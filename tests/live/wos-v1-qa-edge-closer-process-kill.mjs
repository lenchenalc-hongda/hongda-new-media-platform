#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const script = join(
  ROOT,
  'scripts/wos-production-readiness/wos-v1-qa-uat-edge-closer.mjs',
);
const executionId = process.env.WOS_QA_UAT_CLOSER_EXECUTION_ID;
const armToken = process.env.WOS_QA_UAT_CLOSER_ARM_TOKEN;
const processNonce = process.env.WOS_QA_UAT_EDGE_PROCESS_NONCE;
const container = process.env.WOS_QA_PSQL_DOCKER_CONTAINER;
const database = process.env.WOS_QA_DATABASE;
const codeSha = process.env.WOS_QA_UAT_CLOSER_CODE_SHA || 'a'.repeat(64);
const controlSchema =
  process.env.WOS_QA_CLOSER_CONTROL_SCHEMA || 'wos_v1_qa_uat';
const receiptOutputPath =
  process.env.WOS_QA_UAT_EDGE_CLOSE_RECEIPT_OUTPUT;

function fail(code) {
  throw new Error(code);
}

function query(sql) {
  const result = spawnSync(
    'docker',
    [
      'exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', database, '-At', '-f', '-',
    ],
    { input: sql, encoding: 'utf8' },
  );
  if (result.status !== 0) fail('EDGE_CLOSER_DB_QUERY_FAILED');
  return String(result.stdout || '').trim();
}

if (!executionId || !armToken || !processNonce || !container || !database) {
  fail('EDGE_CLOSER_TEST_ENV_REQUIRED');
}
if (!['wos_v1_qa_uat','wos_v1_qa_closer'].includes(controlSchema)) {
  fail('EDGE_CLOSER_CONTROL_SCHEMA_INVALID');
}
const controlTable =
  controlSchema === 'wos_v1_qa_uat' ? 'closeout_controls' : 'controls';
const armReceiptTable =
  controlSchema === 'wos_v1_qa_uat'
    ? 'closer_arm_receipts'
    : 'arm_receipts';
const closeReceiptTable =
  controlSchema === 'wos_v1_qa_uat'
    ? 'closer_close_receipts'
    : 'close_receipts';

const dir = mkdtempSync(join(tmpdir(), 'wos-edge-closer-'));
const statePath = join(dir, `${executionId}.json`);
let server;
try {
  server = http.createServer((request, response) => {
    const authorized = request.headers.authorization === 'Bearer test-service-key'
      && request.headers['x-wos-qa-uat-authorization-id']
        === 'WOS-V1-PRODUCTION-M2-QA-UAT-003'
      && request.headers['x-wos-qa-uat-execution-id'] === executionId
      && request.headers['x-wos-qa-uat-closer-nonce'] === processNonce
      && request.headers['x-wos-qa-closer-probe'] === '1';
    let closedAt = '';
    if (authorized) {
      try {
        closedAt = query(`
          SELECT to_jsonb(closed_at)#>>'{}'
          FROM ${controlSchema}.${closeReceiptTable}
          WHERE execution_id='${executionId}'::uuid
            AND closer_kind='EDGE';
        `);
      } catch {
        closedAt = '';
      }
    }
    response.writeHead(authorized ? 503 : 401, {
      'Content-Type': 'application/json',
    });
    response.end(JSON.stringify({
      ok: false,
      code: authorized ? 'WOS_V1_QA_EDGE_CLOSED' : 'UNAUTHORIZED_PROBE',
      data: authorized
        ? {
            gateStatus: 'CLOSED',
            executionId,
            closedAt,
          }
        : null,
    }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') fail('EDGE_CLOSER_PROBE_BIND_FAILED');

  const state = {
    schemaVersion: 1,
    status: 'ARMED',
    executionId,
    authorizationId: 'WOS-V1-PRODUCTION-M2-QA-UAT-003',
    projectRef: 'xulmpqaknlwqqculbsek',
    codeSha256: codeSha,
    functionUrl: `http://127.0.0.1:${address.port}/`,
    processNonce,
    launchdLabel: 'com.hongda.wos.qa-edge-closer.local-test',
    writeDeadlineAt: new Date(Date.now() + 8000).toISOString(),
    edgeCleanupDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  const heartbeatBefore = query(`
    SELECT edge_last_heartbeat_at
    FROM ${controlSchema}.${controlTable}
    WHERE execution_id='${executionId}'::uuid;
  `);

  const launcher = [
    "const {spawn}=require('node:child_process');",
    `const child=spawn(process.execPath,${JSON.stringify([
      script,
      'watch',
      '--loop',
      '--state',
      statePath,
    ])},{detached:true,stdio:'ignore',env:process.env});`,
    'child.unref();',
  ].join('');
  const launched = spawnSync(process.execPath, ['-e', launcher], {
    env: {
      ...process.env,
      WOS_V1_QA_EDGE_CLOSER_TEST_MODE: 'true',
      WOS_V1_QA_EDGE_CLOSER_TEST_PSQL: 'true',
      WOS_V1_QA_ARM_TOKEN: armToken,
      WOS_QA_EDGE_SERVICE_ROLE_KEY: 'test-service-key',
      WOS_QA_PSQL_DOCKER_CONTAINER: container,
      WOS_QA_DATABASE: database,
    },
    encoding: 'utf8',
  });
  if (launched.status !== 0) fail('EDGE_CLOSER_LAUNCHER_FAILED');

  const deadline = Date.now() + 20_000;
  let closed;
  while (Date.now() < deadline) {
    try {
      const current = JSON.parse(readFileSync(statePath, 'utf8'));
      if (current.status === 'CLOSED') {
        closed = current;
        break;
      }
    } catch {
      // State is replaced atomically enough for this single-writer harness.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!closed || closed.closeReceipt?.probe?.ok !== true) {
    fail('DETACHED_EDGE_CLOSER_DID_NOT_VERIFY_CLOSE');
  }

  const dbState = query(`
    SELECT jsonb_build_object(
      'edgeState',edge_state,
      'closeReceipts',(
        SELECT count(*) FROM ${controlSchema}.${closeReceiptTable} receipt
        WHERE receipt.execution_id='${executionId}'::uuid
          AND receipt.closer_kind='EDGE'
      ),
      'edgeLastHeartbeatAt',edge_last_heartbeat_at,
      'receiptHeartbeatAt',(
        SELECT max(receipt.heartbeat_at)
        FROM ${controlSchema}.${armReceiptTable} receipt
        WHERE receipt.execution_id='${executionId}'::uuid
          AND receipt.closer_kind='EDGE'
      )
    )::text
    FROM ${controlSchema}.${controlTable}
    WHERE execution_id='${executionId}'::uuid;
  `);
  const parsed = JSON.parse(dbState.split('\n').filter(Boolean).at(-1));
  if (parsed.edgeState !== 'CLOSED' || parsed.closeReceipts !== 1) {
    fail('EDGE_CLOSER_DATABASE_RECEIPT_MISMATCH');
  }
  if (!parsed.edgeLastHeartbeatAt
    || parsed.edgeLastHeartbeatAt === heartbeatBefore) {
    process.stderr.write(`${JSON.stringify({
      heartbeatBefore,
      edgeLastHeartbeatAt: parsed.edgeLastHeartbeatAt,
      receiptHeartbeatAt: parsed.receiptHeartbeatAt,
    })}\n`);
    fail('EDGE_CLOSER_PROCESS_HEARTBEAT_UNCHANGED');
  }
  if (receiptOutputPath) {
    writeFileSync(receiptOutputPath, `${JSON.stringify(closed, null, 2)}\n`, {
      mode: 0o600,
    });
  }
  process.stdout.write('WOS_V1_QA_EDGE_CLOSER_MAIN_PROCESS_EXIT=PASS\n');
  process.stdout.write('WOS_V1_QA_EDGE_CLOSER_DETACHED_PROCESS=PASS\n');
  process.stdout.write('WOS_V1_QA_EDGE_CLOSER_PROCESS_HEARTBEAT=PASS\n');
  process.stdout.write('WOS_V1_QA_EDGE_CLOSER_HTTP_CLOSED_PROBE=PASS\n');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
