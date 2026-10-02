import {
  AI_DRAFT_STATUSES,
  BUSINESS_PROFILE_FK_FIELDS,
  CUSTOMER_PROJECT_DOMAIN_ACTIONS,
  CUSTOMER_PROJECT_DOMAIN_RESOURCES,
  PROJECT_EVENT_TYPES,
  PROJECT_LIFECYCLE_STATUSES,
  PROJECT_TYPES,
  REPORT_METRIC_SEMANTICS,
  WORK_ITEM_STATUSES,
  buildCanonicalCustomerReferenceIdentityKey,
  canAccessCustomerProjectDomain,
  canMarkProjectWon,
  canMutateCustomerReference,
  canTransitionAIDraft,
  canTransitionProject,
  canTransitionWorkItem,
  getProjectEventCategory,
  isValidBusinessProfileForeignKey,
  isValidExpectedAmountCurrency,
  isValidProjectCollaboration,
  isWorkItemOverdue,
  projectEventCountsAsEffectiveProgress,
  projectEventCountsAsMeaningfulChange,
  type CustomerProjectAppRole,
  type CustomerProjectDomainAction,
  type CustomerProjectResourceRelation,
  type ProjectEventType,
} from '../../src/lib/customer-projects/domain';
import {
  aiDraftSchema,
  customerReferenceSchema,
  derivedReportSnapshotSchema,
  metricValueSchema,
  projectEventSchema,
  projectSchema,
  workItemSchema,
} from '../../src/lib/customer-projects/schemas';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ID = '44444444-4444-4444-8444-444444444444';
const MEMBER_ID = '55555555-5555-4555-8555-555555555555';
const ACTOR_ID = '66666666-6666-4666-8666-666666666666';
const NOW = '2026-09-26T03:00:00.000Z';
const PAST = '2026-09-25T03:00:00.000Z';
const FUTURE = '2026-09-27T03:00:00.000Z';

const canonicalCustomerReference = {
  id: CUSTOMER_ID,
  org_id: ORG_ID,
  reference_kind: 'canonical',
  external_source: 'external_erp',
  external_customer_id: 'C-10001',
  display_name_snapshot: '宏达客户示例',
  external_owner_reference: 'SALES-001',
  source_synced_at: NOW,
  status: 'active',
  created_at: NOW,
  updated_at: NOW,
} as const;

const provisionalCustomerReference = {
  id: 'abababab-abab-4bab-8bab-abababababab',
  org_id: ORG_ID,
  reference_kind: 'provisional',
  provisional_source_reference: 'lead_draft:LD-001',
  display_name_snapshot: '待映射新客户',
  status: 'pending_review',
  mapped_canonical_reference_id: null,
  created_by_profile_id: OWNER_ID,
  created_at: NOW,
  updated_at: NOW,
} as const;

const validProject = {
  id: PROJECT_ID,
  org_id: ORG_ID,
  customer_reference_id: CUSTOMER_ID,
  title: '转印膜年度框架机会',
  objective_summary: '客户需要年度转印膜供货并确认样品颜色标准',
  project_type: 'transfer_film',
  owner_profile_id: OWNER_ID,
  status: 'active',
  stage: 'qualification',
  waiting_on: 'customer',
  next_action_summary: '确认样品颜色标准',
  next_check_at: '2026-09-28T02:00:00.000Z',
  risk_level: 'medium',
  priority: 'high',
  expected_amount_minor: 1000000,
  currency: 'CNY',
  expected_close_date: '2026-10-31',
  version: 1,
  created_by_profile_id: OWNER_ID,
  created_at: NOW,
  updated_at: NOW,
} as const;

console.log('\n=== Customer Project Domain ===');

for (const projectType of PROJECT_TYPES) {
  assert(
    projectSchema.safeParse({ ...validProject, project_type: projectType }).success,
    `project type accepted: ${projectType}`,
  );
}
assert(
  !projectSchema.safeParse({ ...validProject, project_type: 'unknown' }).success,
  'unknown project type rejected',
);
assert(projectSchema.safeParse(validProject).success, 'valid active project schema');
assert(
  !projectSchema.safeParse({ ...validProject, stage: null }).success,
  'persisted project requires a valid stage',
);
assert(
  !PROJECT_LIFECYCLE_STATUSES.includes('draft' as never),
  'persisted project draft state is not in lifecycle',
);
assert(
  projectSchema.safeParse({
    ...validProject,
    status: 'paused',
    next_check_at: FUTURE,
  }).success,
  'paused project with next check accepted',
);
assert(
  !projectSchema.safeParse({
    ...validProject,
    status: 'paused',
    next_check_at: null,
  }).success,
  'paused project requires next check',
);
assert(
  !projectSchema.safeParse({
    ...validProject,
    expected_amount_minor: 1000,
    currency: null,
  }).success,
  'project amount requires currency',
);
assert(
  !projectSchema.safeParse({
    ...validProject,
    expected_amount_minor: null,
    currency: 'CNY',
  }).success,
  'project currency requires amount',
);

assert(
  customerReferenceSchema.safeParse(canonicalCustomerReference).success,
  'valid canonical customer reference',
);
assert(
  customerReferenceSchema.safeParse(provisionalCustomerReference).success,
  'valid provisional customer reference',
);
assert(
  !customerReferenceSchema.safeParse({
    ...provisionalCustomerReference,
    status: 'mapped',
    mapped_canonical_reference_id: null,
  }).success,
  'mapped provisional reference requires canonical mapping id',
);
assert(
  customerReferenceSchema.safeParse({
    ...provisionalCustomerReference,
    status: 'mapped',
    mapped_canonical_reference_id: CUSTOMER_ID,
  }).success,
  'mapped provisional reference with canonical id accepted',
);
assert(
  !customerReferenceSchema.safeParse({
    ...provisionalCustomerReference,
    external_customer_id: 'FAKE-001',
  }).success,
  'provisional reference rejects canonical ID pretending to be valid',
);
assert(
  !customerReferenceSchema.safeParse({
    ...canonicalCustomerReference,
    reference_kind: 'canonical',
    external_customer_id: null,
  }).success,
  'canonical reference requires external customer ID',
);
assert(
  canMarkProjectWon(canonicalCustomerReference),
  'canonical customer reference can support won',
);
assert(
  !canMarkProjectWon(provisionalCustomerReference),
  'provisional customer reference cannot support won',
);

assert(canTransitionProject('active', 'paused'), 'project active -> paused');
assert(canTransitionProject('paused', 'active'), 'project paused -> active');
assert(canTransitionProject('lost', 'active'), 'project lost -> active approved');
assert(!canTransitionProject('won', 'active'), 'won project is terminal');
assert(!canTransitionProject('cancelled', 'active'), 'cancelled project is terminal');

for (const status of WORK_ITEM_STATUSES) {
  assert(
    canTransitionWorkItem(status, status) === false,
    `work item self transition rejected: ${status}`,
  );
}
assert(canTransitionWorkItem('pending', 'in_progress'), 'pending -> in_progress');
assert(canTransitionWorkItem('pending', 'completed'), 'pending -> completed quick action');
assert(canTransitionWorkItem('pending', 'blocked'), 'pending -> blocked quick action');
assert(canTransitionWorkItem('pending', 'cancelled'), 'pending -> cancelled');
assert(canTransitionWorkItem('in_progress', 'blocked'), 'in_progress -> blocked');
assert(canTransitionWorkItem('in_progress', 'completed'), 'in_progress -> completed');
assert(canTransitionWorkItem('blocked', 'in_progress'), 'blocked -> in_progress');
assert(canTransitionWorkItem('blocked', 'completed'), 'blocked -> completed');
assert(!canTransitionWorkItem('completed', 'in_progress'), 'completed work item terminal');
assert(!canTransitionWorkItem('cancelled', 'pending'), 'cancelled work item terminal');

for (const status of AI_DRAFT_STATUSES) {
  assert(
    canTransitionAIDraft(status, status) === false,
    `AI draft self transition rejected: ${status}`,
  );
}
assert(canTransitionAIDraft('draft', 'accepted'), 'AI draft -> accepted');
assert(canTransitionAIDraft('draft', 'rejected'), 'AI draft -> rejected');
assert(canTransitionAIDraft('draft', 'expired'), 'AI draft -> expired');
assert(!canTransitionAIDraft('accepted', 'rejected'), 'accepted AI draft terminal');

assert(
  isValidProjectCollaboration({
    ownerProfileId: OWNER_ID,
    collaborators: [
      { profile_id: MEMBER_ID, collaborator_role: 'technical' },
      { profile_id: ACTOR_ID, collaborator_role: 'quality' },
    ],
  }),
  'one owner plus multiple collaborators',
);
assert(
  !isValidProjectCollaboration({
    ownerProfileId: OWNER_ID,
    collaborators: [{ profile_id: OWNER_ID, collaborator_role: 'technical' }],
  }),
  'owner cannot also be collaborator',
);
assert(
  !isValidProjectCollaboration({
    ownerProfileId: OWNER_ID,
    collaborators: [
      { profile_id: MEMBER_ID, collaborator_role: 'technical' },
      { profile_id: MEMBER_ID, collaborator_role: 'support' },
    ],
  }),
  'duplicate collaborators rejected',
);

assert(
  !projectEventCountsAsEffectiveProgress('CONTACT_LOGGED'),
  'ordinary contact is not effective progress',
);
assert(
  !projectEventCountsAsEffectiveProgress('CUSTOMER_RESPONSE_RECEIVED'),
  'generic customer response is not effective progress',
);
assert(
  projectEventCountsAsEffectiveProgress('EFFECTIVE_PROGRESS_RECORDED'),
  'explicit progress event counts as effective progress',
);
assert(
  !projectEventCountsAsEffectiveProgress('STAGE_CHANGED'),
  'stage change alone is not effective progress',
);
assert(
  !projectEventCountsAsEffectiveProgress('PROJECT_LOST'),
  'lost is not effective progress',
);
assert(
  !projectEventCountsAsEffectiveProgress('PROJECT_PAUSED'),
  'paused is not effective progress',
);
assert(
  projectEventCountsAsMeaningfulChange('STAGE_CHANGED'),
  'stage change is a meaningful change',
);
assert(
  projectEventCountsAsMeaningfulChange('PROJECT_LOST'),
  'lost is a meaningful lifecycle change',
);
assert(
  projectEventCountsAsMeaningfulChange('PROJECT_PAUSED'),
  'paused is a meaningful lifecycle change',
);
assert(
  projectEventCountsAsMeaningfulChange('WAITING_STARTED'),
  'waiting change is meaningful',
);
assert(
  !projectEventCountsAsMeaningfulChange('CONTACT_LOGGED'),
  'ordinary contact is not a meaningful change',
);
assert(
  !projectEventCountsAsMeaningfulChange('CUSTOMER_RESPONSE_RECEIVED'),
  'generic response is not a meaningful change',
);

assert(getProjectEventCategory('CONTACT_LOGGED') === 'CONTACT', 'contact category');
assert(getProjectEventCategory('QUOTE_SENT') === 'COMMERCIAL', 'commercial category');
assert(
  !projectEventSchema.safeParse({
    ...validEvent,
    event_type: 'QUOTE_SENT',
    event_category: 'COMMERCIAL',
    payload: {},
  }).success,
  'quote sent requires evidence reference',
);
assert(
  projectEventSchema.safeParse({
    ...validEvent,
    event_type: 'QUOTE_SENT',
    event_category: 'COMMERCIAL',
    payload: { evidence_reference: 'WeCom quotation file Q-2026-001' },
  }).success,
  'quote sent with evidence reference accepted',
);
assert(
  !projectEventSchema.safeParse({
    ...validEvent,
    event_type: 'ORDER_CONFIRMED',
    event_category: 'COMMERCIAL',
    payload: {},
  }).success,
  'order confirmed requires explicit evidence reference',
);
assert(
  projectEventSchema.safeParse({
    ...validEvent,
    event_type: 'ORDER_CONFIRMED',
    event_category: 'COMMERCIAL',
    payload: { evidence_reference: 'Customer PO / confirmation message' },
  }).success,
  'order confirmed with evidence reference accepted',
);
assert(getProjectEventCategory('COMMERCIAL_CONFIRMED') === 'COMMERCIAL', 'equipment commercial confirmation category');
assert(getProjectEventCategory('ORDER_CONFIRMED') === 'COMMERCIAL', 'order confirmed category');
assert(getProjectEventCategory('PROJECT_WON') === 'LIFECYCLE', 'lifecycle category');
assert(getProjectEventCategory('PROJECT_CANCELLED') === 'LIFECYCLE', 'project cancelled category');
assert(projectEventCountsAsEffectiveProgress('ORDER_CONFIRMED'), 'confirmed order counts as effective progress');
assert(projectEventCountsAsMeaningfulChange('PROJECT_CANCELLED'), 'cancelled project is meaningful change');

const validEvent = {
  id: '77777777-7777-4777-8777-777777777777',
  org_id: ORG_ID,
  customer_reference_id: CUSTOMER_ID,
  project_id: PROJECT_ID,
  event_type: 'EFFECTIVE_PROGRESS_RECORDED',
  event_category: 'PROGRESS',
  occurred_at: NOW,
  recorded_at: NOW,
  actor_profile_id: ACTOR_ID,
  source: 'user',
  source_reference_id: null,
  raw_input: '客户确认进入样品验证',
  payload_schema_version: 1,
  payload: { progress_kind: 'sample_validation' },
  correction_of_event_id: null,
} as const;
assert(projectEventSchema.safeParse(validEvent).success, 'valid progress event schema');
assert(
  !projectEventSchema.safeParse({
    ...validEvent,
    event_category: 'CONTACT',
  }).success,
  'event category must match event type',
);
assert(
  !projectEventSchema.safeParse({
    ...validEvent,
    customer_reference_id: null,
    project_id: null,
  }).success,
  'event requires customer or project reference',
);
assert(
  !projectEventSchema.safeParse({
    ...validEvent,
    source: 'user',
    actor_profile_id: null,
  }).success,
  'user event requires human actor',
);
assert(
  projectEventSchema.safeParse({
    ...validEvent,
    source: 'integration',
    actor_profile_id: null,
    source_reference_id: 'erp:event:1001',
  }).success,
  'integration event can use nullable actor with source reference',
);
assert(
  !projectEventSchema.safeParse({
    ...validEvent,
    source: 'integration',
    actor_profile_id: null,
    source_reference_id: null,
  }).success,
  'integration event requires source reference',
);
assert(
  projectEventSchema.safeParse({
    ...validEvent,
    source: 'system',
    actor_profile_id: null,
    source_reference_id: null,
  }).success,
  'system event does not require fake human actor',
);
assert(
  projectEventSchema.safeParse({
    ...validEvent,
    source: 'accepted_ai_draft',
    actor_profile_id: ACTOR_ID,
    source_reference_id: 'ai-draft:abc',
  }).success,
  'accepted AI event requires human actor and source reference',
);
assert(
  !projectEventSchema.safeParse({
    ...validEvent,
    source: 'accepted_ai_draft',
    actor_profile_id: ACTOR_ID,
    source_reference_id: null,
  }).success,
  'accepted AI event requires source reference',
);
assert(
  !projectEventSchema.safeParse({
    ...validEvent,
    event_type: 'PROJECT_PAUSED',
    event_category: 'LIFECYCLE',
    payload: {},
  }).success,
  'project pause requires pause reason',
);
assert(
  projectEventSchema.safeParse({
    ...validEvent,
    event_type: 'PROJECT_PAUSED',
    event_category: 'LIFECYCLE',
    payload: { pause_reason: '等待客户预算确认' },
  }).success,
  'project pause with reason accepted',
);
assert(
  !projectEventSchema.safeParse({
    ...validEvent,
    event_type: 'PROJECT_REOPENED',
    event_category: 'LIFECYCLE',
    payload: {},
  }).success,
  'project reopen requires reopen reason',
);

const validWorkItem = {
  id: '88888888-8888-4888-8888-888888888888',
  org_id: ORG_ID,
  customer_reference_id: CUSTOMER_ID,
  project_id: PROJECT_ID,
  work_item_type: 'NEXT_ACTION',
  title: '跟进客户确认',
  description: null,
  assignee_profile_id: OWNER_ID,
  created_by_profile_id: OWNER_ID,
  due_at: PAST,
  status: 'pending',
  priority: 'high',
  blocked_reason: null,
  completed_at: null,
  completed_by_profile_id: null,
  cancelled_at: null,
  cancelled_by_profile_id: null,
  version: 1,
  created_at: NOW,
  updated_at: NOW,
} as const;
assert(workItemSchema.safeParse(validWorkItem).success, 'valid work item schema');
assert(
  !workItemSchema.safeParse({
    ...validWorkItem,
    status: 'blocked',
    blocked_reason: null,
  }).success,
  'blocked work item requires reason',
);
assert(
  workItemSchema.safeParse({
    ...validWorkItem,
    status: 'blocked',
    blocked_reason: '等待客户确认',
  }).success,
  'blocked work item with reason accepted',
);
assert(
  !workItemSchema.safeParse({
    ...validWorkItem,
    status: 'completed',
  }).success,
  'completed work item requires completion metadata',
);
assert(
  isWorkItemOverdue(validWorkItem, NOW),
  'pending past-due work item is overdue',
);
assert(
  isWorkItemOverdue({ ...validWorkItem, status: 'blocked' }, NOW),
  'blocked past-due work item is overdue',
);
assert(
  !isWorkItemOverdue({ ...validWorkItem, status: 'blocked', due_at: FUTURE }, NOW),
  'blocked future work item is not overdue',
);
assert(
  !isWorkItemOverdue({
    ...validWorkItem,
    status: 'completed',
  }, NOW),
  'completed work item is not overdue',
);
assert(
  !isWorkItemOverdue({
    ...validWorkItem,
    status: 'cancelled',
  }, NOW),
  'cancelled work item is not overdue',
);

const validAIDraft = {
  id: '99999999-9999-4999-8999-999999999999',
  org_id: ORG_ID,
  raw_input: '客户说下周一给最终答复',
  structured_proposal: { type: 'NEXT_ACTION' },
  proposal_type: 'WORK_ITEM',
  customer_reference_id: CUSTOMER_ID,
  project_id: PROJECT_ID,
  confidence: 0.82,
  status: 'draft',
  accepted_by_profile_id: null,
  accepted_at: null,
  rejected_by_profile_id: null,
  rejected_at: null,
  source_model: 'mock-model',
  source_run_id: 'run-1',
  created_at: NOW,
  updated_at: NOW,
} as const;
assert(aiDraftSchema.safeParse(validAIDraft).success, 'valid AI draft schema');
assert(
  !aiDraftSchema.safeParse({
    ...validAIDraft,
    status: 'accepted',
  }).success,
  'accepted AI draft requires acceptance metadata',
);
assert(
  aiDraftSchema.safeParse({
    ...validAIDraft,
    status: 'accepted',
    accepted_by_profile_id: OWNER_ID,
    accepted_at: NOW,
  }).success,
  'accepted AI draft with metadata accepted',
);
assert(
  !aiDraftSchema.safeParse({
    ...validAIDraft,
    status: 'accepted',
    accepted_by_profile_id: OWNER_ID,
    accepted_at: NOW,
    rejected_by_profile_id: OWNER_ID,
    rejected_at: NOW,
  }).success,
  'accepted AI draft rejects rejection metadata',
);
assert(
  !aiDraftSchema.safeParse({
    ...validAIDraft,
    status: 'draft',
    accepted_by_profile_id: OWNER_ID,
    accepted_at: NOW,
  }).success,
  'draft AI cannot carry acceptance metadata',
);
assert(
  !aiDraftSchema.safeParse({
    ...validAIDraft,
    status: 'rejected',
    rejected_by_profile_id: OWNER_ID,
    rejected_at: NOW,
    accepted_by_profile_id: OWNER_ID,
    accepted_at: NOW,
  }).success,
  'rejected AI draft rejects acceptance metadata',
);

assert(
  metricValueSchema.safeParse({ state: 'unknown', reason: '数据尚未接入' }).success,
  'unknown report metric remains explicit',
);
const validDraftReport = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  org_id: ORG_ID,
  subject_profile_id: OWNER_ID,
  period: 'daily',
  period_start: '2026-09-26',
  period_end: '2026-09-26',
  timezone: 'Asia/Shanghai',
  status: 'draft',
  deterministic_metrics: {
    effective_progress_events: { state: 'known', value: 2 },
    unresolved_work_items: { state: 'unknown', reason: 'WorkItem 尚未接入' },
  },
  ai_narrative: null,
  source_event_cursor: {
    cursor_kind: 'recorded_at_id',
    recorded_at: NOW,
    record_id: validEvent.id,
  },
  source_work_item_cursor: {
    cursor_kind: 'monotonic_sequence',
    sequence: 42,
  },
  version: 1,
  supersedes_report_id: null,
  submitted_by_profile_id: null,
  submitted_at: null,
  created_at: NOW,
  updated_at: NOW,
} as const;
assert(
  derivedReportSnapshotSchema.safeParse(validDraftReport).success,
  'draft report with explicit ingestion cursors',
);
assert(
  !derivedReportSnapshotSchema.safeParse({
    ...validDraftReport,
    submitted_by_profile_id: OWNER_ID,
    submitted_at: NOW,
  }).success,
  'draft report cannot carry submission metadata',
);
assert(
  !derivedReportSnapshotSchema.safeParse({
    ...validDraftReport,
    status: 'submitted',
  }).success,
  'submitted report requires submission metadata',
);
assert(
  derivedReportSnapshotSchema.safeParse({
    ...validDraftReport,
    status: 'submitted',
    submitted_by_profile_id: OWNER_ID,
    submitted_at: NOW,
  }).success,
  'submitted report with metadata accepted',
);
assert(
  !derivedReportSnapshotSchema.safeParse({
    ...validDraftReport,
    status: 'superseded',
  }).success,
  'superseded status removed in favor of immutable submitted snapshots',
);
assert(
  derivedReportSnapshotSchema.safeParse({
    ...validDraftReport,
    supersedes_report_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  }).success,
  'correction draft can point to an earlier report',
);
assert(
  REPORT_METRIC_SEMANTICS.actionCountIsNotUniqueCustomerCount
  && REPORT_METRIC_SEMANTICS.actionCountIsNotUniqueProjectCount,
  'action counts are not unique entity counts',
);
assert(
  REPORT_METRIC_SEMANTICS.quoteCountIsNotConfirmedOrderCount
  && REPORT_METRIC_SEMANTICS.expectedAmountIsNotConfirmedOrderOrPayment,
  'commercial signals are not confirmed order/payment facts',
);
assert(
  REPORT_METRIC_SEMANTICS.mixedCurrenciesRequireApprovedFxPolicy
  && REPORT_METRIC_SEMANTICS.missingDataIsUnknownNotZeroOrNoWork,
  'currency and missing-data safety semantics',
);

const keyBase = {
  org_id: ORG_ID,
  external_source: 'external_erp',
  external_customer_id: 'C-10001',
};
assert(
  buildCanonicalCustomerReferenceIdentityKey(keyBase)
    !== buildCanonicalCustomerReferenceIdentityKey({
      ...keyBase,
      org_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }),
  'customer identity key changes with org',
);
assert(
  buildCanonicalCustomerReferenceIdentityKey(keyBase)
    !== buildCanonicalCustomerReferenceIdentityKey({ ...keyBase, external_source: 'other' }),
  'customer identity key changes with source',
);
assert(
  buildCanonicalCustomerReferenceIdentityKey(keyBase)
    !== buildCanonicalCustomerReferenceIdentityKey({
      ...keyBase,
      external_customer_id: 'C-10002',
    }),
  'customer identity key changes with external ID',
);

assert(isValidExpectedAmountCurrency(1000, 'CNY'), 'amount and currency pair valid');
assert(!isValidExpectedAmountCurrency(1000, null), 'amount without currency invalid');
assert(!isValidExpectedAmountCurrency(null, 'CNY'), 'currency without amount invalid');
assert(!isValidExpectedAmountCurrency(10.5, 'CNY'), 'amount uses integer minor units');

for (const fieldName of BUSINESS_PROFILE_FK_FIELDS) {
  assert(
    isValidBusinessProfileForeignKey(fieldName),
    `business profile FK naming: ${fieldName}`,
  );
}
assert(
  !isValidBusinessProfileForeignKey('auth_user_id'),
  'auth.users identity naming rejected for business FK',
);

const mutationActions: CustomerProjectDomainAction[] = [
  'create',
  'update',
  'accept',
  'reject',
  'expire',
  'submit',
  'manage',
];
for (const appRole of ['operator', 'viewer'] as CustomerProjectAppRole[]) {
  for (const resource of CUSTOMER_PROJECT_DOMAIN_RESOURCES) {
    for (const action of mutationActions) {
      assert(
        !canAccessCustomerProjectDomain({
          appRole,
          sameOrg: true,
          relations: ['none'],
          resource,
          action,
        }),
        `${appRole} has no mutation capability: ${resource}/${action}`,
      );
    }
  }
}

const relations = (values: CustomerProjectResourceRelation[]) => values;

assert(
  !canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['unrelated']),
    resource: 'project',
    action: 'read',
  }),
  'unrelated sales cannot read project',
);
assert(
  canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'admin',
    relations: relations(['unrelated']),
    resource: 'project',
    action: 'read',
  }),
  'admin same-org unrelated relation does not block org-scoped access',
);
assert(
  canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'manager',
    relations: relations(['unrelated']),
    resource: 'project',
    action: 'read',
  }),
  'manager same-org unrelated relation does not block org-scoped access',
);
assert(
  canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['none']),
    resource: 'project',
    action: 'create',
  }),
  'sales can create a self-owned project opportunity',
);
assert(
  canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['owner']),
    resource: 'project',
    action: 'update',
  }),
  'sales owner can update owned project',
);
assert(
  !canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['collaborator']),
    resource: 'project',
    action: 'update',
  }),
  'sales collaborator cannot change project core fields',
);
assert(
  canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['collaborator']),
    resource: 'work_item',
    action: 'create',
  }),
  'sales collaborator can create work item',
);
assert(
  canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['assignee']),
    resource: 'work_item',
    action: 'update',
  }),
  'sales assignee can update work item',
);
assert(
  !canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['collaborator']),
    resource: 'ai_draft',
    action: 'accept',
  }),
  'sales collaborator cannot accept AI draft',
);
assert(
  canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['owner']),
    resource: 'ai_draft',
    action: 'accept',
  }),
  'sales owner can accept AI draft',
);
assert(
  !canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'admin',
    relations: relations(['none']),
    resource: 'project_event',
    action: 'update',
  }),
  'admin cannot mutate append-only ProjectEvent',
);
assert(
  !canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'admin',
    relations: relations(['none']),
    resource: 'report',
    action: 'update',
  }),
  'admin cannot mutate submitted report in place',
);
assert(
  canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'admin',
    relations: relations(['none']),
    resource: 'settings',
    action: 'manage',
  }),
  'admin can manage settings',
);
assert(
  !canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'manager',
    relations: relations(['none']),
    resource: 'settings',
    action: 'manage',
  }),
  'manager cannot manage settings',
);
assert(
  !canAccessCustomerProjectDomain({
    appRole: 'admin',
    sameOrg: false,
    relations: relations(['none']),
    resource: 'project',
    action: 'read',
  }),
  'admin cross-org access denied',
);
assert(
  !canAccessCustomerProjectDomain({
    appRole: 'manager',
    sameOrg: false,
    relations: relations(['none']),
    resource: 'project',
    action: 'read',
  }),
  'manager cross-org access denied',
);
assert(
  !canAccessCustomerProjectDomain({
    appRole: 'sales',
    sameOrg: false,
    relations: relations(['owner']),
    resource: 'project',
    action: 'update',
  }),
  'sales owner cross-org access denied',
);
assert(
  canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['none']),
    resource: 'customer_reference',
    action: 'create',
    customerReferenceKind: 'provisional',
  }),
  'sales can create provisional customer reference',
);
assert(
  !canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['none']),
    resource: 'customer_reference',
    action: 'create',
    customerReferenceKind: 'canonical',
  }),
  'sales cannot create canonical customer mapping',
);
assert(
  !canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['creator']),
    resource: 'customer_reference',
    action: 'update',
    customerReferenceKind: 'canonical',
  }),
  'sales cannot update canonical customer mapping',
);
assert(
  canMutateCustomerReference({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['creator']),
    intent: 'update_provisional_details',
  }),
  'sales creator can update provisional customer reference',
);
assert(
  !canMutateCustomerReference({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['creator']),
    intent: 'map_to_canonical',
  }),
  'sales cannot self-map provisional customer reference to canonical',
);
assert(
  canMutateCustomerReference({
    sameOrg: true,
    appRole: 'manager',
    relations: relations(['none']),
    intent: 'map_to_canonical',
  }),
  'manager can perform audited canonical mapping',
);
assert(
  !canMutateCustomerReference({
    sameOrg: false,
    appRole: 'admin',
    relations: relations(['none']),
    intent: 'map_to_canonical',
  }),
  'cross-org canonical mapping denied',
);
assert(
  canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['subject']),
    resource: 'report',
    action: 'update',
    reportStatus: 'draft',
  }),
  'sales report subject can update draft report',
);
assert(
  !canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['subject']),
    resource: 'report',
    action: 'update',
    reportStatus: 'submitted',
  }),
  'sales report subject cannot update submitted report',
);
assert(
  !canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'sales',
    relations: relations(['collaborator']),
    resource: 'report',
    action: 'submit',
    reportStatus: 'draft',
  }),
  'project collaborator cannot submit another employee report',
);
assert(
  canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'manager',
    relations: relations(['none']),
    resource: 'report',
    action: 'update',
    reportStatus: 'draft',
  }),
  'manager can correct draft report',
);
assert(
  !canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'manager',
    relations: relations(['none']),
    resource: 'report',
    action: 'update',
    reportStatus: 'submitted',
  }),
  'manager cannot update submitted report',
);
assert(
  !canAccessCustomerProjectDomain({
    sameOrg: true,
    appRole: 'admin',
    relations: relations(['none']),
    resource: 'report',
    action: 'update',
    reportStatus: 'submitted',
  }),
  'admin cannot update submitted report',
);

for (const eventType of PROJECT_EVENT_TYPES) {
  const category = getProjectEventCategory(eventType);
  assert(
    category === 'CONTACT'
      || category === 'PROGRESS'
      || category === 'WAIT'
      || category === 'COMMERCIAL'
      || category === 'LIFECYCLE',
    `event category resolved: ${eventType as ProjectEventType}`,
  );
}

for (const action of CUSTOMER_PROJECT_DOMAIN_ACTIONS) {
  assert(typeof action === 'string', `domain action available: ${action}`);
}

console.log(`Customer Project Domain tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
