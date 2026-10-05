import {
  buildOldCustomerRecommendation,
  buildPhase10SourceCategoryReport,
  countExplicitFollowUpToProjectConversions,
  RELATIONSHIP_CONVERSION_SOURCE_KEY,
  trustedProjectConversionProvenanceFromAudit,
  type ProactiveCustomerRow,
  type ProactiveEventRow,
  type ProactiveProjectRow,
  type ProactiveWorkItemRow,
} from '../../src/lib/customer-projects/old-customer-proactive';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Customer Project Center Phase 10 Proactive Contract ===');

const NOW = new Date('2026-10-04T04:00:00.000Z');
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000101';
const SECOND_CUSTOMER_ID = '00000000-0000-0000-0000-000000000102';
const PROJECT_ID = '00000000-0000-0000-0000-000000000201';

const customer: ProactiveCustomerRow = {
  id: CUSTOMER_ID,
  reference_kind: 'canonical',
  status: 'active',
};

function recommend(input?: {
  customer?: ProactiveCustomerRow;
  projects?: ProactiveProjectRow[];
  workItems?: ProactiveWorkItemRow[];
  events?: ProactiveEventRow[];
}) {
  return buildOldCustomerRecommendation({
    now: NOW,
    customer: input?.customer ?? customer,
    projects: input?.projects ?? [],
    workItems: input?.workItems ?? [],
    events: input?.events ?? [],
  });
}

const aRecommendation = recommend({
  events: [
    {
      id: '00000000-0000-0000-0000-000000000301',
      customer_reference_id: CUSTOMER_ID,
      project_id: PROJECT_ID,
      event_type: 'ORDER_CONFIRMED',
      occurred_at: '2026-09-01T00:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000302',
      customer_reference_id: CUSTOMER_ID,
      project_id: null,
      event_type: 'CONTACT_LOGGED',
      occurred_at: '2026-08-01T00:00:00.000Z',
      payload: { relationship_follow_up: true },
    },
  ],
});
assert(aRecommendation.segment === 'A', 'recent trusted transaction maps to A');
assert(aRecommendation.cadenceDays === 30, 'A cadence is 30 days');
assert(aRecommendation.state === 'due', 'A recommendation uses the latest trusted baseline');
assert(aRecommendation.lastTrustedTransactionAt === '2026-09-01T00:00:00.000Z', 'A exposes trusted transaction time');
assert(aRecommendation.lastConfirmedRelationshipAt === '2026-08-01T00:00:00.000Z', 'A exposes confirmed relationship time');
assert(aRecommendation.overdue === false && aRecommendation.countsAsKpi === false, 'A is not overdue or KPI before acceptance');
assert(aRecommendation.formalWorkItemId === null, 'A does not fabricate a formal WorkItem');
assert(aRecommendation.canArrangeFollowUp === true, 'A can be explicitly accepted');

const bRecommendation = recommend({
  events: [
    {
      id: '00000000-0000-0000-0000-000000000303',
      customer_reference_id: CUSTOMER_ID,
      project_id: PROJECT_ID,
      event_type: 'PROJECT_WON',
      occurred_at: '2025-01-01T00:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000304',
      customer_reference_id: CUSTOMER_ID,
      project_id: null,
      event_type: 'CUSTOMER_RESPONSE_RECEIVED',
      occurred_at: '2026-09-20T00:00:00.000Z',
      payload: { relationship_follow_up: true },
    },
  ],
});
assert(bRecommendation.segment === 'B', 'historical trusted transaction maps to B');
assert(bRecommendation.cadenceDays === 60, 'B cadence is 60 days');
assert(bRecommendation.state === 'not_due', 'B uses latest trusted relationship/transaction baseline');

const cRecommendation = recommend({
  events: [
    {
      id: '00000000-0000-0000-0000-000000000305',
      customer_reference_id: CUSTOMER_ID,
      project_id: null,
      event_type: 'CONTACT_LOGGED',
      occurred_at: '2026-06-01T00:00:00.000Z',
      payload: { relationship_follow_up: true },
    },
  ],
});
assert(cRecommendation.segment === 'C', 'confirmed relationship baseline maps to C');
assert(cRecommendation.cadenceDays === 90, 'C cadence is 90 days');
assert(cRecommendation.state === 'due', 'C becomes due from confirmed relationship baseline only');

const suppressedByProject = recommend({
  projects: [{
    id: PROJECT_ID,
    customer_reference_id: CUSTOMER_ID,
    status: 'active',
  }],
});
assert(
  suppressedByProject.state === 'suppressed_active_project'
    && suppressedByProject.canArrangeFollowUp === false,
  'active Project suppresses proactive recommendation',
);

const suppressedByFollowUp = recommend({
  workItems: [{
    id: '00000000-0000-0000-0000-000000000401',
    customer_reference_id: CUSTOMER_ID,
    project_id: null,
    work_item_type: 'FOLLOW_UP',
    status: 'pending',
  }],
});
assert(
  suppressedByFollowUp.state === 'suppressed_open_follow_up'
    && suppressedByFollowUp.canArrangeFollowUp === false,
  'open customer-level FOLLOW_UP suppresses duplicate recommendation',
);

const missingBaseline = recommend();
assert(
  missingBaseline.state === 'needs_baseline'
    && missingBaseline.segment === 'UNKNOWN'
    && missingBaseline.nextSuggestedFollowUpAt === null,
  'missing customer relationship/transaction evidence stays UNKNOWN and needs a baseline',
);

const provisional = recommend({
  customer: {
    id: CUSTOMER_ID,
    reference_kind: 'provisional',
    status: 'pending_review',
  },
  events: [{
    id: '00000000-0000-0000-0000-000000000306',
    customer_reference_id: CUSTOMER_ID,
    project_id: null,
    event_type: 'CONTACT_LOGGED',
    occurred_at: '2026-06-01T00:00:00.000Z',
    payload: { relationship_follow_up: true },
  }],
});
assert(
  provisional.segment === 'UNKNOWN'
    && provisional.state === 'evidence_unknown',
  'provisional customer is not treated as an old customer',
);

const sourceEvent: ProactiveEventRow = {
  id: '00000000-0000-0000-0000-000000000307',
  customer_reference_id: CUSTOMER_ID,
  project_id: null,
  event_type: 'CONTACT_LOGGED',
  occurred_at: '2026-09-20T00:00:00.000Z',
  payload: { relationship_follow_up: true },
};
const projectConversionEvent: ProactiveEventRow = {
  id: '00000000-0000-0000-0000-000000000308',
  customer_reference_id: CUSTOMER_ID,
  project_id: PROJECT_ID,
  event_type: 'CONTACT_LOGGED',
  occurred_at: '2026-09-21T00:00:00.000Z',
  payload: {},
};
const replyOnlyProjectEvent: ProactiveEventRow = {
  id: '00000000-0000-0000-0000-000000000309',
  customer_reference_id: CUSTOMER_ID,
  project_id: PROJECT_ID,
  event_type: 'CUSTOMER_RESPONSE_RECEIVED',
  occurred_at: '2026-09-22T00:00:00.000Z',
  payload: {},
};
assert(
  countExplicitFollowUpToProjectConversions([
    sourceEvent,
    projectConversionEvent,
    replyOnlyProjectEvent,
  ]) === 0,
  'event payload keys alone cannot forge explicit Project conversion provenance',
);

const trustedProjectConversion = {
  auditId: '00000000-0000-0000-0000-000000000310',
  projectId: PROJECT_ID,
  customerReferenceId: CUSTOMER_ID,
  sourceFollowUpEventId: sourceEvent.id,
  recordedAt: '2026-09-21T00:00:00.000Z',
};
assert(
  countExplicitFollowUpToProjectConversions(
    [sourceEvent, projectConversionEvent, replyOnlyProjectEvent],
    [trustedProjectConversion],
  ) === 1,
  'only trusted server-created Project creation provenance counts as conversion',
);
assert(
  countExplicitFollowUpToProjectConversions(
    [sourceEvent, projectConversionEvent],
    [
      trustedProjectConversion,
      {
        ...trustedProjectConversion,
        auditId: '00000000-0000-0000-0000-000000000313',
      },
    ],
  ) === 1,
  'duplicate Project creation provenance for one follow-up counts once',
);
assert(
  countExplicitFollowUpToProjectConversions([
    { ...sourceEvent, payload: {} },
    projectConversionEvent,
  ], [trustedProjectConversion]) === 0,
  'reply-only or weakly linked source does not count as conversion',
);
assert(
  countExplicitFollowUpToProjectConversions([
    {
      ...sourceEvent,
      payload: {
        [RELATIONSHIP_CONVERSION_SOURCE_KEY]: sourceEvent.id,
      },
    },
    projectConversionEvent,
  ]) === 0,
  'a reserved provenance key in an event payload is never trusted',
);
assert(
  trustedProjectConversionProvenanceFromAudit({
    id: '00000000-0000-0000-0000-000000000311',
    org_id: '00000000-0000-0000-0000-000000000001',
    entity_type: 'PROJECT',
    entity_id: PROJECT_ID,
    action: 'PROJECT_CREATED',
    request_id: sourceEvent.id,
    metadata: { customer_reference_id: CUSTOMER_ID },
    recorded_at: '2026-09-21T00:00:00.000Z',
  })?.sourceFollowUpEventId === sourceEvent.id,
  'Project creation audit rows are mapped to trusted conversion provenance',
);

const unmarkedReply: ProactiveEventRow = {
  id: '00000000-0000-0000-0000-000000000312',
  customer_reference_id: CUSTOMER_ID,
  project_id: null,
  event_type: 'CUSTOMER_RESPONSE_RECEIVED',
  occurred_at: '2026-09-22T00:00:00.000Z',
  payload: {},
};

const sourceReport = buildPhase10SourceCategoryReport({
  recommendations: [
    aRecommendation,
    { ...missingBaseline, customerReferenceId: SECOND_CUSTOMER_ID },
  ],
  workItems: [],
  events: [sourceEvent, projectConversionEvent, unmarkedReply],
  trustedProjectConversions: [trustedProjectConversion],
});
assert(
  sourceReport.new_media_lead.state === 'unknown'
    && sourceReport.proactive_outbound.state === 'unknown',
  'missing new-media and proactive source evidence stays UNKNOWN',
);
assert(
  sourceReport.old_customer_reactivation.state === 'known'
    && sourceReport.old_customer_reactivation.value
      .explicitFollowUpToProjectConversionCount === 1
    && sourceReport.old_customer_reactivation.value
      .confirmedRelationshipFollowUpCount === 1,
  'old-customer reactivation excludes unmarked contact/reply facts',
);

const unmarkedOnlyReport = buildPhase10SourceCategoryReport({
  recommendations: [],
  workItems: [],
  events: [unmarkedReply],
});
assert(
  unmarkedOnlyReport.old_customer_reactivation.state === 'known'
    && unmarkedOnlyReport.old_customer_reactivation.value
      .confirmedRelationshipFollowUpCount === 0,
  'an unmarked contact/reply is never relabeled as old_customer_reactivation',
);

console.log('Phase 10 proactive tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
