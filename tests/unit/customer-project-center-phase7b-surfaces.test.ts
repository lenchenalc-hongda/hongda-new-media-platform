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

console.log('\n=== Customer Project Center Phase 7B Surface Contract ===');

const server = fs.readFileSync(
  'src/lib/customer-projects/report-narrative-server.ts',
  'utf8',
);
const pure = fs.readFileSync(
  'src/lib/customer-projects/report-narrative.ts',
  'utf8',
);
const narrativeRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/[id]/narrative/route.ts',
  'utf8',
);
const regenerateRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/[id]/narrative/regenerate/route.ts',
  'utf8',
);
const acceptRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/[id]/narrative/accept/route.ts',
  'utf8',
);
const rejectRoute = fs.readFileSync(
  'src/app/api/customer-projects/reports/[id]/narrative/reject/route.ts',
  'utf8',
);
const reportsPage = fs.readFileSync(
  'src/app/customer-projects/reports/page.tsx',
  'utf8',
);

assert(
  pure.includes("REPORT_NARRATIVE_PROPOSAL_TYPE = 'REPORT_NARRATIVE'")
    && server.includes('proposal_type: REPORT_NARRATIVE_PROPOSAL_TYPE'),
  'REPORT_NARRATIVE reuses the existing cpc_ai_drafts proposal source',
);
assert(
  server.includes(".eq('subject_profile_id', profile.id)")
    && server.includes(".eq('created_by_profile_id', profile.id)"),
  'narrative mutations require the report subject and proposal creator identity',
);
assert(
  server.includes('.eq(\'period_type\', \'daily\')')
    && server.includes("if (report.status !== 'draft')"),
  'generation is limited to an existing personal daily report draft',
);
assert(
  server.includes('expectedProposalVersion')
    && server.includes('expectedReportVersion')
    && server.includes(".eq('version', expectedProposalVersion)")
    && server.includes(".eq('version', expectedReportVersion)"),
  'accept verifies both AI Draft and report optimistic versions',
);
assert(
  server.includes(".eq('status', 'draft')")
    && server.includes('acceptedReportVersion'),
  'accept requires both records to remain drafts',
);
const reportUpdateStart = server.lastIndexOf(".from('cpc_reports')");
const reportUpdateEnd = server.indexOf(".select('id,version')", reportUpdateStart);
const reportUpdateBlock =
  reportUpdateStart >= 0 && reportUpdateEnd > reportUpdateStart
    ? server.slice(reportUpdateStart, reportUpdateEnd)
    : '';
assert(
  reportUpdateBlock.includes('narrative: proposal.narrative,')
    && reportUpdateBlock.includes('version: acceptedReportVersion,')
    && !reportUpdateBlock.includes('deterministic_metrics:')
    && !reportUpdateBlock.includes('metrics_schema_version:')
    && !reportUpdateBlock.includes('source_event_seq:')
    && !reportUpdateBlock.includes('source_audit_seq:'),
  'accept writes narrative/version only, never deterministic report facts',
);
assert(
  server.includes("action: expired")
    && server.includes("'REPORT_NARRATIVE_REJECTED'")
    && server.includes("'REPORT_NARRATIVE_EXPIRED'")
    && server.includes('formal_report_changed: false'),
  'reject/expire closes only the AI draft path and records no formal report change',
);
assert(
  server.includes('deterministicMetricsFingerprint')
    && server.includes('source_event_seq: report.sourceEventSeq')
    && server.includes('source_audit_seq: report.sourceAuditSeq')
    && server.includes('report_version: report.version')
    && server.includes('metrics_schema_version: report.metricsSchemaVersion'),
  'structured proposal/audit persists the complete generation basis',
);

const proposalBlockStart = server.indexOf('const proposal: ReportNarrativeProposal = {');
const proposalBlockEnd = server.indexOf('const admin = requireAdminStore();', proposalBlockStart);
const proposalBlock = proposalBlockStart >= 0 && proposalBlockEnd > proposalBlockStart
  ? server.slice(proposalBlockStart, proposalBlockEnd)
  : '';
for (const secret of [
  'API_KEY',
  'apiKey',
  'SERVICE_ROLE',
  'authorization',
  'cookie',
  'token',
]) {
  assert(
    !proposalBlock.includes(secret),
    'structured proposal does not persist unsafe provider secret field: ' + secret,
  );
}
assert(
  server.includes('provider: generated.provider.provider')
    && server.includes('model: generated.provider.model'),
  'proposal persists only safe provider/model identifiers',
);

assert(
  server.includes('不得推断缺失的外部订单、回款、收据、报价或客户归属数据')
    && server.includes('缺失集成或未知数据不得写成 0、没有订单、没有回款、没有工作或等价结论')
    && pure.includes("externalIntegrationPolicy: 'UNKNOWN_NOT_ZERO'"),
  'AI prompt keeps missing external data unknown and never fabricates zero/no-work facts',
);
assert(
  !server.includes('cpc_orders')
    && !server.includes('cpc_payments')
    && !server.includes('cpc_receipts')
    && !server.includes('expected_amount_minor'),
  'narrative generation does not infer missing external finance/order integrations',
);

for (const source of [
  narrativeRoute,
  regenerateRoute,
  acceptRoute,
  rejectRoute,
]) {
  assert(!source.includes('.from('), 'narrative API route has no direct table read/write');
  assert(!source.includes('.rpc('), 'narrative API route has no duplicate RPC mutation');
}
assert(
  narrativeRoute.includes('generateReportNarrative')
    && narrativeRoute.includes('readReportNarrativeState')
    && regenerateRoute.includes('generateReportNarrative')
    && acceptRoute.includes('acceptReportNarrative')
    && rejectRoute.includes('rejectReportNarrative'),
  'narrative APIs delegate all behavior to the server-only controlled service',
);

assert(
  reportsPage.includes('生成 AI 摘要')
    && reportsPage.includes('待确认 AI 摘要（非正式）')
    && reportsPage.includes('接受为正式摘要')
    && reportsPage.includes('拒绝提案')
    && reportsPage.includes('重新生成')
    && reportsPage.includes('摘要依据已过期'),
  'My Reports UI exposes generate/review/accept/reject/stale/regenerate states',
);
assert(
  reportsPage.includes('/narrative/accept')
    && reportsPage.includes('/narrative/reject')
    && reportsPage.includes('/narrative/regenerate'),
  'My Reports UI uses report-scoped server narrative APIs',
);
for (const forbidden of [
  'localStorage',
  'site_data',
  '/api/data',
  '.from(',
  '.rpc(',
]) {
  assert(
    !reportsPage.includes(forbidden),
    'narrative UI avoids direct/legacy mutation path: ' + forbidden,
  );
}
assert(
  reportsPage.includes('接受后只会写入摘要文字，不会改写日报数字或项目事实')
    && reportsPage.includes('旧摘要没有被覆盖'),
  'narrative UI clearly separates non-authoritative AI text from deterministic facts',
);

console.log(
  'Phase 7B surface tests: '
    + passed
    + ' passed, '
    + failed
    + ' failed',
);
if (failed > 0) process.exit(1);
