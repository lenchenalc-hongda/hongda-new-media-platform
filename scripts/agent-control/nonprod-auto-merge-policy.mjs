/**
 * Pure, fail-closed policy gate for Hongda's owner-authorized non-Production merge lane.
 * NOTE: no API tokens, network requests, mutating operations, or merge side effects here.
 * Invoke only with freshly fetched, trusted GitHub/Agent Control evidence.
 */
export const NONPROD_MERGE_BASE = 'integration/hongda-dev';
export const NONPROD_MERGE_REPOSITORY = 'lenchenalc-hongda/hongda-new-media-platform';

const FORBIDDEN_PREFIXES = [
  '.github/', 'scripts/agent-control/', 'docs/agent-control/',
  'supabase/', 'src/lib/supabase/', 'src/lib/auth/',
  'src/components/layout/', 'src/app/api/', 'src/middleware',
  '.vercel/', 'vercel.', 'src/app/layout.',
];

const FORBIDDEN_EXACT = new Set([
  'AGENTS.md', '.gitignore', 'package.json', 'pnpm-lock.yaml',
  'pnpm-workspace.yaml', 'tsconfig.json', 'next.config.mjs',
  'tailwind.config.js', 'postcss.config.mjs', '.env', '.env.local',
  'src/middleware.ts', 'src/app/layout.tsx',
]);

const sha40 = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const safePath = value => typeof value === 'string' && value.length > 0
  && value.length < 241 && !value.includes('\\')
  && !value.startsWith('/')
  && !value.split('/').some(item => item === '.' || item === '..' || item === '');

export function inspectNonprodAutoMerge({
  repository, pr, control, registry, changedPaths, checks, statusChecks,
  trustedCompletion, liveIntegrationHead, activeProjectPrCount,
}) {
  const reasons = [];
  const deny = reason => reasons.push(reason);
  if (repository !== NONPROD_MERGE_REPOSITORY) deny('WRONG_REPOSITORY');
  if (!pr || pr.state !== 'open' || pr.draft !== false) deny('PR_NOT_READY');
  if (pr?.base?.ref !== NONPROD_MERGE_BASE) deny('PRODUCTION_OR_UNKNOWN_BASE');
  if (pr?.base?.repo?.full_name !== NONPROD_MERGE_REPOSITORY
      || pr?.head?.repo?.full_name !== NONPROD_MERGE_REPOSITORY) deny('FORK_OR_UNKNOWN_REPO');
  if (!sha40(pr?.base?.sha) || !sha40(liveIntegrationHead)
      || pr.base.sha !== liveIntegrationHead) deny('BASE_MOVED');
  if (!sha40(pr?.head?.sha)) deny('HEAD_SHA_INVALID');
  if (pr?.mergeable !== true || pr?.mergeable_state !== 'clean') deny('NOT_CLEANLY_MERGEABLE');

  const project = registry?.projects?.[control?.project];
  if (!project || !Number.isInteger(project.control_issue)) deny('PROJECT_UNREGISTERED');
  if (!control || control.status !== 'APPROVED_FOR_MERGE'
      || control.pm_review !== 'PASS'
      || control.owner_action_required !== false
      || control.auto_production !== false
      || control.production_execution_authorized !== false) deny('PM_OR_HUMAN_GATE');
  if (control?.active_pr !== pr?.number
      || control?.active_branch !== pr?.head?.ref
      || control?.verified_head !== pr?.head?.sha
      || control?.pm_review_head !== pr?.head?.sha
      || control?.pm_review_pr !== pr?.number) deny('CONTROL_HEAD_OR_PR_MISMATCH');
  if (!control?.current_task_id?.startsWith(project?.task_prefix || '__UNREGISTERED__')
      || !pr?.head?.ref?.startsWith(project?.branch_prefix || '__UNREGISTERED__')) {
    deny('TASK_OR_BRANCH_SCOPE');
  }
  if (activeProjectPrCount !== 1) deny('MULTIPLE_OR_UNVERIFIED_ACTIVE_PRS');
  if (!trustedCompletion || trustedCompletion.status !== 'PASS'
      || trustedCompletion.readyForPmReview !== true
      || trustedCompletion.prNumber !== pr?.number
      || trustedCompletion.headSha !== pr?.head?.sha
      || trustedCompletion.project !== control?.project
      || trustedCompletion.taskId !== control?.current_task_id
      || trustedCompletion.author !== 'hongda-agent-control-writer[bot]') {
    deny('UNTRUSTED_COMPLETION_CONTRACT');
  }

  if (!Array.isArray(changedPaths) || changedPaths.length === 0
      || changedPaths.length > 30 || new Set(changedPaths).size !== changedPaths.length) {
    deny('UNVERIFIED_FILE_SET');
  } else {
    const allowed = (project?.owned_prefixes || []);
    for (const path of changedPaths) {
      if (!safePath(path)
          || FORBIDDEN_EXACT.has(path)
          || FORBIDDEN_PREFIXES.some(prefix => path.startsWith(prefix))
          || (registry?.shared_exact_paths || []).includes(path)
          || (registry?.shared_prefixes || []).some(prefix => path.startsWith(prefix))
          || !allowed.some(prefix => path.startsWith(prefix))) {
        deny('FILE_OUTSIDE_SAFE_OWNERSHIP:' + path);
      }
    }
  }

  // All required green statuses MUST be on the live exact HEAD.
  // No CI result from another PR, base SHA, or earlier revision counts.
  for (const name of ['lint-and-audit']) {
    const list = Array.isArray(checks) ? checks.filter(c => c.name === name && c.head_sha === pr?.head?.sha) : [];
    if (list.length !== 1 || list[0].status !== 'completed' || list[0].conclusion !== 'success') {
      deny('REQUIRED_CI_NOT_GREEN:' + name);
    }
  }
  if (!Array.isArray(statusChecks)
      || !statusChecks.some(c => c.context === 'Vercel' && c.state === 'success'
        && c.head_sha === pr?.head?.sha)) deny('VERCEL_PREVIEW_NOT_VERIFIED');

  if (control?.current_phase && /Production\s+(Release|Cutover|Deployment|Readiness\s+Gate)/i.test(control.current_phase)) {
    deny('PRODUCTION_PHASE');
  }
  return { allowed: reasons.length === 0, reasons };
}
