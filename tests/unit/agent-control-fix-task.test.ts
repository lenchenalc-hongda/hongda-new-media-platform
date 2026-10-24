import assert from 'node:assert/strict';
import { parseTrustedFixTask, FIX_TASK_SENTINEL, selectBoundOriginalReadyTask } from '../../scripts/agent-control/project-lane-fix-task.mjs';

const master = 'a'.repeat(40);
const head = 'b'.repeat(40);
const taskId = 'WOS-P4-SCHEDULING-MODEL-001';
const branch = 'codex/wos-p4-scheduling-model-001-aaaaaaaaaaaa';
const paths = [
  'src/lib/workshop-orders/scheduling.ts',
  'tests/unit/workshop-order-scheduling.test.ts',
  'tests/unit/workshop-order-suite.test.ts',
];
const original = {
  project: 'workshop-order-system',
  taskId,
  status: 'READY_FOR_CODEX',
  baseMasterSha: master,
  expectedHead: master,
  fixRound: '0 / 3',
  allowedPaths: [...paths, 'src/app/workshop-orders/schedule/page.tsx'],
  checks: 'typecheck,build,secret-audit,smoke',
  objectiveB64: Buffer.from('Original bounded task').toString('base64'),
};
const state = {
  schema_version: 1,
  project: 'workshop-order-system',
  status: 'FIX_REQUIRED',
  current_task_id: taskId,
  master_sha: master,
  active_pr: 157,
  active_branch: branch,
  verified_head: head,
  fix_round: 1,
  max_fix_rounds: 3,
  auto_merge: false,
  auto_production: false,
};
const fields = [
  FIX_TASK_SENTINEL,
  'PROJECT = workshop-order-system',
  'TASK_ID = ' + taskId,
  'TASK_STATUS = FIX_REQUIRED',
  'PR_NUMBER = 157',
  'BRANCH = ' + branch,
  'EXPECTED_HEAD = ' + head,
  'VERIFIED_HEAD = ' + head,
  'FIX_ROUND = 1 / 3',
  'ALLOWED_PATHS_JSON = ' + JSON.stringify(paths),
  'CHECKS = typecheck,build,secret-audit,smoke',
];
const repairInstruction = 'Repair the validated Phase 4 scheduling checks. Do not alter Production.';
const body = fields.join('\n') + '\n\n' + repairInstruction;
const good = parseTrustedFixTask(body, original, state);
assert(good, 'trusted exact owner FIX task must be parsed');
assert.equal(good.status, 'FIX_REQUIRED');
assert.equal(good.expectedHead, head);
assert.equal(good.baseMasterSha, master);
assert.equal(Buffer.from(good.objectiveB64, 'base64').toString('utf8'), repairInstruction);
assert.deepEqual(good.allowedPaths, paths);
assert(parseTrustedFixTask(body.replaceAll('\n', '\r\n'), original, state), 'CRLF should be accepted');

function rejected(name: string, candidate: string, prior = original, current = state) {
  assert.equal(parseTrustedFixTask(candidate, prior, current), null, name);
}
rejected('wrong sentinel', body.replace(FIX_TASK_SENTINEL, 'AGENT_CONTROL_PROJECT_TASK_V1'));
rejected('wrong PR', body.replace('PR_NUMBER = 157', 'PR_NUMBER = 156'));
rejected('wrong branch', body.replace('BRANCH = ' + branch, 'BRANCH = codex/wos-malicious'));
rejected('wrong HEAD', body.replace('EXPECTED_HEAD = ' + head, 'EXPECTED_HEAD = ' + master));
rejected('wrong verified HEAD', body.replace('VERIFIED_HEAD = ' + head, 'VERIFIED_HEAD = ' + master));
rejected('wrong round', body.replace('FIX_ROUND = 1 / 3', 'FIX_ROUND = 2 / 3'));
rejected('wrong TASK_ID', body.replace('TASK_ID = ' + taskId, 'TASK_ID = WOS-OTHER'));
rejected('wrong status', body.replace('TASK_STATUS = FIX_REQUIRED', 'TASK_STATUS = READY_FOR_CODEX'));
rejected('wrong project', body.replace('PROJECT = workshop-order-system', 'PROJECT = global-lead-hub'));
rejected('duplicate key', body.replace('CHECKS =', 'PR_NUMBER = 157\nCHECKS ='));
rejected('extra header field', body.replace('CHECKS =', 'DISABLE_RLS = YES\nCHECKS ='));
rejected('missing check', body.replace('\nCHECKS = typecheck,build,secret-audit,smoke', ''));
rejected('modified checks', body.replace('CHECKS = typecheck,build,secret-audit,smoke', 'CHECKS = typecheck,build'));
rejected('missing instruction', fields.join('\n') + '\n\n');
rejected('missing separator', fields.join('\n') + '\n' + repairInstruction);
rejected('oversized instructions', fields.join('\n') + '\n\n' + 'a'.repeat(12001));
rejected('disallowed new path', body.replace(JSON.stringify(paths), JSON.stringify(['src/lib/supabase/admin.ts'])));
rejected('duplicate path', body.replace(JSON.stringify(paths), JSON.stringify([paths[0], paths[0]])));
rejected('empty paths', body.replace(JSON.stringify(paths), '[]'));
rejected('invalid JSON', body.replace(JSON.stringify(paths), 'not-json'));
assert.equal(parseTrustedFixTask(body, {...original, baseMasterSha:head}, state), null, 'original base must be exact');
assert.equal(parseTrustedFixTask(body, original, {...state, status:'WAITING_REVIEW'}), null, 'FIX parser requires FIX state');
assert.equal(parseTrustedFixTask(body, original, {...state, active_pr:158}), null, 'PR must match state');
assert.equal(parseTrustedFixTask(body, original, {...state, fix_round:3}), null, 'max fix rounds must fail closed');

const prIdentity = {
  number:157,
  created_at:'2026-10-24T06:09:54Z',
  body:[
    'PROJECT = workshop-order-system',
    'TASK_ID = ' + taskId,
    'BASE_MASTER_SHA = ' + master,
    'BRANCH = ' + branch,
    'TASK_COMMENT_ID = 6380615465',
  ].join('\n'),
};
const readyRecord = {
  comment:{id:6380615465,created_at:'2026-10-24T05:56:00Z',updated_at:'2026-10-24T05:56:00Z'},
  task:original,
};
const laterWeakTask = {
  comment:{id:6380999999,created_at:'2026-10-24T07:00:00Z',updated_at:'2026-10-24T07:00:00Z'},
  task:{...original,checks:'typecheck',allowedPaths:['src/lib/workshop-orders/scheduling.ts']},
};
assert.deepEqual(selectBoundOriginalReadyTask(prIdentity,[laterWeakTask,readyRecord],state),original,'later task cannot weaken original checks or allowlist');
assert.equal(selectBoundOriginalReadyTask(prIdentity,[laterWeakTask],state),null,'missing bound comment fails closed');
assert.equal(selectBoundOriginalReadyTask({...prIdentity,body:prIdentity.body.replace('6380615465','6380999999')},[laterWeakTask,readyRecord],state),null,'comment created after PR fails closed');
assert.equal(selectBoundOriginalReadyTask({...prIdentity,body:prIdentity.body+'\nTASK_COMMENT_ID = 6380615465'},[readyRecord],state),null,'duplicate identity fails closed');
assert.equal(selectBoundOriginalReadyTask({...prIdentity,body:prIdentity.body.replace('BRANCH = '+branch,'BRANCH = codex/wrong')},[readyRecord],state),null,'branch mismatch fails closed');
assert.equal(selectBoundOriginalReadyTask({...prIdentity,number:158},[readyRecord],state),null,'PR identity mismatch fails closed');
assert.equal(selectBoundOriginalReadyTask(prIdentity,[{...readyRecord,comment:{...readyRecord.comment,updated_at:'2026-10-24T07:10:00Z'}}],state),null,'edited original after PR fails closed');
assert.equal(selectBoundOriginalReadyTask(prIdentity,[readyRecord,readyRecord],state),null,'ambiguous original fails closed');

console.log('agent-control-fix-task.test.ts: PASS');
