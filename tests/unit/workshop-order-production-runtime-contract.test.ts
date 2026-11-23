import assert from 'node:assert/strict';
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

console.log('workshop-order-production-runtime-contract.test.ts: PASS');
console.log('WOS_V1_PRODUCTION_PROJECT_PIN=PASS');
console.log('WOS_V1_PRODUCTION_WRITES_DEFAULT_OFF=PASS');
console.log('WOS_V1_QA_PROJECT_NOT_PRODUCTION_RUNTIME=PASS');
console.log('WOS_V1_CAN_START_FALSE=PASS');
