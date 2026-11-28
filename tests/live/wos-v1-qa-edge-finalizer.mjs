#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const actualScript = join(
  ROOT,
  'scripts/wos-production-readiness/wos-v1-qa-uat-edge-closer.mjs',
);
if (!existsSync(actualScript)) throw new Error('EDGE_CLOSER_SOURCE_MISSING');

const executionId = '9d375980-42f3-4f94-85cf-f45652d1501b';
const baseState = {
  status: 'CLOSED',
  executionId,
  authorizationId: 'WOS-V1-PRODUCTION-M2-QA-UAT-010',
  projectRef: 'xulmpqaknlwqqculbsek',
  codeSha256: 'a601eb785bac26b90ac80c76e375cb03ec0f50cb8f2691978d5683a5826bd628',
  functionUrl:
    'https://xulmpqaknlwqqculbsek.supabase.co/functions/v1/wos-v1-verify-image',
  processNonce: '6aa2c612-0e33-4918-b156-9b1bb3fee1d1',
  launchdLabel: 'com.hongda.wos.qa-edge-closer.test',
  launchdLoaded: true,
  writeDeadlineAt: '2026-11-27T08:12:35.410816Z',
  edgeCleanupDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
  closeReceipt: {
    result: {
      status: 'CLOSED',
      executionId,
      timely: true,
      deadlineAt: '2026-11-27T08:18:35.410816Z',
      closedAt: '2026-11-27T08:12:40.741624Z',
    },
    probe: {
      status: 503,
      code: 'WOS_V1_QA_EDGE_CLOSED',
      ok: true,
      executionId,
      closedAt: '2026-11-27T08:12:40.741624Z',
    },
  },
};

function writeState(stateFile) {
  writeFileSync(stateFile, `${JSON.stringify(baseState, null, 2)}\n`, {
    mode: 0o600,
  });
}

function finalizerEnv(path) {
  return {
    ...process.env,
    PATH: path,
    WOS_V1_QA_EDGE_CLOSER_TEST_MODE: '',
    WOS_V1_QA_EDGE_CLOSER_TEST_PSQL: '',
  };
}

async function waitForClosedReceipt(stateFile) {
  const timeout = Date.now() + 20_000;
  while (Date.now() <= timeout) {
    try {
      const state = JSON.parse(readFileSync(stateFile, 'utf8'));
      if (state.status === 'CLOSED'
        && state.closeReceipt?.launchAgentUnloaded === true) {
        return state;
      }
    } catch {
      // The finalizer replaces the state after launchctl bootout.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('WOS_V1_QA_EDGE_FINALIZER_TIMEOUT');
}

const dir = mkdtempSync(join(tmpdir(), 'wos-edge-finalizer-'));
try {
  const successBin = join(dir, 'success-bin');
  const missingBin = join(dir, 'missing-bin');
  const rejectedBin = join(dir, 'rejected-bin');
  mkdirSync(successBin, { recursive: true });
  mkdirSync(missingBin, { recursive: true });
  mkdirSync(rejectedBin, { recursive: true });

  const stateFile = join(dir, 'state.json');
  const marker = join(dir, 'launchctl.marker');
  writeState(stateFile);

  const successLaunchctl = join(successBin, 'launchctl');
  writeFileSync(successLaunchctl, `#!/bin/sh
if [ "$1" = "bootout" ]; then
  printf '%s\\n' "$2" > "${marker}"
  exit 0
fi
if [ "$1" = "print" ]; then
  printf 'Could not find service\\n' >&2
  exit 113
fi
exit 1
`, { mode: 0o700 });
  chmodSync(successLaunchctl, 0o700);

  const launcher = [
    "const {spawn}=require('node:child_process');",
    `const child=spawn(process.execPath,${JSON.stringify([
      actualScript,
      'finalize',
      '--state',
      stateFile,
    ])},{detached:true,stdio:'ignore',env:process.env});`,
    'child.unref();',
  ].join('');
  const launched = spawnSync(process.execPath, ['-e', launcher], {
    encoding: 'utf8',
    env: finalizerEnv(`${successBin}:${process.env.PATH || ''}`),
  });
  assert.equal(launched.status, 0, launched.stderr);

  const state = await waitForClosedReceipt(stateFile);
  assert(existsSync(`${stateFile}.finalizer.ack.json`));
  assert(existsSync(marker), 'finalizer did not invoke launchctl bootout');
  assert.equal(state.launchdLoaded, false);
  const sealed = {
    authorizationId: state.closeReceipt.authorizationId,
    projectRef: state.closeReceipt.projectRef,
    executionId: state.closeReceipt.executionId,
    codeSha256: state.closeReceipt.codeSha256,
    processNonce: state.closeReceipt.processNonce,
    launchAgentUnloaded: state.closeReceipt.launchAgentUnloaded,
    result: state.closeReceipt.result,
    probe: state.closeReceipt.probe,
  };
  assert.equal(
    state.closeReceipt.receiptSha256,
    createHash('sha256').update(JSON.stringify(sealed)).digest('hex'),
  );

  const unverifiedState = join(dir, 'unverified-state.json');
  writeFileSync(unverifiedState, `${JSON.stringify({
    ...baseState,
    status: 'CLOSE_UNVERIFIED',
    closeReceipt: {
      ...baseState.closeReceipt,
      probe: {
        status: 503,
        code: 'WOS_V1_EDGE_SERVER_CONFIG_INCOMPLETE',
        ok: false,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });
  const unverified = spawnSync(process.execPath, [
    actualScript,
    'finalize',
    '--state',
    unverifiedState,
  ], {
    encoding: 'utf8',
    env: finalizerEnv(`${successBin}:${process.env.PATH || ''}`),
  });
  assert.notEqual(unverified.status, 0);
  assert.match(
    unverified.stderr,
    /WOS_V1_QA_EDGE_CLOSED_PROBE_FAILED/,
  );
  const unverifiedSaved = JSON.parse(
    readFileSync(unverifiedState, 'utf8'),
  );
  assert.equal(unverifiedSaved.status, 'CLOSE_UNVERIFIED');
  assert.equal(unverifiedSaved.launchdLoaded, false);

  const rejectedState = join(dir, 'rejected-state.json');
  writeState(rejectedState);
  const rejectedLaunchctl = join(rejectedBin, 'launchctl');
  writeFileSync(rejectedLaunchctl, `#!/bin/sh
if [ "$1" = "bootout" ]; then
  exit 1
fi
if [ "$1" = "print" ]; then
  printf 'launchctl: operation not permitted\\n' >&2
  exit 1
fi
exit 1
`, { mode: 0o700 });
  chmodSync(rejectedLaunchctl, 0o700);
  const rejected = spawnSync(process.execPath, [
    actualScript,
    'finalize',
    '--state',
    rejectedState,
  ], {
    encoding: 'utf8',
    env: finalizerEnv(`${rejectedBin}:${process.env.PATH || ''}`),
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr,
    /WOS_V1_QA_EDGE_CLOSER_LAUNCHD_UNLOAD_FAILED/);

  const missingState = join(dir, 'missing-state.json');
  writeState(missingState);
  const missing = spawnSync(process.execPath, [
    actualScript,
    'finalize',
    '--state',
    missingState,
  ], {
    encoding: 'utf8',
    env: finalizerEnv(missingBin),
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr,
    /WOS_V1_QA_EDGE_CLOSER_LAUNCHD_UNLOAD_FAILED/);

  console.log('WOS_V1_QA_EDGE_FINALIZER_DETACHED=PASS');
  console.log('WOS_V1_QA_EDGE_FINALIZER_UNVERIFIED_FAIL_CLOSED=PASS');
  console.log('WOS_V1_QA_EDGE_FINALIZER_LAUNCHCTL_REJECTED=PASS');
  console.log('WOS_V1_QA_EDGE_FINALIZER_LAUNCHCTL_MISSING=PASS');
  console.log('WOS_V1_QA_EDGE_FINALIZER=PASS');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
