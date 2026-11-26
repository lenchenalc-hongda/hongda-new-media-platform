import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const install = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_INSTALL_NOT_AUTHORIZED.sql',
  'utf8',
);
const ownerGate = readFileSync(
  'docs/workshop-order-system/production-readiness/WOS_V1_PRODUCTION_M2_QA_UAT_OWNER_GATE_20261126.md',
  'utf8',
);
const inputs = JSON.parse(readFileSync(
  'docs/workshop-order-system/qa-fixture/production-m2-uat-20261126/inputs.json',
  'utf8',
)) as {
  environment: Record<string, string>;
  edgeEnvironment: Record<string, string | boolean>;
  dbCloserEnvironment: Record<string, string>;
};
const dbCloser = readFileSync(
  'scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs',
  'utf8',
);
const edgeCloser = readFileSync(
  'scripts/wos-production-readiness/wos-v1-qa-uat-edge-closer.mjs',
  'utf8',
);
const edgeProcessKill = readFileSync(
  'tests/live/wos-v1-qa-edge-closer-process-kill.mjs',
  'utf8',
);
const edgeFunction = readFileSync(
  'supabase/functions/wos-v1-verify-image/index.ts',
  'utf8',
);
const appClient = readFileSync(
  'src/lib/workshop-orders/production-app-client.ts',
  'utf8',
);

for (const marker of [
  'wos_v1_qa_uat.closeout_controls',
  'wos_v1_qa_uat.closer_arm_receipts',
  'wos_v1_qa_uat.closer_close_receipts',
  "interval '480 seconds'",
  "interval '540 seconds'",
  "interval '840 seconds'",
  'QA_UAT_WRITE_DEADLINE_EXPIRED',
  'QA_UAT_CLOSERS_NOT_ARMED',
  'wos_v1_qa_uat.arm_db_closer',
  'wos_v1_qa_uat.record_db_heartbeat',
  'wos_v1_qa_uat.record_edge_heartbeat',
  'wos_v1_qa_uat.bind_qa_uat_order',
  'wos_v1_qa_uat.close_db_closer',
  'wos_v1_qa_uat.close_edge_closer',
  'wos_v1_qa_uat.db_close_tick',
  'wos_v1_qa_uat.edge_close_tick',
  'QA_UAT_DB_CLOSER_REOPEN_FORBIDDEN',
  'QA_UAT_EDGE_CLOSER_REOPEN_FORBIDDEN',
  'authorized_create_request_id',
  'authorized_actor_profile_id',
  'authorized_payload_fingerprint',
  'authorized_order_number',
  'authorized_customer_id',
  'authorized_project_id',
  'public.wos_v1_qa_uat_edge_write_allowed',
  'public.wos_v1_qa_uat_edge_control_status',
  'public.wos_v1_qa_uat_edge_heartbeat',
  'public.wos_v1_qa_uat_bind_order',
  'public.wos_v1_qa_uat_close_edge',
  'public.wos_v1_qa_uat_edge_probe',
  'public.wos_v1_qa_uat_edge_record_proof',
  'QA_UAT_CLOSER_HEARTBEAT_STALE',
  'QA_UAT_ORDER_NOT_BOUND',
  'QA_UAT_ORDER_BINDING_DRIFT',
  'wos_v1_qa_uat.unschedule_db_cron',
  'cron.unschedule',
]) {
  assert(install.includes(marker), `closer SQL missing ${marker}`);
}
assert(!install.includes('public.wos_v1_qa_uat_edge_renew_proof'));
assert(!/GRANT EXECUTE[\s\S]{0,160}TO authenticated/.test(
  install.slice(
    install.indexOf('wos_v1_qa_uat_edge_write_allowed'),
    install.indexOf('CREATE FUNCTION public.wos_v1_qa_uat_open_gate'),
  ),
));
assert(!dbCloser.includes('WOS_V1_QA_OPENED_AT'));

for (const marker of [
  "command === 'install'",
  "command === 'arm'",
  "command === 'status'",
  "command === 'close'",
  "command === 'revoke'",
  "command === 'recover'",
  'WOS_V1_QA_PG_CRON_UNAVAILABLE',
  'WOS_V1_QA_DB_CLOSER_JOB_CONFLICT',
  "cron.schedule(",
  "'10 seconds'",
  'db_close_tick',
  'WOS_V1_QA_PSQL_OR_DOCKER_REQUIRED',
  'WOS_V1_QA_LOCAL_TEST_SCOPE_REQUIRED',
  'cronUnscheduled',
  'priorHeartbeatMs',
  'REMOTE_PSQL_IMAGE',
  'postgres@sha256:f9cf3e1f0066f0eb0c48707d864f0ac5941e9ff454a072077d97a4d278d07d73',
]) {
  assert(dbCloser.includes(marker), `DB closer runner missing ${marker}`);
}

for (const marker of [
  "command === 'arm'",
  "command === 'watch'",
  "command === 'status'",
  "command === 'close'",
  "command === 'revoke'",
  "command === 'disarm'",
  "'launchctl'",
  "'bootstrap'",
  "'kickstart'",
  'WOS_V1_QA_EDGE_CLOSED',
  'wos_v1_qa_uat_close_edge',
  'wos_v1_qa_uat_edge_heartbeat',
  'x-wos-qa-uat-execution-id',
  'x-wos-qa-uat-closer-nonce',
  'processNonce',
  'WOS_V1_QA_EDGE_PROCESS_NONCE_REQUIRED',
  'WOS_V1_QA_EDGE_PROCESS_NONCE_CONFLICT',
  'WOS_V1_QA_EDGE_TEST_MODE_CANNOT_LOAD_LAUNCHD',
  'WOS_V1_QA_EDGE_LOCAL_TEST_SCOPE_REQUIRED',
  'EnvironmentVariables',
  'WOS_V1_QA_EDGE_LAUNCHD',
]) {
  assert(edgeCloser.includes(marker), `Edge closer runner missing ${marker}`);
}
assert((edgeCloser.match(/assertLocalTestScope\(\)/g) || []).length >= 4);
assert(edgeProcessKill.includes('WOS_V1_QA_EDGE_CLOSER_MAIN_PROCESS_EXIT'));
assert(edgeProcessKill.includes('detached:true'));

for (const marker of [
  'QA_UAT_AUTHORIZATION_ID',
  'x-wos-qa-uat-authorization-id',
  'x-wos-qa-uat-execution-id',
  'x-wos-qa-uat-closer-nonce',
  'wos_v1_qa_uat_edge_write_allowed',
  'wos_v1_qa_uat_edge_probe',
  'wos_v1_qa_uat_edge_record_proof',
  'WOS_V1_QA_EDGE_GATE_UNAVAILABLE',
  'WOS_V1_QA_EDGE_GATE_CLOSED',
]) {
  assert(edgeFunction.includes(marker), `Edge hard gate missing ${marker}`);
}
assert(appClient.includes('x-wos-qa-uat-authorization-id'));

const executionId = 'efddb60c-4a70-4b46-bf18-46629a4397d2';
const processNonce = '77ac7769-25a2-495a-8892-467d16abb00e';
for (const document of [ownerGate, JSON.stringify(inputs)]) {
  assert(document.includes(executionId));
  assert(document.includes(processNonce));
  assert(document.includes('xulmpqaknlwqqculbsek'));
  assert(document.includes(
    'https://hongda-wos-p00202-qa-preview-git-32498d-lens-projects-3fc386bd.vercel.app',
  ));
  assert(document.includes('verify_jwt=true')
    || document.includes('"verify_jwt":true'));
}
assert.equal(
  inputs.environment.NEXT_PUBLIC_WOS_V1_QA_UAT_EXECUTION_ID,
  executionId,
);
assert.equal(
  inputs.environment.NEXT_PUBLIC_WOS_V1_QA_UAT_CLOSER_NONCE,
  processNonce,
);
assert.equal(inputs.edgeEnvironment.WOS_SUPABASE_ALLOWED_REFS, 'xulmpqaknlwqqculbsek');
assert.equal(inputs.edgeEnvironment.WOS_V1_EDGE_WRITES_ENABLED_BEFORE_ARM, false);
assert.equal(
  inputs.edgeEnvironment.WOS_V1_EDGE_WRITES_ENABLED_DURING_AUTHORIZED_GATE,
  true,
);
assert.equal(inputs.edgeEnvironment.verify_jwt, true);
assert.equal(
  inputs.dbCloserEnvironment.psqlClientImage,
  'postgres@sha256:f9cf3e1f0066f0eb0c48707d864f0ac5941e9ff454a072077d97a4d278d07d73',
);
assert.match(
  install,
  /'codeSha256',v_control\.code_sha256/,
);

for (const file of [
  'scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs',
  'scripts/wos-production-readiness/wos-v1-qa-uat-edge-closer.mjs',
  'tests/live/wos-v1-qa-edge-closer-process-kill.mjs',
]) {
  const check = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
  });
  assert.equal(check.status, 0, `${file}: ${check.stderr}`);
}

const armDir = mkdtempSync(join(tmpdir(), 'wos-edge-closer-arm-'));
try {
  const executionId = '97979797-9797-4797-8797-979797979797';
  const armed = spawnSync(process.execPath, [
    'scripts/wos-production-readiness/wos-v1-qa-uat-edge-closer.mjs',
    'arm',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      WOS_V1_QA_EXECUTION_ID: executionId,
      WOS_V1_QA_EDGE_PROCESS_NONCE:
        '97979797-9797-4797-8797-979797979798',
      WOS_V1_QA_ARM_TOKEN: '98989898-9898-4898-8898-989898989898',
      WOS_V1_QA_CODE_SHA256: 'c'.repeat(64),
      WOS_V1_QA_EDGE_CLOSER_STATE_DIR: join(armDir, 'state'),
      WOS_V1_QA_EDGE_CLOSER_PLIST_DIR: join(armDir, 'launchagents'),
    },
  });
  assert.equal(armed.status, 0, armed.stderr);
  assert.equal(
    JSON.parse(armed.stdout.trim()).status,
    'PENDING_LAUNCHD_LOAD',
  );
  assert(readdirSync(join(armDir, 'state')).some(name =>
    name === `${executionId}.json`));
  assert(readdirSync(join(armDir, 'launchagents')).some(name =>
    name.endsWith('.plist')));
} finally {
  rmSync(armDir, { recursive: true, force: true });
}

const dbBypass = spawnSync(process.execPath, [
  'scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs',
  'arm',
], {
  encoding: 'utf8',
  env: {
    ...process.env,
    WOS_V1_QA_EXECUTION_ID: '91919191-9191-4191-8191-919191919191',
    WOS_V1_QA_ARM_TOKEN: '92929292-9292-4292-8292-929292929292',
    WOS_V1_QA_CODE_SHA256: 'c'.repeat(64),
    WOS_V1_QA_DB_CLOSER_MOCK_CRON: 'true',
  },
});
assert.notEqual(dbBypass.status, 0);
assert.match(dbBypass.stderr, /WOS_V1_QA_LOCAL_TEST_SCOPE_REQUIRED/);

const edgeBypass = spawnSync(process.execPath, [
  'scripts/wos-production-readiness/wos-v1-qa-uat-edge-closer.mjs',
  'arm',
], {
  encoding: 'utf8',
  env: {
    ...process.env,
    WOS_V1_QA_EXECUTION_ID: '97979797-9797-4797-8797-979797979797',
    WOS_V1_QA_EDGE_PROCESS_NONCE:
      '97979797-9797-4797-8797-979797979798',
    WOS_V1_QA_ARM_TOKEN: '98989898-9898-4898-8898-989898989898',
    WOS_V1_QA_CODE_SHA256: 'c'.repeat(64),
    WOS_V1_QA_EDGE_CLOSER_TEST_MODE: 'true',
    WOS_V1_QA_EDGE_CLOSER_TEST_PSQL: 'true',
    WOS_V1_QA_EDGE_FUNCTION_URL: 'http://127.0.0.1:9/',
  },
});
assert.notEqual(edgeBypass.status, 0);
assert.match(
  edgeBypass.stderr,
  /WOS_V1_QA_EDGE_LOCAL_TEST_SCOPE_REQUIRED/,
);

console.log('wos-v1-qa-closers.test.ts: PASS');
console.log('WOS_V1_QA_DB_CLOSER_SOURCE_CONTRACT=PASS');
console.log('WOS_V1_QA_EDGE_CLOSER_SOURCE_CONTRACT=PASS');
console.log('WOS_V1_QA_CLOSER_HARD_DEADLINE_CONTRACT=PASS');
