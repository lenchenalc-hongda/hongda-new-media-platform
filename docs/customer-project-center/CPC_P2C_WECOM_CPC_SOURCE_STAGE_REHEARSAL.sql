-- CPC P2-C: review-dev ONLY, additively installs a gated source-to-outbox planner.
-- This is NOT a production migration and has NO cron, external requests or keys.
-- Run AFTER private schema, role and worker assets in P2-B.
begin;

-- Bounded, no-data-revealing runtime predicate. It is intentionally a private
-- SECURITY DEFINER because scheduled server workers have no human CPC RLS
-- session. Explicitly revoke PUBLIC/anon/authenticated function access.
create or replace function cpc_wecom_private.is_cpc_due_current(
  p_outbox_id uuid, p_now timestamptz default now()
) returns boolean
language sql stable security definer
set search_path = pg_catalog
as $fn$
  select exists (
    select 1
    from cpc_wecom_private.notification_outbox q
    join cpc_wecom_private.app_configs c
      on c.org_id=q.org_id and c.app_enabled
    join cpc_wecom_private.member_bindings b
      on b.org_id=q.org_id and b.profile_id=q.recipient_profile_id
      and b.is_active and b.in_app_visible_scope
    join public.profiles recipient
      on recipient.id=q.recipient_profile_id
      and recipient.org_id=q.org_id and recipient.is_active
      and recipient.role in ('admin','manager','sales')
    where q.id=p_outbox_id
      and p_now is not null
      and q.source_effective_at <= p_now + interval '48 hours'
      and (
        (q.source_kind='formal_task' and exists (
          select 1
          from public.cpc_work_items w
          join public.cpc_projects p on p.id=w.project_id
            and p.org_id=w.org_id
          where w.id=q.source_id and w.org_id=q.org_id
            and w.assignee_profile_id=q.recipient_profile_id
            and w.status in ('pending','in_progress','blocked')
            and w.work_item_type in ('NEXT_ACTION','CUSTOMER_COMMITMENT',
                 'INTERNAL_COLLABORATION','MANAGEMENT_DECISION')
            and w.due_at=q.source_effective_at
            and p.status='active' and p.archived_at is null
        ))
        or
        (q.source_kind='waiting_check' and exists (
          select 1 from public.cpc_projects p
          where p.id=q.source_id and p.org_id=q.org_id
            and p.owner_profile_id=q.recipient_profile_id
            and p.status='active' and p.archived_at is null
            and p.waiting_on <> 'none'
            and p.next_check_at=q.source_effective_at
        ))
      )
  );
$fn$;

revoke all on function cpc_wecom_private.is_cpc_due_current(uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function cpc_wecom_private.is_cpc_due_current(uuid,timestamptz)
  to cpc_wecom_worker;

-- Daily digest source planner. PRIVATE: only approved scheduler worker role.
-- Project-stagnation and acquisition-gap are intentionally OUT OF SCOPE here:
-- this function enqueues only formal facts that already exist in CPC.
create or replace function cpc_wecom_private.stage_cpc_due(
  p_now timestamptz default now()
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog
as $fn$
declare
  v_local timestamp;
  v_day date;
  v_inserted int := 0;
  v_cancelled int := 0;
begin
  if p_now is null then
    raise exception 'CPC_WECOM_INVALID_NOW';
  end if;
  v_local := p_now at time zone 'Asia/Shanghai';
  v_day := v_local::date;
  if extract(isodow from v_local) > 5
    or extract(hour from v_local) <> 9
    or extract(minute from v_local) < 0
    or extract(minute from v_local) >= 15 then
    return pg_catalog.jsonb_build_object(
      'status','outside_window','staged',0,'cancelled',0);
  end if;

  -- Late/closed/rescheduled/retargeted/binding-revoked sources cancel
  -- only UNSENT pending and retry rows. Sent/UNKNOWN remain for audit;
  -- leased rows require worker-side revalidation before external request.
  with cancelled as (
    update cpc_wecom_private.notification_outbox q
    set state='cancelled', lease_token=null,lease_expires_at=null,
      last_error_code='SOURCE_NO_LONGER_CURRENT',updated_at=p_now
    where q.state in ('pending','retry')
      and q.source_kind in ('formal_task','waiting_check')
      and not cpc_wecom_private.is_cpc_due_current(q.id,p_now)
    returning q.id
  )
  select count(*) into v_cancelled from cancelled;

  with eligible as (
    select w.org_id, w.assignee_profile_id as recipient_profile_id,
      'formal_task'::text as source_kind,w.id as source_id,
      w.due_at as source_effective_at
    from public.cpc_work_items w
    join public.cpc_projects p
      on p.id=w.project_id and p.org_id=w.org_id
    where p.status='active' and p.archived_at is null
      and w.status in ('pending','in_progress','blocked')
      and w.work_item_type in ('NEXT_ACTION','CUSTOMER_COMMITMENT',
        'INTERNAL_COLLABORATION','MANAGEMENT_DECISION')
      and w.due_at is not null
      and w.due_at <= p_now + interval '48 hours'
    union all
    select p.org_id,p.owner_profile_id,
      'waiting_check'::text,p.id,p.next_check_at
    from public.cpc_projects p
    where p.status='active' and p.archived_at is null
      and p.waiting_on <> 'none'
      and p.next_check_at is not null
      and p.next_check_at <= p_now + interval '48 hours'
  ), authorized as (
    select e.*
    from eligible e
    join cpc_wecom_private.app_configs c
      on c.org_id=e.org_id and c.app_enabled
    join cpc_wecom_private.member_bindings m
      on m.org_id=e.org_id and m.profile_id=e.recipient_profile_id
      and m.is_active and m.in_app_visible_scope
    join public.profiles recipient
      on recipient.id=e.recipient_profile_id and recipient.org_id=e.org_id
      and recipient.is_active
      and recipient.role in ('admin','manager','sales')
  ), inserted as (
    insert into cpc_wecom_private.notification_outbox
      (org_id,recipient_profile_id,source_kind,source_id,
       source_effective_at,dispatch_day,available_at)
    select a.org_id,a.recipient_profile_id,a.source_kind,a.source_id,
      a.source_effective_at,v_day,p_now
    from authorized a
    on conflict (org_id,recipient_profile_id,source_kind,source_id,
      source_effective_at,dispatch_day,policy_version)
    do nothing
    returning id
  )
  select count(*) into v_inserted from inserted;

  return pg_catalog.jsonb_build_object(
    'status','staged','staged',v_inserted,'cancelled',v_cancelled);
end
$fn$;

revoke all on function cpc_wecom_private.stage_cpc_due(timestamptz)
  from public,anon,authenticated;
grant execute on function cpc_wecom_private.stage_cpc_due(timestamptz)
  to cpc_wecom_worker;

-- Source verification cannot be exposed to browser or public REST RPC.
commit;
