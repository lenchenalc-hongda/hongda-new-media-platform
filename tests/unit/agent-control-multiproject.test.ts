import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

const registry = JSON.parse(read('.github/agent-control/project-registry.json'));
assert.equal(registry.schema_version, 1);
assert.equal(registry.max_parallel_projects, 2);
assert.equal(registry.shared_path_lock, true);

const cpc = registry.projects['customer-project-center'];
const glh = registry.projects['global-lead-hub'];
assert.equal(cpc.control_issue, 10);
assert.equal(glh.control_issue, 72);
assert.equal(cpc.task_prefix, 'CPC-');
assert.equal(glh.task_prefix, 'GLH-');
assert.equal(cpc.branch_prefix, 'codex/cpc-');
assert.equal(glh.branch_prefix, 'codex/glh-');

const cpcOwned = new Set(cpc.owned_prefixes);
const glhOwned = new Set(glh.owned_prefixes);
for (const path of cpcOwned) {
  assert.equal(glhOwned.has(path), false, `owned prefix overlaps: ${path}`);
}
for (const shared of registry.shared_exact_paths) {
  assert.equal(cpcOwned.has(shared), false);
  assert.equal(glhOwned.has(shared), false);
}
assert(registry.shared_exact_paths.includes('AGENTS.md'));
assert(registry.shared_exact_paths.includes('package.json'));
assert(registry.shared_prefixes.includes('.github/'));
assert(registry.shared_prefixes.includes('scripts/agent-control/'));

const agents = read('AGENTS.md');
assert(agents.includes('ONE_ACTIVE_TASK_PER_PROJECT = true'));
assert(agents.includes('MAX_PARALLEL_PROJECTS = 2'));
assert(agents.includes('SHARED_PATH_LOCK = true'));
assert(agents.includes('Global Lead Hub uses Issue #72'));
assert(!agents.includes('ONE_ACTIVE_TASK_PER_REPO = true'));

const protocol = read('docs/agent-control/MULTI_PROJECT_PROTOCOL.md');
assert(protocol.includes('One active coding task per project'));
assert(protocol.includes('two self-hosted runner instances'));
assert(protocol.includes('Production'));

const runnerSetup = read('docs/agent-control/RUNNER_POOL_SETUP.md');
assert(runnerSetup.includes('~/actions-runner-hongda-2'));
assert(runnerSetup.includes('hongda-mac-lane-2'));
assert(runnerSetup.includes('hongda-agent-control'));
assert(runnerSetup.includes('.runner'));
assert(runnerSetup.includes('.credentials'));

const workflow = read('.github/workflows/global-lead-hub-agent-control.yml');
assert(workflow.includes('github.event.issue.number == 72'));
assert(workflow.includes('agent-control-${{ github.repository }}-global-lead-hub'));
assert(workflow.includes('objective_b64: ${{ steps.validate.outputs.objective_b64 }}'));
assert(workflow.includes('runs-on: [self-hosted, macOS, X64, hongda-agent-control]'));
assert(workflow.includes('project-lane-validate.mjs'));
assert(workflow.includes('project-lane-run.sh'));
assert(workflow.includes('project-lane-publish.sh'));

const validator = read('scripts/agent-control/project-lane-validate.mjs');
assert(validator.includes("const PROJECT = process.env.AGENT_CONTROL_PROJECT || 'global-lead-hub'"));
assert(validator.includes("const TASK_SENTINEL = 'AGENT_CONTROL_PROJECT_TASK_V1'"));
assert(validator.includes('shared path requires serialized shared lock'));
assert(validator.includes('path is outside project ownership'));

const runner = read('scripts/agent-control/project-lane-run.sh');
assert(runner.includes('pnpm next start -p 3000'));
assert(!runner.includes('pnam next'));
assert(runner.includes('PROJECT_LANE_PATH_OUT_OF_SCOPE'));
assert(runner.includes('execute Production SQL/RLS/env changes'));

const publisher = read('scripts/agent-control/project-lane-publish.sh');
assert(publisher.includes('AUTO_PRODUCTION = false'));
assert(publisher.includes('READY_FOR_PM_REVIEW = YES'));
assert(!publisher.includes('merge_pull_request'));
assert(!publisher.includes('push origin master'));
assert(!publisher.includes('push origin main'));

console.log('agent-control-multiproject.test.ts: PASS');
