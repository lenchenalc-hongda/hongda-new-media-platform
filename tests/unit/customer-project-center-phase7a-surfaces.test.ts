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

console.log('\n=== Customer Project Center Phase 7A Report Surface Contract ===');

const api = fs.readFileSync('src/lib/customer-projects/api.ts', 'utf8');
const dailyRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/daily/route.ts',
  'utf8',
);
const submitRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/[id]/submit/route.ts',
  'utf8',
);
const page = fs.readFileSync(
  'src/app/customer-projects/reports/page.tsx',
  'utf8',
);
const navigation = fs.readFileSync(
  'src/lib/constants/navigation.ts',
  'utf8',
);
const domain = fs.readFileSync(
  'src/lib/customer-projects/domain.ts',
  'utf8',
);

assert(
  api.includes("| 'REFRESH_DAILY_REPORT'")
    && api.includes("| 'SUBMIT_REPORT'"),
  'shared mutation API includes report commands',
);
assert(
  api.includes("supabase.rpc('cpc_refresh_daily_report_draft'")
    && api.includes("supabase.rpc('cpc_submit_report'"),
  'report commands map to narrow RPCs',
);
assert(
  !api.includes('p_deterministic_metrics: body'),
  'client metrics are never forwarded to persistence RPC',
);
assert(
  api.includes("INVALID_REPORT_PERIOD: 'Phase 7A 只允许生成或刷新当天日报'"),
  'historical refresh is surfaced as a controlled policy error',
);

assert(
  dailyRoute.includes(".from('cpc_reports')")
    && dailyRoute.includes(".eq('subject_profile_id', profile.id)")
    && dailyRoute.includes(".eq('period_type', 'daily')"),
  'daily report GET reads own daily report snapshots only',
);
assert(
  dailyRoute.includes("if (date === today)")
    && dailyRoute.includes("supabase.rpc('cpc_get_daily_report_metrics'"),
  'live deterministic metrics are requested only for the current business date',
);
assert(
  dailyRoute.includes("runCpcMutation(req, {}, 'REFRESH_DAILY_REPORT')"),
  'daily report POST delegates to controlled refresh mutation',
);
assert(
  submitRoute.includes("runCpcMutation(req, params, 'SUBMIT_REPORT')")
    && !submitRoute.includes('.from(')
    && !submitRoute.includes('.rpc('),
  'submit route delegates only to shared mutation layer',
);

assert(
  page.includes('title="我的报告"')
    && page.includes('日报由已确认业务事实自动生成'),
  'My Reports page is explicitly derived from confirmed facts',
);
assert(
  page.includes("历史日期只读取已保存快照，不用当前状态重新计算"),
  'historical reports are snapshot-only in Phase 7A',
);
assert(
  page.includes('数字来自已确认 CPC 事实')
    && page.includes('消息数、点击数、AI 草稿数量不会作为绩效分数'),
  'report UI prevents raw activity metrics from becoming employee performance scoring',
);
assert(
  page.includes('确认提交')
    && page.includes('提交后快照不可原地覆盖'),
  'employee explicitly confirms report and immutable history is communicated',
);
assert(
  page.includes('Phase 7A 先保留可选摘要字段；数字不可手工改'),
  'narrative is optional while deterministic numbers stay non-editable',
);
assert(
  !page.includes('localStorage')
    && !page.includes('site_data')
    && !page.includes('/api/data')
    && !page.includes('.from(')
    && !page.includes('.rpc('),
  'report client avoids legacy/direct persistence paths',
);

assert(
  navigation.includes("{ label: '我的报告', path: '/customer-projects/reports', icon: '📝' }")
    && !navigation.includes("{ label: '我的报告', path: '/customer-projects/reports', icon: '📝', disabled: true }"),
  'My Reports navigation is enabled',
);

assert(
  domain.includes('period_type: DerivedReportPeriod;')
    && domain.includes('revision_no: number;')
    && domain.includes('metrics_schema_version: number;')
    && domain.includes('narrative: string | null;')
    && domain.includes('unknowns: unknown[];')
    && domain.includes('source_event_seq: number | null;')
    && domain.includes('source_audit_seq: number | null;')
    && !domain.includes('ai_narrative: string | null;'),
  'report domain interface matches approved Phase 4 persistence schema',
);

console.log('Phase 7A surface tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
