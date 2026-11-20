-- REVIEW-DEV ONLY. This is a rehearsal SQL asset, NOT an approved production migration.
-- A canonical migration must be generated and approved before release.
-- Isolated schema, no changes to public CPC source tables, Auth, or RLS.
begin;

create schema if not exists cpc_wecom_private;
revoke all on schema cpc_wecom_private from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'cpc_wecom_worker') then
    create role cpc_wecom_worker nologin;
  end if;
end
$do$;

create table if not exists cpc_wecom_private.app_configs (
  org_id uuid primary key references public.organizations(id),
  corp_id text not null check (corp_id ~ '^ww[A-Za-z0-9]{10,60}$'),
  agent_id bigint not null check (agent_id > 0),
  app_enabled boolean not null default false,
  configured_at timestamptz not null default now()
);

create table if not exists cpc_wecom_private.member_bindings (
  org_id uuid not null references cpc_wecom_private.app_configs(org_id),
  profile_id uuid not null references public.profiles(id),
  wecom_user_id text not null check (
    wecom_user_id ~ '^[A-Za-z0-9_.@-]{1,128}$'
    and lower(wecom_user_id) <> '@all'
  ),
  verified_by_profile_id uuid not null references public.profiles(id),
  verified_at timestamptz not null default now(),
  is_active boolean not null default false,
  in_app_visible_scope boolean not null default false,
  primary key (org_id, profile_id),
  unique (org_id, wecom_user_id)
);

create table if not exists cpc_wecom_private.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references cpc_wecom_private.app_configs(org_id),
  recipient_profile_id uuid not null references public.profiles(id),
  source_kind text not null check (source_kind in (
    'formal_task','waiting_check','project_stalled',
    'new_project_gap','missing_next_step'
  )),
  source_id uuid not null,
  source_effective_at timestamptz not null,
  dispatch_day date not null,
  policy_version integer not null default 1 check (policy_version > 0),
  state text not null default 'pending' check (
    state in ('pending','leased','retry','sent','unknown','dead','cancelled')
  ),
  attempts integer not null default 0 check (attempts between 0 and 3),
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code varchar(40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint cpc_wecom_attempt_limit check (attempts <= max_attempts),
  constraint cpc_wecom_lease_shape check (
    (state = 'leased' and lease_token is not null and lease_expires_at is not null)
    or (state <> 'leased' and lease_token is null and lease_expires_at is null)
  ),
  unique (org_id,recipient_profile_id,source_kind,source_id,
          source_effective_at,dispatch_day,policy_version)
);

create index if not exists cpc_wecom_claim_idx
  on cpc_wecom_private.notification_outbox (available_at,id)
  where state in ('pending','retry');

create index if not exists cpc_wecom_expired_lease_idx
  on cpc_wecom_private.notification_outbox (lease_expires_at,id)
  where state = 'leased';

create table if not exists cpc_wecom_private.notification_attempts (
  id bigint generated always as identity primary key,
  outbox_id uuid not null references cpc_wecom_private.notification_outbox(id),
  attempt_number integer not null check (attempt_number between 1 and 3),
  result_state text not null check (
    result_state in ('accepted','retryable_rejected','permanent_rejected','unknown')
  ),
  error_code varchar(40),
  recorded_at timestamptz not null default now(),
  unique (outbox_id,attempt_number)
);

-- Prevent an administrator accidentally binding a member outside the org or
-- a non-admin from being recorded as the verifier.
create or replace function cpc_wecom_private.verify_member_binding()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.profile_id and p.org_id = new.org_id
      and p.is_active and p.role in ('sales','manager','admin')
  ) then
    raise exception 'CPC_WECOM_MEMBER_ORG_OR_STATUS_INVALID';
  end if;
  if not exists (
    select 1 from public.profiles a
    where a.id = new.verified_by_profile_id and a.org_id = new.org_id
      and a.is_active and a.role = 'admin'
  ) then
    raise exception 'CPC_WECOM_ADMIN_VERIFIER_REQUIRED';
  end if;
  return new;
end
$$;
revoke all on function cpc_wecom_private.verify_member_binding() from public,anon,authenticated;
drop trigger if exists cpc_wecom_verify_member on cpc_wecom_private.member_bindings;
create trigger cpc_wecom_verify_member
  before insert or update on cpc_wecom_private.member_bindings
  for each row execute function cpc_wecom_private.verify_member_binding();

-- Enqueue only into active app and verified, visible, same-organization binding.
-- The future worker MUST repeat these checks immediately before message/send.
create or replace function cpc_wecom_private.verify_outbox_target()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1
    from cpc_wecom_private.app_configs c
    join cpc_wecom_private.member_bindings m on m.org_id = c.org_id
    join public.profiles p on p.id = m.profile_id and p.org_id = m.org_id
    where c.org_id = new.org_id and c.app_enabled
      and m.profile_id = new.recipient_profile_id
      and m.is_active and m.in_app_visible_scope
      and p.is_active
  ) then
    raise exception 'CPC_WECOM_OUTBOX_TARGET_NOT_VERIFIED';
  end if;
  return new;
end
$$;
revoke all on function cpc_wecom_private.verify_outbox_target() from public,anon,authenticated;
drop trigger if exists cpc_wecom_verify_outbox on cpc_wecom_private.notification_outbox;
create trigger cpc_wecom_verify_outbox
  before insert or update of org_id,recipient_profile_id
  on cpc_wecom_private.notification_outbox
  for each row execute function cpc_wecom_private.verify_outbox_target();

-- Private RLS: no policies for anon/authenticated, not in exposed Data API.
alter table cpc_wecom_private.app_configs enable row level security;
alter table cpc_wecom_private.member_bindings enable row level security;
alter table cpc_wecom_private.notification_outbox enable row level security;
alter table cpc_wecom_private.notification_attempts enable row level security;

revoke all on all tables in schema cpc_wecom_private from public,anon,authenticated;
revoke all on all sequences in schema cpc_wecom_private from public,anon,authenticated;
grant usage on schema cpc_wecom_private to cpc_wecom_worker;
grant select on cpc_wecom_private.app_configs,
  cpc_wecom_private.member_bindings to cpc_wecom_worker;
grant select,insert,update on cpc_wecom_private.notification_outbox to cpc_wecom_worker;
grant select,insert on cpc_wecom_private.notification_attempts to cpc_wecom_worker;
grant usage on all sequences in schema cpc_wecom_private to cpc_wecom_worker;

drop policy if exists cpc_wecom_worker_access on cpc_wecom_private.app_configs;
create policy cpc_wecom_worker_access on cpc_wecom_private.app_configs
  for select to cpc_wecom_worker using (true);
drop policy if exists cpc_wecom_worker_access on cpc_wecom_private.member_bindings;
create policy cpc_wecom_worker_access on cpc_wecom_private.member_bindings
  for select to cpc_wecom_worker using (true);
drop policy if exists cpc_wecom_worker_access on cpc_wecom_private.notification_outbox;
create policy cpc_wecom_worker_access on cpc_wecom_private.notification_outbox
  for all to cpc_wecom_worker using (true) with check (true);
drop policy if exists cpc_wecom_worker_access on cpc_wecom_private.notification_attempts;
create policy cpc_wecom_worker_access on cpc_wecom_private.notification_attempts
  for all to cpc_wecom_worker using (true) with check (true);

-- No LOGIN role is granted cpc_wecom_worker here; there is NO worker identity,
-- scheduled job, token, application secret, or outbound message delivery.
commit;
