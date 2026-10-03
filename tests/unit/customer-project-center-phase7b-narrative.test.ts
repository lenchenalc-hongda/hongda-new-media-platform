import {
  REPORT_NARRATIVE_PROMPT_VERSION,
  REPORT_NARRATIVE_SCHEMA_VERSION,
  buildReportNarrativeBasis,
  buildReportNarrativePromptInput,
  computeReportNarrativeBasisFingerprint,
  evaluateReportNarrativeStaleness,
  parseReportNarrativeProposal,
  validateReportNarrativeText,
  type ReportNarrativeProposal,
} from '../../src/lib/customer-projects/report-narrative';
import type { DailyReportListItem } from '../../src/lib/customer-projects/reports';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Customer Project Center Phase 7B Narrative Contract ===');

function report(
  overrides: Partial<DailyReportListItem> = {},
): DailyReportListItem {
  return {
    id: '00000000-0000-0000-0000-000000000701',
    periodType: 'daily',
    periodStart: '2026-10-03',
    periodEnd: '2026-10-03',
    revisionNo: 1,
    status: 'draft',
    metricsSchemaVersion: 1,
    deterministicMetrics: {
      meaningfulProgressCount: { state: 'known', value: 2 },
      quoteSentCount: { state: 'known', value: 1 },
      orderConfirmedCount: { state: 'unknown', reason: '外部订单源尚未集成' },
    },
    narrative: null,
    unknowns: [{ type: 'EXTERNAL_ORDER_SOURCE', status: 'not_integrated' }],
    sourceEventSeq: 41,
    sourceAuditSeq: 73,
    supersedesReportId: null,
    submittedAt: null,
    version: 3,
    createdAt: '2026-10-03T09:00:00.000Z',
    updatedAt: '2026-10-03T09:05:00.000Z',
    ...overrides,
  };
}

const currentReport = report();
const basis = buildReportNarrativeBasis(currentReport);
assert(
  basis.reportId === currentReport.id
    && basis.reportVersion === currentReport.version
    && basis.sourceEventSeq === 41
    && basis.sourceAuditSeq === 73
    && basis.metricsSchemaVersion === 1,
  'generation basis binds report id/version and source cursors',
);
assert(
  basis.deterministicMetricsFingerprint.startsWith('fnv1a32x2:'),
  'generation basis includes deterministic metrics fingerprint',
);
assert(
  computeReportNarrativeBasisFingerprint({
    periodType: 'daily',
    periodStart: currentReport.periodStart,
    periodEnd: currentReport.periodEnd,
    revisionNo: currentReport.revisionNo,
    metricsSchemaVersion: currentReport.metricsSchemaVersion,
    deterministicMetrics: currentReport.deterministicMetrics,
    unknowns: currentReport.unknowns,
    sourceEventSeq: currentReport.sourceEventSeq,
    sourceAuditSeq: currentReport.sourceAuditSeq,
  }) === basis.deterministicMetricsFingerprint,
  'fingerprint is deterministic for identical report basis',
);

const proposal: ReportNarrativeProposal = {
  schemaVersion: REPORT_NARRATIVE_SCHEMA_VERSION,
  action: 'REPORT_NARRATIVE',
  narrative: '本日完成了 CPC 有效推进和报价发送。',
  basis,
  generationRequest: {
    promptVersion: REPORT_NARRATIVE_PROMPT_VERSION,
    requestedAt: '2026-10-03T09:10:00.000Z',
    factSource: 'DETERMINISTIC_REPORT_SNAPSHOT',
    externalIntegrationPolicy: 'UNKNOWN_NOT_ZERO',
  },
  provider: {
    provider: 'mock',
    model: 'mock',
    generatedAt: '2026-10-03T09:10:01.000Z',
  },
  acceptance: null,
};

assert(
  parseReportNarrativeProposal(proposal) !== null,
  'valid REPORT_NARRATIVE proposal parses',
);
assert(
  parseReportNarrativeProposal({ ...proposal, action: 'WORK_ITEM' }) === null,
  'wrong proposal action fails closed',
);
assert(
  parseReportNarrativeProposal({
    ...proposal,
    provider: { ...proposal.provider, apiKey: 'must-not-be-accepted' },
  }) !== null,
  'extra provider fields are ignored rather than exposed by the parser',
);

assert(
  evaluateReportNarrativeStaleness(proposal, currentReport, 'draft').length === 0,
  'proposal is current for the exact report basis',
);
assert(
  evaluateReportNarrativeStaleness(
    proposal,
    report({ version: 4 }),
    'draft',
  ).includes('REPORT_VERSION_CHANGED'),
  'report version change marks proposal stale',
);
assert(
  evaluateReportNarrativeStaleness(
    proposal,
    report({
      deterministicMetrics: {
        ...currentReport.deterministicMetrics,
        meaningfulProgressCount: { state: 'known', value: 3 },
      },
    }),
    'draft',
  ).includes('REPORT_BASIS_FINGERPRINT_CHANGED'),
  'metric change marks proposal stale',
);
assert(
  evaluateReportNarrativeStaleness(
    proposal,
    report({ sourceEventSeq: 42 }),
    'draft',
  ).includes('SOURCE_EVENT_CURSOR_CHANGED'),
  'event cursor change marks proposal stale',
);
assert(
  evaluateReportNarrativeStaleness(
    proposal,
    report({
      status: 'submitted',
      submittedAt: '2026-10-03T10:00:00.000Z',
    }),
    'draft',
  ).includes('REPORT_NOT_DRAFT'),
  'pending proposal cannot be accepted after report submission',
);

const accepted: ReportNarrativeProposal = {
  ...proposal,
  narrative: '本日完成了 CPC 有效推进和报价发送，仍需员工确认。',
  acceptance: {
    acceptedReportVersion: 4,
    acceptedAt: '2026-10-03T09:20:00.000Z',
  },
};
assert(
  evaluateReportNarrativeStaleness(
    accepted,
    report({
      narrative: accepted.narrative,
      version: 4,
    }),
    'accepted',
  ).length === 0,
  'accepted narrative remains current at its accepted report version',
);
assert(
  evaluateReportNarrativeStaleness(
    accepted,
    report({
      narrative: accepted.narrative,
      version: 5,
    }),
    'accepted',
  ).includes('REPORT_VERSION_CHANGED'),
  'accepted narrative becomes stale after a later report refresh',
);

const promptInput = buildReportNarrativePromptInput(currentReport);
assert(
  promptInput.period.start === '2026-10-03'
    && promptInput.provenance.sourceEventSeq === 41
    && promptInput.deterministicFacts.length > 0
    && promptInput.unknowns.some(value => value.includes('EXTERNAL_ORDER_SOURCE')),
  'AI input is limited to period, provenance, deterministic facts and unknowns',
);
assert(
  !JSON.stringify(promptInput).includes('customer_reference_id')
    && !JSON.stringify(promptInput).includes('owner_profile_id')
    && !JSON.stringify(promptInput).includes('expected_amount'),
  'AI input excludes ownership, owner and amount source-of-truth fields',
);

assert(
  validateReportNarrativeText('本日完成两项 CPC 有效推进，并记录一次报价发送。') !== null,
  'concise factual Chinese narrative is accepted',
);
for (const forbidden of [
  '员工排名第一，绩效评分很高。',
  'AI摘要显示今天没有订单，也没有回款。',
  '消息数和点击率可以作为绩效证据。',
]) {
  assert(
    validateReportNarrativeText(forbidden) === null,
    'unsafe narrative output fails closed: ' + forbidden,
  );
}

console.log(
  'Phase 7B narrative tests: '
    + passed
    + ' passed, '
    + failed
    + ' failed',
);
if (failed > 0) process.exit(1);
