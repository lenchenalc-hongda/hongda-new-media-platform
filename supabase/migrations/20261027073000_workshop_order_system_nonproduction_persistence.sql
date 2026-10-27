-- Workshop Order System Phase 5 non-Production persistence foundation.
-- REPOSITORY DRAFT ONLY. This file must not be applied to Supabase or Production
-- until the exact migration and SHA pass the Human Gate.
--
-- This migration is additive: it does not create a bucket, execute a remote
-- request, alter Production data, or grant browser clients direct mutation.
-- The two office entry types remain independent source tables.

begin;

-- Composite source identities let immutable submission facts prove that their
-- organization and source record agree without a polymorphic foreign key.
create unique index if not exists wos_production_orders_id_organization_key
  on public.wos_production_orders(id, organization_id);
create unique index if not exists wos_sampling_requests_id_organization_key
  on public.wos_sampling_requests(id, organization_id);
create unique index if not exists wos_reference_images_id_organization_key
  on public.wos_reference_images(id, organization_id);

-- Image metadata is append-only. source_version_number pins the metadata to the
-- source revision visible when the object was registered.
alter table public.wos_reference_images
  add column if not exists source_version_number integer;
alter table public.wos_reference_images
  add column if not exists technical_attempt_id uuid
  references public.wos_sampling_technical_records(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 1. Immutable office completeness evidence
-- ---------------------------------------------------------------------------

create table if not exists public.wos_office_readiness_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_type text not null check (
    entity_type in ('PRODUCTION_ORDER','SAMPLING_REQUEST')
  ),
  source_id uuid not null,
  source_version_number integer not null check (source_version_number > 0),
  source_version_label text not null check (
    length(btrim(source_version_label)) between 1 and 120
  ),
  evidence_type text not null check (evidence_type = 'OFFICE_COMPLETENESS'),
  confirmed_by_profile_id uuid not null references public.profiles(id),
  confirmed_at timestamptz not null,
  evidence_snapshot jsonb not null check (
    jsonb_typeof(evidence_snapshot) = 'object'
  ),
  immutable boolean not null default true check (immutable = true),
  created_at timestamptz not null default now(),
  unique (
    organization_id,
    entity_type,
    source_id,
    source_version_number,
    evidence_type
  )
);

-- ---------------------------------------------------------------------------
-- 2. Independent office submission ledgers
-- ---------------------------------------------------------------------------

create table if not exists public.wos_production_order_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  production_order_id uuid not null,
  submission_key text not null check (
    length(btrim(submission_key)) between 8 and 200
  ),
  source_version_number integer not null check (source_version_number > 0),
  source_version_label text not null check (
    length(btrim(source_version_label)) between 1 and 120
  ),
  project_owner_profile_id uuid not null references public.profiles(id),
  submitted_by_profile_id uuid not null references public.profiles(id),
  readiness_evidence_id uuid not null
    references public.wos_office_readiness_evidence(id) on delete restrict,
  submitted_at timestamptz not null,
  immutable boolean not null default true check (immutable = true),
  created_at timestamptz not null default now(),
  unique (organization_id, submission_key),
  unique (organization_id, production_order_id, source_version_number),
  foreign key (production_order_id, organization_id)
    references public.wos_production_orders(id, organization_id)
    on delete restrict
);

create table if not exists public.wos_sampling_request_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  sampling_request_id uuid not null,
  submission_key text not null check (
    length(btrim(submission_key)) between 8 and 200
  ),
  source_version_number integer not null check (source_version_number > 0),
  source_version_label text not null check (
    length(btrim(source_version_label)) between 1 and 120
  ),
  project_owner_profile_id uuid not null references public.profiles(id),
  submitted_by_profile_id uuid not null references public.profiles(id),
  readiness_evidence_id uuid not null
    references public.wos_office_readiness_evidence(id) on delete restrict,
  submitted_at timestamptz not null,
  immutable boolean not null default true check (immutable = true),
  created_at timestamptz not null default now(),
  unique (organization_id, submission_key),
  unique (organization_id, sampling_request_id, source_version_number),
  foreign key (sampling_request_id, organization_id)
    references public.wos_sampling_requests(id, organization_id)
    on delete restrict
);

-- ---------------------------------------------------------------------------
-- 3. Explicit image supersession and immutable audit facts
-- ---------------------------------------------------------------------------

create table if not exists public.wos_reference_image_supersessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_type text not null check (
    entity_type in ('PRODUCTION_ORDER','SAMPLING_REQUEST')
  ),
  source_id uuid not null,
  previous_image_id uuid not null,
  next_image_id uuid not null,
  previous_source_version_number integer not null check (
    previous_source_version_number > 0
  ),
  next_source_version_number integer not null check (
    next_source_version_number > previous_source_version_number
  ),
  superseded_by_profile_id uuid not null references public.profiles(id),
  superseded_at timestamptz not null,
  immutable boolean not null default true check (immutable = true),
  created_at timestamptz not null default now(),
  unique (previous_image_id),
  unique (next_image_id),
  unique (id, organization_id),
  foreign key (previous_image_id, organization_id)
    references public.wos_reference_images(id, organization_id)
    on delete restrict,
  foreign key (next_image_id, organization_id)
    references public.wos_reference_images(id, organization_id)
    on delete restrict
);

create table if not exists public.wos_persistence_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null check (length(btrim(event_key)) between 8 and 240),
  organization_id uuid not null references public.organizations(id),
  entity_type text not null check (
    entity_type in ('PRODUCTION_ORDER','SAMPLING_REQUEST')
  ),
  source_id uuid not null,
  source_version_number integer not null check (source_version_number > 0),
  source_version_label text not null check (
    length(btrim(source_version_label)) between 1 and 120
  ),
  event_type text not null check (
    event_type in (
      'OFFICE_RECORD_SUBMITTED',
      'IMAGE_VERSION_APPENDED',
      'IMAGE_VERSION_SUPERSEDED'
    )
  ),
  actor_profile_id uuid not null references public.profiles(id),
  related_id uuid,
  event_payload jsonb not null check (jsonb_typeof(event_payload) = 'object'),
  immutable boolean not null default true check (immutable = true),
  created_at timestamptz not null default now(),
  unique (organization_id, event_key)
);

-- ---------------------------------------------------------------------------
-- 4. Fail-closed fact validation
-- ---------------------------------------------------------------------------

create or replace function public.wos_reject_persistence_fact_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'WOS_IMMUTABLE_FACT' using errcode = '55000';
end;
$$;

create or replace function public.wos_validate_office_readiness_evidence()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_source_organization_id uuid;
  v_source_version_number integer;
  v_source_version_label text;
  v_confirmer public.profiles%rowtype;
begin
  if new.entity_type = 'PRODUCTION_ORDER' then
    select po.organization_id, po.version, po.version_label
      into v_source_organization_id, v_source_version_number,
        v_source_version_label
      from public.wos_production_orders po
      where po.id = new.source_id;
  elsif new.entity_type = 'SAMPLING_REQUEST' then
    select sr.organization_id, sr.version, sr.version_label
      into v_source_organization_id, v_source_version_number,
        v_source_version_label
      from public.wos_sampling_requests sr
      where sr.id = new.source_id;
  else
    raise exception 'WOS_INVALID_SOURCE_TYPE' using errcode = '22023';
  end if;

  if v_source_organization_id is null
     or v_source_organization_id <> new.organization_id
     or v_source_version_number <> new.source_version_number
     or v_source_version_label <> new.source_version_label then
    raise exception 'WOS_STALE_READINESS_EVIDENCE' using errcode = '40001';
  end if;

  select * into v_confirmer
  from public.profiles p
  where p.id = new.confirmed_by_profile_id
    and p.org_id = new.organization_id
    and p.is_active = true
    and p.role in ('admin','manager','sales');

  if not found then
    raise exception 'WOS_READINESS_PROFILE_INVALID' using errcode = '42501';
  end if;
  if new.immutable is not true then
    raise exception 'WOS_READINESS_EVIDENCE_MISSING' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.wos_validate_office_submission()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_entity_type text;
  v_source_id uuid;
  v_source_organization_id uuid;
  v_source_version_number integer;
  v_source_version_label text;
  v_source_owner_profile_id uuid;
  v_source_status text;
  v_evidence public.wos_office_readiness_evidence%rowtype;
begin
  if tg_table_name = 'wos_production_order_submissions' then
    v_entity_type := 'PRODUCTION_ORDER';
    v_source_id := new.production_order_id;
    select po.organization_id, po.version, po.version_label,
        po.project_owner_profile_id, po.workflow_status
      into v_source_organization_id, v_source_version_number,
        v_source_version_label, v_source_owner_profile_id,
        v_source_status
      from public.wos_production_orders po
      where po.id = new.production_order_id;
  elsif tg_table_name = 'wos_sampling_request_submissions' then
    v_entity_type := 'SAMPLING_REQUEST';
    v_source_id := new.sampling_request_id;
    select sr.organization_id, sr.version, sr.version_label,
        sr.product_owner_profile_id, sr.workflow_status
      into v_source_organization_id, v_source_version_number,
        v_source_version_label, v_source_owner_profile_id,
        v_source_status
      from public.wos_sampling_requests sr
      where sr.id = new.sampling_request_id;
  else
    raise exception 'WOS_INVALID_SUBMISSION_TABLE' using errcode = '22023';
  end if;

  if v_source_organization_id is null
     or v_source_organization_id <> new.organization_id then
    raise exception 'WOS_SOURCE_ORGANIZATION_MISMATCH' using errcode = '42501';
  end if;
  if v_source_version_number <> new.source_version_number
     or v_source_version_label <> new.source_version_label then
    raise exception 'WOS_STALE_SUBMISSION_VERSION' using errcode = '40001';
  end if;
  if v_source_owner_profile_id <> new.project_owner_profile_id then
    raise exception 'WOS_PROJECT_OWNER_MISMATCH' using errcode = '42501';
  end if;
  if v_source_status <> 'SUBMITTED' then
    raise exception 'WOS_SOURCE_NOT_SUBMITTED' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = new.project_owner_profile_id
      and p.org_id = new.organization_id
      and p.is_active = true
      and p.role in ('admin','manager','sales')
  ) then
    raise exception 'WOS_PROJECT_OWNER_PROFILE_INVALID'
      using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = new.submitted_by_profile_id
      and p.org_id = new.organization_id
      and p.is_active = true
      and p.role in ('admin','manager','sales')
  ) then
    raise exception 'WOS_SUBMITTER_PROFILE_INVALID' using errcode = '42501';
  end if;

  select * into v_evidence
  from public.wos_office_readiness_evidence e
  where e.id = new.readiness_evidence_id;
  if not found
     or v_evidence.organization_id <> new.organization_id
     or v_evidence.entity_type <> v_entity_type
     or v_evidence.source_id <> v_source_id
     or v_evidence.source_version_number <> new.source_version_number
     or v_evidence.source_version_label <> new.source_version_label
     or v_evidence.immutable is not true then
    raise exception 'WOS_READINESS_EVIDENCE_MISSING' using errcode = '22023';
  end if;

  if new.immutable is not true then
    raise exception 'WOS_IMMUTABLE_SUBMISSION_REQUIRED' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.wos_validate_reference_image_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_entity_segment text;
  v_category_segment text;
  v_attempt_segment text;
  v_source_organization_id uuid;
  v_source_version_number integer;
  v_source_version_label text;
  v_expected_object_key text;
  v_previous public.wos_reference_images%rowtype;
begin
  if new.entity_type = 'PRODUCTION_ORDER' then
    v_entity_segment := 'production-order';
    select po.organization_id, po.version, po.version_label
      into v_source_organization_id, v_source_version_number,
        v_source_version_label
      from public.wos_production_orders po
      where po.id = new.entity_id;
  elsif new.entity_type = 'SAMPLING_REQUEST' then
    v_entity_segment := 'sampling-request';
    select sr.organization_id, sr.version, sr.version_label
      into v_source_organization_id, v_source_version_number,
        v_source_version_label
      from public.wos_sampling_requests sr
      where sr.id = new.entity_id;
  else
    raise exception 'WOS_INVALID_SOURCE_TYPE' using errcode = '22023';
  end if;

  if v_source_organization_id is null
     or v_source_organization_id <> new.organization_id then
    raise exception 'WOS_IMAGE_SOURCE_ORGANIZATION_MISMATCH'
      using errcode = '42501';
  end if;
  if new.source_version_number is null
     or new.source_version_number <> v_source_version_number
     or new.version_label <> v_source_version_label then
    raise exception 'WOS_STALE_IMAGE_VERSION' using errcode = '40001';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = new.uploaded_by_profile_id
      and p.org_id = new.organization_id
      and p.is_active = true
  ) then
    raise exception 'WOS_IMAGE_PROFILE_INVALID' using errcode = '42501';
  end if;

  v_category_segment := case new.category
    when 'PRODUCT' then 'product'
    when 'FILM_PATTERN' then 'film-pattern'
    when 'CUSTOMER_APPROVED_SAMPLE' then 'customer-approved-sample'
    when 'SIGNED_SAMPLE' then 'signed-sample'
    when 'SAMPLING_RESULT' then 'sampling-result'
    else null
  end;
  if v_category_segment is null then
    raise exception 'WOS_IMAGE_CATEGORY_NOT_VERSIONED' using errcode = '22023';
  end if;

  if new.category = 'SAMPLING_RESULT' then
    if new.entity_type <> 'SAMPLING_REQUEST'
       or new.technical_attempt_id is null
       or not exists (
         select 1
         from public.wos_sampling_technical_records r
         where r.id = new.technical_attempt_id
           and r.organization_id = new.organization_id
           and r.sampling_request_id = new.entity_id
       ) then
      raise exception 'WOS_RESULT_IMAGE_ATTEMPT_MISMATCH'
        using errcode = '22023';
    end if;
    v_attempt_segment := 'attempt/' || new.technical_attempt_id::text;
  elsif new.technical_attempt_id is not null then
    raise exception 'WOS_TECHNICAL_ATTEMPT_NOT_ALLOWED' using errcode = '22023';
  else
    v_attempt_segment := 'no-attempt';
  end if;

  if new.storage_bucket <> 'wos-private'
     or new.file_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'
     or new.mime_type not in ('image/jpeg','image/png','image/webp')
     or new.file_size <= 0
     or new.file_size > 20971520 then
    raise exception 'WOS_INVALID_IMAGE_FILE' using errcode = '22023';
  end if;

  v_expected_object_key :=
    'organizations/' || new.organization_id::text
    || '/wos/' || v_entity_segment
    || '/' || new.entity_id::text
    || '/' || v_category_segment
    || '/v' || new.source_version_number::text
    || '/' || v_attempt_segment
    || '/' || new.id::text
    || '/' || new.file_name;

  if new.storage_path <> v_expected_object_key
     or left(new.storage_path, 1) = '/'
     or position('..' in new.storage_path) > 0
     or position(chr(92) in new.storage_path) > 0
     or position('?' in new.storage_path) > 0
     or position('#' in new.storage_path) > 0 then
    raise exception 'WOS_PUBLIC_OR_FOREIGN_IMAGE_KEY' using errcode = '22023';
  end if;
  -- Object transfer must finish before immutable metadata is registered.
  if new.image_status <> 'READY' then
    raise exception 'WOS_IMAGE_NOT_READY' using errcode = '22023';
  end if;

  if new.supersedes_image_id is not null then
    select * into v_previous
    from public.wos_reference_images i
    where i.id = new.supersedes_image_id;
    if not found
       or v_previous.organization_id <> new.organization_id
       or v_previous.entity_type <> new.entity_type
       or v_previous.entity_id <> new.entity_id
       or v_previous.category <> new.category
       or v_previous.image_status <> 'READY'
       or v_previous.source_version_number is null
       or v_previous.source_version_number >= new.source_version_number
       or v_previous.version_label = new.version_label then
      raise exception 'WOS_IMAGE_SUPERSESSION_INVALID' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.wos_validate_image_supersession()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_previous public.wos_reference_images%rowtype;
  v_next public.wos_reference_images%rowtype;
begin
  select * into v_previous
  from public.wos_reference_images i
  where i.id = new.previous_image_id;
  select * into v_next
  from public.wos_reference_images i
  where i.id = new.next_image_id;

  if v_previous.id is null or v_next.id is null
     or v_previous.organization_id <> new.organization_id
     or v_next.organization_id <> new.organization_id
     or v_previous.entity_type <> new.entity_type
     or v_next.entity_type <> new.entity_type
     or v_previous.entity_id <> new.source_id
     or v_next.entity_id <> new.source_id
     or v_previous.category <> v_next.category
     or v_next.supersedes_image_id is distinct from v_previous.id
     or v_previous.image_status <> 'READY'
     or v_next.image_status <> 'READY'
     or v_previous.source_version_number <> new.previous_source_version_number
     or v_next.source_version_number <> new.next_source_version_number
     or new.next_source_version_number <= new.previous_source_version_number
     or v_previous.version_label = v_next.version_label then
    raise exception 'WOS_IMAGE_SUPERSESSION_INVALID' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = new.superseded_by_profile_id
      and p.org_id = new.organization_id
      and p.is_active = true
  ) then
    raise exception 'WOS_IMAGE_SUPERSESSION_PROFILE_INVALID'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger wos_office_readiness_evidence_validate
  before insert on public.wos_office_readiness_evidence
  for each row execute function public.wos_validate_office_readiness_evidence();
create trigger wos_production_order_submissions_validate
  before insert on public.wos_production_order_submissions
  for each row execute function public.wos_validate_office_submission();
create trigger wos_sampling_request_submissions_validate
  before insert on public.wos_sampling_request_submissions
  for each row execute function public.wos_validate_office_submission();
create trigger wos_reference_images_validate
  before insert on public.wos_reference_images
  for each row execute function public.wos_validate_reference_image_version();
create trigger wos_reference_image_supersessions_validate
  before insert on public.wos_reference_image_supersessions
  for each row execute function public.wos_validate_image_supersession();

create trigger wos_office_readiness_evidence_immutable
  before update or delete on public.wos_office_readiness_evidence
  for each row execute function public.wos_reject_persistence_fact_mutation();
create trigger wos_production_order_submissions_immutable
  before update or delete on public.wos_production_order_submissions
  for each row execute function public.wos_reject_persistence_fact_mutation();
create trigger wos_sampling_request_submissions_immutable
  before update or delete on public.wos_sampling_request_submissions
  for each row execute function public.wos_reject_persistence_fact_mutation();
create trigger wos_reference_images_immutable
  before update or delete on public.wos_reference_images
  for each row execute function public.wos_reject_persistence_fact_mutation();
create trigger wos_reference_image_supersessions_immutable
  before update or delete on public.wos_reference_image_supersessions
  for each row execute function public.wos_reject_persistence_fact_mutation();
create trigger wos_persistence_audit_events_immutable
  before update or delete on public.wos_persistence_audit_events
  for each row execute function public.wos_reject_persistence_fact_mutation();
create trigger wos_sampling_technical_records_immutable
  before update or delete on public.wos_sampling_technical_records
  for each row execute function public.wos_reject_persistence_fact_mutation();
create trigger wos_status_history_immutable
  before update or delete on public.wos_status_history
  for each row execute function public.wos_reject_persistence_fact_mutation();

-- ---------------------------------------------------------------------------
-- 5. Deterministic projection
-- ---------------------------------------------------------------------------

create or replace view public.wos_workshop_inbox
with (security_invoker = true)
as
select
  'PRODUCTION_ORDER'::text || ':' || po.id::text as task_key,
  'PRODUCTION_ORDER'::text as entity_type,
  po.organization_id,
  po.id as source_id,
  po.version as source_version_number,
  po.version_label,
  po.project_owner_profile_id,
  s.id as submission_id,
  s.submitted_at,
  'SUBMITTED'::text as workflow_status
from public.wos_production_order_submissions s
join public.wos_production_orders po
  on po.id = s.production_order_id
 and po.organization_id = s.organization_id
 and po.version = s.source_version_number
 and po.version_label = s.source_version_label
 and po.project_owner_profile_id = s.project_owner_profile_id
join public.wos_office_readiness_evidence e
  on e.id = s.readiness_evidence_id
 and e.organization_id = po.organization_id
 and e.entity_type = 'PRODUCTION_ORDER'
 and e.source_id = po.id
 and e.source_version_number = po.version
 and e.source_version_label = po.version_label
 and e.immutable = true
join public.profiles owner
  on owner.id = po.project_owner_profile_id
 and owner.org_id = po.organization_id
 and owner.is_active = true
where po.workflow_status = 'SUBMITTED'

union all

select
  'SAMPLING_REQUEST'::text || ':' || sr.id::text as task_key,
  'SAMPLING_REQUEST'::text as entity_type,
  sr.organization_id,
  sr.id as source_id,
  sr.version as source_version_number,
  sr.version_label,
  sr.product_owner_profile_id,
  s.id as submission_id,
  s.submitted_at,
  'SUBMITTED'::text as workflow_status
from public.wos_sampling_request_submissions s
join public.wos_sampling_requests sr
  on sr.id = s.sampling_request_id
 and sr.organization_id = s.organization_id
 and sr.version = s.source_version_number
 and sr.version_label = s.source_version_label
 and sr.product_owner_profile_id = s.project_owner_profile_id
join public.wos_office_readiness_evidence e
  on e.id = s.readiness_evidence_id
 and e.organization_id = sr.organization_id
 and e.entity_type = 'SAMPLING_REQUEST'
 and e.source_id = sr.id
 and e.source_version_number = sr.version
 and e.source_version_label = sr.version_label
 and e.immutable = true
join public.profiles owner
  on owner.id = sr.product_owner_profile_id
 and owner.org_id = sr.organization_id
 and owner.is_active = true
where sr.workflow_status = 'SUBMITTED';

create or replace view public.wos_current_reference_image_versions
with (security_invoker = true)
as
select
  i.*,
  case
    when s.previous_image_id is not null then 'SUPERSEDED'
    else i.image_status
  end as effective_image_status,
  s.next_image_id,
  s.superseded_at
from public.wos_reference_images i
left join public.wos_reference_image_supersessions s
  on s.previous_image_id = i.id
 and s.organization_id = i.organization_id;

-- ---------------------------------------------------------------------------
-- 6. Organization-isolated read surfaces; writes await a reviewed server RPC
-- ---------------------------------------------------------------------------

alter table public.wos_office_readiness_evidence enable row level security;
alter table public.wos_production_order_submissions enable row level security;
alter table public.wos_sampling_request_submissions enable row level security;
alter table public.wos_reference_image_supersessions enable row level security;
alter table public.wos_persistence_audit_events enable row level security;

revoke all on table public.wos_office_readiness_evidence
  from public, anon, authenticated;
revoke all on table public.wos_production_order_submissions
  from public, anon, authenticated;
revoke all on table public.wos_sampling_request_submissions
  from public, anon, authenticated;
revoke all on table public.wos_reference_image_supersessions
  from public, anon, authenticated;
revoke all on table public.wos_persistence_audit_events
  from public, anon, authenticated;

grant select on table public.wos_office_readiness_evidence to authenticated;
grant select on table public.wos_production_order_submissions to authenticated;
grant select on table public.wos_sampling_request_submissions to authenticated;
grant select on table public.wos_reference_image_supersessions to authenticated;
grant select on table public.wos_persistence_audit_events to authenticated;
grant select on table public.wos_workshop_inbox to authenticated;
grant select on table public.wos_current_reference_image_versions to authenticated;

create policy wos_office_readiness_evidence_org_read
  on public.wos_office_readiness_evidence for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and p.org_id = wos_office_readiness_evidence.organization_id
    )
  );

create policy wos_production_order_submissions_org_read
  on public.wos_production_order_submissions for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and p.org_id =
          wos_production_order_submissions.organization_id
    )
  );

create policy wos_sampling_request_submissions_org_read
  on public.wos_sampling_request_submissions for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and p.org_id =
          wos_sampling_request_submissions.organization_id
    )
  );

create policy wos_reference_image_supersessions_org_read
  on public.wos_reference_image_supersessions for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and p.org_id =
          wos_reference_image_supersessions.organization_id
    )
  );

create policy wos_persistence_audit_events_org_read
  on public.wos_persistence_audit_events for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and p.org_id = wos_persistence_audit_events.organization_id
    )
  );

comment on table public.wos_production_order_submissions is
  'Immutable idempotent production-order submission facts. Repository draft only.';
comment on table public.wos_sampling_request_submissions is
  'Immutable idempotent sampling-request submission facts. Repository draft only.';
comment on table public.wos_reference_image_supersessions is
  'Explicit append-only image replacement facts; image rows are never overwritten.';
comment on view public.wos_workshop_inbox is
  'One deterministic workshop task per current matching office submission.';

commit;
