import {
  aggregateWeeklyReport,
  weeklyPeriodForBusinessDate,
  type WeeklyDailySnapshot,
  type WeeklyReportListItem,
} from '../../src/lib/customer-projects/reports';
import {
  buildReportNarrativeBasis,
  evaluateReportNarrativeStaleness,
} from '../../src/lib/customer-projects/report-narrative';
import {
  buildWeeklySuggestionBasis,
  buildWeeklySuggestionCandidates,
  evaluateWeeklySuggestionStaleness,
  fallbackWeeklySuggestions,
  validateWeeklySuggestionModelOutput,
} from '../../src/lib/customer-projects/weekly-report-suggestions';
import { parseAiWorkItemProposal } from '../../src/lib/customer-projects/ai-drafts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Customer Project Center Phase 8 Weekly Report Contract ===');

assert(
  JSON.stringify(weeklyPeriodForBusinessDate('2026-10-01'))
    === JSON.stringify({
      periodStart: '2026-09-28',
      periodEnd: '2026-10-04',
    }),
  'weekly period is deterministic Monday-Sunday',
);
assert(
  weeklyPeriodForBusinessDate('2026-10-03')?.periodStart === '2026-09-28',
  'Saturday belongs to the same Shanghai business week',
);
assert(
  weeklyPeriodForBusinessDate('not-a-date') === null,
  'invalid weekly period fails closed',
);

function snapshot(
  date: string,
  overrides: Partial<WeeklyDailySnapshot> = {},
): WeeklyDailySnapshot {
  return {
    reportId: '00000000-0000-0000-0000-00000000800' + date.slice(-1),
    periodStart: date,
    status: 'draft',
    revisionNo: 1,
    version: 1,
    deterministicMetrics: {
      meaningfulProgressCount: { state: 'known', value: 1 },
      stageLifecycleWaitingChangeCount: { state: 'known', value: 1 },
      projectCreatedCount: { state: 'known', value: 0 },
      projectWonCount: { state: 'known', value: 0 },
      projectLostCount: { state: 'known', value: 0 },
      nextActionCreatedCount: { state: 'known', value: 1 },
      nextActionCompletedCount: { state: 'known', value: 1 },
      nextActionRescheduledCount: { state: 'known', value: 0 },
      customerCommitmentDueCount: { state: 'known', value: 1 },
      customerCommitmentCompletedCount: { state: 'known', value: 1 },
      customerCommitmentOverdueEndCount: { state: 'known', value: 1 },
      internalCollaborationCompletedCount: { state: 'known', value: 0 },
      managementDecisionCompletedCount: { state: 'known', value: 0 },
      oldCustomerFollowUpCount: { state: 'known', value: 0 },
      quoteSentCount: { state: 'known', value: 0 },
      sampleSentCount: { state: 'known', value: 0 },
      customerCommercialConfirmedCount: { state: 'known', value: 0 },
      orderConfirmedCount: {
        state: 'unknown',
        reason: '外部订单源尚未集成',
      },
    },
    unknowns: [{ type: 'EXTERNAL_ORDER_SOURCE', status: 'not_integrated' }],
    sourceEventSeq: 10,
    sourceAuditSeq: 20,
    ...overrides,
  };
}

const completeDates = [
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
  '2026-10-01',
  '2026-10-02',
];
const complete = aggregateWeeklyReport({
  periodStart: '2026-09-28',
  periodEnd: '2026-10-04',
  coverageThrough: '2026-10-02',
  snapshots: completeDates.map(date => snapshot(date)),
});
assert(
  complete.coverage.complete
    && complete.coverage.expectedDailyCount === 5
    && complete.coverage.coveredDailyCount === 5,
  'coverage is explicit and complete through the requested business date',
);
assert(
  complete.deterministicMetrics.meaningfulProgressCount.state === 'known'
    && complete.deterministicMetrics.meaningfulProgressCount.value === 5,
  'known weekly facts aggregate from authoritative daily snapshots',
);
assert(
  complete.deterministicMetrics.customerCommitmentOverdueEndCount.state === 'known'
    && complete.deterministicMetrics.customerCommitmentOverdueEndCount.value === 1,
  'point-in-time overdue commitments use the week-end maximum rather than a duplicated sum',
);
assert(
  complete.deterministicMetrics.orderConfirmedCount.state === 'unknown'
    && complete.deterministicMetrics.orderConfirmedCount.reason.includes('外部订单源'),
  'unknown source semantics survive weekly aggregation',
);
assert(
  JSON.stringify(complete.unknowns).includes('外部订单、回款、收据或报价权威源尚未集成'),
  'external source coverage is explicit in weekly unknowns',
);

const missing = aggregateWeeklyReport({
  periodStart: '2026-09-28',
  periodEnd: '2026-10-04',
  coverageThrough: '2026-10-02',
  snapshots: completeDates.slice(0, 4).map(date => snapshot(date)),
});
assert(
  !missing.coverage.complete
    && missing.coverage.missingDates.includes('2026-10-02'),
  'missing daily snapshots remain visible instead of silently omitted',
);
assert(
  missing.deterministicMetrics.meaningfulProgressCount.state === 'unknown',
  'missing coverage keeps deterministic metrics unknown rather than zero',
);

const latest = aggregateWeeklyReport({
  periodStart: '2026-09-28',
  periodEnd: '2026-10-04',
  coverageThrough: '2026-09-28',
  snapshots: [
    snapshot('2026-09-28', { revisionNo: 1, version: 1 }),
    snapshot('2026-09-28', {
      reportId: '00000000-0000-0000-0000-00000000899',
      revisionNo: 2,
      version: 1,
      deterministicMetrics: {
        ...snapshot('2026-09-28').deterministicMetrics,
        meaningfulProgressCount: { state: 'known', value: 4 },
      },
    }),
  ],
});
assert(
  latest.deterministicMetrics.meaningfulProgressCount.state === 'known'
    && latest.deterministicMetrics.meaningfulProgressCount.value === 4,
  'weekly aggregation selects the latest daily revision deterministically',
);

const weeklyReport: WeeklyReportListItem = {
  id: '00000000-0000-0000-0000-00000000850',
  periodType: 'weekly',
  periodStart: '2026-09-28',
  periodEnd: '2026-10-04',
  revisionNo: 1,
  status: 'draft',
  metricsSchemaVersion: 1,
  deterministicMetrics: complete.deterministicMetrics,
  narrative: null,
  unknowns: complete.unknowns,
  sourceEventSeq: complete.sourceEventSeq,
  sourceAuditSeq: complete.sourceAuditSeq,
  supersedesReportId: null,
  submittedAt: null,
  version: 3,
  createdAt: '2026-10-03T09:00:00.000Z',
  updatedAt: '2026-10-03T09:05:00.000Z',
};
const narrativeBasis = buildReportNarrativeBasis(weeklyReport);
assert(
  narrativeBasis.periodType === 'weekly'
    && narrativeBasis.deterministicMetricsFingerprint.startsWith('fnv1a32x2:'),
  'weekly narrative binds period type, report version and metric fingerprint',
);
assert(
  evaluateReportNarrativeStaleness(
    {
      schemaVersion: 1,
      action: 'REPORT_NARRATIVE',
      narrative: '本周已完成多项确定性项目推进，外部订单源仍需保持未知。',
      basis: narrativeBasis,
      generationRequest: {
        promptVersion: 'cpc-weekly-report-narrative-v1',
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
    },
    { ...weeklyReport, version: 4 },
    'draft',
  ).includes('REPORT_VERSION_CHANGED'),
  'weekly narrative proposals become stale when the report version changes',
);

const candidate = buildWeeklySuggestionCandidates({
  projects: [
    {
      id: '00000000-0000-0000-0000-00000000860',
      title: '包装膜项目',
      customerReferenceId: '00000000-0000-0000-0000-00000000861',
      waitingOn: 'customer',
      nextCheckAt: '2026-10-02T09:00:00.000Z',
      priority: 'high',
      hasOpenNextAction: true,
    },
  ],
  workItems: [
    {
      id: '00000000-0000-0000-0000-00000000862',
      customerReferenceId: null,
      projectId: '00000000-0000-0000-0000-00000000860',
      workItemType: 'NEXT_ACTION',
      title: '确认样品',
      dueAt: '2026-10-02T09:00:00.000Z',
      status: 'blocked',
      priority: 'high',
      blockedReason: '等待客户反馈',
    },
  ],
  periodEnd: '2026-10-04',
});
assert(candidate.length === 1, 'suggestions only use confirmed waiting/blocked candidates');
assert(
  candidate[0].workItemType === 'FOLLOW_UP'
    && candidate[0].projectId === null
    && candidate[0].customerReferenceId === '00000000-0000-0000-0000-00000000861',
  'suggestion target and work-item type come from the confirmed fact without duplicating an open next action',
);

const modelItems = validateWeeklySuggestionModelOutput({
  suggestions: [
    {
      candidateId: candidate[0].candidateId,
      title: '处理受阻事项并联系客户',
      description: '先确认客户反馈，再恢复下一步任务。',
      rationale: candidate[0].rationale,
      priority: 'high',
    },
    {
      candidateId: 'invented-candidate',
      title: '创建未授权项目',
      description: null,
      rationale: '不得新增事实',
      priority: 'high',
    },
    {
      candidateId: candidate[0].candidateId,
      title: '员工排名第一',
      description: null,
      rationale: '绩效评分',
      priority: 'high',
    },
  ],
}, candidate);
assert(
  modelItems.length === 1 && modelItems[0].candidateId === candidate[0].candidateId,
  'AI output cannot invent candidates or ranking/performance content',
);
assert(
  fallbackWeeklySuggestions(candidate)[0].title.includes('处理受阻事项'),
  'mock provider still creates concrete proposals from confirmed candidates',
);

const suggestionBasis = buildWeeklySuggestionBasis(weeklyReport);
const weeklyWorkItemProposal = parseAiWorkItemProposal({
  schemaVersion: 1,
  action: 'CREATE_WORK_ITEM',
  workItemType: 'NEXT_ACTION',
  title: '处理受阻事项',
  description: '确认客户反馈。',
  dueAt: null,
  priority: 'high',
  weeklyBasis: suggestionBasis,
  rationale: candidate[0].rationale,
  candidateId: candidate[0].candidateId,
});
assert(
  weeklyWorkItemProposal?.weeklyBasis?.reportId === weeklyReport.id
    && weeklyWorkItemProposal?.rationale === candidate[0].rationale,
  'WORK_ITEM proposal persists weekly report and rationale traceability',
);
assert(
  weeklyWorkItemProposal !== null
    && evaluateWeeklySuggestionStaleness(
      weeklyWorkItemProposal,
      { ...weeklyReport, version: 4 },
      'draft',
    ).includes('REPORT_VERSION_CHANGED'),
  'weekly suggestions become stale when their weekly report basis changes',
);

console.log(
  'Phase 8 weekly report tests: '
    + passed
    + ' passed, '
    + failed
    + ' failed',
);
if (failed > 0) process.exit(1);
