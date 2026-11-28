import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  WOS_PRODUCTION_SUPABASE_REF,
  WOS_QA_SUPABASE_REF,
  WOS_V1_PRODUCTION_RPC_NAMES,
  canInvokeWosV1ProductionWrite,
  classifyWosSupabaseRuntime,
  resolveWosProductionRuntime,
  wosV1ReadOnlyInvariant,
} from '../../src/lib/workshop-orders/production-runtime-contract';

assert.equal(
  classifyWosSupabaseRuntime(
    'https://' + WOS_PRODUCTION_SUPABASE_REF + '.supabase.co',
  ),
  'production',
);
assert.equal(
  classifyWosSupabaseRuntime('https://' + WOS_QA_SUPABASE_REF + '.supabase.co'),
  'qa',
);
assert.equal(
  classifyWosSupabaseRuntime('https://example.supabase.co'),
  'foreign',
);
assert.equal(
  classifyWosSupabaseRuntime(
    'https://' + WOS_PRODUCTION_SUPABASE_REF + '.supabase.co.evil.test',
  ),
  'foreign',
);
assert.equal(
  classifyWosSupabaseRuntime(
    'http://' + WOS_PRODUCTION_SUPABASE_REF + '.supabase.co',
  ),
  'foreign',
);

const disabled = resolveWosProductionRuntime({
  vercelEnv: 'production',
  authMode: 'supabase',
  supabaseUrl: 'https://' + WOS_PRODUCTION_SUPABASE_REF + '.supabase.co',
  writesEnabled: 'false',
});
assert.equal(disabled.project, 'production');
assert.equal(disabled.writesEnabled, false);
assert.equal(canInvokeWosV1ProductionWrite('admin', disabled), false);

const qaUrl = resolveWosProductionRuntime({
  vercelEnv: 'preview',
  authMode: 'supabase',
  supabaseUrl: 'https://' + WOS_QA_SUPABASE_REF + '.supabase.co',
  writesEnabled: 'true',
});
assert.equal(qaUrl.project, 'qa');
assert.equal(qaUrl.writesEnabled, false);
assert.equal(canInvokeWosV1ProductionWrite('admin', qaUrl), false);

const previewProduction = resolveWosProductionRuntime({
  vercelEnv: 'preview',
  authMode: 'supabase',
  supabaseUrl: 'https://' + WOS_PRODUCTION_SUPABASE_REF + '.supabase.co',
  writesEnabled: 'true',
});
assert.equal(previewProduction.writesEnabled, false);

const enabled = resolveWosProductionRuntime({
  vercelEnv: 'production',
  authMode: 'supabase',
  supabaseUrl: 'https://' + WOS_PRODUCTION_SUPABASE_REF + '.supabase.co',
  writesEnabled: 'true',
});
assert.equal(enabled.writesEnabled, true);
assert.equal(canInvokeWosV1ProductionWrite('admin', enabled), true);
assert.equal(canInvokeWosV1ProductionWrite('manager', enabled), true);
assert.equal(canInvokeWosV1ProductionWrite('sales', enabled), true);
assert.equal(canInvokeWosV1ProductionWrite('operator', enabled), true);
assert.equal(canInvokeWosV1ProductionWrite('viewer', enabled), false);
assert.equal(canInvokeWosV1ProductionWrite('workshop', enabled), false);
assert.equal(canInvokeWosV1ProductionWrite(undefined, enabled), false);

assert(Object.values(WOS_V1_PRODUCTION_RPC_NAMES)
  .every(name => name.startsWith('wos_') && !name.startsWith('wos_qa_')));
assert(!Object.values(WOS_V1_PRODUCTION_RPC_NAMES)
  .some(name => name.includes('gate') || name.includes('preview')));
assert.deepEqual(wosV1ReadOnlyInvariant(), {
  reviewReadyBeforeProof: false,
  canStart: false,
});

const runtimeForwardSql = readFileSync(resolve(
  'docs/workshop-order-system/production-readiness/sql/',
  'WOS_V1_PRODUCTION_RUNTIME_FORWARD_NOT_AUTHORIZED.sql',
), 'utf8');
const runtimeRollbackSql = readFileSync(resolve(
  'docs/workshop-order-system/production-readiness/sql/',
  'WOS_V1_PRODUCTION_RUNTIME_ROLLBACK_NOT_AUTHORIZED.sql',
), 'utf8');
const p7CandidateSql = readFileSync(resolve(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_P7_INSTALL.sql',
), 'utf8');
const proofRenewalSql = readFileSync(resolve(
  'docs/workshop-order-system/production-readiness/sql/',
  'V1_APP_01_PROOF_RENEWAL_NOT_AUTHORIZED.sql',
), 'utf8');

assert.match(
  runtimeForwardSql,
  /p_storage_object_version IS NULL[\s\S]*length\(btrim\(p_storage_object_version\)\) = 0/,
);
assert.match(
  p7CandidateSql,
  /storage_object_version text NOT NULL[\s\S]*length\(storage_object_version\) BETWEEN 1 AND 512/,
);
assert.match(
  runtimeRollbackSql,
  /WOS_V1_RUNTIME_ROLLBACK_REQUIRES_DATA_RETENTION_DECISION/,
);
assert.match(
  runtimeRollbackSql,
  /FOREACH v_table IN ARRAY ARRAY\[[\s\S]*wos_order_create_receipts/,
);
for (const marker of [
  "'WAITING_MATERIAL', 'READINESS_CHECK'",
  'RENEWAL_IMAGE_NOT_CURRENT',
  'RENEWAL_CURRENT_IMAGE_SET_INVALID',
  'RENEWAL_IMAGE_NOT_IN_CURRENT_BASELINE',
  'RENEWAL_STORAGE_OBJECT_CHANGED',
  "v_object.metadata->>'mimetype' <> 'image/png'",
  "v_object.version IS DISTINCT FROM p_storage_object_version",
  'WHEN v_requires_current_images THEN v_image.category',
  "ELSE replace(v_category_slug, '-', '_')",
  "'sha256', p_sha256",
]) assert(proofRenewalSql.includes(marker), `renewal missing ${marker}`);
assert(!proofRenewalSql.includes(
  "v_order.workflow_status NOT IN ('DRAFT', 'NEEDS_INFORMATION')",
));
assert(!proofRenewalSql.includes(
  'object.owner_id = p_actor_user_id::text',
), 'renewal must bind the immutable object, not the current actor, as uploader');

console.log('workshop-order-production-runtime-contract.test.ts: PASS');
console.log('WOS_V1_PRODUCTION_PROJECT_PIN=PASS');
console.log('WOS_V1_PRODUCTION_WRITES_DEFAULT_OFF=PASS');
console.log('WOS_V1_QA_PROJECT_NOT_PRODUCTION_RUNTIME=PASS');
console.log('WOS_V1_CAN_START_FALSE=PASS');
console.log('WOS_V1_STORAGE_VERSION_STRICT=PASS');
console.log('WOS_V1_RUNTIME_ROLLBACK_DATA_GUARD=PASS');
