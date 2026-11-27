import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, [
  'tests/live/wos-v1-qa-edge-finalizer.mjs',
], {
  encoding: 'utf8',
  timeout: 30_000,
});

assert.equal(
  result.status,
  0,
  `Edge finalizer harness failed:\n${result.stdout}\n${result.stderr}`,
);
assert.match(result.stdout, /WOS_V1_QA_EDGE_FINALIZER=PASS/);

console.log('WOS_V1_QA_EDGE_FINALIZER_HARNESS=PASS');
