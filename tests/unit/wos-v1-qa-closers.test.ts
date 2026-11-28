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
const closerOnlyInstall = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_CLOSER_ONLY_INSTALL_NOT_AUTHORIZED.sql',
  'utf8',
);
const closerOnlyRollback = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_CLOSER_ONLY_ROLLBACK_NOT_AUTHORIZED.sql',
  'utf8',
);
const ownerGate = readFileSync(
  'docs/workshop-order-system/production-readiness/WOS_V1_PRODUCTION_M2_QA_UAT_OWNER_GATE_20261126.md',
  'utf8',
);
const closerRehearsalOwnerGate = readFileSync(
  'docs/workshop-order-system/production-readiness/WOS_V1_PRODUCTION_M2_QA_BUSINESS_UAT_OWNER_GATE_20261127.md',
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
const edgePreservation = JSON.parse(readFileSync(
  'docs/workshop-order-system/production-readiness/evidence/WOS_V1_QA_EDGE_V36_PRESERVATION_20261127.json',
  'utf8',
)) as {
  hostedEdgeVersion: number;
  hostedBundleSha256: string;
  verifyJwt: boolean;
  remoteDeploymentTouchedThisRound: boolean;
  hostedSource: Record<string, string | boolean>;
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
  'public.wos_v1_qa_uat_edge_preflight',
  'public.wos_v1_qa_uat_bind_order',
  'public.wos_v1_qa_uat_close_edge',
  'public.wos_v1_qa_uat_edge_probe',
  'public.wos_v1_qa_uat_edge_record_proof',
  'QA_UAT_CLOSER_HEARTBEAT_STALE',
  'QA_UAT_ORDER_NOT_BOUND',
  'QA_UAT_ORDER_BINDING_DRIFT',
  'wos_v1_qa_uat.unschedule_db_cron',
  'WOS_V1_QA_CLOSER_ONLY_PUBLIC_API_OWNED',
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
  "command === 'install-closer-only'",
  "command === 'install-full-m2'",
  "command === 'activate-full-m2'",
  "command === 'arm'",
  "command === 'arm-closer-only'",
  "command === 'status'",
  "command === 'status-closer-only'",
  "command === 'close'",
  "command === 'close-closer-only'",
  "command === 'revoke'",
  "command === 'revoke-closer-only'",
  "command === 'recover'",
  "command === 'recover-closer-only'",
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
  'WOS_QA_DATABASE_URL_PROJECT_SCOPE_MISMATCH',
  'WOS_V1_QA_DB_CLOSER_ONLY_INSTALL',
  'WOS_V1_QA_EDGE_CLOSE_RECEIPT_INVALID',
  'WOS_V1_QA_EDGE_CLOSE_RECEIPT_HASH_MISMATCH',
  'WOS_V1_QA_EDGE_CLOSE_RECEIPT_MISSING',
  "process.env.WOS_V1_QA_APP_EXECUTION_ID",
  "|| 'e646bb29-0fb2-47e5-ad4e-d59428d3ca22'",
  'WOS_V1_QA_APP_EXECUTION_ID_MISMATCH',
  'WOS_V1_QA_APP_LOCAL_TEST_SCOPE_REQUIRED',
  "wos_v1.qa_local_test",
  'activate-qa-app',
  'deactivate-qa-app',
  'install-storage-compat',
  'rollback-storage-compat',
  'install-v2-proof-guard-compat',
  'rollback-v2-proof-guard-compat',
  'install-v2-image-register-compat',
  'rollback-v2-image-register-compat',
  'WOS_V1_QA_DB_CLOSER_STORAGE_COMPAT_INSTALL',
  'WOS_V1_QA_DB_CLOSER_STORAGE_COMPAT_ROLLBACK',
  'WOS_V1_QA_DB_CLOSER_V2_PROOF_GUARD_INSTALL',
  'WOS_V1_QA_DB_CLOSER_V2_PROOF_GUARD_ROLLBACK',
  'WOS_V1_QA_DB_CLOSER_V2_IMAGE_REGISTER_INSTALL',
  'WOS_V1_QA_DB_CLOSER_V2_IMAGE_REGISTER_ROLLBACK',
]) {
  assert(dbCloser.includes(marker), `DB closer runner missing ${marker}`);
}
const installCloserOnlySource = dbCloser.slice(
  dbCloser.indexOf('function installCloserOnly()'),
  dbCloser.indexOf('async function sleep('),
);
assert(!dbCloser.includes("command === 'install'"));
assert(!installCloserOnlySource.includes('ACTIVATE_NOT_AUTHORIZED'));
assert(!installCloserOnlySource.includes('qa_uat_activation_authorized'));
const recoverSource = dbCloser.slice(
  dbCloser.indexOf('function recover()'),
  dbCloser.indexOf('function recoverCloserOnly()'),
);
assert(recoverSource.indexOf('deactivateQaApp()')
  < recoverSource.indexOf(
    'WOS_V1_QA_UAT_M2_DEACTIVATE_NOT_AUTHORIZED.sql',
  ));
assert(recoverSource.includes('recoveryError ??= error'));

for (const marker of [
  'wos_v1_qa_closer.controls',
  'wos_v1_qa_closer.arm_receipts',
  'wos_v1_qa_closer.close_receipts',
  'wos_v1_qa_closer.arm_db_closer',
  'wos_v1_qa_closer.record_db_heartbeat',
  'wos_v1_qa_closer.record_edge_heartbeat',
  'wos_v1_qa_closer.db_close_tick',
  'wos_v1_qa_closer.close_db_closer',
  'wos_v1_qa_closer.close_edge_closer',
  'wos_v1_qa_closer.closer_status',
  'public.wos_v1_qa_uat_edge_control_status',
  'public.wos_v1_qa_uat_edge_heartbeat',
  'public.wos_v1_qa_uat_edge_preflight',
  'public.wos_v1_qa_uat_close_edge',
  'public.wos_v1_qa_uat_edge_probe',
  "interval '480 seconds'",
  "interval '540 seconds'",
  "interval '840 seconds'",
  'WOS_V1_QA_CLOSER_FULL_ADAPTER_CONFLICT',
  'WOS_V1_QA_CLOSER_PUBLIC_API_EXISTS',
  'WOS_V1_QA_IDENTITY_MARKER_MISMATCH',
  'edge_probe_verified_at',
  'edgeProbeVerifiedAt',
  '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
  '9164ac91-a50c-4023-836c-5c0887b619fb',
  'b55ccc94-6352-4cad-8600-fad32955d014',
]) {
  assert(closerOnlyInstall.includes(marker), `closer-only SQL missing ${marker}`);
}
assert(!closerOnlyInstall.includes('CREATE TABLE IF NOT EXISTS wos_v1_qa_uat.write_gates'));
assert(!closerOnlyInstall.includes('TO authenticated'));
assert(!closerOnlyInstall.includes(
  'CREATE OR REPLACE FUNCTION public.wos_v1_qa_uat_m2_action',
));
for (const marker of [
  'WOS_V1_QA_CLOSER_ROLLBACK_NOT_AUTHORIZED',
  'WOS_V1_QA_CLOSER_ROLLBACK_REQUIRES_VERIFIED_CLOSE',
  'WOS_V1_QA_CLOSER_PUBLIC_API_OWNERSHIP_MISMATCH',
  'edge_probe_oid',
  'edge_probe_definition_md5',
  'DROP FUNCTION IF EXISTS public.wos_v1_qa_uat_edge_probe',
  'DROP FUNCTION IF EXISTS public.wos_v1_qa_uat_edge_preflight',
  'audit tables retained',
]) {
  assert(closerOnlyRollback.includes(marker),
    `closer-only rollback missing ${marker}`);
}

for (const marker of [
  "command === 'arm'",
  "command === 'finalize'",
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
  'WOS_V1_QA_EDGE_CREDENTIAL_PREFLIGHT_FAILED_',
  'WOS_V1_QA_EDGE_ARM_FAILURE_CLOSE_UNVERIFIED',
  'WOS_V1_QA_EDGE_OPEN_PROBE_FAILED_',
  'probeEdgeOnce',
  'attempt <= 3',
  'attempt * 500',
  "spawnSync('curl', ['-q', '--config', '-']",
  'WOS_V1_QA_EDGE_PROXY',
  'configuredEdgeProxy',
  'localTarget',
  'proxyEnvironment',
  'header = ',
  'write-out = ',
  "command === 'credential-preflight'",
  'probeOpen',
  'probeCredential',
  'wos_v1_qa_uat_edge_preflight',
  'closeArmFailure',
  'CLOSE_UNVERIFIED',
  'closedTimesMatch',
  'WOS_V1_QA_EDGE_CLOSED_TIMESTAMP_MISMATCH',
  'EDGE_CREDENTIAL_PREFLIGHT=PASS',
  'WOS_V1_QA_EDGE_TEST_MODE_CANNOT_LOAD_LAUNCHD',
  'WOS_V1_QA_EDGE_LOCAL_TEST_SCOPE_REQUIRED',
  'WOS_V1_QA_EDGE_CLOSER_LAUNCHD_UNLOAD_FAILED',
  'WOS_V1_QA_EDGE_CLOSER_FROZEN_SCRIPT_TAMPERED',
  'frozenScriptPath',
  'frozenScriptSha256',
  'plistContent(id, path, frozenScriptPath)',
  'spawnFinalizer(path)',
  'finalizerAckPath',
  'WOS_V1_QA_EDGE_FINALIZER_SPAWN_FAILED',
  'SCHEDULED_EDGE_CLOSE_PRE_FINALIZER',
  'SCHEDULED_EDGE_CLOSE_FINALIZER',
  'launchAgentUnloaded',
  'EnvironmentVariables',
  'WOS_V1_QA_EDGE_LAUNCHD',
  'WOS_V1_QA_EDGE_SERVICE_ROLE_JWT_REQUIRED',
  'WOS_V1_QA_EDGE_SERVICE_ROLE_PROJECT_SCOPE_MISMATCH',
]) {
  assert(edgeCloser.includes(marker), `Edge closer runner missing ${marker}`);
}
assert((edgeCloser.match(/assertLocalTestScope\(\)/g) || []).length >= 4);
assert.match(
  edgeCloser,
  /async function watchLoop[\s\S]*await watch\(stateFile, true\)/,
);
const edgeArmSource = edgeCloser.slice(
  edgeCloser.indexOf('async function arm()'),
  edgeCloser.indexOf('function readState('),
);
assert(
  edgeArmSource.indexOf('wos_v1_qa_uat_edge_preflight')
    < edgeArmSource.indexOf('probeCredential({'),
);
assert(edgeArmSource.includes('bootstrapHeartbeat'));
assert(edgeArmSource.includes('await spawnFinalizer(path)'));
assert(edgeArmSource.includes('heartbeatAt !== priorHeartbeatAt'));
assert(edgeArmSource.includes('armedHeartbeatAt === priorHeartbeatAt'));
// UAT-010 regression: the SQL control status is NOT an HTTP probe envelope.
assert(edgeArmSource.includes('openProbe = await probeOpen(pending);'));
assert(!edgeArmSource.includes('probeOpen(armedControl)'));
assert(edgeArmSource.includes('functionUrl: functionUrl(),'));
assert(edgeArmSource.includes('processNonce,'));
assert(edgeCloser.includes('WOS_V1_QA_EDGE_PROBE_ENVELOPE_INVALID'));
assert(
  edgeArmSource.indexOf('wos_v1_qa_uat_close_edge')
    < edgeArmSource.indexOf('WOS_V1_QA_EDGE_CREDENTIAL_PREFLIGHT_FAILED_'),
);
const credentialPreflightSource = edgeCloser.slice(
  edgeCloser.indexOf('async function credentialPreflight()'),
  edgeCloser.indexOf('async function closeEdge('),
);
assert(
  credentialPreflightSource.indexOf(
    'validateSha(process.env.WOS_V1_QA_CODE_SHA256)',
  ) < credentialPreflightSource.indexOf('codeSha256: codeSha'),
);
assert(edgeProcessKill.includes('WOS_V1_QA_EDGE_CLOSER_MAIN_PROCESS_EXIT'));
assert(edgeProcessKill.includes('detached:true'));
assert(edgeProcessKill.includes('WOS_QA_CLOSER_CONTROL_SCHEMA'));

for (const marker of [
  'WOS_V1_QA_UAT_AUTHORIZATION_ID',
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
assert(
  edgeFunction.indexOf("x-wos-qa-closer-probe")
    < edgeFunction.indexOf("WOS_V1_EDGE_WRITES_ENABLED"),
);

const historicalExecutionId = 'efddb60c-4a70-4b46-bf18-46629a4397d2';
const historicalNonce = '77ac7769-25a2-495a-8892-467d16abb00e';
const executionId = '791577cc-23bb-4b8d-93dd-e90b6630abe2';
const processNonce = '97f12512-70fe-4e9f-b81a-574b48ed7fad';
assert(ownerGate.includes(historicalExecutionId));
assert(ownerGate.includes(historicalNonce));
for (const document of [closerRehearsalOwnerGate, JSON.stringify(inputs)]) {
  assert(document.includes(executionId));
  assert(document.includes(processNonce));
  assert(document.includes('xulmpqaknlwqqculbsek'));
  assert(document.includes(
    'https://hongda-wos-p00202-qa-preview-git-0f95f1-lens-projects-3fc386bd.vercel.app',
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
for (const marker of [
  'WOS-V1-PRODUCTION-M2-QA-UAT-005',
  'WOS-V1-PRODUCTION-M2-QA-BUSINESS-UAT-20261127-01',
  '791577cc-23bb-4b8d-93dd-e90b6630abe2',
  '97f12512-70fe-4e9f-b81a-574b48ed7fad',
  'HOSTED_VERSION_AFTER_RECOVERY=41',
  'WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY',
  'PR283_MERGE=FORBIDDEN',
]) {
  assert(closerRehearsalOwnerGate.includes(marker),
    `closer rehearsal Owner Gate missing ${marker}`);
}
assert(!closerRehearsalOwnerGate.includes('TO_BE_FILLED_AFTER_SOURCE_FREEZE'));
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
assert.equal(edgePreservation.hostedEdgeVersion, 36);
assert.equal(
  edgePreservation.hostedBundleSha256,
  '21fd1a8d31508662c6c0790e9304b793e864ffb321de5b77bcc8145e91f18450',
);
assert.equal(edgePreservation.remoteDeploymentTouchedThisRound, false);
assert.equal(edgePreservation.hostedSource.closerProbeSupported, false);
assert.equal(
  edgePreservation.hostedSource.indexSha256,
  'c439c387943830df597a00a9007699965c6834bc9381fc15684d7f5cd98dc795',
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

const dbScopeBypass = spawnSync(process.execPath, [
  'scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs',
  'status-closer-only',
], {
  encoding: 'utf8',
  env: {
    ...process.env,
    WOS_QA_DATABASE_URL:
      'postgresql://postgres:not-a-secret@db.production.invalid/postgres',
    WOS_V1_QA_EXECUTION_ID: '91919191-9191-4191-8191-919191919191',
  },
});
assert.notEqual(dbScopeBypass.status, 0);
assert.match(
  dbScopeBypass.stderr,
  /WOS_QA_DATABASE_URL_PROJECT_SCOPE_MISMATCH/,
);

for (const [databaseUrl, expectedCode] of [
  [
    'postgresql://postgres:not-a-secret@db.xulmpqaknlwqqculbsek.supabase.co/postgres?sslmode=disable',
    'WOS_QA_DATABASE_URL_TLS_REQUIRED',
  ],
  [
    'postgresql://postgres:not-a-secret@db.xulmpqaknlwqqculbsek.supabase.co.evil/postgres',
    'WOS_QA_DATABASE_URL_PROJECT_SCOPE_MISMATCH',
  ],
  [
    'postgresql://postgres.xulmpqaknlwqqculbsekevil:not-a-secret@aws-0-ap-southeast-1.pooler.supabase.com/postgres',
    'WOS_QA_DATABASE_URL_PROJECT_SCOPE_MISMATCH',
  ],
] as const) {
  const bypass = spawnSync(process.execPath, [
    'scripts/wos-production-readiness/wos-v1-qa-uat-db-closer.mjs',
    'status-closer-only',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      WOS_QA_DATABASE_URL: databaseUrl,
      WOS_V1_QA_EXECUTION_ID: '91919191-9191-4191-8191-919191919191',
    },
  });
  assert.notEqual(bypass.status, 0);
  assert.match(bypass.stderr, new RegExp(expectedCode));
}

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

const scopePayload = Buffer.from(JSON.stringify({
  role: 'authenticated',
  ref: 'xulmpqaknlwqqculbsek',
})).toString('base64url');
const edgeServiceScopeBypass = spawnSync(process.execPath, [
  'scripts/wos-production-readiness/wos-v1-qa-uat-edge-closer.mjs',
  'status',
], {
  encoding: 'utf8',
  env: {
    ...process.env,
    WOS_V1_QA_EXECUTION_ID: '97979797-9797-4797-8797-979797979797',
    WOS_QA_EDGE_SERVICE_ROLE_KEY: `header.${scopePayload}.signature`,
  },
});
assert.notEqual(edgeServiceScopeBypass.status, 0);
assert.match(
  edgeServiceScopeBypass.stderr,
  /WOS_V1_QA_EDGE_SERVICE_ROLE_PROJECT_SCOPE_MISMATCH/,
);

console.log('wos-v1-qa-closers.test.ts: PASS');
console.log('WOS_V1_QA_DB_CLOSER_SOURCE_CONTRACT=PASS');
console.log('WOS_V1_QA_EDGE_CLOSER_SOURCE_CONTRACT=PASS');
console.log('WOS_V1_QA_CLOSER_HARD_DEADLINE_CONTRACT=PASS');
