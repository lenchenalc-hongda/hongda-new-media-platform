-- P1 schema proposal for a DEDICATED EMPTY Supabase control project only.
-- NOT APPLIED. Never execute on hongda-new-media or hongda-review-dev.
-- When a dedicated project exists, generate a proper Supabase migration with CLI.
-- Provision a restricted backend database identity in a separate reviewed step.

begin;
create schema if not exists ac_control;
revoke all on schema ac_control from public;
revoke all on schema ac_control from anon;
revoke all on schema ac_control from authenticated;

create table ac_control.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  target_repository text not null,
  priority integer not null default 100,
  enabled boolean not null default false,
  dispatch_owner text not null default 'SHADOW',
  created_at timestamptz not null default now(),
  constraint dispatch_owner_domain check (dispatch_owner in ('SHADOW','V2','V3'))
);

create table ac_control.epics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ac_control.projects(id),
  epic_key text not null unique,
  approved_at timestamptz,
  approval_expires_at timestamptz,
  approved_by text,
  approved_paths jsonb not null default '[]'::jsonb,
  acceptance_contract jsonb not null default '{}'::jsonb,
  scope_class text not null check (scope_class in ('SANDBOX','LOW','SENSITIVE','PRODUCTION')),
  created_at timestamptz not null default now(),
  check (jsonb_typeof(approved_paths) = 'array')
);

create table ac_control.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ac_control.projects(id),
  epic_id uuid not null references ac_control.epics(id),
  task_key text not null unique,
  status text not null default 'DRAFT' check(status in (
    'DRAFT','QUEUED','DISPATCHING','CODING','PM_REVIEW','FIX_REQUIRED',
    'MERGE_ELIGIBLE','MERGED','RELEASE_VERIFIED','COMPLETE','RECONCILING',
    'BLOCKED','HUMAN_GATE','CANCELLED')),
  revision bigint not null default 0 check(revision>=0),
  lease_epoch bigint not null default 0 check(lease_epoch>=0),
  lease_owner text,
  lease_expires_at timestamptz,
  branch_ref text,
  base_sha text check(base_sha is null or base_sha ~ '^[a-f0-9]{40}$'),
  head_sha text check(head_sha is null or head_sha ~ '^[a-f0-9]{40}$'),
  risk text not null check(risk in ('SANDBOX','LOW','SENSITIVE','PRODUCTION')),
  allowed_paths jsonb not null default '[]'::jsonb,
  checks jsonb not null default '[]'::jsonb,
  acceptance jsonb not null default '{}'::jsonb,
  fix_round smallint not null default 0 check(fix_round between 0 and 3),
  last_run_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(jsonb_typeof(allowed_paths)='array' and jsonb_typeof(checks)='array')
);

create table ac_control.task_dependencies (
  task_id uuid not null references ac_control.tasks(id),
  depends_on uuid not null references ac_control.tasks(id),
  primary key(task_id,depends_on),
  check(task_id<>depends_on)
);

create table ac_control.executions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references ac_control.tasks(id),
  lease_epoch bigint not null,
  actor text not null,
  github_run_id bigint unique,
  github_run_attempt integer,
  state text not null default 'RESERVED',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(task_id,lease_epoch)
);

create table ac_control.events (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  task_id uuid references ac_control.tasks(id),
  event_type text not null,
  actor text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table ac_control.outbox (
  id bigint generated always as identity primary key,
  op_key text not null unique,
  task_id uuid not null references ac_control.tasks(id),
  lease_epoch bigint not null,
  kind text not null check(kind in ('GITHUB_DISPATCH','ISSUE_MIRROR','ALERT')),
  payload jsonb not null,
  state text not null default 'PENDING' check(state in ('PENDING','INFLIGHT','ACKED','AMBIGUOUS','CANCELLED')),
  attempts integer not null default 0,
  not_before timestamptz not null default now(),
  created_at timestamptz not null default now(),
  changed_at timestamptz not null default now()
);

create table ac_control.path_locks (
  task_id uuid not null references ac_control.tasks(id),
  lease_epoch bigint not null,
  scope text not null,
  acquired_at timestamptz not null default now(),
  primary key(task_id,scope)
);

create table ac_control.approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references ac_control.projects(id),
  epic_id uuid references ac_control.epics(id),
  approval_key text not null unique,
  scope text not null,
  approved_by text not null,
  valid_until timestamptz not null,
  constraints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table ac_control.releases (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references ac_control.tasks(id),
  head_sha text not null check(head_sha ~ '^[a-f0-9]{40}$'),
  merge_sha text check(merge_sha is null or merge_sha ~ '^[a-f0-9]{40}$'),
  deployment_id text,
  state text not null default 'PENDING',
  verified_at timestamptz,
  evidence jsonb not null default '{}'::jsonb
);

create table ac_control.heartbeats (
  agent_id text primary key,
  role text not null,
  lease_epoch bigint,
  last_seen_at timestamptz not null,
  details jsonb not null default '{}'::jsonb
);

create table ac_control.inbound_deliveries (
  delivery_id uuid primary key,
  event_type text not null,
  digest text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null
);

-- Defense in depth, even though ac_control is NOT exposed by PostgREST.
do $$ declare t text; begin
  foreach t in array array['projects','epics','tasks','task_dependencies','executions',
    'events','outbox','path_locks','approvals','releases','heartbeats','inbound_deliveries'] loop
    execute format('alter table ac_control.%I enable row level security',t);
    execute format('revoke all on ac_control.%I from public',t);
    execute format('revoke all on ac_control.%I from anon',t);
    execute format('revoke all on ac_control.%I from authenticated',t);
  end loop;
end $$;

-- Compare file scopes: a trailing slash denotes a directory prefix; otherwise
-- the string denotes an exact path. A directory covers its descendants.
create or replace function ac_control.scope_overlap(a text,b text)
returns boolean language sql immutable set search_path=pg_catalog as $$
  select case
    when a is null or b is null or a='' or b='' then true
    when right(a,1)='/' and right(b,1)='/' then starts_with(a,b) or starts_with(b,a)
    when right(a,1)='/' then starts_with(b,a)
    when right(b,1)='/' then starts_with(a,b)
    else a=b end;
$$;

-- All claim checks, resource reservation and dispatch intent share one txn.
-- Global advisory lock is sufficient only while every writer exclusively uses
-- these private functions and table access is never granted directly.
create or replace function ac_control.claim_task(
  p_task_id uuid, p_expected_revision bigint, p_actor text, p_seconds integer default 900)
returns table(task_id uuid, acquired_epoch bigint, new_revision bigint, outbox_id bigint)
language plpgsql security definer set search_path=pg_catalog,ac_control as $$
declare
  t ac_control.tasks%rowtype;
  p ac_control.projects%rowtype;
  e ac_control.epics%rowtype;
  new_epoch bigint;
  new_revision bigint;
  new_outbox_id bigint;
  candidate text;
begin
  perform pg_advisory_xact_lock(19260801);
  if p_actor is null or length(p_actor)<3 or p_seconds<60 or p_seconds>1800 then
    raise exception 'INVALID_LEASE_REQUEST';
  end if;
  select * into t from ac_control.tasks where id=p_task_id for update;
  if not found or t.status<>'QUEUED' or t.revision<>p_expected_revision then
    raise exception 'STALE_TASK_OR_REVISION';
  end if;
  if t.risk not in ('SANDBOX','LOW') then raise exception 'HUMAN_GATE_REQUIRED'; end if;
  select * into p from ac_control.projects where id=t.project_id;
  if not found or not p.enabled or p.dispatch_owner<>'V3' then
    raise exception 'PROJECT_NOT_DISPATCH_ENABLED';
  end if;
  select * into e from ac_control.epics where id=t.epic_id and project_id=t.project_id;
  if not found or e.approved_at is null or e.approval_expires_at<=now() or
     e.scope_class not in ('SANDBOX','LOW') then
    raise exception 'EPIC_NOT_APPROVED';
  end if;
  if not exists (
    select 1 from ac_control.approvals a where a.epic_id=t.epic_id
      and a.scope='NONPROD_CODE_EXECUTION' and a.valid_until>now()
  ) then raise exception 'MISSING_SCOPE_GRANT'; end if;
  if jsonb_array_length(t.allowed_paths)=0 or
     jsonb_array_length(t.checks)=0 then raise exception 'EMPTY_TASK_SCOPE'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(t.allowed_paths) s
      where s !~ '^[a-zA-Z0-9_.@/-]+$' or left(s,1)='/' or position('..' in s)>0
  ) then raise exception 'INVALID_PATH_SCOPE'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(t.allowed_paths) s
    where not exists (
      select 1 from jsonb_array_elements_text(e.approved_paths) ap
      where s=ap or (right(ap,1)='/' and starts_with(s,ap))
    )
  ) then raise exception 'SCOPE_EXCEEDS_EPIC'; end if;
  if exists (
    select 1 from ac_control.task_dependencies d
      join ac_control.tasks upstream on upstream.id=d.depends_on
      where d.task_id=t.id and upstream.status<>'RELEASE_VERIFIED'
  ) then raise exception 'DEPENDENCIES_NOT_VERIFIED'; end if;
  if (select count(*) from ac_control.tasks active
      where active.status in ('DISPATCHING','CODING') and
        active.lease_expires_at > now()) >= 2 then
    raise exception 'CODING_CAPACITY_EXHAUSTED';
  end if;
  if exists (
    select 1 from ac_control.tasks x
      where x.project_id=t.project_id and x.id<>t.id and
        x.status in ('DISPATCHING','CODING','PM_REVIEW','FIX_REQUIRED',
                     'MERGE_ELIGIBLE','MERGED','RECONCILING')
  ) then raise exception 'PROJECT_WRITER_CONFLICT'; end if;
  if exists (
    select 1 from ac_control.path_locks l
    cross join lateral jsonb_array_elements_text(t.allowed_paths) wanted(scope)
    where l.task_id<>t.id and ac_control.scope_overlap(l.scope,wanted.scope)
  ) then raise exception 'SHARED_PATH_CONFLICT'; end if;
  new_epoch:=t.lease_epoch+1;
  update ac_control.tasks
    set status='DISPATCHING',revision=revision+1,lease_epoch=new_epoch,
      lease_owner=p_actor,lease_expires_at=now()+make_interval(secs=>p_seconds),
      updated_at=now()
    where id=t.id and revision=p_expected_revision
    returning revision into new_revision;
  insert into ac_control.executions(task_id,lease_epoch,actor)
    values(t.id,new_epoch,p_actor);
  for candidate in select jsonb_array_elements_text(t.allowed_paths) loop
    insert into ac_control.path_locks(task_id,lease_epoch,scope)
    values(t.id,new_epoch,candidate);
  end loop;
  insert into ac_control.events(event_key,task_id,event_type,actor,data)
    values('claim:'||t.id::text||':'||new_epoch,t.id,'TASK_CLAIMED',p_actor,
      jsonb_build_object('revision',new_revision,'lease_epoch',new_epoch));
  insert into ac_control.outbox(op_key,task_id,lease_epoch,kind,payload)
    values('dispatch:'||t.id::text||':'||new_epoch,t.id,new_epoch,'GITHUB_DISPATCH',
      jsonb_build_object('task_id',t.id,'lease_epoch',new_epoch,'task_key',t.task_key))
    returning id into new_outbox_id;
  return query select t.id,new_epoch,new_revision,new_outbox_id;
end;
$$;

-- An expired epoch cannot update task state. No implicit re-dispatch.
create or replace function ac_control.heartbeat_task(
  p_task_id uuid,p_epoch bigint,p_actor text,p_seconds integer default 900)
returns boolean language plpgsql security definer
set search_path=pg_catalog,ac_control as $$
declare affected integer;
begin
  if p_seconds<60 or p_seconds>1800 then return false; end if;
  update ac_control.tasks set lease_expires_at=now()+make_interval(secs=>p_seconds),
    updated_at=now()
    where id=p_task_id and lease_epoch=p_epoch and lease_owner=p_actor
      and lease_expires_at>now() and status in ('DISPATCHING','CODING');
  get diagnostics affected=row_count;
  return affected=1;
end;
$$;

-- Claim expiration never frees a lock or repeats the network call on its own.
create or replace function ac_control.mark_expired_for_reconciliation()
returns integer language plpgsql security definer
set search_path=pg_catalog,ac_control as $$
declare t ac_control.tasks%rowtype; n integer:=0;
begin
  perform pg_advisory_xact_lock(19260801);
  for t in select * from ac_control.tasks where status in ('DISPATCHING','CODING')
       and lease_expires_at<now() for update skip locked loop
    update ac_control.tasks set status='RECONCILING',revision=revision+1,
      updated_at=now() where id=t.id and lease_epoch=t.lease_epoch;
    update ac_control.outbox set state='AMBIGUOUS',changed_at=now()
      where task_id=t.id and lease_epoch=t.lease_epoch and state in ('PENDING','INFLIGHT');
    insert into ac_control.events(event_key,task_id,event_type,actor,data)
      values('lease-expired:'||t.id::text||':'||t.lease_epoch,t.id,'LEASE_EXPIRED',
        'ac_control',jsonb_build_object('previous_owner',t.lease_owner))
      on conflict (event_key) do nothing;
    n:=n+1;
  end loop;
  return n;
end;
$$;

-- No privileged roles have been bound: admin must provision separate restricted
-- runtime role and scoped GRANT EXECUTE after independent review. By default
-- PostgreSQL grants PUBLIC execute on functions, so revoke each explicitly.
revoke all on all functions in schema ac_control from public;
revoke all on all functions in schema ac_control from anon;
revoke all on all functions in schema ac_control from authenticated;
revoke all on all sequences in schema ac_control from public;
revoke all on all sequences in schema ac_control from anon;
revoke all on all sequences in schema ac_control from authenticated;
commit;
