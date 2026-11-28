import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';

const SCRIPT =
  'scripts/wos-production-readiness/wos-v1-qa-uat-edge-closer.mjs';
const EXECUTION_ID = 'f5149801-df08-4ce7-b336-df6d449c9aec';
const NONCE = 'f45beece-2a4a-4c3b-ae7b-d262347a4091';
const CODE_SHA =
  'c7c9c37a657fa6457baac095e6adcdeea222b36d1aa4542f7130bc870e45cc24';

function probeEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    ...process.env,
    WOS_V1_QA_AUTHORIZATION_ID: 'WOS-V1-PRODUCTION-M2-QA-UAT-011',
    WOS_V1_QA_EXECUTION_ID: EXECUTION_ID,
    WOS_V1_QA_CODE_SHA256: CODE_SHA,
    WOS_V1_QA_EDGE_PROCESS_NONCE: NONCE,
    WOS_V1_QA_EDGE_CLOSER_TEST_MODE: 'true',
    WOS_V1_QA_EDGE_CLOSER_TEST_PSQL: 'true',
    WOS_QA_PSQL_DOCKER_CONTAINER:
      'codex-wos-prod-readiness-pg17-test',
    WOS_QA_DATABASE: 'wos_v1_qa_test_ci',
    WOS_QA_EDGE_SERVICE_ROLE_KEY: 'test-service-key',
    WOS_V1_QA_EDGE_PROXY: '',
    HTTPS_PROXY: '',
    https_proxy: '',
    ...overrides,
  };
}

async function probeAgainstLocalHttp(
  mode: 'OPEN' | 'CLOSED',
  status: number,
  payload: Record<string, unknown>,
): Promise<string> {
  const server = http.createServer((request, response) => {
    const valid = request.method === 'POST'
      && request.headers.authorization === 'Bearer test-service-key'
      && request.headers.apikey === 'test-service-key'
      && request.headers['x-wos-qa-uat-authorization-id']
        === 'WOS-V1-PRODUCTION-M2-QA-UAT-011'
      && request.headers['x-wos-qa-uat-execution-id'] === EXECUTION_ID
      && request.headers['x-wos-qa-uat-closer-nonce'] === NONCE
      && request.headers['x-wos-qa-closer-probe'] === '1';
    response.writeHead(valid ? status : 401, {
      'content-type': 'application/json',
    });
    response.end(JSON.stringify(valid ? payload : {
      ok: false,
      code: 'WOS_V1_QA_EDGE_PROBE_UNAUTHORIZED',
      data: null,
    }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  try {
    const child = spawn(process.execPath, [
      SCRIPT,
      'credential-preflight',
    ], {
      env: probeEnv({
        WOS_V1_QA_EDGE_PROBE_EXPECT: mode,
        WOS_V1_QA_EDGE_FUNCTION_URL:
          `http://127.0.0.1:${address.port}/functions/v1/wos-v1-verify-image`,
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    assert.equal(code, 0, stderr);
    return stdout;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
}

const open = await probeAgainstLocalHttp('OPEN', 200, {
  ok: true,
  code: 'WOS_V1_QA_EDGE_OPEN_PROBE',
  data: {
    gateStatus: 'OPEN',
    executionId: EXECUTION_ID,
  },
});
assert(open.includes('EDGE_CREDENTIAL_PREFLIGHT=PASS'));
assert(open.includes('"httpStatus":200'));
assert(open.includes('WOS_V1_QA_EDGE_OPEN_PROBE'));

const closed = await probeAgainstLocalHttp('CLOSED', 503, {
  ok: false,
  code: 'WOS_V1_QA_EDGE_CLOSED',
  data: {
    gateStatus: 'CLOSED',
    executionId: EXECUTION_ID,
    closedAt: '2026-11-28T04:29:16.531388Z',
  },
});
assert(closed.includes('EDGE_CREDENTIAL_PREFLIGHT=PASS'));
assert(closed.includes('"httpStatus":503'));
assert(closed.includes('WOS_V1_QA_EDGE_CLOSED'));

for (const [label, overrides] of [
  ['MISSING_NONCE', { WOS_V1_QA_EDGE_PROCESS_NONCE: undefined }],
  ['BAD_URL', { WOS_V1_QA_EDGE_FUNCTION_URL: 'not-a-http-url' }],
] as const) {
  const result = spawnSync(process.execPath, [
    SCRIPT,
    'credential-preflight',
  ], {
    env: probeEnv(overrides),
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.notEqual(result.status, 0, `${label} unexpectedly passed`);
}

console.log('WOS_V1_QA_EDGE_PROBE_HTTP_ENVELOPE=PASS');
console.log('WOS_V1_QA_EDGE_PROBE_MISSING_NONCE_FAIL_CLOSED=PASS');
console.log('WOS_V1_QA_EDGE_PROBE_BAD_URL_FAIL_CLOSED=PASS');
