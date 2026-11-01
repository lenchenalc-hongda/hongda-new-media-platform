-- P2 operations proposal for dedicated ac_control private schema only.
-- Must be reviewed and applied only after 001_control_plane.sql in an isolated DB.
-- Functions are security-definer and have PUBLIC execution revoked; a dedicated
-- backend identity must be provisioned and attested in a separate approved step.

begin;

create or replace function ac_control.begin_outbox_send(p_op_key text, p_expected_epoch bigint)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,ac_control as $$
declare o ac_control.outbox%rowtype; t ac_control.tasks%rowtype;
begin
  perform pg_advisory_xact_lock(19260801);
  select * into o from ac_control.outbox where op_key=p_op_key for update;
  if not found or o.state<>'PENDING' or o.lease_epoch<>p_expected_epoch then
    raise exception 'OUTBOX_ALREADY_INFLIGHT_OR_STALE';
  end if;
  select * into t from ac_control.tasks where id=o.task_id for update;
  if not found or t.lease_epoch<>p_expected_epoch or t.status<>'DISPATCHING'
    or t.lease_expires_at<=now() then raise exception 'TASK_DISPATCH_NOT_CURRENT'; end if;
  update ac_control.outbox set state='INFLIGHT',attempts=attempts+1,changed_at=now()
    where id=o.id;
  insert into ac_control.events(event_key,task_id,event_type,actor,data)
    values('dispatch-attempt:'||o.op_key,o.task_id,'DISPATCH_INFLIGHT','ac_dispatcher',
      jsonb_build_object('epoch',p_expected_epoch)) on conflict(event_key) do nothing;
  return jsonb_build_object('op_key',o.op_key,'task_id',o.task_id,
    'lease_epoch',o.lease_epoch,'payload',o.payload);
end;
$$;

-- The HTTP 204 acknowledgement deliberately does not mark a task CODING.
-- After an uncertain HTTP outcome the message remains AMBIGUOUS until the
-- corresponding GitHub worker submits a valid signed workflow identity.
create or replace function ac_control.mark_outbox_ambiguous(p_op_key text,p_expected_epoch bigint)
returns boolean language plpgsql security definer
set search_path=pg_catalog,ac_control as $$
declare n integer;
begin
  update ac_control.outbox set state='AMBIGUOUS',changed_at=now()
    where op_key=p_op_key and lease_epoch=p_expected_epoch and state='INFLIGHT';
  get diagnostics n=row_count;
  return n=1;
end;
$$;

-- IMPORTANT: This function must be callable exclusively by a backend service
-- which VERIFIED GitHub OIDC signature and immutable run/repository/workflow
-- identity. The SQL function cannot verify the JWT. Do NOT grant this to
-- the Coding runner, anon/authenticated, or a general service-role client.
create or replace function ac_control.bind_verified_workflow_run(
  p_task_id uuid, p_epoch bigint, p_run_id bigint, p_run_attempt integer,
  p_attestation_digest text)
returns boolean language plpgsql security definer
set search_path=pg_catalog,ac_control as $$
declare t ac_control.tasks%rowtype; o ac_control.outbox%rowtype;
begin
  perform pg_advisory_xact_lock(19260801);
  if p_run_id<=0 or p_run_attempt<1 or p_attestation_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_ATTESTATION_REFERENCE'; end if;
  select * into t from ac_control.tasks where id=p_task_id for update;
  if not found or t.lease_epoch<>p_epoch or t.status<>'DISPATCHING'
     or t.lease_expires_at<=now() then raise exception 'STALE_RUN_EPOCH'; end if;
  select * into o from ac_control.outbox
    where op_key='dispatch:'||p_task_id::text||':'||p_epoch
    and state in ('INFLIGHT','AMBIGUOUS') for update;
  if not found then raise exception 'OUTBOX_NOT_AMBIGUOUS'; end if;
  if exists (select 1 from ac_control.executions where github_run_id=p_run_id
             and (task_id<>p_task_id or lease_epoch<>p_epoch)) then
    raise exception 'GITHUB_RUN_ALREADY_BOUND_TO_ANOTHER_TASK'; end if;
  update ac_control.executions set github_run_id=p_run_id,
    github_run_attempt=p_run_attempt,state='CODING'
    where task_id=p_task_id and lease_epoch=p_epoch;
  update ac_control.outbox set state='ACKED',changed_at=now() where id=o.id;
  update ac_control.tasks set status='CODING',revision=revision+1,
    last_run_id=p_run_id,updated_at=now() where id=p_task_id and lease_epoch=p_epoch;
  insert into ac_control.events(event_key,task_id,event_type,actor,data)
    values('github-run:'||p_run_id::text,p_task_id,'OIDC_VERIFIED_RUN_BOUND',
      'ac_attestation_service',jsonb_build_object('sha256',p_attestation_digest,
       'run_id',p_run_id,'attempt',p_run_attempt,'epoch',p_epoch));
  return true;
end;
$$;

-- Reconcile never automatically reclaims an ambiguous dispatch. To requeue a
-- task, external GitHub run history must first be proven definitively absent
-- by a separately audited reconciler. No unrestricted requeue RPC exists.

-- Store verified inbound GitHub webhook receipt idempotently. Source payload
-- must already have passed HMAC verification by the receiver.
create or replace function ac_control.record_verified_delivery(
 p_delivery_id uuid,p_event_type text,p_digest text,p_payload jsonb)
returns boolean language plpgsql security definer
set search_path=pg_catalog,ac_control as $$
declare n integer;
begin
  if p_digest !~ '^[a-f0-9]{64}$' or p_event_type not in
   ('workflow_run','pull_request','check_run','deployment_status','push') then
    raise exception 'INVALID_VERIFIED_DELIVERY';
  end if;
  insert into ac_control.inbound_deliveries(delivery_id,event_type,digest,payload)
    values(p_delivery_id,p_event_type,p_digest,p_payload)
    on conflict(delivery_id) do nothing;
  get diagnostics n=row_count;
  if n=1 then
    insert into ac_control.events(event_key,task_id,event_type,actor,data)
      values('delivery:'||p_delivery_id::text,null,'GITHUB_WEBHOOK','ac_webhook_receiver',
       jsonb_build_object('event_type',p_event_type));
  end if;
  return n=1;
end;
$$;

revoke all on all functions in schema ac_control from public;
revoke all on all functions in schema ac_control from anon;
revoke all on all functions in schema ac_control from authenticated;
commit;
