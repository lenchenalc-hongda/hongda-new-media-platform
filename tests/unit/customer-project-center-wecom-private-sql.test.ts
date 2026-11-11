import assert from 'node:assert/strict';
import fs from 'node:fs';

console.log('\n=== CPC P2-C Private WeCom SQL Security Contract ===');
const root = 'docs/customer-project-center/';
const base = fs.readFileSync(root + 'CPC_P2B_WECOM_PRIVATE_OUTBOX_REHEARSAL.sql', 'utf8');
const worker = fs.readFileSync(root + 'CPC_P2B_WECOM_WORKER_REHEARSAL.sql', 'utf8');
const source = fs.readFileSync(root + 'CPC_P2C_WECOM_CPC_SOURCE_STAGE_REHEARSAL.sql', 'utf8');
const rollback = fs.readFileSync(root + 'CPC_P2C_WECOM_SOURCE_ROLLBACK_QA.sql', 'utf8');

assert.ok(base.includes('create schema if not exists cpc_wecom_private'), 'notifications live in private schema');
assert.ok(base.includes('create role cpc_wecom_worker nologin'), 'no direct-LOGIN worker created');
for (const table of ['app_configs','member_bindings','notification_outbox','notification_attempts']) {
  assert.ok(base.includes('cpc_wecom_private.' + table), 'private table registered: ' + table);
  assert.ok(base.includes('alter table cpc_wecom_private.' + table + ' enable row level security'),
    'RLS for private table: ' + table);
}
assert.ok(base.includes('revoke all on schema cpc_wecom_private from public, anon, authenticated'),
  'never expose private schema to CPC browser');
assert.ok(base.includes('unique (org_id,recipient_profile_id,source_kind,source_id,'),
  'idempotency backed by a real DB uniqueness constraint');
assert.ok(base.includes('cpc_wecom_verify_member') && base.includes('cpc_wecom_verify_outbox'),
  'bound employee + app scope validated at source');
assert.ok(worker.includes('for update of q skip locked'), 'concurrent claim uses SKIP LOCKED');
assert.ok(worker.includes('cpc_wecom_private.is_cpc_due_current(q.id,p_now)'),
  'queue claim must revalidate current CPC business facts');
assert.ok(worker.includes("last_error_code='LEASE_EXPIRED_UNKNOWN'")
  && worker.includes('into cpc_wecom_private.notification_attempts'),
  'crashed worker is quarantined AND has an immutable attempt audit');
assert.ok(source.includes('security definer') && source.includes('set search_path = pg_catalog'),
  'privileged facts are processed in private functions with safe search_path');
assert.ok(source.includes('revoke all on function cpc_wecom_private.stage_cpc_due')
  && source.includes('from public,anon,authenticated'),
  'browser sessions cannot invoke planner');
assert.ok(source.includes('join public.cpc_work_items w') || source.includes('from public.cpc_work_items w'),
  'formal WorkItems are the primary truth');
assert.ok(source.includes("w.assignee_profile_id=q.recipient_profile_id")
  && source.includes("p.owner_profile_id=q.recipient_profile_id"),
  'work assignee and waiting project owner are independent');
assert.ok(source.includes("p.waiting_on <> 'none'")
  && source.includes("w.status in ('pending','in_progress','blocked')"),
  'only active duties can create notifications');
assert.ok(source.includes("state='cancelled'") && source.includes("state in ('pending','retry')"),
  'only unsent stale occurrences cancelled, preserves other audit states');
assert.ok(rollback.includes('rollback;')
  && rollback.includes('QA_COMPLETED_TASK_STILL_CURRENT')
  && rollback.includes('QA_STALE_CPC_FACT_WAS_LEASED')
  && rollback.includes('QA_UNKNOWN_SEND_REDELIVERED'),
  'CPC fake data tests rolled back with stale and unknown guards');
for (const [label,code] of [['private schema',base],['worker',worker],['stage',source]]) {
  assert.ok(!code.includes('qyapi.weixin.qq.com')
    && !code.includes('WECOM_APP_SECRET=')
    && !code.includes('cron.schedule('),
    label + ' must never store real sender credentials or launch external delivery');
}
console.log('PASS: private RLS, no-login worker, current-source locks, audit, and rollback contract');
