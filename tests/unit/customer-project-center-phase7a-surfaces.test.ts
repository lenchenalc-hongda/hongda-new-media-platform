import fs from 'node:fs';
import { mapCpcRpcResult } from '../../src/lib/customer-projects/api';

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

const listRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/route.ts',
  'utf8',
);
const generateRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/daily/generate/route.ts',
  'utf8',
);
const submitRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/[id]/submit/route.ts',
  'utf8',
);
const correctionRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/[id]/correction/route.ts',
  'utf8',
);
const reportsPage = fs.readFileSync(
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
const schemas = fs.readFileSync(
  'src/lib/customer-projects/schemas.ts',
  'utf8',
);
const api = fs.readFileSync(
  'src/lib/customer-projects/api.ts',
  'utf8',
);

assert(
  listRoute.includes(".from('cpc_reports')")
    && listRoute.includes(".eq('subject_profile_id', profile.id)")
    && listRoute.includes(".eq('period_type', 'daily')"),
  'My Reports API explicitly returns only the authenticated subject daily reports',
);
assert(
  listRoute.includes('derivedReportSnapshotSchema.safeParse(row)'),
  'report DB rows are validated before returning DTOs',
);
assert(
  !listRoute.includes('submitted_by_profile_id:')
    && !listRoute.includes('created_by_profile_id:'),
  'report DTO does not expose internal actor ids',
);

assert(
  generateRoute.includes("runCpcMutation(req, {}, 'GENERATE_DAILY_REPORT')"),
  'daily generation route delegates to shared mutation layer',
);
assert(
  submitRoute.includes("runCpcMutation(req, params, 'SUBMIT_REPORT')"),
  'daily submit route delegates to shared mutation layer',
);
assert(
  correctionRoute.includes("runCpcMutation(req, params, 'CREATE_REPORT_CORRECTION')"),
  'daily correction route delegates to shared mutation layer',
);
for (const source of [generateRoute, submitRoute, correctionRoute]) {
  assert(!source.includes('.from('), 'report mutation route has no direct table mutation');
  assert(!source.includes('.rpc('), 'report mutation route has no duplicate RPC mapping');
}

assert(
  api.includes("| 'GENERATE_DAILY_REPORT'")
    && api.includes("| 'SUBMIT_REPORT'")
    && api.includes("| 'CREATE_REPORT_CORRECTION'"),
  'shared CPC mutation command layer includes report workflow',
);
assert(
  api.includes("supabase.rpc('cpc_generate_daily_report_draft'")
    && api.includes("supabase.rpc('cpc_submit_report'")
    && api.includes("supabase.rpc('cpc_create_report_correction'"),
  'report commands map to narrow report RPCs',
);
assert(
  api.includes("REPORT_ALREADY_SUBMITTED: '该日期日报已经提交")
    && api.includes("REPORT_DRAFT_EXISTS: '该周期已有更正草稿"),
  'report immutable/correction conflicts map to controlled messages',
);

const generateMap = mapCpcRpcResult('GENERATE_DAILY_REPORT', {
  data: {
    ok: true,
    code: 'OK',
    message: 'RAW REPORT MESSAGE',
    data: {
      report_id: '00000000-0000-0000-0000-000000000501',
      status: 'draft',
      revision_no: 1,
      version: 2,
      deterministic_metrics: { secret: 123 },
      subject_profile_id: '00000000-0000-0000-0000-000000000502',
    },
  },
  error: null,
});
assert(generateMap.status === 200, 'report generation success maps 200');
assert(
  JSON.stringify(Object.keys((generateMap.body.data as any) ?? {}).sort())
    === '["reportId","revisionNo","status","version"]',
  'report generation mutation response is strict whitelist',
);
assert(
  !JSON.stringify(generateMap.body).includes('deterministic_metrics')
    && !JSON.stringify(generateMap.body).includes('00000000-0000-0000-0000-000000000502'),
  'report generation mutation hides snapshot internals and subject id',
);

const correctionMap = mapCpcRpcResult('CREATE_REPORT_CORRECTION', {
  data: {
    ok: true,
    code: 'OK',
    message: 'RAW CORRECTION MESSAGE',
    data: {
      report_id: '00000000-0000-0000-0000-000000000503',
      status: 'draft',
      revision_no: 2,
      version: 1,
      supersedes_report_id: '00000000-0000-0000-0000-000000000501',
      reason: 'SECRET',
    },
  },
  error: null,
});
assert(correctionMap.status === 200, 'report correction success maps 200');
assert(
  JSON.stringify(Object.keys((correctionMap.body.data as any) ?? {}).sort())
    === '["reportId","revisionNo","status","supersedesReportId","version"]',
  'report correction response is strict whitelist',
);
assert(
  !JSON.stringify(correctionMap.body).includes('SECRET'),
  'report correction response hides raw reason/internal data',
);

assert(
  reportsPage.includes('title="我的报告"')
    && reportsPage.includes('日报数字从已确认业务事实派生')
    && reportsPage.includes('生成今日日报')
    && reportsPage.includes('确认并提交')
    && reportsPage.includes('创建更正版'),
  'My Reports page exposes derive -> confirm -> submit -> correction flow',
);
assert(
  reportsPage.includes('先在项目/任务里修正事实，再刷新草稿')
    && reportsPage.includes('不会让你重新逐项目填写一次'),
  'My Reports instructs source correction rather than duplicate report entry',
);
assert(
  reportsPage.includes('日报')
    && reportsPage.includes('周报')
    && reportsPage.includes("switchPeriod('weekly')"),
  'Phase 8 enables the weekly tab on the existing My Reports surface',
);
assert(
  reportsPage.includes('latestRevisionByPeriod')
    && reportsPage.includes('draftPeriods.has(periodKey)'),
  'correction UI only permits latest submitted revision when no draft exists',
);
assert(
  reportsPage.includes('订单/回款等外部权威数据尚未完成集成时')
    && reportsPage.includes('不会被当成 0')
    && reportsPage.includes('消息数、记录数、点击数和 AI 草稿数也不会作为员工绩效指标'),
  'report UI states missing external SoT and anti-surveillance boundaries',
);
for (const forbidden of ['localStorage', 'site_data', '/api/data', '.from(', '.rpc(']) {
  assert(!reportsPage.includes(forbidden), 'report client avoids direct/legacy path: ' + forbidden);
}
assert(
  !reportsPage.includes('name="deterministicMetrics"')
    && !reportsPage.includes('setDeterministicMetrics'),
  'employees cannot manually edit deterministic report metrics',
);

assert(
  navigation.includes("{ label: '我的报告', path: '/customer-projects/reports', icon: '📝' }")
    && !navigation.includes("{ label: '我的报告', path: '/customer-projects/reports', icon: '📝', disabled: true }"),
  'My Reports navigation is enabled',
);

for (const field of [
  'period_type: DerivedReportPeriod;',
  'revision_no: number;',
  'metrics_schema_version: number;',
  'narrative: string | null;',
  'unknowns: unknown[];',
  'source_event_seq: number | null;',
  'source_audit_seq: number | null;',
  'created_by_profile_id: string;',
]) {
  assert(domain.includes(field), 'DerivedReportSnapshot matches persisted field: ' + field);
}
for (const legacyField of [
  'period: DerivedReportPeriod;',
  'timezone: string;',
  'ai_narrative: string | null;',
  'source_event_cursor: IngestionCursor | null;',
  'source_work_item_cursor: IngestionCursor | null;',
]) {
  assert(!domain.includes(legacyField), 'legacy report persistence assumption removed: ' + legacyField);
}
assert(
  schemas.includes('period_type: z.enum')
    && schemas.includes('revision_no: z.number().int().min(1)')
    && schemas.includes('metrics_schema_version: z.number().int().min(1)')
    && schemas.includes('unknowns: z.array(z.unknown())'),
  'report schema validates approved persisted shape',
);

console.log('Phase 7A report surface tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
