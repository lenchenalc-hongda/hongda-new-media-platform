-- CPC P2-C NONPROD TRANSACTIONAL QA ONLY.
-- Creates synthetic CPC project and work item, tests source-to-outbox flow,
-- duplicate suppression, reschedule and completion, then ROLLBACK. No messages.
begin;
do $qa$
declare
  v_org uuid;
  v_admin uuid;
  v_sales uuid;
  v_customer uuid;
  v_project uuid;
  v_work uuid;
  v_result jsonb;
  v_n int;
  v_claim record;
  v_claim_two record;
begin
  select a.org_id,a.id into v_org,v_admin
  from public.profiles a
  where a.is_active and a.role='admin'
    and exists (select 1 from public.profiles s
      where s.org_id=a.org_id and s.is_active and s.role='sales')
  order by a.id limit 1;
  if v_org is null then raise exception 'NO_QA_ORG_WITH_ADMIN_AND_SALES'; end if;
  select id into v_sales from public.profiles
  where org_id=v_org and role='sales' and is_active order by id limit 1;

  insert into public.cpc_customer_references
    (org_id,reference_kind,provisional_source_reference,display_name_snapshot,
     created_by_profile_id,status)
  values (v_org,'provisional','QA-WECOM-'||gen_random_uuid()::text,
          '[QA] synthetic customer, rolled back',v_admin,'pending_review')
  returning id into v_customer;
  insert into public.cpc_projects
    (org_id,customer_reference_id,title,objective_summary,project_type,
     owner_profile_id,created_by_profile_id,status,stage,waiting_on,next_check_at,priority)
  values (v_org,v_customer,'[QA] WeCom only - rolled back',
          'Synthetic test, never contact customer','transfer_film',
          v_sales,v_admin,'active','requirement_alignment','customer',
          '2026-11-11T02:30:00Z','medium')
  returning id into v_project;
  insert into public.cpc_work_items
    (org_id,customer_reference_id,project_id,work_item_type,title,
     assignee_profile_id,created_by_profile_id,due_at,status,priority)
  values (v_org,v_customer,v_project,'NEXT_ACTION','[QA] confirm sample',
          v_sales,v_admin,'2026-11-11T02:00:00Z','pending','medium')
  returning id into v_work;
  insert into cpc_wecom_private.app_configs (org_id,corp_id,agent_id,app_enabled)
  values(v_org,'ww1234567890abcdef',1000003,true);
  insert into cpc_wecom_private.member_bindings
    (org_id,profile_id,wecom_user_id,verified_by_profile_id,
     is_active,in_app_visible_scope)
  values(v_org,v_sales,'qa_p2c_20261111',v_admin,true,true);

  v_result := cpc_wecom_private.stage_cpc_due('2026-11-11T01:07:00Z');
  if (v_result->>'staged')::int<>2 then
    raise exception 'QA_FIRST_STAGE_EXPECTED_2 got %',v_result;
  end if;
  select count(*) into v_n from cpc_wecom_private.notification_outbox
    where org_id=v_org and state='pending'
      and source_id in (v_work,v_project);
  if v_n<>2 then raise exception 'QA_MISSING_DUE_TASK_OR_WAITING_CHECK'; end if;

  v_result := cpc_wecom_private.stage_cpc_due('2026-11-11T01:09:00Z');
  if (v_result->>'staged')::int<>0 then
    raise exception 'QA_DUPLICATE_ENQUEUED got %',v_result;
  end if;

  -- Only current CPC business facts may receive leases. Two due facts can
  -- be claimed separately; a third claim cannot fetch the same rows twice.
  select * into v_claim from cpc_wecom_private.claim_pending(
    '11111111-1111-4111-8111-111111111111'::uuid,
    '2026-11-11T01:09:00Z',60);
  select * into v_claim_two from cpc_wecom_private.claim_pending(
    '22222222-2222-4222-8222-222222222222'::uuid,
    '2026-11-11T01:09:00Z',60);
  if v_claim.outbox_id is null or v_claim_two.outbox_id is null
    or v_claim.outbox_id=v_claim_two.outbox_id then
    raise exception 'QA_SOURCE_AWARE_CLAIMS_FAILED';
  end if;
  select count(*) into v_n from cpc_wecom_private.claim_pending(
    '33333333-3333-4333-8333-333333333333'::uuid,
    '2026-11-11T01:09:00Z',60);
  if v_n<>0 then raise exception 'QA_DUPLICATE_CLAIM'; end if;
  -- Reset synthetic leases within the still-uncommitted QA transaction.
  update cpc_wecom_private.notification_outbox
    set state='pending',lease_token=null,lease_expires_at=null,attempts=0
    where org_id=v_org and source_id in (v_project,v_work);

  update public.cpc_work_items
    set status='completed',completed_at=now(),
      completed_by_profile_id=v_sales,version=version+1,updated_at=now()
    where id=v_work;
  update public.cpc_projects
    set next_check_at='2026-11-11T03:10:00Z',
        version=version+1,updated_at=now()
    where id=v_project;
  -- Even BEFORE reconciliation, claim must re-read the real task and
  -- refuse old pending reminders after status/deadline changes.
  select count(*) into v_n from cpc_wecom_private.claim_pending(
    '44444444-4444-4444-8444-444444444444'::uuid,
    '2026-11-11T01:10:00Z',60);
  if v_n<>0 then raise exception 'QA_STALE_CPC_FACT_WAS_LEASED'; end if;
  v_result := cpc_wecom_private.stage_cpc_due('2026-11-11T01:10:00Z');
  if (v_result->>'cancelled')::int<>2 or (v_result->>'staged')::int<>1 then
    raise exception 'QA_SOURCE_CHANGE_BAD got %',v_result;
  end if;
  select count(*) into v_n from cpc_wecom_private.notification_outbox
    where org_id=v_org and state='pending'
      and source_kind='waiting_check'
      and source_effective_at='2026-11-11T03:10:00Z';
  if v_n<>1 then raise exception 'QA_NEW_WAITING_DATE_NOT_STAGED'; end if;
  select count(*) into v_n from cpc_wecom_private.notification_outbox
    where org_id=v_org and state='cancelled';
  if v_n<>2 then raise exception 'QA_SUPERSEDED_EVENTS_NOT_CANCELLED'; end if;
  if cpc_wecom_private.is_cpc_due_current(
      (select id from cpc_wecom_private.notification_outbox
       where org_id=v_org and source_id=v_work limit 1),
      '2026-11-11T01:10:00Z') then
    raise exception 'QA_COMPLETED_TASK_STILL_CURRENT';
  end if;
  raise notice 'CPC_P2C_PASS: 2 staged, 0 duplicate, 2 cancelled, 1 new waiting';
end
$qa$;
rollback;