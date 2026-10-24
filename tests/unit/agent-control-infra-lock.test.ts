import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verifySharedInfraLock } from '../../scripts/agent-control/shared-infra-lock.mjs';

const sha = 'a'.repeat(40);
const head = 'b'.repeat(40);
const registry = JSON.parse(fs.readFileSync('.github/agent-control/project-registry.json', 'utf8'));
const state = {
  schema_version: 1,
  project: 'agent-control-infrastructure',
  status: 'PM_REVIEW',
  current_task_id: 'AC-INFRA-FIX-VALIDATOR-CI-20261024',
  active_pr: 159,
  active_branch: 'infra/wos-phase4-ci-fix-task-validator-20261024',
  verified_head: head,
  base_master_sha: sha,
  shared_path_lock_owner: 159,
  queued_shared_prs: [121],
  allowed_paths: ['.github/workflows/ci.yml', 'scripts/agent-control/shared-infra-lock.mjs'],
  max_parallel_projects: 2,
  auto_merge: false,
  auto_production: false,
  production_execution_authorized: false,
};
const pr = {
  number: 159,
  state: 'open',
  draft: true,
  merged: false,
  body: 'INFRA_CONTROL_ISSUE = 160\nTASK_ID = AC-INFRA-FIX-VALIDATOR-CI-20261024',
  head: { ref: state.active_branch, sha: head },
  base: { ref: 'master', sha },
};
const args = {
  registry, state, pr, controlIssue: 160, eventHead: head, masterHead: sha,
  changedPaths: ['.github/workflows/ci.yml', 'scripts/agent-control/shared-infra-lock.mjs'],
};
const pass = verifySharedInfraLock(args);
assert.equal(pass.status, 'PASS');
assert.equal(pass.pr_number, 159);
assert.equal(pass.verified_files, 2);
function block(reason: string, mutations: Record<string, any>) {
  assert.throws(() => verifySharedInfraLock({ ...args, ...mutations }), new RegExp('SHARED_INFRA_LOCK_' + reason));
}
block('STALE_HEAD', { eventHead: sha });
block('STALE_HEAD', { state: { ...state, verified_head: sha } });
block('STALE_MASTER', { masterHead: head });
block('STALE_MASTER', { pr: { ...pr, base: { ref: 'master', sha: head } } });
block('LOCK_NOT_HELD', { state: { ...state, shared_path_lock_owner: 121 } });
block('LOCK_NOT_HELD', { state: { ...state, active_pr: 121 } });
block('BRANCH_PREFIX_MISMATCH', { state: { ...state, active_branch: 'codex/wos-bad' } });
block('PR_NOT_SAFE_DRAFT', { pr: { ...pr, draft: false } });
block('UNSAFE_STATE_FLAGS', { state: { ...state, auto_merge: true } });
block('UNSAFE_STATE_FLAGS', { state: { ...state, production_execution_authorized: true } });
block('UNSAFE_REGISTRY_FLAGS', { registry: { ...registry, shared_infrastructure_lane: { ...registry.shared_infrastructure_lane, auto_merge: true } } });
block('LOCK_POLICY_MISSING', { registry: { ...registry, shared_infrastructure_lane: { ...registry.shared_infrastructure_lane, requires_serialized_shared_path_lock: false } } });
block('UNREGISTERED_LANE', { registry: { ...registry, shared_infrastructure_lane: undefined } });
block('WRONG_CONTROL_ISSUE', { controlIssue: 104 });
block('TASK_MISMATCH', { state: { ...state, current_task_id: 'WOS-P4-ABC' } });
block('PR_CONTROL_BINDING_MISMATCH', { pr: { ...pr, body: 'TASK_ID = AC-INFRA-FIX-VALIDATOR-CI-20261024' } });
block('INVALID_CHANGED_PATHS', { changedPaths: ['.github/workflows/ci.yml', '.github/workflows/ci.yml'] });
block('CHANGED_PATH_OUT_OF_SCOPE', { changedPaths: ['src/lib/supabase/admin.ts'] });
block('CHANGED_PATH_OUT_OF_SCOPE', { changedPaths: ['.github/workflows/../secrets.yml'] });
block('ALLOWLIST_NOT_SHARED_INFRA_OWNED', { state: { ...state, allowed_paths: ['src/app/workshop-orders/page.tsx'] } });
block('INVALID_ALLOWLIST', { state: { ...state, allowed_paths: ['.github/workflows/ci.yml', '.github/workflows/ci.yml'] } });
block('QUEUED_LOCK_CONFLICT', { state: { ...state, queued_shared_prs: [159] } });
console.log('agent-control-infra-lock.test.ts: PASS');
