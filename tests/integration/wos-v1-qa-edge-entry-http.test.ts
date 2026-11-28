import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', [
  'dlx',
  'deno@2.9.6',
  'test',
  '--no-config',
  '--no-lock',
  '--node-modules-dir=none',
  '--allow-env',
  '--allow-net',
  '--allow-read',
  '--allow-import',
  'tests/integration/wos-v1-qa-edge-entry-http.deno.test.ts',
], {
  encoding: 'utf8',
  timeout: 180_000,
});

assert.equal(
  result.status,
  0,
  `Deno Edge entry harness failed:\n${result.stdout}\n${result.stderr}`,
);
assert.match(
  result.stdout,
  /WOS_V1_EDGE_ENTRY_HTTP_DENO_HARNESS=PASS/,
);

console.log('WOS_V1_EDGE_ENTRY_HTTP_HARNESS=PASS');
