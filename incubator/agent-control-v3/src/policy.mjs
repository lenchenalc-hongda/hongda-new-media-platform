export const sha40 = /^[a-f0-9]{40}$/;
const safeScope = /^[A-Za-z0-9_.@/-]+$/;

export function isSafePath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 256 &&
    safeScope.test(path) && !path.startsWith('/') && !path.includes('..') &&
    !path.includes('//') && !path.includes('\\') && !path.endsWith('/.');
}

export function scopesOverlap(a, b) {
  if (!isSafePath(a) || !isSafePath(b)) return true; // untrusted scope is blocking
  if (a === b) return true;
  const aDir = a.endsWith('/');
  const bDir = b.endsWith('/');
  return (aDir && b.startsWith(a)) || (bDir && a.startsWith(b));
}

export function scopeIsAllowed(path, approvedScopes) {
  if (!isSafePath(path) || !Array.isArray(approvedScopes)) return false;
  return approvedScopes.some(scope =>
    isSafePath(scope) && (scope === path || (scope.endsWith('/') && path.startsWith(scope))));
}

export function eligibleToClaim({project, epic, task, approvals = [], now = Date.now()}) {
  if (!project?.enabled || project.dispatchOwner !== 'V3') return 'PROJECT_NOT_ENABLED';
  if (!epic || epic.projectId !== project.id || !epic.approvedBy ||
      !Number.isFinite(epic.approvedUntil) || epic.approvedUntil <= now)
    return 'EPIC_NOT_APPROVED';
  if (!['SANDBOX','LOW'].includes(task?.risk) ||
      !['SANDBOX','LOW'].includes(epic?.risk)) return 'RISK_HUMAN_GATE';
  if (!Array.isArray(task.paths) || !task.paths.length ||
      !Array.isArray(task.checks) || !task.checks.length ||
      !task.paths.every(p => scopeIsAllowed(p,epic.paths))) return 'SCOPE_NOT_APPROVED';
  if (!approvals.some(a => a.epicId === epic.id && a.scope === 'NONPROD_CODE_EXECUTION' &&
     a.approvedBy && Number.isFinite(a.validUntil) && a.validUntil > now))
    return 'EXECUTION_GRANT_MISSING';
  return null;
}

export function selectApprovedSuccessor({projectId, tasks, epics, approvals, now = Date.now()}) {
  const complete = new Set(tasks.filter(t => t.status === 'RELEASE_VERIFIED').map(t => t.id));
  const candidates = tasks.filter(t => t.projectId === projectId && t.status === 'QUEUED' &&
      (t.dependsOn || []).every(dep => complete.has(dep)))
    .filter(t => {
      const project = t.project;
      const epic = epics.find(e => e.id === t.epicId);
      return eligibleToClaim({project,epic,task:t,approvals,now}) === null;
    })
    .sort((a,b) => (a.priority ?? 100) - (b.priority ?? 100) || a.id.localeCompare(b.id));
  return candidates[0] || null;
}

/** Merge remains permanently disabled in P0-P3, even with green CI. */
export function canMerge({policyVersion = 'P0_P3',task,head,ci,review,grant,branchProtected,preview,independentReviewer}) {
  if (policyVersion !== 'P4_AUTHORIZED') return {allowed:false,reason:'P4_NOT_AUTHORIZED'};
  if (!task || !['SANDBOX','LOW'].includes(task.risk)) return {allowed:false,reason:'HIGH_RISK'};
  if (!sha40.test(String(head||'')) || head !== task.headSha)
    return {allowed:false,reason:'HEAD_MISMATCH'};
  if (!branchProtected) return {allowed:false,reason:'UNPROTECTED_BASE'};
  if (!ci?.passed || ci.headSha !== head || !preview?.ready || preview.headSha !== head)
    return {allowed:false,reason:'EVIDENCE_NOT_EXACT_HEAD'};
  if (!review?.passed || review.headSha !== head || !independentReviewer || review.actor === task.writer)
    return {allowed:false,reason:'REVIEW_NOT_INDEPENDENT'};
  if (!grant?.allowAutoMerge || grant?.headSha !== head || !grant?.allowGitConnectedDeployment ||
      grant.expiresAt < Date.now()) return {allowed:false,reason:'MERGE_GRANT_INVALID'};
  return {allowed:true,reason:'ALL_GATES_PASS'};
}
