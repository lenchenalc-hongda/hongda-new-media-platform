#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = fileURLToPath(import.meta.url);
const AUTH_ID = 'WOS-V1-PRODUCTION-M2-QA-UAT-003';
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

function plistContent(id, path) {
  const output = join(stateDir(), `${id}.log`);
  const error = join(stateDir(), `${id}.error.log`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(label(id))}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(SCRIPT)}</string>
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
  </dict>
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
  const priorHeartbeatMs = Date.parse(control?.edgeLastHeartbeatAt || '');
  mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  mkdirSync(plistDir(), { recursive: true });
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
    processNonce,
    writeDeadlineAt: control?.writeDeadlineAt ?? null,
    edgeCleanupDeadlineAt: control?.edgeCleanupDeadlineAt ?? null,
    armedAt: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(pending, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(plist, plistContent(id, path), { mode: 0o600 });
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
    if (check.status !== 0) fail('WOS_V1_QA_EDGE_CLOSER_LAUNCHD_NOT_LOADED');
  }

  const waitUntil = Date.now() + 35_000;
  let armedControl = control;
  while (Date.now() < waitUntil) {
    armedControl = await edgeRpc('wos_v1_qa_uat_edge_control_status', {
      p_authorization_id: AUTH_ID,
      p_project_ref: PROJECT_REF,
    });
    const heartbeatMs = Date.parse(armedControl.edgeLastHeartbeatAt || '');
    if (armedControl.status === 'OPEN'
      && armedControl.executionId === id
      && armedControl.codeSha256 === codeSha
      && armedControl.edgeProcessNonce === processNonce
      && Number.isFinite(heartbeatMs)
      && (!Number.isFinite(priorHeartbeatMs) || heartbeatMs > priorHeartbeatMs)
      && heartbeatMs >= Date.now() - 30_000) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const armedHeartbeatMs = Date.parse(
    armedControl.edgeLastHeartbeatAt || '',
  );
  if (armedControl.status !== 'OPEN'
    || armedControl.executionId !== id
    || armedControl.codeSha256 !== codeSha
    || armedControl.edgeProcessNonce !== processNonce
    || !Number.isFinite(armedHeartbeatMs)
    || (Number.isFinite(priorHeartbeatMs) && armedHeartbeatMs <= priorHeartbeatMs)
    || armedHeartbeatMs < Date.now() - 30_000) {
    spawnSync(
      'launchctl',
      ['bootout', `gui/${process.getuid()}/${label(id)}`],
      { stdio: 'ignore' },
    );
    fail('WOS_V1_QA_EDGE_CLOSER_HEARTBEAT_TIMEOUT');
  }
  const armed = {
    ...pending,
    status: 'ARMED',
    writeDeadlineAt: armedControl.writeDeadlineAt,
    edgeCleanupDeadlineAt: armedControl.edgeCleanupDeadlineAt,
    launchdLabel: label(id),
    launchdLoaded: load,
    plistPath: plist,
  };
  const digest = createHash('sha256')
    .update(JSON.stringify(armed))
    .digest('hex');
  writeFileSync(path, `${JSON.stringify({ ...armed, receiptSha256: digest }, null, 2)}\n`, {
    mode: 0o600,
  });
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
  validateFunctionUrl(state.functionUrl, localTestMode());
  return state;
}

async function probeClosed(state) {
  const service = serviceKey();
  const response = await fetch(state.functionUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${service}`,
      apikey: service,
      'Content-Type': 'application/json',
      'x-wos-qa-uat-authorization-id': AUTH_ID,
      'x-wos-qa-uat-execution-id': state.executionId,
      'x-wos-qa-uat-closer-nonce': state.processNonce,
      'x-wos-qa-closer-probe': '1',
    },
    body: '{}',
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  const data = payload?.data && typeof payload.data === 'object'
    ? payload.data
    : null;
  const closedAt = typeof data?.closedAt === 'string' ? data.closedAt : '';
  return {
    status: response.status,
    code: payload && typeof payload === 'object'
      ? String(payload.code || '')
      : '',
    ok: response.status === 503
      && payload
      && payload.code === 'WOS_V1_QA_EDGE_CLOSED'
      && data?.gateStatus === 'CLOSED'
      && data?.executionId === state.executionId
      && closedAt.length > 0,
    executionId: data?.executionId || null,
    closedAt: closedAt || null,
  };
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
  const check = spawnSync('launchctl', ['print', domainLabel], {
    encoding: 'utf8',
  });
  if (check.status === 0) {
    fail('WOS_V1_QA_EDGE_CLOSER_LAUNCHD_UNLOAD_FAILED');
  }
  return { required: true, verified: true };
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
  const launchAgent = unloadLaunchAgent(state);
  const sealedReceipt = {
    authorizationId: AUTH_ID,
    projectRef: PROJECT_REF,
    executionId: state.executionId,
    codeSha256: state.codeSha256,
    processNonce: state.processNonce,
    launchAgentUnloaded: launchAgent.required
      ? launchAgent.verified
      : false,
    result,
    probe,
  };
  const receipt = {
    ...sealedReceipt,
    receiptSha256: createHash('sha256')
      .update(JSON.stringify(sealedReceipt))
      .digest('hex'),
  };
  writeFileSync(`${stateFile}.close.json`, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
  const closedState = { ...state, status: 'CLOSED', closeReceipt: receipt };
  writeFileSync(stateFile, `${JSON.stringify(closedState, null, 2)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (result.timely !== true) fail('WOS_V1_QA_EDGE_CLOSER_DEADLINE_MISSED');
  if (!probe.ok) fail('WOS_V1_QA_EDGE_CLOSED_PROBE_FAILED');
}

async function watchLoop(stateFile) {
  while (true) {
    const state = readState(stateFile);
    if (state.status === 'CLOSED') return;
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
  if (!probe.ok) fail('WOS_V1_QA_EDGE_CLOSED_PROBE_FAILED');
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
  else if (command === 'watch') {
    const stateFile = process.argv[stateIndex + 1];
    if (process.argv.includes('--loop')) await watchLoop(stateFile);
    else await watch(stateFile, process.argv.includes('--once'));
  } else if (command === 'status') await status();
  else if (command === 'close' || command === 'revoke') await manualClose();
  else if (command === 'disarm') disarm();
  else fail('WOS_V1_QA_EDGE_CLOSER_COMMAND_INVALID');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'UNKNOWN'}\n`);
  process.exitCode = 1;
}
