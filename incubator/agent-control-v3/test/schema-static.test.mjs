import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../db/001_control_plane.sql',import.meta.url),'utf8');
test('P1: proposed schema has private role permissions and fail-closed primitives',()=>{
  for(const name of ['projects','epics','tasks','task_dependencies','executions','events','outbox',
    'path_locks','approvals','releases','heartbeats','inbound_deliveries'])
    assert(sql.includes(`create table ac_control.${name} (`),`missing ${name}`);
  for(const needle of [
    'revoke all on schema ac_control from public',
    'revoke all on schema ac_control from anon',
    'revoke all on schema ac_control from authenticated',
    'enable row level security',
    'pg_advisory_xact_lock(19260801)',
    't.revision<>p_expected_revision',
    "p.dispatch_owner<>'V3'",
    "then raise exception 'SHARED_PATH_CONFLICT'",
    "raise exception 'EPIC_NOT_APPROVED'",
    "then raise exception 'SCOPE_EXCEEDS_EPIC'",
    'lease_epoch=new_epoch',
    "'GITHUB_DISPATCH'",
    "set status='RECONCILING'",
    'revoke all on all functions in schema ac_control from public',
  ])assert(sql.includes(needle),`missing guard: ${needle}`);
});

const ops=readFileSync(new URL('../db/002_runtime_ops.sql',import.meta.url),'utf8');
test('P2: durable outbox cannot directly mark a task coding after HTTP 204',()=>{
  for(const needle of ['begin_outbox_send','OUTBOX_ALREADY_INFLIGHT_OR_STALE',
    "state='AMBIGUOUS'",'bind_verified_workflow_run','OIDC_VERIFIED_RUN_BOUND',
    'STALE_RUN_EPOCH','record_verified_delivery','on conflict(delivery_id) do nothing',
    'revoke all on all functions in schema ac_control from public'])
    assert(ops.includes(needle),`missing P2 invariant ${needle}`);
});
