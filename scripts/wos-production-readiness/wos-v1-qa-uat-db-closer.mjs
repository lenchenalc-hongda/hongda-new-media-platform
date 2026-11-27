#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const AUTH_ID = 'WOS-V1-PRODUCTION-M2-QA-UAT-004';
const QA_APP_EXECUTION_ID = '812aebd9-75d5-427a-9047-5c84a5d6fe42';
const PROJECT_REF = 'xulmpqaknlwqqculbsek';
const ARM_KEYCHAIN = 'WOS_V1_QA_DB_CLOSER_ARM_TOKEN';
const OWNED_TEST_CONTAINER =
  /^codex-wos-prod-readiness-pg17-[A-Za-z0-9_.-]+$/;
const REMOTE_PSQL_IMAGE =
  'postgres@sha256:f9cf3e1f0066f0eb0c48707d864f0ac5941e9ff454a072077d97a4d278d07d73';
const CLOSER_ONLY_INSTALL = join(
  ROOT,
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_CLOSER_ONLY_INSTALL_NOT_AUTHORIZED.sql',
);
const CLOSER_ONLY_ROLLBACK = join(
  ROOT,
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_CLOSER_ONLY_ROLLBACK_NOT_AUTHORIZED.sql',
);
const APP_ACTIVATE = join(
  ROOT,
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_APP_ACTIVATE_NOT_AUTHORIZED.sql',
);
const APP_DEACTIVATE = join(
  ROOT,
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_APP_DEACTIVATE_NOT_AUTHORIZED.sql',
);

function fail(code) {
  throw new Error(code);
}

function validateUuid(value, code) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value || '')) {
    fail(code);
  }
  return value.toLowerCase();
}

function validateSha(value) {
  if (!/^[a-f0-9]{64}$/.test(value || '')) {
    fail('WOS_V1_QA_CODE_SHA256_INVALID');
  }
  return value;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function deterministicUuid(value) {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function databaseEnv() {
  const urlValue = process.env.WOS_QA_DATABASE_URL;
  if (!urlValue) fail('WOS_QA_DATABASE_URL_REQUIRED');
  const url = new URL(urlValue);
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    fail('WOS_QA_DATABASE_URL_INVALID');
  }
  const sslmode = url.searchParams.get('sslmode') || 'require';
  if (!['require', 'verify-ca', 'verify-full'].includes(sslmode)) {
    fail('WOS_QA_DATABASE_URL_TLS_REQUIRED');
  }
  const user = decodeURIComponent(url.username);
  const directMatch = url.hostname === `db.${PROJECT_REF}.supabase.co`
    && user === 'postgres';
  const poolerMatch =
    /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)
    && user === `postgres.${PROJECT_REF}`;
  if ((!directMatch && !poolerMatch)
    || decodeURIComponent(url.pathname.replace(/^\//, '')) !== 'postgres') {
    fail('WOS_QA_DATABASE_URL_PROJECT_SCOPE_MISMATCH');
  }
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: user,
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
    PGSSLMODE: sslmode,
    PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT || '10',
  };
}

function failProcessResult(result) {
  if (result.error) fail('WOS_V1_QA_PSQL_START_FAILED');
  if (result.status !== 0) {
    const diagnostic = String(result.stderr || '')
      .split('\n')
      .find(line => /ERROR:|FATAL:|DETAIL:|HINT:/.test(line));
    process.stderr.write(`${diagnostic || 'WOS_V1_QA_PSQL_FAILED'}\n`);
    fail('WOS_V1_QA_PSQL_FAILED');
  }
  return String(result.stdout || '').trim();
}

function runSql(sql) {
  const container = process.env.WOS_QA_PSQL_DOCKER_CONTAINER;
  if (container) {
    return failProcessResult(spawnSync(
        'docker',
        [
          'exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
          '-U', 'postgres', '-d', process.env.WOS_QA_DATABASE || 'postgres',
          '-At', '-f', '-',
        ],
        { cwd: ROOT, input: sql, encoding: 'utf8' },
      ));
  }
  const remoteEnv = databaseEnv();
  const localPsql = spawnSync('psql', ['--version'], {
    encoding: 'utf8',
    stdio: 'ignore',
  });
  if (!localPsql.error && localPsql.status === 0) {
    return failProcessResult(spawnSync(
        'psql',
        ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-f', '-'],
      { cwd: ROOT, env: remoteEnv, input: sql, encoding: 'utf8' },
      ));
  }
  const dockerImage = spawnSync(
    'docker',
    ['image', 'inspect', REMOTE_PSQL_IMAGE, '--format', '{{.Id}}'],
    { encoding: 'utf8' },
  );
  if (dockerImage.error || dockerImage.status !== 0) {
    fail('WOS_V1_QA_PSQL_OR_DOCKER_REQUIRED');
  }
  return failProcessResult(spawnSync(
    'docker',
    [
      'run', '--rm', '-i',
      '-e', 'PGHOST',
      '-e', 'PGPORT',
      '-e', 'PGUSER',
      '-e', 'PGPASSWORD',
      '-e', 'PGDATABASE',
      '-e', 'PGSSLMODE',
      '-e', 'PGCONNECT_TIMEOUT',
      REMOTE_PSQL_IMAGE,
      'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-f', '-',
    ],
    {
      cwd: ROOT,
      env: databaseEnv(),
      input: sql,
      encoding: 'utf8',
    },
  ));
}

function assertLocalTestScope() {
  if (process.env.WOS_V1_QA_DB_CLOSER_MOCK_CRON !== 'true') return;
  const container = process.env.WOS_QA_PSQL_DOCKER_CONTAINER || '';
  const database = process.env.WOS_QA_DATABASE || '';
  if (!OWNED_TEST_CONTAINER.test(container)
    || !database.endsWith('_ci')) {
    fail('WOS_V1_QA_LOCAL_TEST_SCOPE_REQUIRED');
  }
}

function keychainSecret(service, account) {
  const result = spawnSync(
    'security',
    ['find-generic-password', '-s', service, '-a', account, '-w'],
    { encoding: 'utf8' },
  );
  return result.status === 0 ? result.stdout.trim() : '';
}

function storeKeychainSecret(service, account, value) {
  execFileSync(
    'security',
    ['add-generic-password', '-U', '-s', service, '-a', account, '-w', value],
    { stdio: 'ignore' },
  );
}

function executionId() {
  return validateUuid(
    process.env.WOS_V1_QA_EXECUTION_ID,
    'WOS_V1_QA_EXECUTION_ID_REQUIRED',
  );
}

function qaAppLocalTest() {
  const container = process.env.WOS_QA_PSQL_DOCKER_CONTAINER || '';
  if (!container) return false;
  if (!OWNED_TEST_CONTAINER.test(container)
    || !(process.env.WOS_QA_DATABASE || '').endsWith('_ci')) {
    fail('WOS_V1_QA_APP_LOCAL_TEST_SCOPE_REQUIRED');
  }
  return true;
}

function qaAppExecutionId() {
  const localTest = qaAppLocalTest();
  const supplied = process.env.WOS_V1_QA_EXECUTION_ID;
  if (localTest) {
    return validateUuid(
      supplied || QA_APP_EXECUTION_ID,
      'WOS_V1_QA_APP_EXECUTION_ID_INVALID',
    );
  }
  if (supplied && supplied.toLowerCase() !== QA_APP_EXECUTION_ID) {
    fail('WOS_V1_QA_APP_EXECUTION_ID_MISMATCH');
  }
  return QA_APP_EXECUTION_ID;
}

function armToken(id) {
  const supplied = process.env.WOS_V1_QA_ARM_TOKEN;
  if (supplied) {
    const token = validateUuid(supplied, 'WOS_V1_QA_ARM_TOKEN_INVALID');
    if (process.env.WOS_V1_QA_ALLOW_KEYCHAIN_ARM === 'true') {
      storeKeychainSecret(ARM_KEYCHAIN, id, token);
    }
    return token;
  }
  const stored = keychainSecret(ARM_KEYCHAIN, id);
  if (stored) return validateUuid(stored, 'WOS_V1_QA_ARM_TOKEN_INVALID');
  if (process.env.WOS_V1_QA_ALLOW_KEYCHAIN_ARM !== 'true') {
    fail('WOS_V1_QA_ARM_TOKEN_REQUIRED');
  }
  const created = randomUUID();
  storeKeychainSecret(ARM_KEYCHAIN, id, created);
  return created;
}

function projectSettingsSql() {
  return [
    `SET wos_v1.qa_project=${sqlLiteral(PROJECT_REF)};`,
  ].join('\n');
}

function installFullM2() {
  const sql = [
    projectSettingsSql(),
    "SET wos_v1.qa_uat_install_authorized='yes';",
    readFileSync(
      join(
        ROOT,
        'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_INSTALL_NOT_AUTHORIZED.sql',
      ),
      'utf8',
    ),
  ].join('\n');
  runSql(sql);
  process.stdout.write('WOS_V1_QA_DB_CLOSER_FULL_M2_INSTALL=PASS\n');
}

function activateFullM2() {
  const sql = [
    projectSettingsSql(),
    "SET wos_v1.qa_uat_activation_authorized='yes';",
    readFileSync(
      join(
        ROOT,
        'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_ACTIVATE_NOT_AUTHORIZED.sql',
      ),
      'utf8',
    ),
  ].join('\n');
  runSql(sql);
  process.stdout.write('WOS_V1_QA_DB_CLOSER_FULL_M2_ACTIVATE=PASS\n');
}

function activateQaApp() {
  const id = qaAppExecutionId();
  const localTest = qaAppLocalTest();
  const sql = [
    projectSettingsSql(),
    `SET wos_v1.qa_authorization_id=${sqlLiteral(AUTH_ID)};`,
    `SET wos_v1.qa_execution_id=${sqlLiteral(id)};`,
    `SET wos_v1.qa_local_test=${sqlLiteral(localTest ? 'yes' : 'no')};`,
    "SET wos_v1.qa_uat_app_activation_authorized='yes';",
    readFileSync(APP_ACTIVATE, 'utf8'),
  ].join('\n');
  runSql(sql);
  process.stdout.write('WOS_V1_QA_DB_CLOSER_APP_ACTIVATE=PASS\n');
}

function deactivateQaApp() {
  const sql = [
    projectSettingsSql(),
    "SET wos_v1.qa_uat_app_deactivation_authorized='yes';",
    readFileSync(APP_DEACTIVATE, 'utf8'),
  ].join('\n');
  runSql(sql);
  process.stdout.write('WOS_V1_QA_DB_CLOSER_APP_DEACTIVATE=PASS\n');
}

function installCloserOnly() {
  const sql = [
    projectSettingsSql(),
    "SET wos_v1.qa_closer_install_authorized='yes';",
    readFileSync(CLOSER_ONLY_INSTALL, 'utf8'),
  ].join('\n');
  runSql(sql);
  process.stdout.write('WOS_V1_QA_DB_CLOSER_ONLY_INSTALL=PASS\n');
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function closerScope(closerOnly) {
  if (closerOnly) {
    return {
      schema: 'wos_v1_qa_closer',
      table: 'controls',
      jobPrefix: 'wos_v1_qa_closer',
      label: 'CLOSER_ONLY',
    };
  }
  return {
    schema: 'wos_v1_qa_uat',
    table: 'closeout_controls',
    jobPrefix: 'wos_v1_qa_uat_db_closer',
    label: 'FULL_M2',
  };
}

function verifyEdgeCloseReceipt(
  executionIdValue,
  expectedCodeSha,
  expectedEdgeClosedAt,
) {
  const path = process.env.WOS_V1_QA_EDGE_CLOSER_STATE_PATH
    || join(
      homedir(),
      'Library/Application Support/HongdaOS/WOSQAUAT/edge-closer',
      `${executionIdValue}.json`,
    );
  let state;
  try {
    state = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('WOS_V1_QA_EDGE_CLOSE_RECEIPT_MISSING');
  }
  const receipt = state?.closeReceipt;
  const resultClosedAtMs = Date.parse(receipt?.result?.closedAt || '');
  const databaseClosedAtMs = Date.parse(expectedEdgeClosedAt || '');
  if (state?.status !== 'CLOSED'
    || receipt?.authorizationId !== AUTH_ID
    || receipt.projectRef !== PROJECT_REF
    || receipt.executionId !== executionIdValue
    || receipt.codeSha256 !== expectedCodeSha
    || typeof receipt.processNonce !== 'string'
    || receipt.processNonce.length === 0
    || state.processNonce !== receipt.processNonce
    || (state.launchdLoaded === true
      && receipt.launchAgentUnloaded !== true)
    || !receipt?.result
    || !receipt?.probe
    || receipt.result.status !== 'CLOSED'
    || receipt.result.executionId !== executionIdValue
    || receipt.result.timely !== true
    || !Number.isFinite(resultClosedAtMs)
    || !Number.isFinite(databaseClosedAtMs)
    || resultClosedAtMs !== databaseClosedAtMs
    || receipt.probe.status !== 503
    || receipt.probe.code !== 'WOS_V1_QA_EDGE_CLOSED'
    || receipt.probe.ok !== true
    || receipt.probe.executionId !== executionIdValue
    || receipt.probe.closedAt !== receipt.result.closedAt) {
    fail('WOS_V1_QA_EDGE_CLOSE_RECEIPT_INVALID');
  }
  const expectedReceiptSha = createHash('sha256')
    .update(JSON.stringify({
      authorizationId: receipt.authorizationId,
      projectRef: receipt.projectRef,
      executionId: receipt.executionId,
      codeSha256: receipt.codeSha256,
      processNonce: receipt.processNonce,
      launchAgentUnloaded: receipt.launchAgentUnloaded,
      result: receipt.result,
      probe: receipt.probe,
    }))
    .digest('hex');
  if (receipt.receiptSha256 !== expectedReceiptSha) {
    fail('WOS_V1_QA_EDGE_CLOSE_RECEIPT_HASH_MISMATCH');
  }
  return {
    receiptSha256: receipt.receiptSha256,
    processNonce: receipt.processNonce,
  };
}

async function arm(closerOnly = false) {
  assertLocalTestScope();
  const id = executionId();
  const token = armToken(id);
  const codeSha = validateSha(process.env.WOS_V1_QA_CODE_SHA256);
  const scope = closerScope(closerOnly);
  const jobName = `${scope.jobPrefix}_${id.replaceAll('-', '')}`;
  const requestId = deterministicUuid(`${id}:db-closer`);
  const cronCommand =
    `SELECT ${scope.schema}.db_close_tick('${id}'::uuid,'${requestId}'::uuid);`;
  const sql = `
BEGIN;
DO $arm$
DECLARE
  v_job_id bigint;
  v_arm jsonb;
BEGIN
  v_arm:=${scope.schema}.arm_db_closer(
    ${sqlLiteral(id)}::uuid,
    ${sqlLiteral(token)}::uuid,
    ${sqlLiteral(AUTH_ID)},
    ${sqlLiteral(PROJECT_REF)},
    ${sqlLiteral(codeSha)}
  );
  IF to_regnamespace('cron') IS NULL
    OR to_regclass('cron.job') IS NULL
    OR to_regprocedure('cron.schedule(text,text,text)') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_PG_CRON_UNAVAILABLE';
  END IF;
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname=${sqlLiteral(jobName)}
    AND schedule='10 seconds'
    AND command=${sqlLiteral(cronCommand)}
    AND active=true;
  IF v_job_id IS NULL THEN
    IF EXISTS(
      SELECT 1 FROM cron.job WHERE jobname=${sqlLiteral(jobName)}
    ) THEN
      RAISE EXCEPTION 'WOS_V1_QA_DB_CLOSER_JOB_CONFLICT';
    END IF;
    SELECT cron.schedule(
      ${sqlLiteral(jobName)},
      '10 seconds',
      ${sqlLiteral(cronCommand)}
    ) INTO v_job_id;
  END IF;
  UPDATE ${scope.schema}.${scope.table}
  SET db_cron_job_id=v_job_id
  WHERE execution_id=${sqlLiteral(id)}::uuid;
END;
$arm$;
SELECT ${scope.schema}.closer_status(${sqlLiteral(id)}::uuid)::text;
COMMIT;
`;
  const output = runSql(sql);
  const lines = output.split('\n').filter(Boolean);
  const result = lines.filter(line =>
    line.startsWith('{') || line.startsWith('[')).at(-1);
  if (!result) fail('WOS_V1_QA_DB_CLOSER_ARM_STATUS_MISSING');
  const initial = JSON.parse(result);
  if (initial.status !== 'FOUND') fail('WOS_V1_QA_DB_CLOSER_ARM_STATUS_INVALID');
  const priorHeartbeatMs = Date.parse(initial.dbLastHeartbeatAt || '');
  if (process.env.WOS_V1_QA_DB_CLOSER_MOCK_CRON === 'true') {
    runSql(
      `SELECT ${scope.schema}.db_close_tick(${sqlLiteral(id)}::uuid,${sqlLiteral(requestId)}::uuid)::text;`,
    );
  }
  const waitMs = Number(process.env.WOS_V1_QA_DB_HEARTBEAT_WAIT_MS || '35000');
  const deadline = Date.now() + Math.max(10000, waitMs);
  let current = initial;
  while (Date.now() < deadline) {
    const raw = runSql(
      `SELECT ${scope.schema}.closer_status(${sqlLiteral(id)}::uuid)::text;`,
    );
    current = JSON.parse(raw.split('\n').filter(Boolean).at(-1));
    const heartbeatMs = Date.parse(current.dbLastHeartbeatAt || '');
    if (Number.isFinite(heartbeatMs)
      && (!Number.isFinite(priorHeartbeatMs) || heartbeatMs > priorHeartbeatMs)
      && heartbeatMs >= Date.now() - 30_000
      && Array.isArray(current.armedKinds)
      && current.armedKinds.includes('DB')) {
      process.stdout.write(`${JSON.stringify({
        ...current,
        status: 'ARMED',
        scope: scope.label,
      })}\n`);
      return;
    }
    await sleep(1000);
  }
  const jobId = Number(current.dbCronJobId);
  if (Number.isInteger(jobId)) {
    runSql(`
      DO $unschedule$
      BEGIN
        IF to_regprocedure('cron.unschedule(bigint)') IS NOT NULL THEN
          EXECUTE 'SELECT cron.unschedule(${jobId})';
        END IF;
      END;
      $unschedule$;
    `);
  }
  fail('WOS_V1_QA_DB_CLOSER_HEARTBEAT_TIMEOUT');
}

function status(closerOnly = false) {
  const id = executionId();
  const scope = closerScope(closerOnly);
  const output = runSql(
    `SELECT ${scope.schema}.closer_status(${sqlLiteral(id)}::uuid)::text;`,
  );
  process.stdout.write(`${output}\n`);
}

function close(closerOnly = false) {
  const id = executionId();
  const requestId = validateUuid(
    process.env.WOS_V1_QA_CLOSE_REQUEST_ID || randomUUID(),
    'WOS_V1_QA_CLOSE_REQUEST_ID_INVALID',
  );
  const reason = String(
    process.env.WOS_V1_QA_CLOSE_REASON
      || `${closerOnly ? 'CLOSER_ONLY_DB' : 'DB'}_CLOSE_REQUESTED`,
  ).slice(0, 200);
  const functionName =
    `${closerScope(closerOnly).schema}.close_db_closer`;
  const output = runSql(
    `SELECT ${functionName}(${sqlLiteral(id)}::uuid,${sqlLiteral(requestId)}::uuid,${sqlLiteral(reason)})::text;`,
  );
  const result = JSON.parse(output.split('\n').filter(Boolean).at(-1));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.timely !== true) fail('WOS_V1_QA_DB_CLOSER_DEADLINE_MISSED');
  if (result.cronUnscheduled !== true) {
    fail('WOS_V1_QA_DB_CLOSER_CRON_UNSCHEDULE_FAILED');
  }
}

function recover() {
  let recoveryError;
  try {
    close(false);
  } catch (error) {
    recoveryError = error;
  }
  try {
    deactivateQaApp();
  } catch (error) {
    recoveryError ??= error;
  }
  try {
    const sql = [
      projectSettingsSql(),
      "SET wos_v1.qa_uat_close_authorized='yes';",
      "SET wos_v1.qa_uat_rollback_authorized='yes';",
      readFileSync(
        join(
          ROOT,
          'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_DEACTIVATE_NOT_AUTHORIZED.sql',
        ),
        'utf8',
      ),
      readFileSync(
        join(
          ROOT,
          'docs/workshop-order-system/production-readiness/sql/WOS_V1_QA_UAT_M2_ROLLBACK_NOT_AUTHORIZED.sql',
        ),
        'utf8',
      ),
    ].join('\n');
    runSql(sql);
  } catch (error) {
    recoveryError ??= error;
  }
  if (recoveryError) throw recoveryError;
  process.stdout.write('WOS_V1_QA_DB_CLOSER_DATA_RETAINING_RECOVERY=PASS\n');
}

function recoverCloserOnly() {
  close(true);
  const id = executionId();
  const sql = `
    SELECT wos_v1_qa_closer.closer_status(${sqlLiteral(id)}::uuid)::text;
  `;
  const statusOutput = runSql(sql);
  const closerStatus = JSON.parse(
    statusOutput.split('\n').filter(Boolean).at(-1),
  );
  if (closerStatus.dbState !== 'CLOSED'
    || closerStatus.edgeState !== 'CLOSED'
    || closerStatus.dbCloseTimely !== true
    || closerStatus.edgeCloseTimely !== true
    || !closerStatus.edgeProbeVerifiedAt
    || closerStatus.edgeProbeExecutionId !== id) {
    fail('WOS_V1_QA_CLOSER_ONLY_RECOVERY_REQUIRES_VERIFIED_CLOSE');
  }
  const edgeReceipt = verifyEdgeCloseReceipt(
    id,
    closerStatus.codeSha256,
    closerStatus.edgeClosedAt,
  );
  if (edgeReceipt.processNonce !== closerStatus.edgeProcessNonce) {
    fail('WOS_V1_QA_EDGE_CLOSE_RECEIPT_NONCE_MISMATCH');
  }
  runSql([
    projectSettingsSql(),
    "SET wos_v1.qa_closer_rollback_authorized='yes';",
    readFileSync(CLOSER_ONLY_ROLLBACK, 'utf8'),
  ].join('\n'));
  process.stdout.write(`${JSON.stringify({
    status: 'RECOVERED',
    executionId: id,
    edgeReceiptSha256: edgeReceipt.receiptSha256,
    publicApiOwner: 'NONE',
    auditRetained: true,
  })}\n`);
}

const command = process.argv[2];
try {
  if (command === 'install-closer-only') installCloserOnly();
  else if (command === 'install-full-m2') installFullM2();
  else if (command === 'activate-full-m2') activateFullM2();
  else if (command === 'activate-qa-app') activateQaApp();
  else if (command === 'deactivate-qa-app') deactivateQaApp();
  else if (command === 'arm') await arm(false);
  else if (command === 'arm-closer-only') await arm(true);
  else if (command === 'status') status(false);
  else if (command === 'status-closer-only') status(true);
  else if (command === 'close') close(false);
  else if (command === 'close-closer-only') close(true);
  else if (command === 'revoke') close(false);
  else if (command === 'revoke-closer-only') close(true);
  else if (command === 'recover') recover();
  else if (command === 'recover-closer-only') recoverCloserOnly();
  else fail('WOS_V1_QA_DB_CLOSER_COMMAND_INVALID');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'UNKNOWN'}\n`);
  process.exitCode = 1;
}
