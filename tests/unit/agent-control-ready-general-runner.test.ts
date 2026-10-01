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
)) as {
  type?: string;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, {
    type?: string;
    enum?: string[];
    items?: { type?: string };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

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

const executeStart = workflow.indexOf('  ready-general-execute:');
const publishStart = workflow.indexOf('  ready-general-publish:');
check(executeStart >= 0 && publishStart > executeStart,
  'general READY execution and publishing are separate jobs');
const execute = workflow.slice(executeStart, publishStart);
const publisher = workflow.slice(publishStart);
const codexStep = execute.indexOf('      - name: Run isolated general READY task and fixed checks');
check(codexStep >= 0, 'isolated general READY execution step exists');
const isolated = execute.slice(codexStep);
check(isolated.includes('env -i')
  && !isolated.includes('GH_APP_TOKEN:')
  && !isolated.includes('SUPABASE_')
  && !isolated.includes('OPENAI_API_KEY'),
  'isolated Codex step receives no GitHub, database, Production or personal model token');
check(execute.includes('validate_workspace before_checks')
  && execute.includes('validate_workspace after_checks')
  && execute.includes('git_control_hash')
  && execute.includes('git diff --cached --exit-code')
  && execute.includes('READY_GENERAL_PATH=OUT_OF_SCOPE_')
  && execute.includes('READY_GENERAL_PARENT_CHAIN=UNSAFE')
  && execute.includes('READY_GENERAL_DIFF_SHAPE=UNSAFE_')
  && execute.includes('git diff --check'),
  'runner repeats git control, index, path, parent, mode and diff validation before and after checks');
check(execute.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02')
  && execute.includes('artifact-meta')
  && execute.includes('actions/artifacts/$UPLOADED_ARTIFACT_ID')
  && execute.includes('artifact_digest')
  && execute.includes('artifact_id'),
  'runner uploads with a commit-pinned action and exposes service artifact ID and digest');
check(execute.includes('manifest.json')
  && execute.includes('"trusted_comment_id"')
  && execute.includes('"allowed_paths"')
  && execute.includes('"changed_paths"')
  && execute.includes('"modes"')
  && execute.includes('"file_sha256"')
  && execute.includes('"canonical_diff_sha256"')
  && execute.includes('"bundle_sha256"'),
  'runner packages exact bytes with a complete hash-bound manifest');
check(!execute.includes('actions/create-github-app-token')
  && !execute.includes('GH_APP_TOKEN')
  && !execute.includes('secrets.AGENT_CONTROL_APP_PRIVATE_KEY')
  && !execute.includes('permission-contents: write')
  && !execute.includes('permission-pull-requests: write'),
  'execution job cannot mint or receive a write credential');
check(isolated.includes('case "$check_name" in')
  && isolated.includes('typecheck)')
  && isolated.includes('agent-control)')
  && isolated.includes('customer-project-center)')
  && isolated.includes('secret-audit)')
  && isolated.includes('smoke)'),
  'comment check names map to fixed repository-owned commands');

check(publisher.includes('runs-on: ubuntu-latest')
  && publisher.includes('persist-credentials: false')
  && publisher.includes('actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093')
  && publisher.includes('artifact-ids: ${{ needs.ready-general-execute.outputs.artifact_id }}'),
  'publisher starts from a clean runner and downloads the exact artifact by ID');
check(publisher.includes('actions/artifacts/$ARTIFACT_ID')
  && publisher.includes('artifact digest')
  && publisher.includes('"file_sha256"')
  && publisher.includes('"canonical_diff_sha256"')
  && publisher.includes('"bundle_sha256"')
  && publisher.includes('READY_GENERAL_ARTIFACT_HASH=MISMATCH')
  && publisher.includes('READY_GENERAL_CANONICAL_DIFF=MISMATCH')
  && publisher.includes('READY_GENERAL_REBUILT_FILE_HASH=MISMATCH')
  && publisher.includes('READY_GENERAL_REBUILT_BUNDLE_HASH=MISMATCH'),
  'publisher verifies service digest plus manifest, bundle, file and canonical diff hashes');
check(publisher.includes('GITHUB_TOKEN="$READ_TOKEN" pnpm exec tsx scripts/agent-control/github-dry-run.ts')
  && publisher.includes('ready_general_task_comment_id')
  && publisher.includes('READY_GENERAL_MASTER=MOVED')
  && publisher.includes('READY_GENERAL_LIVE_STATE_VERIFY=PASS'),
  'publisher rechecks live Issue state, newest task and master before writer token');
check(publisher.includes('READ_TOKEN: ${{ github.token }}')
  && !publisher.includes('GITHUB_TOKEN="$GH_APP_TOKEN" pnpm exec tsx'),
  'live revalidation uses a read-only workflow token, not the scoped writer token');
const mintStart = publisher.indexOf('      - name: Mint scoped GitHub App token');
check(mintStart >= 0, 'publisher mints the writer token only after preflight');
const afterMint = publisher.slice(mintStart);
check(!afterMint.includes('pnpm')
  && !afterMint.includes('tsx')
  && !afterMint.includes('scripts/agent-control')
  && !afterMint.includes('ready-bootstrap-json.rb')
  && !afterMint.includes('bash scripts/'),
  'publisher never executes repository-provided code after the write token is available');
check(publisher.includes('codex/agent-control-ready-general-$normalized_task-')
  && publisher.includes('"draft" => true')
  && !publisher.includes('push --force')
  && !publisher.includes('push -f'),
  'publisher uses a deterministic branch, Draft PR and no force push');
check(publisher.includes('READY_GENERAL_IDEMPOTENT_REUSE=YES')
  && publisher.includes('READY_GENERAL_BRANCH=CONFLICT')
  && publisher.includes('READY_GENERAL_PR=CONFLICT')
  && publisher.includes('abort "not draft" unless pr["draft"] == true')
  && publisher.includes('abort "wrong base" unless pr.dig("base", "ref") == "master"')
  && publisher.includes('abort "wrong head sha" unless pr.dig("head", "sha") == ARGV[2]'),
  'same task/base/head Draft PR can resume while conflicting remote state fails closed');
check(publisher.includes('AUTO_MERGE = false')
  && publisher.includes('AUTO_PRODUCTION = false')
  && publisher.includes('DATABASE_CHANGED = NO')
  && publisher.includes('RLS_CHANGED = NO'),
  'Completion Contract preserves merge and Production gates');

check(schema.type === 'object'
  && schema.additionalProperties === false
  && schema.required?.length === 6
  && schema.required?.includes('changed_paths')
  && schema.required?.includes('acceptance_sentinel')
  && schema.properties?.status?.type === 'string'
  && schema.properties?.status?.enum?.includes('PASS') === true
  && schema.properties?.task_id?.type === 'string'
  && schema.properties?.base_master_sha?.type === 'string'
  && schema.properties?.changed_paths?.type === 'array'
  && schema.properties?.changed_paths?.items?.type === 'string'
  && schema.properties?.workspace_write_confirmed?.type === 'boolean'
  && schema.properties?.acceptance_sentinel?.type === 'string',
  'Codex output schema uses the portable strict Structured Outputs subset');
const serializedSchema = JSON.stringify(schema);
check(!serializedSchema.includes('"$schema"')
  && !serializedSchema.includes('"const"')
  && !serializedSchema.includes('"minLength"')
  && !serializedSchema.includes('"maxLength"')
  && !serializedSchema.includes('"pattern"')
  && !serializedSchema.includes('"minItems"')
  && !serializedSchema.includes('"maxItems"')
  && !serializedSchema.includes('"uniqueItems"'),
  'Codex output schema avoids compatibility-sensitive constraints');
check(isolated.includes('result["status"] == "PASS"')
  && isolated.includes('result["task_id"] == ARGV[1]')
  && isolated.includes('result["base_master_sha"] == ARGV[2]')
  && isolated.includes('result["changed_paths"].sort == expected_paths')
  && isolated.includes('result["workspace_write_confirmed"] == true')
  && isolated.includes('result["acceptance_sentinel"] == "CODEX_READY_GENERAL_PROOF=PASS"'),
  'exact READY acceptance identity remains enforced after model output');
check(ci.includes('tests/unit/agent-control-ready-general-runner.test.ts'),
  'normal CI runs general READY runner safety tests');

console.log(`Agent Control READY general runner: ${passed} checks passed`);
