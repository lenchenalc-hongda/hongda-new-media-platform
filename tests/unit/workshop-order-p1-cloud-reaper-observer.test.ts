import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// WOS-owned suite bridge: run real isolated Python regression tests on CI.
// No GitHub App token, Supabase credential, fixture Secret or network is required.
const source = readFileSync('src/lib/workshop-orders/qa-cloud-reaper/observer.py', 'utf8');
if (!source.includes('CLOUD_REAPER_DELETE_DISABLED_UNSERIALIZED_WRITERS')) {
  throw new Error('WOS_REAPER_OBSERVE_ONLY_GUARD_MISSING');
}
if (!source.includes('if method != "GET"')) {
  throw new Error('WOS_REAPER_READ_ONLY_METHOD_GUARD_MISSING');
}
const result = spawnSync('python3', [
  'tests/unit/workshop-order-p1-cloud-reaper-observer.test.py',
], {
  encoding: 'utf8',
  timeout: 45_000,
  env: { ...process.env, WOS_P1_CLEANUP_APP_TOKEN: '' },
});
const output = (result.stdout ?? '') + (result.stderr ?? '');
if (result.error || result.status !== 0 || !output.includes('Ran 20 tests') || !output.includes('\nOK')) {
  throw new Error('WOS_REAPER_PYTHON_TESTS_FAILED ' + String(result.error ?? result.status) + ' ' + output.slice(-600));
}
console.log('WOS_P1_CLOUD_REAPER_OBSERVATION_ONLY_PYTHON_TESTS=PASS count=20');
