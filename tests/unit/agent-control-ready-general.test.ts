import {
  buildReadyGeneralBranchName,
  isAllowedReadyGeneralPath,
  parseReadyGeneralTask,
  readyGeneralChangedPathsAllowed,
  readyGeneralPublicationComplete,
  selectTrustedReadyGeneralTask,
} from '../../src/lib/agent-control/ready-general';

const taskId = 'CPC-AUTO-004-READY-GENERAL-001';
const baseMasterSha = 'a'.repeat(40);
const objective = 'Document the customer project workflow and verify the bounded READY task policy.';
const objectiveB64 = Buffer.from(objective).toString('base64');
const path = 'docs/customer-project-center/WORKFLOW_V1.md';
const lines = [
  'AGENT_CONTROL_READY_TASK_V1',
  `TASK_ID = ${taskId}`,
  'TASK_STATUS = READY_FOR_CODEX',
  `BASE_MASTER_SHA = ${baseMasterSha}`,
  `ALLOWED_PATHS_JSON = ["${path}"]`,
  'CHECKS = typecheck,agent-control',
  `OBJECTIVE_B64 = ${objectiveB64}`,
];
const expected = { taskId, baseMasterSha };
const comment = (body = lines.join('\n'), authorLogin = 'lenchenalc-hongda') => ({
  id: 123,
  authorLogin,
  body,
});

let passed = 0;
function check(value: unknown, name: string) {
  if (!value) throw new Error(name);
  passed++;
}

check(parseReadyGeneralTask(comment(), expected)?.allowedPaths[0] === path, 'valid exact task');
check(parseReadyGeneralTask(comment(lines.join('\r\n')), expected)?.objective === objective, 'CRLF task');
check(parseReadyGeneralTask(comment(lines.join('\n') + '\n\n'), expected) === null, 'extra blank line');
check(parseReadyGeneralTask(comment(lines.join('\n') + '\n '), expected) === null, 'trailing whitespace line');
check(parseReadyGeneralTask(comment(lines.join('\n'), 'untrusted-user'), expected) === null, 'untrusted author');
check(parseReadyGeneralTask(comment(lines.join('\n')), { taskId, baseMasterSha: 'b'.repeat(40) }) === null, 'stale base');
check(parseReadyGeneralTask(comment([...lines, `TASK_ID = ${taskId}`].join('\n')), expected) === null, 'duplicate field');
check(parseReadyGeneralTask(comment([...lines, 'EXTRA = yes'].join('\n')), expected) === null, 'extra field');
check(parseReadyGeneralTask(comment(lines.join('\n').replace('READY_FOR_CODEX', 'FIX_REQUIRED')), expected) === null, 'wrong state');
check(parseReadyGeneralTask(comment(lines.join('\n').replace(objectiveB64, 'Zm9v=')), expected) === null, 'short objective');
check(parseReadyGeneralTask(comment(lines.join('\n').replace(objectiveB64, '!!bad!!')), expected) === null, 'bad base64');
check(parseReadyGeneralTask(comment(lines.join('\n').replace(path, '../../.github/workflows/evil.yml')), expected) === null, 'traversal');
check(parseReadyGeneralTask(comment(lines.join('\n').replace(path, '.github/workflows/evil.yml')), expected) === null, 'protected path');
check(parseReadyGeneralTask(comment(lines.join('\n').replace(`["${path}"]`, `["${path}","${path}"]`)), expected) === null, 'duplicate path');
check(parseReadyGeneralTask(comment(lines.join('\n').replace('typecheck,agent-control', 'typecheck,agent-control,unknown')), expected) === null, 'unknown check');
check(parseReadyGeneralTask(comment(lines.join('\n').replace('typecheck,agent-control', 'typecheck,typecheck')), expected) === null, 'duplicate check');
check(parseReadyGeneralTask(comment(lines.join('\n').replace(path, 'src/lib/customer-projects/domain.ts')), expected) === null, 'code needs stronger checks');
check(isAllowedReadyGeneralPath('src/lib/customer-projects/domain.ts'), 'project domain path');
check(isAllowedReadyGeneralPath('tests/unit/customer-project-domain.test.ts'), 'project test path');
check(!isAllowedReadyGeneralPath('supabase/migrations/000.sql'), 'migration blocked');
check(!isAllowedReadyGeneralPath('docs/customer-project-center/../AGENTS.md'), 'parent traversal blocked');
check(!isAllowedReadyGeneralPath('docs/customer-project-center/.hidden.md'), 'hidden path blocked');
check(readyGeneralChangedPathsAllowed([path], [path]), 'matching changed path');
check(!readyGeneralChangedPathsAllowed([path, '.github/workflows/evil.yml'], [path]), 'extra changed path');
check(!readyGeneralChangedPathsAllowed([path, path], [path]), 'duplicate changed path');
check(selectTrustedReadyGeneralTask([comment()], expected)?.commentId === 123, 'latest owner task selected');
check(selectTrustedReadyGeneralTask([
  comment(),
  { ...comment(lines.join('\n').replace('READY_FOR_CODEX', 'FAILED')), id: 124 },
], expected) === null, 'newer invalid owner task supersedes old task');
check(selectTrustedReadyGeneralTask([
  comment(),
  { ...comment(lines.join('\n'), 'untrusted-user'), id: 124 },
], expected)?.commentId === 123, 'untrusted comment cannot supersede owner task');

const publicationTaskId = 'CPC-AUTO-007-REPLAY-001';
const publicationBase = 'b'.repeat(40);
const publicationBranch = buildReadyGeneralBranchName(publicationTaskId, publicationBase)!;
const publicationHead = 'c'.repeat(40);
const publicationPr = {
  number: 77,
  state: 'open' as const,
  draft: true,
  headBranch: publicationBranch,
  headSha: publicationHead,
  baseBranch: 'master',
  authorLogin: 'hongda-agent-control-writer[bot]',
  body: [
    'Bounded general READY task executed by the isolated Agent Control runner.',
    `TASK_ID = ${publicationTaskId}`,
    `BASE_MASTER_SHA = ${publicationBase}`,
    `BRANCH = ${publicationBranch}`,
    `HEAD_SHA = ${publicationHead}`,
    'AUTO_MERGE = false',
    'AUTO_PRODUCTION = false',
  ].join('\n'),
};
const completionComment = {
  id: 999,
  authorLogin: 'hongda-agent-control-writer[bot]',
  body: [
    `TASK_ID = ${publicationTaskId}`,
    'TASK_STATUS = PASS',
    `BASE_MASTER_SHA = ${publicationBase}`,
    `BRANCH = ${publicationBranch}`,
    `HEAD_SHA = ${publicationHead}`,
    'PR_NUMBER = 77',
    'AUTO_MERGE = false',
    'AUTO_PRODUCTION = false',
    'READY_FOR_PM_REVIEW = YES',
  ].join('\n'),
};

check(publicationBranch === `codex/agent-control-ready-general-cpc-auto-007-replay-001-${publicationBase.slice(0, 12)}`,
  'deterministic branch is derived from task and base');
check(readyGeneralPublicationComplete(
  publicationPr,
  [completionComment],
  { taskId: publicationTaskId, baseMasterSha: publicationBase },
), 'authentic bot Draft PR plus same-head Completion Contract is complete');
check(!readyGeneralPublicationComplete(
  { ...publicationPr, authorLogin: 'lenchenalc-hongda' },
  [completionComment],
  { taskId: publicationTaskId, baseMasterSha: publicationBase },
), 'non-bot PR cannot satisfy publication replay guard');
check(!readyGeneralPublicationComplete(
  publicationPr,
  [{ ...completionComment, body: completionComment.body.replace('READY_FOR_PM_REVIEW = YES', 'READY_FOR_PM_REVIEW = NO') }],
  { taskId: publicationTaskId, baseMasterSha: publicationBase },
), 'incomplete contract cannot satisfy publication replay guard');
check(!readyGeneralPublicationComplete(
  { ...publicationPr, headSha: 'd'.repeat(40) },
  [completionComment],
  { taskId: publicationTaskId, baseMasterSha: publicationBase },
), 'mismatched publication head is rejected');

console.log(`Agent Control READY general policy: ${passed} checks passed`);
