import fs from 'node:fs';
import {
  buildSubmittedDailyReportReviewItems,
  canReviewSubmittedDailyReports,
} from '../../src/lib/customer-projects/report-review';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Customer Project Center Phase 7C Report Review Contract ===');

const ORG_ID = '00000000-0000-0000-0000-000000000801';
const OTHER_ORG_ID = '00000000-0000-0000-0000-000000000802';
const SUBJECT_ID = '00000000-0000-0000-0000-000000000803';
const OTHER_SUBJECT_ID = '00000000-0000-0000-0000-000000000804';
const REPORT_ID = '00000000-0000-0000-0000-000000000805';

const submittedReport = {
  id: REPORT_ID,
  org_id: ORG_ID,
  subject_profile_id: SUBJECT_ID,
  period_type: 'daily',
  period_start: '2026-10-03',
  period_end: '2026-10-03',
  revision_no: 1,
  status: 'submitted',
  metrics_schema_version: 1,
  deterministic_metrics: {
    meaningfulProgressCount: { state: 'known', value: 2 },
    orderConfirmedCount: {
      state: 'unknown',
      reason: '外部订单源尚未集成',
    },
  },
  narrative: '本日完成两项有效推进。',
  unknowns: [{ type: 'EXTERNAL_ORDER_SOURCE', status: 'not_integrated' }],
  source_event_seq: 41,
  source_audit_seq: 73,
  supersedes_report_id: null,
  created_by_profile_id: SUBJECT_ID,
  submitted_by_profile_id: SUBJECT_ID,
  submitted_at: '2026-10-03T10:00:00.000Z',
  version: 4,
  created_at: '2026-10-03T09:00:00.000Z',
  updated_at: '2026-10-03T10:00:00.000Z',
};

const profiles = [
  {
    id: SUBJECT_ID,
    org_id: ORG_ID,
    full_name: '销售小张',
    department: '销售部',
    is_active: true,
  },
  {
    id: OTHER_SUBJECT_ID,
    org_id: OTHER_ORG_ID,
    full_name: '跨组织员工',
    department: null,
    is_active: true,
  },
];

assert(canReviewSubmittedDailyReports('admin'), 'admin can review submitted reports');
assert(canReviewSubmittedDailyReports('manager'), 'manager can review submitted reports');
assert(!canReviewSubmittedDailyReports('sales'), 'sales cannot use manager review');

const items = buildSubmittedDailyReportReviewItems({
  reports: [
    submittedReport,
    { ...submittedReport, id: '00000000-0000-0000-0000-000000000806', status: 'draft', submitted_at: null, submitted_by_profile_id: null },
    { ...submittedReport, id: '00000000-0000-0000-0000-000000000807', period_type: 'weekly' },
    { ...submittedReport, id: '00000000-0000-0000-0000-000000000808', org_id: OTHER_ORG_ID },
    { ...submittedReport, id: '00000000-0000-0000-0000-000000000809', subject_profile_id: OTHER_SUBJECT_ID },
  ],
  profiles,
  orgId: ORG_ID,
});

assert(items.length === 1, 'review model exposes only same-org submitted daily reports');
assert(items[0].id === REPORT_ID, 'same-org submitted report is returned');
assert(items[0].subject.displayName === '销售小张', 'same-org profile identity is hydrated');
assert(
  items[0].deterministicMetrics.orderConfirmedCount.state === 'unknown'
    && items[0].deterministicMetrics.orderConfirmedCount.reason === '外部订单源尚未集成',
  'unknown metric state and reason are preserved',
);
assert(
  items[0].narrative === '本日完成两项有效推进。'
    && items[0].sourceEventSeq === 41
    && items[0].sourceAuditSeq === 73,
  'accepted narrative and provenance cursors are preserved',
);

const route = fs.readFileSync(
  'src/app/api/customer-projects/reports/review/route.ts',
  'utf8',
);
const page = fs.readFileSync(
  'src/app/customer-projects/reports/review/page.tsx',
  'utf8',
);
const migration = fs.readFileSync(
  'supabase/migrations/20261002090000_customer_project_center_phase7a_reports.sql',
  'utf8',
);
const reportsPage = fs.readFileSync(
  'src/app/customer-projects/reports/page.tsx',
  'utf8',
);

assert(
  route.includes('canReviewSubmittedDailyReports(profile.role)')
    && route.includes('return jsonError(\'无权查看日报审阅\', 403)'),
  'manager API rejects employee access server-side',
);
assert(
  route.includes(".eq('org_id', profile.orgId)")
    && route.includes(".eq('period_type', 'daily')")
    && route.includes(".eq('status', 'submitted')"),
  'manager API is same-org, daily, and submitted-only',
);
assert(
  route.includes(".from('profiles')")
    && route.includes(".eq('org_id', profile.orgId)")
    && route.includes(".in('id', subjectProfileIds)"),
  'identity hydration is constrained to the same organization',
);
for (const mutation of ['.insert(', '.update(', '.delete(', '.upsert(', ".rpc("]) {
  assert(!route.includes(mutation), 'manager route has no mutation path: ' + mutation);
}
assert(
  !route.includes('createAdminSupabaseClient'),
  'manager route uses no privileged service-role client',
);

for (const forbidden of [
  'localStorage',
  'site_data',
  '/api/data',
  '.from(',
  '.rpc(',
  '/submit',
  '/correction',
  '/narrative/accept',
  '/narrative/reject',
  '/narrative/regenerate',
  '/daily/generate',
  '排名',
  '评分',
  '绩效',
]) {
  assert(!page.includes(forbidden), 'manager page has no forbidden path or inference: ' + forbidden);
}
assert(
  page.includes("fetch(\n          '/api/customer-projects/reports/review'")
    && page.includes("metric.state === 'known'")
    && page.includes("return { value: '未知', reason: metric.reason }"),
  'manager page reads the controlled API and keeps unknown semantics visible',
);
assert(
  page.includes('只读查看同组织已提交的日报版本')
    && page.includes('员工尚未接受正式摘要')
    && !page.includes('<button'),
  'manager page is read-only and distinguishes accepted narrative',
);
assert(
  reportsPage.includes('/customer-projects/reports/review')
    && reportsPage.includes('canReviewDailyReports'),
  'My Reports exposes manager review only through the role-aware link',
);

assert(
  migration.includes("public.auth_has_role('admin') OR public.auth_has_role('manager')")
    && migration.includes('r.subject_profile_id = v_actor_profile_id')
    && migration.includes('GRANT SELECT ON TABLE public.cpc_reports TO authenticated'),
  'Phase 7A RLS already authorizes same-org management read and personal sales read',
);
assert(
  migration.includes('trg_cpc_reports_submitted_immutable')
    && migration.includes('submitted CPC report snapshots are immutable'),
  'submitted report immutability remains migration-enforced',
);

console.log(
  'Phase 7C report review tests: '
    + passed
    + ' passed, '
    + failed
    + ' failed',
);
if (failed > 0) process.exit(1);
