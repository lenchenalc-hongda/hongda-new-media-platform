#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = fileURLToPath(import.meta.url);
const AUTH_ID =
  process.env.WOS_V1_QA_AUTHORIZATION_ID
  || 'WOS-V1-PRODUCTION-M2-QA-UAT-014';
const PROJECT_REF = 'xulmpqaknlwqqculbsek';
const ARM_KEYCHAIN = 'WOS_V1_QA_DB_CLOSER_ARM_TOKEN';
const SERVICE_KEYCHAIN = 'WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY';
const DB_DSN_KEYCHAIN = 'WOS_V1_QA_DB_CLOSER_DSN';
const OWNED_TEST_CONTAINER =
  /^codex-wos-prod-readiness-pg17-[A-Za-z0-9_.-]+$/;
const DEFAULT_STATE_DIR = join(
  homedir(),
  'Library/Application Support/HongdaOS/WOSQAUAT/edge-closer',
);
const DEFAULT_PLIST_DIR = join(homedir(), 'Library/LaunchAgents');

function fail(code) {
  throw new Error(code);
}

function writePrivateJson(path, value) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, path);
}

function validateUuid(value, code) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value || '')) {
    fail(code);
  }
  return value.toLowerCase();
}

function validateSha(value) {
  if (!/^[a-f0-9]{64}$/.test(value || '')) fail('WOS_V1_QA_CODE_SHA256_INVALID');
  return value;
}

function localTestMode() {
  return process.env.WOS_V1_QA_EDGE_CLOSER_TEST_MODE === 'true'
    || process.env.WOS_V1_QA_EDGE_CLOSER_TEST_PSQL === 'true';
}

function assertLocalTestScope() {
  if (!localTestMode()) return;
  if (process.env.WOS_V1_QA_EDGE_CLOSER_TEST_MODE !== 'true'
    || process.env.WOS_V1_QA_EDGE_CLOSER_TEST_PSQL !== 'true') {
    fail('WOS_V1_QA_EDGE_TEST_MODE_INCOMPLETE');
  }
  const container = process.env.WOS_QA_PSQL_DOCKER_CONTAINER || '';
  const database = process.env.WOS_QA_DATABASE || '';
  if (!OWNED_TEST_CONTAINER.test(container)
    || !database.endsWith('_ci')) {
    fail('WOS_V1_QA_EDGE_LOCAL_TEST_SCOPE_REQUIRED');
  }
}

function validateFunctionUrl(value, allowLocal) {
  const url = new URL(value);
  const local = allowLocal
    && url.protocol === 'http:'
    && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (!local && (
    url.protocol !== 'https:'
    || url.hostname !== `${PROJECT_REF}.supabase.co`
    || url.pathname !== '/functions/v1/wos-v1-verify-image'
  )) {
    fail('WOS_V1_QA_EDGE_FUNCTION_URL_INVALID');
  }
  return url.toString();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function keychainSecret(service, account) {
  const result = spawnSync(
    'security',
    ['find-generic-password', '-s', service, '-a', account, '-w'],
    { encoding: 'utf8' },
  );
  return result.status === 0 ? result.stdout.trim() : '';
}

function databaseEnv() {
  const urlValue = process.env.WOS_QA_DATABASE_URL
    || keychainSecret(DB_DSN_KEYCHAIN, PROJECT_REF);
  if (!urlValue) fail('WOS_QA_DATABASE_URL_REQUIRED');
  const url = new URL(urlValue);
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    fail('WOS_QA_DATABASE_URL_INVALID');
  }
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
    PGSSLMODE: url.searchParams.get('sslmode') || 'require',
  };
}

function runSql(sql) {
  const container = process.env.WOS_QA_PSQL_DOCKER_CONTAINER;
  const result = container
    ? spawnSync(
        'docker',
        [
          'exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
          '-U', 'postgres', '-d', process.env.WOS_QA_DATABASE || 'postgres',
          '-At', '-f', '-',
        ],
        { cwd: ROOT, input: sql, encoding: 'utf8' },
      )
    : spawnSync(
        'psql',
        ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-f', '-'],
        { cwd: ROOT, env: databaseEnv(), input: sql, encoding: 'utf8' },
      );
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

function stateDir() {
  return process.env.WOS_V1_QA_EDGE_CLOSER_STATE_DIR || DEFAULT_STATE_DIR;
}

function plistDir() {
  return process.env.WOS_V1_QA_EDGE_CLOSER_PLIST_DIR || DEFAULT_PLIST_DIR;
}

function statePath(id) {
  return join(stateDir(), `${id}.json`);
}

function label(id) {
  return `com.hongda.wos.qa-edge-closer.${id.replaceAll('-', '')}`;
}

function configuredEdgeProxy() {
  return process.env.WOS_V1_QA_EDGE_PROXY
    || process.env.HTTPS_PROXY
    || process.env.https_proxy
    || '';
}

function plistPath(id) {
  return join(plistDir(), `${label(id)}.plist`);
}

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function plistContent(id, path, scriptPath = SCRIPT) {
  const output = join(stateDir(), `${id}.log`);
  const error = join(stateDir(), `${id}.error.log`);
  const proxy = configuredEdgeProxy();
  const proxyEnvironment = proxy
    ? `    <key>WOS_V1_QA_EDGE_PROXY</key><string>${xml(proxy)}</string>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(label(id))}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(scriptPath)}</string>
    <string>watch</string>
    <string>--state</string>
    <string>${xml(path)}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>5</integer>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>ProcessType</key><string>Background</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(process.env.PATH || '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin')}</string>
    <key>WOS_V1_QA_EDGE_LAUNCHD</key><string>1</string>
${proxyEnvironment}  </dict>
  <key>StandardOutPath</key><string>${xml(output)}</string>
  <key>StandardErrorPath</key><string>${xml(error)}</string>
</dict>
</plist>
`;
}

function armToken(id) {
  const supplied = process.env.WOS_V1_QA_ARM_TOKEN;
  if (supplied) return validateUuid(supplied, 'WOS_V1_QA_ARM_TOKEN_INVALID');
  const stored = keychainSecret(ARM_KEYCHAIN, id);
  if (!stored) fail('WOS_V1_QA_ARM_TOKEN_REQUIRED');
  return validateUuid(stored, 'WOS_V1_QA_ARM_TOKEN_INVALID');
}

function serviceKey() {
  const key = process.env.WOS_QA_EDGE_SERVICE_ROLE_KEY
    || keychainSecret(SERVICE_KEYCHAIN, PROJECT_REF);
  if (!key) fail('WOS_V1_QA_EDGE_SERVICE_ROLE_KEY_REQUIRED');
  if (localTestMode()) return key;
  const parts = key.split('.');
  if (parts.length !== 3) {
    fail('WOS_V1_QA_EDGE_SERVICE_ROLE_JWT_REQUIRED');
  }
  let payload;
  try {
    payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    );
  } catch {
    fail('WOS_V1_QA_EDGE_SERVICE_ROLE_JWT_INVALID');
  }
  if (payload?.role !== 'service_role' || payload?.ref !== PROJECT_REF) {
    fail('WOS_V1_QA_EDGE_SERVICE_ROLE_PROJECT_SCOPE_MISMATCH');
  }
  return key;
}

function functionUrl() {
  const value = process.env.WOS_V1_QA_EDGE_FUNCTION_URL
    || `https://${PROJECT_REF}.supabase.co/functions/v1/wos-v1-verify-image`;
  assertLocalTestScope();
  return validateFunctionUrl(value, localTestMode());
}

function testPsqlRpc(name, body) {
  let sql;
  if (name === 'wos_v1_qa_uat_edge_control_status') {
    sql = `SELECT public.wos_v1_qa_uat_edge_control_status(
      ${sqlLiteral(body.p_authorization_id)},
      ${sqlLiteral(body.p_project_ref)}
    )::text;`;
  } else if (name === 'wos_v1_qa_uat_edge_heartbeat') {
    sql = `SELECT public.wos_v1_qa_uat_edge_heartbeat(
      ${sqlLiteral(body.p_execution_id)}::uuid,
      ${sqlLiteral(body.p_arm_token)}::uuid,
      ${sqlLiteral(body.p_process_nonce)}::uuid
    )::text;`;
  } else if (name === 'wos_v1_qa_uat_edge_preflight') {
    sql = `SELECT public.wos_v1_qa_uat_edge_preflight(
      ${sqlLiteral(body.p_execution_id)}::uuid,
      ${sqlLiteral(body.p_arm_token)}::uuid,
      ${sqlLiteral(body.p_process_nonce)}::uuid
    )::text;`;
  } else if (name === 'wos_v1_qa_uat_close_edge') {
    sql = `SELECT public.wos_v1_qa_uat_close_edge(
      ${sqlLiteral(body.p_execution_id)}::uuid,
      ${sqlLiteral(body.p_request_id)}::uuid,
      ${sqlLiteral(body.p_reason)}
    )::text;`;
  } else if (name === 'wos_v1_qa_uat_edge_probe') {
    sql = `SELECT public.wos_v1_qa_uat_edge_probe(
      ${sqlLiteral(body.p_execution_id)}::uuid,
      ${sqlLiteral(body.p_process_nonce)}::uuid
    )::text;`;
  } else {
    fail('WOS_V1_QA_EDGE_RPC_NOT_SUPPORTED');
  }
  return JSON.parse(runSql(sql).split('\n').filter(Boolean).at(-1));
}

async function edgeRpc(name, body) {
  assertLocalTestScope();
  if (process.env.WOS_V1_QA_EDGE_CLOSER_TEST_PSQL === 'true') {
    return testPsqlRpc(name, body);
  }
  const service = serviceKey();
  const response = await fetch(
    `https://${PROJECT_REF}.supabase.co/rest/v1/rpc/${name}`,
    {
      method: 'POST',
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== 'object') {
    fail('WOS_V1_QA_EDGE_RPC_FAILED');
  }
  return payload;
}

async function closeArmFailure(id, reason) {
  try {
    unloadLaunchAgent({
      launchdLoaded: true,
      launchdLabel: label(id),
    });
  } catch {
    fail('WOS_V1_QA_EDGE_ARM_FAILURE_LAUNCHD_UNVERIFIED');
  }
  let result;
  try {
    result = await edgeRpc('wos_v1_qa_uat_close_edge', {
      p_execution_id: id,
      p_request_id: randomUUID(),
      p_reason: reason.slice(0, 200),
    });
  } catch {
    fail('WOS_V1_QA_EDGE_ARM_FAILURE_CLOSE_UNVERIFIED');
  }
  if (result?.status !== 'CLOSED') {
    fail('WOS_V1_QA_EDGE_ARM_FAILURE_CLOSE_UNVERIFIED');
  }
  return result;
}

async function arm() {
  assertLocalTestScope();
  const id = validateUuid(
    process.env.WOS_V1_QA_EXECUTION_ID,
    'WOS_V1_QA_EXECUTION_ID_REQUIRED',
  );
  const token = armToken(id);
  const codeSha = validateSha(process.env.WOS_V1_QA_CODE_SHA256);
  const load = process.argv.includes('--load');
  if (load && localTestMode()) {
    fail('WOS_V1_QA_EDGE_TEST_MODE_CANNOT_LOAD_LAUNCHD');
  }
  const testMode = localTestMode();
  const preflightOnly = !load && !testMode;
  const path = statePath(id);
  const plist = plistPath(id);
  const processNonce = validateUuid(
    process.env.WOS_V1_QA_EDGE_PROCESS_NONCE,
    'WOS_V1_QA_EDGE_PROCESS_NONCE_REQUIRED',
  );
  const control = preflightOnly ? null : await edgeRpc(
    'wos_v1_qa_uat_edge_control_status',
    {
      p_authorization_id: AUTH_ID,
      p_project_ref: PROJECT_REF,
    },
  );
  if (!preflightOnly
    && (!control?.writeDeadlineAt || !control?.edgeCleanupDeadlineAt)) {
    fail('WOS_V1_QA_EDGE_CLOSER_CONTROL_MISSING');
  }
  if (!preflightOnly
    && control.edgeProcessNonce
    && control.edgeProcessNonce !== processNonce) {
    fail('WOS_V1_QA_EDGE_PROCESS_NONCE_CONFLICT');
  }
  let bootstrapHeartbeat = null;
  let credentialProbe = null;
  if (load) {
    try {
      bootstrapHeartbeat = await edgeRpc('wos_v1_qa_uat_edge_preflight', {
        p_execution_id: id,
        p_arm_token: token,
        p_process_nonce: processNonce,
      });
    } catch {
      await closeArmFailure(id, 'WOS_V1_QA_EDGE_PREFLIGHT_RPC_FAILED');
      fail('WOS_V1_QA_EDGE_PREFLIGHT_RPC_FAILED');
    }
    try {
      credentialProbe = await probeCredential({
        executionId: id,
        authorizationId: AUTH_ID,
        projectRef: PROJECT_REF,
        codeSha256: codeSha,
        functionUrl: functionUrl(),
        processNonce,
      });
    } catch {
      await closeArmFailure(id, 'WOS_V1_QA_EDGE_CREDENTIAL_PROBE_EXCEPTION');
      fail('WOS_V1_QA_EDGE_CREDENTIAL_PROBE_EXCEPTION');
    }
    if (!credentialProbe.ok) {
      await closeArmFailure(id, 'WOS_V1_QA_EDGE_CREDENTIAL_PREFLIGHT_FAILED');
      fail(
        `WOS_V1_QA_EDGE_CREDENTIAL_PREFLIGHT_FAILED_${credentialProbe.code}`,
      );
    }
  }
  const priorHeartbeatAt =
    bootstrapHeartbeat?.previousHeartbeatAt
    || control?.edgeLastHeartbeatAt
    || '';
  mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  mkdirSync(plistDir(), { recursive: true });
  const frozenScriptPath = join(stateDir(), `${id}.closer.mjs`);
  const frozenScriptSource = readFileSync(SCRIPT, 'utf8');
  const frozenScriptSha256 = createHash('sha256')
    .update(frozenScriptSource)
    .digest('hex');
  writeFileSync(frozenScriptPath, frozenScriptSource, { mode: 0o500 });
  chmodSync(frozenScriptPath, 0o500);
  const pending = {
    schemaVersion: 1,
    status: 'PENDING',
    executionId: id,
    authorizationId: AUTH_ID,
    projectRef: PROJECT_REF,
    codeSha256: codeSha,
    functionUrl: functionUrl(),
    keychainArmTokenAccount: id,
    keychainServiceRoleAccount: PROJECT_REF,
    frozenScriptPath,
    frozenScriptSha256,
    processNonce,
    writeDeadlineAt: control?.writeDeadlineAt ?? null,
    edgeCleanupDeadlineAt: control?.edgeCleanupDeadlineAt ?? null,
    bootstrapHeartbeat,
    credentialProbe,
    armedAt: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(pending, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(
    plist,
    plistContent(id, path, frozenScriptPath),
    { mode: 0o600 },
  );
  chmodSync(path, 0o600);

  if (preflightOnly) {
    process.stdout.write(`${JSON.stringify({
      status: 'PENDING_LAUNCHD_LOAD',
      executionId: id,
      launchdLoaded: false,
      statePath: path,
      plistPath: plist,
    })}\n`);
    return;
  }

  if (load) {
    const domain = `gui/${process.getuid()}`;
    try {
      spawnSync('launchctl', ['bootout', `${domain}/${label(id)}`], {
        stdio: 'ignore',
      });
      execFileSync('launchctl', ['bootstrap', domain, plist], {
        stdio: 'ignore',
      });
      execFileSync('launchctl', ['kickstart', '-k', `${domain}/${label(id)}`], {
        stdio: 'ignore',
      });
      const check = spawnSync(
        'launchctl',
        ['print', `${domain}/${label(id)}`],
        { encoding: 'utf8' },
      );
      if (check.status !== 0) {
        fail('WOS_V1_QA_EDGE_CLOSER_LAUNCHD_NOT_LOADED');
      }
    } catch {
      await closeArmFailure(id, 'WOS_V1_QA_EDGE_CLOSER_LAUNCHD_NOT_LOADED');
      fail('WOS_V1_QA_EDGE_CLOSER_LAUNCHD_NOT_LOADED');
    }
  }

  const waitUntil = Date.now() + 35_000;
  let armedControl = control;
  while (Date.now() < waitUntil) {
    armedControl = await edgeRpc('wos_v1_qa_uat_edge_control_status', {
      p_authorization_id: AUTH_ID,
      p_project_ref: PROJECT_REF,
    });
    const heartbeatAt = String(armedControl.edgeLastHeartbeatAt || '');
    const heartbeatMs = Date.parse(heartbeatAt);
    if (armedControl.status === 'OPEN'
      && armedControl.executionId === id
      && armedControl.codeSha256 === codeSha
      && armedControl.edgeProcessNonce === processNonce
      && Number.isFinite(heartbeatMs)
      && heartbeatAt !== priorHeartbeatAt
      && heartbeatMs >= Date.now() - 30_000) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const armedHeartbeatAt = String(armedControl.edgeLastHeartbeatAt || '');
  const armedHeartbeatMs = Date.parse(armedHeartbeatAt);
  if (armedControl.status !== 'OPEN'
    || armedControl.executionId !== id
    || armedControl.codeSha256 !== codeSha
    || armedControl.edgeProcessNonce !== processNonce
    || !Number.isFinite(armedHeartbeatMs)
    || armedHeartbeatAt === priorHeartbeatAt
    || armedHeartbeatMs < Date.now() - 30_000) {
    await closeArmFailure(id, 'WOS_V1_QA_EDGE_CLOSER_HEARTBEAT_TIMEOUT');
    fail('WOS_V1_QA_EDGE_CLOSER_HEARTBEAT_TIMEOUT');
  }
  let openProbe;
  try {
    // Use the pinned HTTP envelope, not the control-status RPC receipt.
    // armedControl has edgeProcessNonce but lacks functionUrl/processNonce.
    openProbe = await probeOpen(pending);
  } catch {
    await closeArmFailure(id, 'WOS_V1_QA_EDGE_OPEN_PROBE_EXCEPTION');
    fail('WOS_V1_QA_EDGE_OPEN_PROBE_EXCEPTION');
  }
  if (!openProbe.ok) {
    await closeArmFailure(id, 'WOS_V1_QA_EDGE_OPEN_PROBE_FAILED');
    fail(
      `WOS_V1_QA_EDGE_OPEN_PROBE_FAILED_${openProbe.code}`,
    );
  }
  const armed = {
    ...pending,
    status: 'ARMED',
    writeDeadlineAt: armedControl.writeDeadlineAt,
    edgeCleanupDeadlineAt: armedControl.edgeCleanupDeadlineAt,
    launchdLabel: label(id),
    launchdLoaded: load,
    openProbe,
    plistPath: plist,
  };
  const digest = createHash('sha256')
    .update(JSON.stringify(armed))
    .digest('hex');
  writeFileSync(path, `${JSON.stringify({ ...armed, receiptSha256: digest }, null, 2)}\n`, {
    mode: 0o600,
  });
  if (load) {
    await spawnFinalizer(path);
  }
  process.stdout.write(`${JSON.stringify({
    status: 'ARMED',
    executionId: id,
    launchdLoaded: load,
    processNonce,
    writeDeadlineAt: armed.writeDeadlineAt,
    edgeCleanupDeadlineAt: armed.edgeCleanupDeadlineAt,
    receiptSha256: digest,
  })}\n`);
}

function readState(path) {
  assertLocalTestScope();
  if (!path || !existsSync(path)) fail('WOS_V1_QA_EDGE_CLOSER_STATE_MISSING');
  const state = JSON.parse(readFileSync(path, 'utf8'));
  if (state.authorizationId !== AUTH_ID || state.projectRef !== PROJECT_REF) {
    fail('WOS_V1_QA_EDGE_CLOSER_STATE_SCOPE_MISMATCH');
  }
  if (state.frozenScriptPath && state.frozenScriptSha256) {
    const actual = createHash('sha256')
      .update(readFileSync(state.frozenScriptPath))
      .digest('hex');
    if (actual !== state.frozenScriptSha256) {
      fail('WOS_V1_QA_EDGE_CLOSER_FROZEN_SCRIPT_TAMPERED');
    }
  }
  validateFunctionUrl(state.functionUrl, localTestMode());
  return state;
}

async function probeEdgeOnce(state, mode) {
  // The PostgREST control receipt is not an HTTP probe envelope.
  // Reject incomplete envelopes before attempting a network request.
  if (typeof state?.functionUrl !== 'string'
    || typeof state?.executionId !== 'string'
    || typeof state?.processNonce !== 'string') {
    fail('WOS_V1_QA_EDGE_PROBE_ENVELOPE_INVALID');
  }
  const service = serviceKey();
  const credentialPreflight = mode === 'CREDENTIAL';
  const quote = value => `"${String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')}"`;
  const target = new URL(state.functionUrl);
  const localTarget = ['127.0.0.1', 'localhost'].includes(target.hostname);
  const proxy = localTarget ? '' : configuredEdgeProxy();
  const headers = [
    `Authorization: Bearer ${service}`,
    `apikey: ${service}`,
    'Content-Type: application/json',
    `x-wos-qa-uat-authorization-id: ${AUTH_ID}`,
    `x-wos-qa-uat-execution-id: ${state.executionId}`,
    `x-wos-qa-uat-closer-nonce: ${state.processNonce}`,
    'x-wos-qa-closer-probe: 1',
    ...(credentialPreflight
      ? ['x-wos-qa-closer-credential-preflight: 1']
      : []),
  ];
  const config = [
    `url = ${quote(state.functionUrl)}`,
    'request = "POST"',
    'silent',
    'show-error',
    'max-time = 30',
    ...(proxy ? [`proxy = ${quote(proxy)}`] : []),
    ...headers.map(header => `header = ${quote(header)}`),
    'data = "{}"',
    'write-out = "\\n%{http_code}"',
  ].join('\n');
  const result = spawnSync('curl', ['-q', '--config', '-'], {
    input: config,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw result.error || new Error('WOS_V1_QA_EDGE_PROBE_CURL_FAILED');
  }
  const lines = String(result.stdout || '').trimEnd().split('\n');
  const status = Number(lines.pop());
  if (!Number.isInteger(status)) {
    throw new Error('WOS_V1_QA_EDGE_PROBE_STATUS_MISSING');
  }
  let payload = null;
  try {
    payload = JSON.parse(lines.join('\n'));
  } catch {
    payload = null;
  }
  const data = payload?.data && typeof payload.data === 'object'
    ? payload.data
    : null;
  const closedAt = typeof data?.closedAt === 'string' ? data.closedAt : '';
  const commonOk = payload
    && typeof payload === 'object'
    && data?.executionId === state.executionId;
  return {
    status,
    code: payload && typeof payload === 'object'
      ? String(payload.code || '')
      : '',
    ok: mode === 'CREDENTIAL'
      ? status === 200
        && payload?.code === 'WOS_V1_QA_EDGE_CREDENTIAL_VERIFIED'
        && commonOk
      : mode === 'OPEN'
      ? status === 200
        && payload?.code === 'WOS_V1_QA_EDGE_OPEN_PROBE'
        && data?.gateStatus === 'OPEN'
        && commonOk
      : status === 503
        && payload?.code === 'WOS_V1_QA_EDGE_CLOSED'
        && data?.gateStatus === 'CLOSED'
        && commonOk
        && closedAt.length > 0,
    gateStatus: data?.gateStatus || null,
    executionId: data?.executionId || null,
    closedAt: closedAt || null,
  };
}

async function probeEdge(state, mode) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await probeEdgeOnce(state, mode);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw lastError;
}

async function probeOpen(state) {
  return probeEdge(state, 'OPEN');
}

async function probeClosed(state) {
  return probeEdge(state, 'CLOSED');
}

async function probeCredential(state) {
  return probeEdge(state, 'CREDENTIAL');
}

function closedTimesMatch(result, probe) {
  const resultClosedAt = String(result?.closedAt || '');
  const probeClosedAt = String(probe?.closedAt || '');
  const cleanupDeadlineAt = Date.parse(
    result?.deadlineAt || result?.cleanupDeadlineAt || '',
  );
  const closedAtMs = Date.parse(resultClosedAt);
  return resultClosedAt.length > 0
    && resultClosedAt === probeClosedAt
    && Number.isFinite(closedAtMs)
    && Number.isFinite(cleanupDeadlineAt)
    && closedAtMs <= cleanupDeadlineAt;
}

async function credentialPreflight() {
  const id = validateUuid(
    process.env.WOS_V1_QA_EXECUTION_ID,
    'WOS_V1_QA_EXECUTION_ID_REQUIRED',
  );
  const codeSha = validateSha(process.env.WOS_V1_QA_CODE_SHA256);
  const nonce = validateUuid(
    process.env.WOS_V1_QA_EDGE_PROCESS_NONCE,
    'WOS_V1_QA_EDGE_PROCESS_NONCE_REQUIRED',
  );
  const expected = String(
    process.env.WOS_V1_QA_EDGE_PROBE_EXPECT || 'CREDENTIAL',
  ).toUpperCase();
  if (!['CREDENTIAL', 'OPEN', 'CLOSED'].includes(expected)) {
    fail('WOS_V1_QA_EDGE_PROBE_EXPECT_INVALID');
  }
  const state = {
    executionId: id,
    authorizationId: AUTH_ID,
    projectRef: PROJECT_REF,
    codeSha256: codeSha,
    functionUrl: functionUrl(),
    processNonce: nonce,
  };
  const probe = expected === 'CREDENTIAL'
    ? await probeCredential(state)
    : expected === 'OPEN'
      ? await probeOpen(state)
      : await probeClosed(state);
  process.stdout.write(`${JSON.stringify({
    status: probe.ok ? 'PASS' : 'FAIL',
    expected,
    httpStatus: probe.status,
    code: probe.code,
    executionId: probe.executionId,
    gateStatus: probe.gateStatus,
  })}\n`);
  if (!probe.ok) {
    fail(`WOS_V1_QA_EDGE_CREDENTIAL_PREFLIGHT_FAILED_${probe.code}`);
  }
  process.stdout.write('EDGE_CREDENTIAL_PREFLIGHT=PASS\n');
}

async function closeEdge(state, reason) {
  const id = validateUuid(
    state.executionId,
    'WOS_V1_QA_EXECUTION_ID_INVALID',
  );
  const requestId = randomUUID();
  return edgeRpc('wos_v1_qa_uat_close_edge', {
    p_execution_id: id,
    p_request_id: requestId,
    p_reason: reason,
  });
}

function unloadLaunchAgent(state) {
  if (localTestMode() || state.launchdLoaded !== true) {
    return { required: false, verified: false };
  }
  const domainLabel = `gui/${process.getuid()}/${state.launchdLabel}`;
  const bootout = spawnSync('launchctl', ['bootout', domainLabel], {
    encoding: 'utf8',
  });
  if (bootout.error) fail('WOS_V1_QA_EDGE_CLOSER_LAUNCHD_UNLOAD_FAILED');
  const check = spawnSync('launchctl', ['print', domainLabel], {
    encoding: 'utf8',
  });
  if (check.error) fail('WOS_V1_QA_EDGE_CLOSER_LAUNCHD_UNLOAD_FAILED');
  if (check.status === 0) {
    fail('WOS_V1_QA_EDGE_CLOSER_LAUNCHD_UNLOAD_FAILED');
  }
  const checkOutput = `${check.stdout || ''}\n${check.stderr || ''}`;
  if (!/could not find service|no such process|service.*not found/i.test(checkOutput)) {
    fail('WOS_V1_QA_EDGE_CLOSER_LAUNCHD_UNLOAD_FAILED');
  }
  return { required: true, verified: true };
}

function sealCloseReceipt(state, result, probe, launchAgentUnloaded, source) {
  const sealedReceipt = {
    authorizationId: AUTH_ID,
    projectRef: PROJECT_REF,
    executionId: state.executionId,
    codeSha256: state.codeSha256,
    processNonce: state.processNonce,
    launchAgentUnloaded,
    result,
    probe,
  };
  return {
    ...sealedReceipt,
    receiptSha256: createHash('sha256')
      .update(JSON.stringify(sealedReceipt))
      .digest('hex'),
    receiptSource: source,
  };
}

function writeClosedState(stateFile, state, receipt) {
  writePrivateJson(`${stateFile}.close.json`, receipt);
  writePrivateJson(stateFile, {
    ...state,
    status: 'CLOSED',
    launchdLoaded: receipt.launchAgentUnloaded === true
      ? false
      : state.launchdLoaded === true,
    closeReceipt: receipt,
  });
}

function writeUnverifiedCloseState(
  stateFile,
  state,
  receipt,
  reason,
) {
  writePrivateJson(stateFile, {
    ...state,
    status: 'CLOSE_UNVERIFIED',
    launchdLoaded: state.launchdLoaded === true,
    closeReceipt: receipt,
    closeVerificationError: reason,
  });
}

function finalizerAckPath(stateFile) {
  return `${stateFile}.finalizer.ack.json`;
}

async function spawnFinalizer(stateFile) {
  const state = readState(stateFile);
  const ackPath = finalizerAckPath(stateFile);
  rmSync(ackPath, { force: true });
  const child = spawn(
    process.execPath,
    [SCRIPT, 'finalize', '--state', stateFile],
    {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    },
  );
  child.unref();
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (existsSync(ackPath)) {
      try {
        const ack = JSON.parse(readFileSync(ackPath, 'utf8'));
        if (ack?.status === 'STARTED'
          && ack?.executionId === state.executionId) {
          return;
        }
      } catch {
        // The finalizer may still be atomically replacing the handshake.
      }
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child.kill('SIGTERM');
  await closeArmFailure(state.executionId, 'WOS_V1_QA_EDGE_FINALIZER_SPAWN_FAILED');
  fail('WOS_V1_QA_EDGE_FINALIZER_SPAWN_FAILED');
}

async function finalizeClose(stateFile) {
  const state = readState(stateFile);
  writePrivateJson(finalizerAckPath(stateFile), {
    status: 'STARTED',
    executionId: state.executionId,
    processId: process.pid,
    startedAt: new Date().toISOString(),
  });
  const timeout = Date.parse(state.edgeCleanupDeadlineAt || '') + 60_000;
  while (Date.now() <= timeout) {
    const current = readState(stateFile);
    if (current.status === 'CLOSE_UNVERIFIED') {
      const launchAgent = unloadLaunchAgent(current);
      writePrivateJson(stateFile, {
        ...current,
        launchdLoaded: launchAgent.required
          && launchAgent.verified
          ? false
          : current.launchdLoaded,
      });
      fail('WOS_V1_QA_EDGE_CLOSED_PROBE_FAILED');
    }
    if (current.status === 'CLOSED' && current.closeReceipt) {
      const launchAgent = unloadLaunchAgent(current);
      if (current.closeReceipt.result?.timely !== true
        || current.closeReceipt.probe?.ok !== true) {
        writeUnverifiedCloseState(
          stateFile,
          current,
          current.closeReceipt,
          'WOS_V1_QA_EDGE_CLOSED_PROBE_FAILED',
        );
        fail('WOS_V1_QA_EDGE_CLOSED_PROBE_FAILED');
      }
      const receipt = sealCloseReceipt(
        current,
        current.closeReceipt.result,
        current.closeReceipt.probe,
        launchAgent.required ? launchAgent.verified : false,
        'SCHEDULED_EDGE_CLOSE_FINALIZER',
      );
      writeClosedState(stateFile, current, receipt);
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  fail('WOS_V1_QA_EDGE_CLOSER_FINALIZER_TIMEOUT');
}

async function watch(stateFile, once) {
  const state = readState(stateFile);
  if (state.status === 'CLOSED') return;
  const due = Date.parse(state.writeDeadlineAt || state.edgeCleanupDeadlineAt);
  if (!Number.isFinite(due)) fail('WOS_V1_QA_EDGE_CLOSER_DEADLINE_INVALID');
  if (Date.now() < due) {
    await edgeRpc('wos_v1_qa_uat_edge_heartbeat', {
      p_execution_id: state.executionId,
      p_arm_token: armToken(state.executionId),
      p_process_nonce: validateUuid(
        state.processNonce,
        'WOS_V1_QA_EDGE_PROCESS_NONCE_INVALID',
      ),
    });
    if (!once) return;
    process.stdout.write('WOS_V1_QA_EDGE_CLOSER=HEARTBEAT\n');
    return;
  }
  const result = await closeEdge(state, 'SCHEDULED_EDGE_CLOSE');
  const probe = await probeClosed(state);
  const receipt = sealCloseReceipt(
    state,
    result,
    probe,
    false,
    'SCHEDULED_EDGE_CLOSE_PRE_FINALIZER',
  );
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (result.timely !== true
    || !probe.ok
    || !closedTimesMatch(result, probe)) {
    writeUnverifiedCloseState(
      stateFile,
      state,
      receipt,
      result.timely !== true
        ? 'WOS_V1_QA_EDGE_CLOSER_DEADLINE_MISSED'
        : !probe.ok
          ? 'WOS_V1_QA_EDGE_CLOSED_PROBE_FAILED'
          : 'WOS_V1_QA_EDGE_CLOSED_TIMESTAMP_MISMATCH',
    );
    if (result.timely !== true) {
      fail('WOS_V1_QA_EDGE_CLOSER_DEADLINE_MISSED');
    }
    fail('WOS_V1_QA_EDGE_CLOSED_PROBE_FAILED');
  }
  writeClosedState(stateFile, state, receipt);
}

async function watchLoop(stateFile) {
  while (true) {
    const state = readState(stateFile);
    if (state.status === 'CLOSED') return;
    if (state.status === 'CLOSE_UNVERIFIED') {
      fail('WOS_V1_QA_EDGE_CLOSED_PROBE_FAILED');
    }
    const due = Date.parse(state.writeDeadlineAt || state.edgeCleanupDeadlineAt);
    if (Number.isFinite(due) && Date.now() >= due) {
      await watch(stateFile, true);
      return;
    }
    try {
      await watch(stateFile, true);
    } catch {
      // Heartbeats can fail after the DB closer runs; keep waiting for the
      // independent Edge deadline so the Edge state still closes.
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function manualClose() {
  const id = validateUuid(
    process.env.WOS_V1_QA_EXECUTION_ID,
    'WOS_V1_QA_EXECUTION_ID_REQUIRED',
  );
  const path = statePath(id);
  const state = existsSync(path)
    ? readState(path)
    : {
        executionId: id,
        authorizationId: AUTH_ID,
        projectRef: PROJECT_REF,
        functionUrl: functionUrl(),
        launchdLabel: label(id),
      };
  const result = await closeEdge(
    state,
    String(process.env.WOS_V1_QA_CLOSE_REASON || 'MANUAL_EDGE_CLOSE').slice(0, 200),
  );
  const probe = await probeClosed(state);
  process.stdout.write(`${JSON.stringify({ result, probe })}\n`);
  if (result.timely !== true) fail('WOS_V1_QA_EDGE_CLOSER_DEADLINE_MISSED');
  if (!probe.ok || !closedTimesMatch(result, probe)) {
    fail('WOS_V1_QA_EDGE_CLOSED_PROBE_FAILED');
  }
}

async function status() {
  const id = validateUuid(
    process.env.WOS_V1_QA_EXECUTION_ID,
    'WOS_V1_QA_EXECUTION_ID_REQUIRED',
  );
  const path = statePath(id);
  const state = existsSync(path)
    ? readState(path)
    : {
        status: 'NOT_ARMED',
        executionId: id,
        authorizationId: AUTH_ID,
        projectRef: PROJECT_REF,
      };
  const print = spawnSync(
    'launchctl',
    ['print', `gui/${process.getuid()}/${label(id)}`],
    { encoding: 'utf8' },
  );
  const control = await edgeRpc('wos_v1_qa_uat_edge_control_status', {
    p_authorization_id: AUTH_ID,
    p_project_ref: PROJECT_REF,
  });
  process.stdout.write(`${JSON.stringify({
    ...state,
    launchdLoaded: print.status === 0,
    control,
  })}\n`);
}

function disarm() {
  const id = validateUuid(
    process.env.WOS_V1_QA_EXECUTION_ID,
    'WOS_V1_QA_EXECUTION_ID_REQUIRED',
  );
  const state = existsSync(statePath(id))
    ? readState(statePath(id))
    : {
        executionId: id,
        launchdLoaded: true,
        launchdLabel: label(id),
      };
  const launchAgent = unloadLaunchAgent(state);
  process.stdout.write(`${JSON.stringify({
    status: 'DISARMED',
    executionId: id,
    launchAgentUnloaded: launchAgent.required
      ? launchAgent.verified
      : false,
  })}\n`);
}

const command = process.argv[2];
const stateIndex = process.argv.indexOf('--state');
try {
  assertLocalTestScope();
  if (command === 'arm') await arm();
  else if (command === 'finalize') {
    const stateFile = process.argv[stateIndex + 1];
    await finalizeClose(stateFile);
  }
  else if (command === 'watch') {
    const stateFile = process.argv[stateIndex + 1];
    if (process.argv.includes('--loop')) await watchLoop(stateFile);
    else await watch(stateFile, process.argv.includes('--once'));
  } else if (command === 'status') await status();
  else if (command === 'credential-preflight') {
    await credentialPreflight();
  }
  else if (command === 'close' || command === 'revoke') await manualClose();
  else if (command === 'disarm') disarm();
  else fail('WOS_V1_QA_EDGE_CLOSER_COMMAND_INVALID');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'UNKNOWN'}\n`);
  process.exitCode = 1;
}
