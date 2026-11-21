import assert from 'node:assert/strict';
import {
  isWosQaRevisionImageUploadEnabled,
} from '../../src/lib/workshop-orders/api-contract';

const qaUrl = 'https://xulmpqaknlwqqculbsek.supabase.co';
const cases: Array<[string, Parameters<typeof isWosQaRevisionImageUploadEnabled>[0], boolean]> = [
  ['preview production-mode QA', {
    enabled: 'true', vercelEnv: 'preview', nodeEnv: 'production', supabaseUrl: qaUrl,
  }, true],
  ['preview development-mode QA', {
    enabled: 'true', vercelEnv: 'preview', nodeEnv: 'development', supabaseUrl: qaUrl,
  }, true],
  ['local development loopback', {
    enabled: 'true', nodeEnv: 'development', supabaseUrl: 'http://127.0.0.1:55421',
    allowLocal: 'true',
  }, true],
  ['production deployment', {
    enabled: 'true', vercelEnv: 'production', nodeEnv: 'production', supabaseUrl: qaUrl,
  }, false],
  ['unknown Vercel environment', {
    enabled: 'true', vercelEnv: 'staging', nodeEnv: 'production', supabaseUrl: qaUrl,
  }, false],
  ['unset Vercel production next build', {
    enabled: 'true', nodeEnv: 'production', supabaseUrl: qaUrl,
  }, false],
  ['wrong project', {
    enabled: 'true', vercelEnv: 'preview', nodeEnv: 'production',
    supabaseUrl: 'https://amqpvxrurenevniilhtl.supabase.co',
  }, false],
  ['suffix attack', {
    enabled: 'true', vercelEnv: 'preview', nodeEnv: 'production',
    supabaseUrl: qaUrl + '.evil.test',
  }, false],
  ['server switch off', {
    enabled: 'false', vercelEnv: 'preview', nodeEnv: 'production', supabaseUrl: qaUrl,
  }, false],
  ['production-mode loopback', {
    enabled: 'true', nodeEnv: 'production', supabaseUrl: 'http://127.0.0.1:55421',
    allowLocal: 'true',
  }, false],
];

for (const [label, input, expected] of cases) {
  assert.equal(isWosQaRevisionImageUploadEnabled(input), expected, label);
}

console.log('workshop-order-qa-revision-environment.test.ts: PASS');
console.log('WOS_QA_REVISION_PREVIEW_PRODUCTION_MODE=PASS');
console.log('WOS_QA_REVISION_ENV_MATRIX_CASES=' + cases.length);
