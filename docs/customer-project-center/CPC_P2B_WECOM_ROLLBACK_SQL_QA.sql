-- Transactional REVIEW-DEV integration test: leaves no app, binding, or message.
-- Uses an existing QA org with an admin and a salesperson; does not send HTTP.
begin;
do $verify$
declare
  v_org uuid;
  v_admin uuid;
  v_sales uuid;
  v_id uuid;
  v_id_duplicate uuid;
  v_claim record;
  v_updated boolean;
  v_rows integer;
begin
  select p.org_id,p.id into v_org,v_admin
  from public.profiles p
  where p.role='admin' and p.is_active and exists (
    select 1 from public.profiles s
    where s.org_id=p.org_id and s.role='sales' and s.is_active)
  order by p.id limit 1;
  if v_org is null then raise exception 'QA_ADMIN_AND_SALES_MISSING'; end if;
  select id into v_sales from public.profiles
    where org_id=v_org and role='sales' and is_active order by id limit 1;
  insert into cpc_wecom_private.app_configs(org_id,corp_id,agent_id,app_enabled)
    values(v_org,'ww1234567890abcdef',1000003,true)
    on conflict (org_id) do update set app_enabled=true;
  insert into cpc_wecom_private.member_bindings
    (org_id,profile_id,wecom_user_id,verified_by_profile_id,is_active,in_app_visible_scope)
    values (v_org,v_sales,'cpc_qa_only_20261111',v_admin,true,true)
    on conflict (org_id,profile_id) do update
    set wecom_user_id=excluded.wecom_user_id,
        verified_by_profile_id=excluded.verified_by_profile_id,
        is_active=true,in_app_visible_scope=true;
  insert into cpc_wecom_private.notification_outbox
    (org_id,recipient_profile_id,source_kind,source_id,source_effective_at,dispatch_day)
    values (v_org,v_sales,'formal_task',gen_random_uuid(),'2026-11-11T01:00:00Z','2026-11-11')
    returning id into v_id;
  insert into cpc_wecom_private.notification_outbox
    (org_id,recipient_profile_id,source_kind,source_id,source_effective_at,dispatch_day)
    select org_id,recipient_profile_id,source_kind,source_id,source_effective_at,dispatch_day
    from cpc_wecom_private.notification_outbox where id=v_id
    on conflict do nothing returning id into v_id_duplicate;
  if v_id_duplicate is not null then raise exception 'DUPLICATE_ENQUEUED'; end if;
  select * into v_claim from cpc_wecom_private.claim_pending(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    now(),60);
  if v_claim.outbox_id is distinct from v_id or v_claim.attempt_number <> 1 then
    raise exception 'CLAIM_FAILED';
  end if;
  select * into v_claim from cpc_wecom_private.claim_pending(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
    now(),60);
  if v_claim.outbox_id is not null then raise exception 'SECOND_CLAIM_NOT_BLOCKED'; end if;
  v_updated:=cpc_wecom_private.record_delivery(
    v_id,'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,'accepted',null,now());
  if v_updated then raise exception 'BAD_LEASE_FINALIZED'; end if;
  v_updated:=cpc_wecom_private.record_delivery(
    v_id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'accepted',null,now());
  if not v_updated then raise exception 'REAL_LEASE_FINALIZE_FAILED'; end if;
  select count(*) into v_rows from cpc_wecom_private.notification_outbox
  where id=v_id and state='sent' and lease_token is null;
  if v_rows<>1 then raise exception 'ACCEPTANCE_NOT_DURABLE'; end if;
  select count(*) into v_rows from cpc_wecom_private.notification_attempts
  where outbox_id=v_id and attempt_number=1 and result_state='accepted';
  if v_rows<>1 then raise exception 'DELIVERY_ATTEMPT_MISSING'; end if;
  raise notice 'CPC_WECOM_SQL_INTEGRATION_PASS: dedupe, lease, CAS, durable audit (ROLLBACK)';
end
$verify$;
rollback;