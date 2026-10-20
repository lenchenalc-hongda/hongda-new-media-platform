import assert from 'node:assert/strict';
import { inspectNonprodAutoMerge, NONPROD_MERGE_BASE } from '../../scripts/agent-control/nonprod-auto-merge-policy.mjs';

const sha = 'a'.repeat(40), baseSha = 'b'.repeat(40);
const repo = 'lenchenalc-hongda/hongda-new-media-platform';
const fixture = () => ({
  repository: repo,
  pr: {
    number: 99, state: 'open', draft: false, mergeable: true, mergeable_state: 'clean',
    head: { sha, ref: 'codex/wos-test', repo: { full_name: repo } },
    base: { sha: baseSha, ref: NONPROD_MERGE_BASE, repo: { full_name: repo } },
  },
  control: {
    schema_version: 1, project: 'workshop-order-system',
    status: 'APPROVED_FOR_MERGE', current_phase: 'Workshop Order System Phase 2',
    current_task_id: 'WOS-P2-TEST-001', active_pr: 99,
    active_branch: 'codex/wos-test', verified_head: sha,
    pm_review: 'PASS', pm_review_head: sha, pm_review_pr: 99,
    owner_action_required: false, auto_production: false, production_execution_authorized: false,
  },
  registry: {
    projects: {
      'workshop-order-system': {
        control_issue: 104, task_prefix: 'WOS-', branch_prefix: 'codex/wos-',
        owned_prefixes: ['src/app/workshop-orders/', 'src/lib/workshop-orders/',
          'src/components/workshop-orders/', 'tests/unit/workshop-order-', 'docs/workshop-order-system/'],
      },
    },
    shared_prefixes: ['.github/', 'scripts/agent-control/', 'src/lib/supabase/'],
    shared_exact_paths: ['package.json', 'AGENTS.md'],
  },
  changedPaths: ['src/components/workshop-orders/ProductionOrderForm.tsx'],
  checks: [{ name: 'lint-and-audit', head_sha: sha, status: 'completed', conclusion: 'success' }],
  statusChecks: [{ context: 'Vercel', head_sha: sha, state: 'success' }],
  trustedCompletion: {
    status: 'PASS', readyForPmReview: true, prNumber: 99,
    headSha: sha, taskId: 'WOS-P2-TEST-001',
    project: 'workshop-order-system', author: 'hongda-agent-control-writer[bot]',
  },
  liveIntegrationHead: baseSha,
  activeProjectPrCount: 1,
});
const cases = [
  ['happy path', () => {}, true],
  ['master base always denied', f => { f.pr.base.ref = 'master'; }, false],
  ['production base always denied', f => { f.pr.base.ref = 'production'; }, false],
  ['draft denied', f => { f.pr.draft = true; }, false],
  ['closed denied', f => { f.pr.state = 'closed'; }, false],
  ['fork denied', f => { f.pr.head.repo.full_name = 'outsider/fork'; }, false],
  ['stale base denied', f => { f.liveIntegrationHead = 'c'.repeat(40); }, false],
  ['stale reviewed head denied', f => { f.control.pm_review_head = 'c'.repeat(40); }, false],
  ['changed PR HEAD denied', f => { f.pr.head.sha = 'c'.repeat(40); }, false],
  ['PR control mismatch denied', f => { f.control.active_pr = 1; }, false],
  ['control human gate denied', f => { f.control.status = 'HUMAN_GATE'; }, false],
  ['owner action required denied', f => { f.control.owner_action_required = true; }, false],
  ['unknown owner gate denied', f => { delete f.control.owner_action_required; }, false],
  ['unknown production flag denied', f => { delete f.control.production_execution_authorized; }, false],
  ['explicit production authorization denied', f => { f.control.current_phase = 'Production Release Gate'; }, false],
  ['failed CI denied', f => { f.checks[0].conclusion = 'failure'; }, false],
  ['pending CI denied', f => { f.checks[0].status = 'in_progress'; }, false],
  ['stale SHA CI denied', f => { f.checks[0].head_sha = 'c'.repeat(40); }, false],
  ['missing preview denied', f => { f.statusChecks = []; }, false],
  ['stale preview denied', f => { f.statusChecks[0].head_sha = 'c'.repeat(40); }, false],
  ['untrusted bot denied', f => { f.trustedCompletion.author = 'unauthorized[bot]'; }, false],
  ['missing completion denied', f => { f.trustedCompletion = null; }, false],
  ['unregistered project denied', f => { f.control.project = 'unauthorized'; }, false],
  ['wrong branch denied', f => { f.pr.head.ref = 'random/wos'; }, false],
  ['multiple active PRs denied', f => { f.activeProjectPrCount = 2; }, false],
  ['unknown PR count denied', f => { f.activeProjectPrCount = undefined; }, false],
  ['changed root config denied', f => { f.changedPaths = ['package.json']; }, false],
  ['migration denied', f => { f.changedPaths = ['supabase/migrations/20261020_wos.sql']; }, false],
  ['database API denied', f => { f.changedPaths = ['src/app/api/workshop-orders/route.ts']; }, false],
  ['shared CI denied', f => { f.changedPaths = ['.github/workflows/ci.yml']; }, false],
  ['auth denied', f => { f.changedPaths = ['src/lib/auth/session.ts']; }, false],
  ['path traversal denied', f => { f.changedPaths = ['src/app/workshop-orders/../layout.tsx']; }, false],
  ['outside project denied', f => { f.changedPaths = ['src/components/global-lead-hub/Other.tsx']; }, false],
  ['empty file set denied', f => { f.changedPaths = []; }, false],
  ['merge conflict denied', f => { f.pr.mergeable = false; }, false],
  ['uncertain mergeability denied', f => { f.pr.mergeable_state = 'unknown'; }, false],
];
for (const [name, edit, expected] of cases) {
  const input = fixture();
  edit(input);
  const actual = inspectNonprodAutoMerge(input);
  assert.equal(actual.allowed, expected, name + ': ' + JSON.stringify(actual.reasons));
  if (!expected) assert(actual.reasons.length > 0, name + ' missing explicit failure reason');
}
console.log('agent-control-nonprod-merge.test.mjs: PASS; ' + cases.length + ' positive/negative guard cases');
