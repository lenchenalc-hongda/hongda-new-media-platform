import assert from 'node:assert/strict';
import fs from 'node:fs';
import './workshop-order-spec.test';

const read = (path: string) => fs.readFileSync(path, 'utf8');

const registry = JSON.parse(read('.github/agent-control/project-registry.json'));
assert.equal(registry.schema_version, 1);
assert.equal(registry.max_parallel_projects, 2);
assert.equal(registry.shared_path_lock, true);

const cpc = registry.projects['customer-project-center'];
const glh = registry.projects['global-lead-hub'];
const wos = registry.projects['workshop-order-system'];
assert.equal(cpc.control_issue, 10);
assert.equal(glh.control_issue, 72);
assert.equal(wos.control_issue, 104);
assert.equal(cpc.task_prefix, 'CPC-');
assert.equal(glh.task_prefix, 'GLH-');
assert.equal(wos.task_prefix, 'WOS-');
assert.equal(cpc.branch_prefix, 'codex/cpc-');
assert.equal(glh.branch_prefix, 'codex/glh-');
assert.equal(wos.branch_prefix, 'codex/wos-');

const projects = [cpc, glh, wos];
for (let i = 0; i < projects.length; i++) {
  const owned = new Set(projects[i].owned_prefixes);
  for (let j = i + 1; j < projects.length; j++) {
    for (const path of projects[j].owned_prefixes) {
      assert.equal(owned.has(path), false, `owned prefix overlaps: ${path}`);
    }
  }
  for (const shared of registry.shared_exact_paths) {
    assert.equal(owned.has(shared), false);
  }
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
assert(agents.includes('Workshop Order System uses Issue #104'));
assert(agents.includes('More than two projects may be registered'));
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

const glhWorkflow = read('.github/workflows/global-lead-hub-agent-control.yml');
assert(glhWorkflow.includes('github.event.issue.number == 72'));
assert(glhWorkflow.includes('agent-control-${{ github.repository }}-global-lead-hub'));
assert(glhWorkflow.includes('objective_b64: ${{ steps.validate.outputs.objective_b64 }}'));
assert(glhWorkflow.includes('runs-on: [self-hosted, macOS, X64, hongda-agent-control]'));
assert(glhWorkflow.includes('project-lane-validate.mjs'));
assert(glhWorkflow.includes('project-lane-run.sh'));
assert(glhWorkflow.includes('project-lane-publish.sh'));

const cpcWorkflow = read('.github/workflows/customer-project-center-agent-control.yml');
assert(cpcWorkflow.includes('github.event.issue.number == 10'));
assert(cpcWorkflow.includes('agent-control-${{ github.repository }}-customer-project-center'));
assert(cpcWorkflow.includes("AGENT_CONTROL_PROJECT: customer-project-center"));
assert(cpcWorkflow.includes("AGENT_CONTROL_ISSUE: '10'"));
assert(cpcWorkflow.includes('FIX_ROUND: ${{ needs.validate.outputs.fix_round }}'));
assert(cpcWorkflow.includes('MAX_FIX_ROUNDS: ${{ needs.validate.outputs.max_fix_rounds }}'));

const wosWorkflow = read('.github/workflows/workshop-order-system-agent-control.yml');
assert(wosWorkflow.includes('github.event.issue.number == 104'));
assert(wosWorkflow.includes('agent-control-${{ github.repository }}-workshop-order-system'));
assert(wosWorkflow.includes("AGENT_CONTROL_PROJECT: workshop-order-system"));
assert(wosWorkflow.includes("AGENT_CONTROL_ISSUE: '104'"));
assert(wosWorkflow.includes('FIX_ROUND: ${{ needs.validate.outputs.fix_round }}'));
assert(wosWorkflow.includes('MAX_FIX_ROUNDS: ${{ needs.validate.outputs.max_fix_rounds }}'));
assert(wosWorkflow.includes('runs-on: [self-hosted, macOS, X64, hongda-agent-control]'));
assert(wosWorkflow.includes('workflow_dispatch:'));
assert(wosWorkflow.includes('project-lane-recover.mjs'));
assert(wosWorkflow.includes('needs.execute.result == \'failure\''));
assert(glhWorkflow.includes('workflow_dispatch:'));
assert(cpcWorkflow.includes('workflow_dispatch:'));

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
assert(runner.includes('git -c core.quotepath=false diff --name-only --no-renames'));
assert(runner.includes('git -c core.quotepath=false ls-files --others --exclude-standard'));
assert(runner.includes('$HOME/.codex/plugins/.plugin-appserver/codex-cli/bin/codex'));
assert(runner.includes('"$codex_binary" --no-daemon exec'));
assert(runner.includes('agent_codex_home="$agent_user_home/.codex"'));
assert(runner.includes('CODEX_HOME="$agent_codex_home"'));
assert(!runner.includes('CODEX_HOME="$HOME/.codex"'));
assert(runner.includes('AGENT_CODEX_RUNTIME=ISOLATED'));
assert(runner.includes('KEYCHAIN_FAILURE'));
assert(runner.includes('run_result CODE_FAILURE'));
assert(runner.includes('CODEX_STDERR_BEGIN'));
assert(runner.includes('[REDACTED_API_KEY]'));

const publisher = read('scripts/agent-control/project-lane-publish.sh');
assert(publisher.includes('AUTO_PRODUCTION = false'));
assert(publisher.includes('READY_FOR_PM_REVIEW = YES'));
assert(publisher.includes('git -c core.quotepath=false diff --name-only --no-renames'));
assert(publisher.includes('git -c core.quotepath=false ls-files --others --exclude-standard'));
assert(!publisher.includes('merge_pull_request'));
assert(!publisher.includes('push origin master'));
assert(!publisher.includes('push origin main'));

const modelPolicy = read('docs/agent-control/MODEL_POLICY_V1.md');
assert(modelPolicy.includes('L1 — default execution'));
assert(modelPolicy.includes('L2 — first repair'));
assert(modelPolicy.includes('L3 — second repair / strong-model escalation'));
assert(modelPolicy.includes('PM diagnosis required'));
assert(modelPolicy.includes('AUTO_PRODUCTION=false'));

assert(glhWorkflow.includes('FIX_ROUND: ${{ needs.validate.outputs.fix_round }}'));
assert(glhWorkflow.includes('MAX_FIX_ROUNDS: ${{ needs.validate.outputs.max_fix_rounds }}'));
assert(runner.includes('MODEL_POLICY_V1_TIER'));
assert(runner.includes('AGENT_CONTROL_DEFAULT_MODEL:-deepseek-v4-flash'));
assert(runner.includes('AGENT_CONTROL_STRONG_MODEL:-deepseek-v4-pro'));
assert(runner.includes('reasoning_effort="high"'));
assert(runner.includes('reasoning_effort="xhigh"'));
assert(runner.includes('PM_DIAGNOSIS_REQUIRED=YES'));
assert(validator.includes('MODEL_POLICY_V1 max fix rounds reached; PM diagnosis required'));

const framework = read('docs/workshop-order-system/00_PROJECT_FRAMEWORK.md');
assert(framework.includes('两个独立入口，一个共享车间中心'));
assert(framework.includes('花膜对'));
assert(framework.includes('确认样对'));

const imageSpec = read('docs/workshop-order-system/05_REFERENCE_IMAGES_AND_VERSIONING.md');
assert(imageSpec.includes('当前生产基准'));
assert(imageSpec.includes('不允许覆盖'));
assert(imageSpec.includes('订单版本 V4'));

console.log('agent-control-multiproject.test.ts: PASS');

const reliabilityCore = read('scripts/agent-control/reliability-core.mjs');
assert(reliabilityCore.includes('KEYCHAIN_FAILURE'));
assert(reliabilityCore.includes('PROVIDER_401'));
assert(reliabilityCore.includes('NETWORK_FAILURE'));
assert(reliabilityCore.includes('recoveryDecision'));
assert(reliabilityCore.includes('shouldRedispatch'));

const recovery = read('scripts/agent-control/project-lane-recover.mjs');
assert(recovery.includes('RECOVERY_DISPATCHED'));
assert(recovery.includes('infra_retry_count'));
assert(recovery.includes('MAX_INFRA_RETRIES'));

const watchdog = read('scripts/agent-control/reliability-watchdog.mjs');
assert(watchdog.includes('LOST_TRIGGER'));
assert(reliabilityCore.includes('WAITING_OWNER'));
assert(watchdog.includes('RECONCILED_MERGED_PR'));

const watchdogWorkflow = read('.github/workflows/agent-control-reliability-watchdog-v2.yml');
assert(watchdogWorkflow.includes("cron: '*/15 * * * *'"));
assert(watchdogWorkflow.includes('actions: write'));
assert(watchdogWorkflow.includes('issues: write'));
