-- REVIEW-DEV ONLY, additive to CPC_P2B_WECOM_PRIVATE_OUTBOX_REHEARSAL.sql.
-- Secure server-side queue operations; worker role is NOLOGIN and credentials disabled.
begin;

-- Apply only to a worker that has been granted private schema access.
-- Never expose these procedures in the public Data API.
create or replace function cpc_wecom_private.claim_pending(
  p_lease_token uuid, p_now timestamptz default now(), p_lease_seconds int default 60
) returns table (
  outbox_id uuid, occurrence_org_id uuid, recipient_id uuid,
  source_kind text, source_id uuid, source_effective_at timestamptz,
  lease_expires_at timestamptz, attempt_number integer
)
language plpgsql security invoker
set search_path = pg_catalog
as $fn$
begin
  if p_lease_token is null or p_now is null
     or p_lease_seconds < 15 or p_lease_seconds > 300 then
    raise exception 'CPC_WECOM_INVALID_LEASE';
  end if;
  return query
  with candidate as (
    select q.id
    from cpc_wecom_private.notification_outbox q
    join cpc_wecom_private.member_bindings b
      on b.org_id = q.org_id and b.profile_id = q.recipient_profile_id
    join cpc_wecom_private.app_configs c on c.org_id = q.org_id
    -- Runtime identity must be rechecked by the authenticated sender immediately
    -- before HTTP; this NOLOGIN worker cannot bypass public.profiles RLS.
    where q.state in ('pending','retry')
      and q.available_at <= p_now
      and q.attempts < q.max_attempts
      and c.app_enabled and b.is_active and b.in_app_visible_scope
      -- Recheck authoritative CPC source in the private secured function.
      -- Never lease stale/closed/reassigned tasks or unverified waiting checks.
      and cpc_wecom_private.is_cpc_due_current(q.id,p_now)
    order by q.available_at, q.id
    limit 1
    for update of q skip locked
  ), claimed as (
    update cpc_wecom_private.notification_outbox q
    set state = 'leased',
        attempts = q.attempts + 1,
        lease_token = p_lease_token,
        lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
        updated_at = p_now, last_error_code = null
    from candidate
    where q.id = candidate.id
    returning q.id,q.org_id,q.recipient_profile_id,q.source_kind,
      q.source_id,q.source_effective_at,q.lease_expires_at,q.attempts
  )
  select x.id,x.org_id,x.recipient_profile_id,x.source_kind,
    x.source_id,x.source_effective_at,x.lease_expires_at,x.attempts
  from claimed x;
end
$fn$;

create or replace function cpc_wecom_private.record_delivery(
  p_outbox_id uuid, p_lease_token uuid, p_result text,
  p_error_code text default null, p_now timestamptz default now()
) returns boolean
language plpgsql security invoker
set search_path = pg_catalog
as $fn$
declare
  item cpc_wecom_private.notification_outbox%rowtype;
  next_state text;
begin
  if p_outbox_id is null or p_lease_token is null or p_now is null
    or p_result not in ('accepted','retryable_rejected','permanent_rejected','unknown')
    or (p_error_code is not null and p_error_code !~ '^[A-Za-z0-9_-]{1,40}$') then
    return false;
  end if;
  select * into item from cpc_wecom_private.notification_outbox
  where id=p_outbox_id for update;
  if not found or item.state <> 'leased' or item.lease_token <> p_lease_token
    or item.lease_expires_at <= p_now then
    return false;
  end if;

  next_state := case p_result
    when 'accepted' then 'sent'
    when 'unknown' then 'unknown'
    when 'permanent_rejected' then 'dead'
    when 'retryable_rejected' then
      case when item.attempts >= item.max_attempts then 'dead' else 'retry' end
  end;

  update cpc_wecom_private.notification_outbox
  set state = next_state,
    lease_token = null, lease_expires_at = null,
    last_error_code = case when p_result = 'accepted' then null else p_error_code end,
    available_at = case when next_state = 'retry'
      then p_now + make_interval(secs =>
        least(3600, 60 * power(3, greatest(0,item.attempts-1))::int))
      else available_at end,
    accepted_at = case when next_state='sent' then p_now else accepted_at end,
    updated_at = p_now
  where id = p_outbox_id;

  insert into cpc_wecom_private.notification_attempts
    (outbox_id,attempt_number,result_state,error_code)
  values (p_outbox_id,item.attempts,p_result,p_error_code);
  return true;
end
$fn$;

-- Conservatively quarantine every expired in-flight attempt as UNKNOWN.
create or replace function cpc_wecom_private.quarantine_expired(
  p_now timestamptz default now()
) returns integer
language plpgsql security invoker
set search_path=pg_catalog
as $fn$
declare n integer;
begin
  if p_now is null then return 0; end if;
  -- Keep an immutable attempt record for crashed/expired workers.
  -- No retries are issued automatically because a remote send MAY have
  -- succeeded even when the worker lost the acknowledgement.
  with recovered as (
    update cpc_wecom_private.notification_outbox
    set state='unknown',lease_token=null,lease_expires_at=null,
      last_error_code='LEASE_EXPIRED_UNKNOWN',updated_at=p_now
    where state='leased' and lease_expires_at <= p_now
    returning id,attempts
  ), attempt_history as (
    insert into cpc_wecom_private.notification_attempts
      (outbox_id,attempt_number,result_state,error_code)
    select id,attempts,'unknown','LEASE_EXPIRED_UNKNOWN' from recovered
    on conflict (outbox_id,attempt_number) do nothing
    returning outbox_id
  )
  select count(*) into n from recovered;
  return n;
end
$fn$;

revoke all on function cpc_wecom_private.claim_pending(uuid,timestamptz,int) from public,anon,authenticated;
revoke all on function cpc_wecom_private.record_delivery(uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function cpc_wecom_private.quarantine_expired(timestamptz) from public,anon,authenticated;

grant execute on function cpc_wecom_private.claim_pending(uuid,timestamptz,int) to cpc_wecom_worker;
grant execute on function cpc_wecom_private.record_delivery(uuid,uuid,text,text,timestamptz) to cpc_wecom_worker;
grant execute on function cpc_wecom_private.quarantine_expired(timestamptz) to cpc_wecom_worker;

-- No grant of LOGIN, no scheduler, no WeCom Secret, no messages.
commit;