import fs from 'node:fs';
import {
  parseReadyGeneralTask,
  selectTrustedReadyGeneralTask,
} from '../../src/lib/agent-control/ready-general';

const workflow = fs.readFileSync('.github/workflows/agent-control-dry-run.yml', 'utf8');
const validator = fs.readFileSync('scripts/agent-control/github-dry-run.ts', 'utf8');
const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const schema = JSON.parse(fs.readFileSync(
  'scripts/agent-control/codex-ready-general-output.schema.json',
  'utf8',
)) as { additionalProperties?: boolean; required?: string[] };

let passed = 0;
function check(value: unknown, name: string) {
  if (!value) throw new Error(name);
  passed++;
}

const taskId = 'CPC-READY-RUNNER-TEST-001';
const baseMasterSha = 'a'.repeat(40);
const objective = 'Update the bounded customer project documentation using only the approved path.';
const body = [
  'AGENT_CONTROL_READY_TASK_V1',
  `TASK_ID = ${taskId}`,
  'TASK_STATUS = READY_FOR_CODEX',
  `BASE_MASTER_SHA = ${baseMasterSha}`,
  'ALLOWED_PATHS_JSON = ["docs/customer-project-center/WORKFLOW_V1.md"]',
  'CHECKS = typecheck,agent-control',
  `OBJECTIVE_B64 = ${Buffer.from(objective).toString('base64')}`,
].join('\n');
const valid = { id: 100, authorLogin: 'lenchenalc-hongda', body };

check(parseReadyGeneralTask(valid, { taskId, baseMasterSha })?.objective === objective,
  'validator exports a normalized objective after exact trusted parsing');
check(parseReadyGeneralTask(valid, { taskId, baseMasterSha: 'b'.repeat(40) }) === null,
  'stale master is rejected');
check(selectTrustedReadyGeneralTask([
  valid,
  { ...valid, id: 101, body: body.replace('READY_FOR_CODEX', 'FAILED') },
], { taskId, baseMasterSha }) === null,
  'new invalid owner task supersedes an old valid task');

check(validator.includes('selectTrustedReadyGeneralTask'),
  'cloud validator uses the merged trusted general parser');
check(validator.includes('ready_general_task_comment_id')
  && validator.includes('ready_general_objective_b64')
  && validator.includes('ready_general_allowed_paths_b64')
  && validator.includes('ready_general_checks'),
  'cloud validator exports only normalized runner fields');
check(!validator.includes('ready_general_task_body'),
  'raw task comments are not exported to the general runner');

const jobStart = workflow.indexOf('  ready-general-task:');
check(jobStart >= 0, 'general READY job exists');
const job = workflow.slice(jobStart);
const codexStep = job.indexOf('      - name: Run isolated general READY task and fixed checks');
const tokenStep = job.indexOf('      - name: Mint scoped GitHub App token');
const publishStep = job.indexOf('      - name: Revalidate and publish one general READY Draft PR');
check(codexStep >= 0 && tokenStep > codexStep && publishStep > tokenStep,
  'App token is minted only after execution, diff validation and fixed checks');
const isolated = job.slice(codexStep, tokenStep);
check(isolated.includes('env -i')
  && !isolated.includes('GH_APP_TOKEN:')
  && !isolated.includes('SUPABASE_')
  && !isolated.includes('OPENAI_API_KEY'),
  'isolated Codex step receives no GitHub, database, Production or personal model token');
check(isolated.includes('git_control_before')
  && isolated.includes('git diff --cached --exit-code')
  && isolated.includes('READY_GENERAL_PATH=OUT_OF_SCOPE')
  && isolated.includes('READY_GENERAL_PARENT_CHAIN=UNSAFE')
  && isolated.includes('READY_GENERAL_DIFF_SHAPE=UNSAFE'),
  'runner enforces git control, unstaged output, exact paths, parent chains and safe file shapes');
check(isolated.includes('case "$check_name" in')
  && isolated.includes('typecheck)')
  && isolated.includes('agent-control)')
  && isolated.includes('customer-project-center)')
  && isolated.includes('secret-audit)')
  && isolated.includes('smoke)'),
  'comment check names map to fixed repository-owned commands');

const publisher = job.slice(publishStep);
check(publisher.includes('pnpm exec tsx scripts/agent-control/github-dry-run.ts')
  && publisher.includes('READY_GENERAL_MASTER=MOVED')
  && publisher.includes('ready_general_task_comment_id')
  && publisher.includes('READY_GENERAL_PUBLISH_PARENT_CHAIN=UNSAFE'),
  'publisher rechecks live Issue state, newest task and master');
check(publisher.includes('READ_TOKEN: ${{ github.token }}')
  && publisher.includes('GITHUB_TOKEN="$READ_TOKEN" pnpm exec tsx')
  && !publisher.includes('GITHUB_TOKEN="$GH_APP_TOKEN" pnpm exec tsx'),
  'live revalidation uses a read-only workflow token, not the scoped writer token');
check(publisher.includes('codex/agent-control-ready-general-$normalized_task-')
  && publisher.includes('draft-pr')
  && !publisher.includes('push --force')
  && !publisher.includes('push -f'),
  'publisher uses a deterministic branch, Draft PR and no force push');
check(publisher.includes('READY_GENERAL_IDEMPOTENT_REUSE=YES')
  && publisher.includes('READY_GENERAL_BRANCH=CONFLICT')
  && publisher.includes('READY_GENERAL_PR=CONFLICT'),
  'same task/base/head can resume while conflicting remote state fails closed');
check(publisher.includes('AUTO_MERGE = false')
  && publisher.includes('AUTO_PRODUCTION = false')
  && publisher.includes('DATABASE_CHANGED = NO')
  && publisher.includes('RLS_CHANGED = NO'),
  'Completion Contract preserves merge and Production gates');

check(schema.additionalProperties === false
  && schema.required?.includes('changed_paths')
  && schema.required?.includes('acceptance_sentinel'),
  'Codex output schema is strict and requires proof fields');
check(ci.includes('tests/unit/agent-control-ready-general-runner.test.ts'),
  'normal CI runs general READY runner safety tests');

console.log(`Agent Control READY general runner: ${passed} checks passed`);
