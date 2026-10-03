import fs from 'node:fs';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Customer Project Center Phase 8 Surface Contract ===');

const page = fs.readFileSync(
  'src/app/customer-projects/reports/page.tsx',
  'utf8',
);
const reviewPage = fs.readFileSync(
  'src/app/customer-projects/reports/review/page.tsx',
  'utf8',
);
const weeklyListRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/weekly/route.ts',
  'utf8',
);
const weeklyGenerateRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/weekly/generate/route.ts',
  'utf8',
);
const weeklyCorrectionRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/weekly/[id]/correction/route.ts',
  'utf8',
);
const weeklyReviewRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/review/weekly/route.ts',
  'utf8',
);
const suggestionRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/weekly/[id]/suggestions/route.ts',
  'utf8',
);
const acceptRoute = fs.readFileSync(
  'src/app/api/customer-projects/ai-drafts/[id]/accept/route.ts',
  'utf8',
);
const weeklyServer = fs.readFileSync(
  'src/lib/customer-projects/weekly-reports-server.ts',
  'utf8',
);
const suggestionServer = fs.readFileSync(
  'src/lib/customer-projects/weekly-report-suggestions-server.ts',
  'utf8',
);
const narrativeServer = fs.readFileSync(
  'src/lib/customer-projects/report-narrative-server.ts',
  'utf8',
);

assert(
  page.includes('日报') && page.includes('周报') && page.includes("switchPeriod('weekly')"),
  'My Reports exposes a clear Daily/Weekly switch',
);
assert(
  page.includes('/reports/weekly/generate')
    && page.includes('/reports/weekly/')
    && page.includes('/correction')
    && page.includes('/suggestions'),
  'My Reports exposes weekly generate/correction/suggestion controls',
);
assert(
  page.includes('缺少日报覆盖时显示未知，不会按 0 处理')
    && page.includes('需要确认的信息与覆盖来源'),
  'weekly UI keeps unknown and coverage semantics visible',
);
assert(
  page.includes('下周工作建议（AI，非正式）')
    && page.includes('接受并创建任务')
    && page.includes('拒绝建议')
    && page.includes('依据周报版本')
    && page.includes('Event cursor')
    && page.includes('Audit cursor'),
  'weekly suggestions are independently reviewable with rationale and provenance',
);
assert(
  !page.includes('周报 · 后续开放'),
  'weekly placeholder is removed',
);
for (const forbidden of [
  'localStorage',
  'site_data',
  '/api/data',
  '.from(',
  '.rpc(',
  'createAdminSupabaseClient',
]) {
  assert(!page.includes(forbidden), 'weekly client avoids direct/legacy path: ' + forbidden);
}

assert(
  weeklyListRoute.includes(".eq('subject_profile_id', profile.id)")
    && weeklyListRoute.includes(".eq('period_type', 'weekly')"),
  'weekly list is personal and period-scoped',
);
assert(
  weeklyGenerateRoute.includes('generateWeeklyReportDraft')
    && weeklyGenerateRoute.includes('expectedVersion')
    && !weeklyGenerateRoute.includes('.from(')
    && !weeklyGenerateRoute.includes('.rpc('),
  'weekly generation delegates to the server-only controlled service',
);
assert(
  weeklyCorrectionRoute.includes('createWeeklyReportCorrection')
    && weeklyCorrectionRoute.includes('expectedVersion')
    && !weeklyCorrectionRoute.includes('.from(')
    && !weeklyCorrectionRoute.includes('.rpc('),
  'weekly correction delegates to the server-only controlled service',
);
assert(
  weeklyServer.includes(".eq('org_id', profile.orgId)")
    && weeklyServer.includes(".eq('subject_profile_id', profile.id)")
    && weeklyServer.includes("period_type: 'weekly'")
    && weeklyServer.includes('expectedVersion'),
  'weekly mutations are personal, org-scoped and optimistic',
);
assert(
  weeklyServer.includes("status: 'draft'")
    && weeklyServer.includes("action: 'WEEKLY_REPORT_CORRECTION_CREATED'")
    && weeklyServer.includes('supersedes_report_id: source.id'),
  'weekly correction creates a new draft revision without updating submitted rows',
);
assert(
  weeklyServer.includes('aggregateWeeklyReport')
    && weeklyServer.includes('coverageThrough'),
  'weekly server only snapshots deterministic aggregation output with explicit coverage',
);

assert(
  suggestionServer.includes(".eq('proposal_type', 'WORK_ITEM')")
    && suggestionServer.includes('weeklyBasis')
    && suggestionServer.includes('deterministic_metrics_fingerprint')
    && suggestionServer.includes('rationale')
    && suggestionServer.includes('candidateId'),
  'weekly suggestions persist report/fact provenance in the existing AI draft contract',
);
assert(
  suggestionServer.includes("session.rpc('cpc_create_ai_work_item_draft'")
    && suggestionServer.includes("proposal_type', 'WORK_ITEM'"),
  'weekly suggestion creation reuses the existing controlled AI work-item source',
);
assert(
  acceptRoute.includes('assertWeeklySuggestionAcceptable')
    && acceptRoute.includes("runCpcMutation(req, params, 'ACCEPT_AI_DRAFT')"),
  'weekly suggestion acceptance keeps the stale guard but delegates to the controlled accept RPC',
);
assert(
  suggestionServer.includes("result.data.created_by_profile_id !== profile.id")
    && suggestionServer.includes("fail(403, 'FORBIDDEN'")
    && suggestionServer.includes('只有员工本人可以处理自己的周报建议'),
  'manager/admin review cannot accept or reject a weekly suggestion on behalf of the employee',
);
assert(
  suggestionRoute.includes('generateWeeklySuggestions')
    && suggestionRoute.includes('listWeeklySuggestions')
    && !suggestionRoute.includes('.from(')
    && !suggestionRoute.includes('.rpc('),
  'suggestion route stays on the server-only service boundary',
);
assert(
  narrativeServer.includes('toDerivedReportListItem')
    && narrativeServer.includes('reportNarrativePromptVersion(report.periodType)')
    && narrativeServer.includes('periodType: report.period_type'),
  'Phase 7 narrative service is extended to weekly without a second narrative source',
);

assert(
  weeklyReviewRoute.includes(".eq('period_type', 'weekly')")
    && weeklyReviewRoute.includes(".eq('status', 'submitted')")
    && weeklyReviewRoute.includes(".eq('org_id', profile.orgId)"),
  'weekly manager review is same-org and submitted-only',
);
for (const mutation of ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(']) {
  assert(
    !weeklyReviewRoute.includes(mutation),
    'weekly review route has no mutation path: ' + mutation,
  );
}
assert(
  !weeklyReviewRoute.includes('createAdminSupabaseClient'),
  'weekly review route does not use a privileged client',
);
assert(
  reviewPage.includes('管理审阅只读')
    && reviewPage.includes('/reports/review/weekly')
    && !reviewPage.includes('接受为正式')
    && !reviewPage.includes('确认并提交'),
  'weekly review UI stays read-only while exposing the Weekly review filter',
);
for (const forbidden of [
  '/submit',
  '/correction',
  '/narrative/accept',
  '/narrative/reject',
  '/suggestions',
  '排名',
  '评分',
  '绩效',
]) {
  assert(
    !reviewPage.includes(forbidden),
    'weekly review UI has no mutation/ranking path: ' + forbidden,
  );
}

console.log(
  'Phase 8 surface tests: '
    + passed
    + ' passed, '
    + failed
    + ' failed',
);
if (failed > 0) process.exit(1);
