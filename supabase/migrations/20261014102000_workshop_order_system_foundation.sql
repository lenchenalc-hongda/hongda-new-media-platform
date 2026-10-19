-- Workshop Order System Phase 1 foundation.
-- REPOSITORY DRAFT ONLY in this task. This migration is NOT executed against any database.
-- Human approval is required before any Production schema/RLS/data change.

create table if not exists public.wos_production_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid,
  customer_name_snapshot text not null check (btrim(customer_name_snapshot) <> ''),
  project_id uuid,
  project_name_snapshot text,
  order_number text not null check (btrim(order_number) <> ''),
  product_name text not null check (btrim(product_name) <> ''),
  sales_owner_profile_id uuid not null references public.profiles(id),
  project_owner_profile_id uuid not null references public.profiles(id),
  priority text not null check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  is_urgent boolean not null default false,
  version_label text not null check (btrim(version_label) <> ''),
  workflow_status text not null default 'DRAFT' check (
    workflow_status in (
      'DRAFT','SUBMITTED','WORKSHOP_REVIEW','NEEDS_INFORMATION','WAITING_MATERIAL',
      'READINESS_CHECK','READY_TO_SCHEDULE','SCHEDULED','READY_TO_START',
      'IN_PRODUCTION','PAUSED','BLOCKED','PRODUCTION_COMPLETED',
      'READY_FOR_SHIPMENT','CLOSED','CANCELLED'
    )
  ),
  requested_quantity integer not null check (requested_quantity > 0),
  current_batch_quantity integer not null check (
    current_batch_quantity > 0 and current_batch_quantity <= requested_quantity
  ),
  planned_ship_date date,
  split_delivery boolean not null default false,
  product_material text not null check (btrim(product_material) <> ''),
  surface_treatment text,
  pattern_scope text,
  seam_tolerance text,
  position_reference text,
  customer_acceptance_standard text,
  packaging_method text,
  carton_quantity integer check (carton_quantity is null or carton_quantity > 0),
  label_marking_rule text,
  created_by_profile_id uuid not null references public.profiles(id),
  submitted_at timestamptz,
  closed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number)
);

create table if not exists public.wos_sampling_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid,
  customer_name_snapshot text not null check (btrim(customer_name_snapshot) <> ''),
  project_id uuid,
  project_name_snapshot text,
  product_name text not null check (btrim(product_name) <> ''),
  product_owner_profile_id uuid not null references public.profiles(id),
  request_stage text not null check (request_stage in ('UNESTABLISHED','ESTABLISHED')),
  objectives jsonb not null check (jsonb_typeof(objectives) = 'array'),
  version_label text not null check (btrim(version_label) <> ''),
  is_urgent boolean not null default false,
  workflow_status text not null default 'DRAFT' check (
    workflow_status in (
      'DRAFT','SUBMITTED','TECHNICIAN_REVIEW','NEEDS_INFORMATION','WAITING_RESOURCE',
      'READY_FOR_SAMPLING','SAMPLING_IN_PROGRESS','RESULT_REVIEW',
      'PROJECT_CONFIRMATION','CLOSED','CANCELLED'
    )
  ),
  result_decision text check (result_decision is null or result_decision in ('PASS','FAIL','CANNOT_SAMPLE')),
  product_material text not null check (btrim(product_material) <> ''),
  surface_treatment text,
  sample_input_quantity integer not null check (sample_input_quantity > 0),
  required_good_quantity integer not null check (
    required_good_quantity > 0 and required_good_quantity <= sample_input_quantity
  ),
  special_fixture_required boolean not null default false,
  film_type text,
  risk_notes text,
  submitted_at timestamptz,
  sampling_completed_at timestamptz,
  closed_at timestamptz,
  created_by_profile_id uuid not null references public.profiles(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wos_resource_readiness (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_type text not null check (entity_type in ('PRODUCTION_ORDER','SAMPLING_REQUEST')),
  entity_id uuid not null,
  resource_type text not null check (resource_type in ('FILM','FIXTURE','INCOMING_MATERIAL','SIGNED_SAMPLE')),
  status text not null,
  expected_at timestamptz,
  arrived_at timestamptz,
  quantity_expected integer check (quantity_expected is null or quantity_expected >= 0),
  quantity_arrived integer check (quantity_arrived is null or quantity_arrived >= 0),
  version_label text,
  confirmed_by_profile_id uuid references public.profiles(id),
  confirmed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id, resource_type)
);

create table if not exists public.wos_reference_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_type text not null check (entity_type in ('PRODUCTION_ORDER','SAMPLING_REQUEST')),
  entity_id uuid not null,
  category text not null check (
    category in (
      'FILM_PATTERN','PRODUCT','CUSTOMER_APPROVED_SAMPLE','SIGNED_SAMPLE',
      'SAMPLING_RESULT','PACKAGING_LABEL','DEFECT_RISK','OTHER'
    )
  ),
  storage_bucket text not null check (btrim(storage_bucket) <> ''),
  storage_path text not null check (btrim(storage_path) <> ''),
  file_name text not null check (btrim(file_name) <> ''),
  mime_type text not null check (btrim(mime_type) <> ''),
  file_size bigint not null check (file_size > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  caption text,
  version_label text not null check (btrim(version_label) <> ''),
  image_status text not null default 'UPLOADING' check (
    image_status in ('UPLOADING','READY','FAILED','QUARANTINED','SUPERSEDED','ARCHIVED')
  ),
  supersedes_image_id uuid references public.wos_reference_images(id),
  superseded_at timestamptz,
  uploaded_by_profile_id uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  check (supersedes_image_id is null or supersedes_image_id <> id)
);

create table if not exists public.wos_visual_baselines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_type text not null check (entity_type in ('PRODUCTION_ORDER','SAMPLING_REQUEST')),
  entity_id uuid not null,
  version_label text not null check (btrim(version_label) <> ''),
  status text not null default 'DRAFT' check (status in ('DRAFT','CURRENT','SUPERSEDED')),
  confirmed_by_office_profile_id uuid references public.profiles(id),
  confirmed_by_workshop_profile_id uuid references public.profiles(id),
  office_confirmed_at timestamptz,
  workshop_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  superseded_at timestamptz
);

create unique index if not exists wos_one_current_visual_baseline
  on public.wos_visual_baselines(entity_type, entity_id)
  where status = 'CURRENT';

create table if not exists public.wos_visual_baseline_items (
  baseline_id uuid not null references public.wos_visual_baselines(id) on delete restrict,
  reference_image_id uuid not null references public.wos_reference_images(id) on delete restrict,
  display_order integer not null default 0 check (display_order >= 0),
  is_required boolean not null default true,
  primary key (baseline_id, reference_image_id)
);

create table if not exists public.wos_blockers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_type text not null check (entity_type in ('PRODUCTION_ORDER','SAMPLING_REQUEST')),
  entity_id uuid not null,
  blocker_code text not null check (btrim(blocker_code) <> ''),
  blocker_category text not null check (btrim(blocker_category) <> ''),
  description text not null check (btrim(description) <> ''),
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED','WAIVED')),
  opened_by_profile_id uuid not null references public.profiles(id),
  resolved_by_profile_id uuid references public.profiles(id),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text
);

create table if not exists public.wos_confirmations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_type text not null check (entity_type in ('PRODUCTION_ORDER','SAMPLING_REQUEST')),
  entity_id uuid not null,
  confirmation_type text not null check (
    confirmation_type in (
      'OFFICE_COMPLETENESS','TECHNICAL','WORKSHOP_SUPERVISOR','QUALITY',
      'VISUAL_BASELINE','PROJECT_OWNER_RESULT','START_RELEASE'
    )
  ),
  decision text not null check (decision in ('CONFIRMED','REJECTED')),
  profile_id uuid not null references public.profiles(id),
  role_snapshot text not null check (btrim(role_snapshot) <> ''),
  note text,
  confirmed_at timestamptz not null default now()
);

create table if not exists public.wos_sampling_technical_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sampling_request_id uuid not null references public.wos_sampling_requests(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  machine_label text not null check (btrim(machine_label) <> ''),
  temperature numeric,
  transfer_seconds numeric check (transfer_seconds is null or transfer_seconds > 0),
  roller_hardness text,
  fixture_mode text,
  pressure_level text check (pressure_level is null or pressure_level in ('LIGHT','MEDIUM','HEAVY')),
  pressure_note text,
  pretreatment text,
  film_version_label text,
  estimated_bulk_efficiency text,
  result_decision text not null check (result_decision in ('PASS','FAIL','CANNOT_SAMPLE')),
  failure_reason text,
  bulk_risk_notes text,
  improvement_recommendation text,
  technician_profile_id uuid not null references public.profiles(id),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (sampling_request_id, attempt_number),
  check (result_decision = 'PASS' or nullif(btrim(failure_reason), '') is not null)
);

create table if not exists public.wos_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_type text not null check (entity_type in ('PRODUCTION_ORDER','SAMPLING_REQUEST')),
  entity_id uuid not null,
  previous_status text,
  next_status text not null check (btrim(next_status) <> ''),
  actor_profile_id uuid not null references public.profiles(id),
  actor_role text not null check (btrim(actor_role) <> ''),
  reason_code text not null check (btrim(reason_code) <> ''),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wos_production_orders_status_idx
  on public.wos_production_orders(organization_id, workflow_status, planned_ship_date);
create index if not exists wos_production_orders_owner_idx
  on public.wos_production_orders(organization_id, project_owner_profile_id, workflow_status);
create index if not exists wos_sampling_requests_status_idx
  on public.wos_sampling_requests(organization_id, workflow_status, created_at desc);
create index if not exists wos_resource_readiness_entity_idx
  on public.wos_resource_readiness(entity_type, entity_id, resource_type, status);
create index if not exists wos_reference_images_entity_idx
  on public.wos_reference_images(entity_type, entity_id, category, version_label);
create index if not exists wos_blockers_open_idx
  on public.wos_blockers(entity_type, entity_id, status)
  where status = 'OPEN';
create index if not exists wos_status_history_entity_idx
  on public.wos_status_history(entity_type, entity_id, created_at desc);

alter table public.wos_production_orders enable row level security;
alter table public.wos_sampling_requests enable row level security;
alter table public.wos_resource_readiness enable row level security;
alter table public.wos_reference_images enable row level security;
alter table public.wos_visual_baselines enable row level security;
alter table public.wos_visual_baseline_items enable row level security;
alter table public.wos_blockers enable row level security;
alter table public.wos_confirmations enable row level security;
alter table public.wos_sampling_technical_records enable row level security;
alter table public.wos_status_history enable row level security;

revoke all on table public.wos_production_orders from anon, authenticated;
revoke all on table public.wos_sampling_requests from anon, authenticated;
revoke all on table public.wos_resource_readiness from anon, authenticated;
revoke all on table public.wos_reference_images from anon, authenticated;
revoke all on table public.wos_visual_baselines from anon, authenticated;
revoke all on table public.wos_visual_baseline_items from anon, authenticated;
revoke all on table public.wos_blockers from anon, authenticated;
revoke all on table public.wos_confirmations from anon, authenticated;
revoke all on table public.wos_sampling_technical_records from anon, authenticated;
revoke all on table public.wos_status_history from anon, authenticated;

grant select, insert on table public.wos_production_orders to authenticated;
grant select, insert on table public.wos_sampling_requests to authenticated;
grant select on table public.wos_resource_readiness to authenticated;
grant select, insert on table public.wos_reference_images to authenticated;
grant select on table public.wos_visual_baselines to authenticated;
grant select on table public.wos_visual_baseline_items to authenticated;
grant select on table public.wos_blockers to authenticated;
grant select on table public.wos_confirmations to authenticated;
grant select on table public.wos_sampling_technical_records to authenticated;
grant select on table public.wos_status_history to authenticated;

create policy wos_production_orders_select_same_org
  on public.wos_production_orders for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and p.org_id = wos_production_orders.organization_id
    )
  );

create policy wos_production_orders_insert_draft_same_org
  on public.wos_production_orders for insert to authenticated
  with check (
    workflow_status = 'DRAFT'
    and created_by_profile_id in (
      select p.id from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and p.org_id = wos_production_orders.organization_id
        and p.role in ('admin','manager','sales')
    )
  );

create policy wos_sampling_requests_select_same_org
  on public.wos_sampling_requests for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and p.org_id = wos_sampling_requests.organization_id
    )
  );

create policy wos_sampling_requests_insert_draft_same_org
  on public.wos_sampling_requests for insert to authenticated
  with check (
    workflow_status = 'DRAFT'
    and result_decision is null
    and created_by_profile_id in (
      select p.id from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and p.org_id = wos_sampling_requests.organization_id
        and p.role in ('admin','manager','sales')
    )
  );

create policy wos_reference_images_select_same_org
  on public.wos_reference_images for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and p.org_id = wos_reference_images.organization_id
    )
  );

create policy wos_reference_images_insert_same_org
  on public.wos_reference_images for insert to authenticated
  with check (
    uploaded_by_profile_id in (
      select p.id from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and p.org_id = wos_reference_images.organization_id
    )
  );

-- Read-only supporting-table policies. Consequential mutations are intentionally
-- not granted to authenticated clients in Phase 1; later phases must use reviewed
-- RPC/server actions for readiness, baseline activation, blockers, confirmations,
-- technical results and status transitions.
create policy wos_resource_readiness_select_same_org
  on public.wos_resource_readiness for select to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_active = true and p.org_id = wos_resource_readiness.organization_id));

create policy wos_visual_baselines_select_same_org
  on public.wos_visual_baselines for select to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_active = true and p.org_id = wos_visual_baselines.organization_id));

create policy wos_visual_baseline_items_select_same_org
  on public.wos_visual_baseline_items for select to authenticated
  using (
    exists (
      select 1
      from public.wos_visual_baselines b
      join public.profiles p on p.org_id = b.organization_id
      where b.id = wos_visual_baseline_items.baseline_id
        and p.user_id = auth.uid()
        and p.is_active = true
    )
  );

create policy wos_blockers_select_same_org
  on public.wos_blockers for select to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_active = true and p.org_id = wos_blockers.organization_id));

create policy wos_confirmations_select_same_org
  on public.wos_confirmations for select to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_active = true and p.org_id = wos_confirmations.organization_id));

create policy wos_sampling_technical_records_select_same_org
  on public.wos_sampling_technical_records for select to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_active = true and p.org_id = wos_sampling_technical_records.organization_id));

create policy wos_status_history_select_same_org
  on public.wos_status_history for select to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_active = true and p.org_id = wos_status_history.organization_id));

-- No UPDATE/DELETE grants are intentionally present. Baselines/images/technical
-- attempts/history must be superseded or appended, never silently overwritten.
