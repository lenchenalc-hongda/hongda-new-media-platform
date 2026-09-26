import {
  AI_DRAFT_STATUSES,
  BUSINESS_PROFILE_FK_FIELDS,
  CUSTOMER_PROJECT_DOMAIN_ACTIONS,
  CUSTOMER_PROJECT_DOMAIN_RESOURCES,
  PROJECT_EVENT_TYPES,
  PROJECT_TYPES,
  WORK_ITEM_STATUSES,
  canAccessCustomerProjectDomain,
  canTransitionAIDraft,
  canTransitionProject,
  canTransitionWorkItem,
  buildCustomerReferenceIdentityKey,
  getProjectEventCategory,
  isValidBusinessProfileForeignKey,
  isValidExpectedAmountCurrency,
  isValidProjectCollaboration,
  isWorkItemOverdue,
  projectEventCountsAsEffectiveProgress,
  type CustomerProjectDomainAction,
  type CustomerProjectDomainRole,
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

const validCustomerReference = {
  id: CUSTOMER_ID,
  org_id: ORG_ID,
  external_source: 'external_erp',
  external_customer_id: 'C-10001',
  display_name_snapshot: '宏达客户示例',
  external_owner_reference: 'SALES-001',
  source_synced_at: NOW,
  status: 'active',
  created_at: NOW,
  updated_at: NOW,
} as const;

const validProject = {
  id: PROJECT_ID,
  org_id: ORG_ID,
  customer_reference_id: CUSTOMER_ID,
  title: '转印膜年度框架机会',
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
assert(
  projectSchema.safeParse(validProject).success,
  'valid project schema',
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
  customerReferenceSchema.safeParse(validCustomerReference).success,
  'valid customer reference schema',
);
assert(
  !customerReferenceSchema.safeParse({
    ...validCustomerReference,
    status: 'unknown',
  }).success,
  'invalid customer reference status rejected',
);

assert(canTransitionProject('draft', 'active'), 'project draft -> active');
assert(canTransitionProject('active', 'paused'), 'project active -> paused');
assert(canTransitionProject('paused', 'active'), 'project paused -> active');
assert(canTransitionProject('lost', 'active'), 'project lost -> active proposal');
assert(!canTransitionProject('won', 'active'), 'won project is terminal');
assert(!canTransitionProject('cancelled', 'active'), 'cancelled project is terminal');
assert(!canTransitionProject('draft', 'won'), 'draft cannot jump to won');

for (const status of WORK_ITEM_STATUSES) {
  assert(
    canTransitionWorkItem(status, status) === false,
    `work item self transition rejected: ${status}`,
  );
}
assert(canTransitionWorkItem('pending', 'in_progress'), 'work item pending -> in_progress');
assert(canTransitionWorkItem('in_progress', 'blocked'), 'work item in_progress -> blocked');
assert(canTransitionWorkItem('blocked', 'in_progress'), 'work item blocked -> in_progress');
assert(canTransitionWorkItem('in_progress', 'completed'), 'work item in_progress -> completed');
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
    collaborators: [
      { profile_id: OWNER_ID, collaborator_role: 'technical' },
    ],
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
  'customer response is not automatically effective progress',
);
assert(
  projectEventCountsAsEffectiveProgress('EFFECTIVE_PROGRESS_RECORDED'),
  'explicit progress event counts as effective progress',
);
assert(
  projectEventCountsAsEffectiveProgress('STAGE_CHANGED'),
  'stage change counts as effective progress',
);
assert(
  getProjectEventCategory('CONTACT_LOGGED') === 'CONTACT',
  'contact event category',
);
assert(
  getProjectEventCategory('QUOTE_SENT') === 'COMMERCIAL',
  'commercial event category',
);
assert(
  getProjectEventCategory('PROJECT_WON') === 'LIFECYCLE',
  'lifecycle event category',
);

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
  due_at: '2026-09-27T02:00:00.000Z',
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
  isWorkItemOverdue(validWorkItem, '2026-09-28T00:00:00.000Z'),
  'pending work item can be overdue',
);
assert(
  !isWorkItemOverdue(
    { ...validWorkItem, status: 'blocked' },
    '2026-09-28T00:00:00.000Z',
  ),
  'blocked work item is not simply overdue',
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
  metricValueSchema.safeParse({ state: 'unknown', reason: '数据尚未接入' }).success,
  'unknown report metric remains explicit',
);
assert(
  derivedReportSnapshotSchema.safeParse({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    org_id: ORG_ID,
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
    source_event_watermark: NOW,
    source_work_item_watermark: null,
    version: 1,
    supersedes_report_id: null,
    submitted_by_profile_id: null,
    submitted_at: null,
    created_at: NOW,
    updated_at: NOW,
  }).success,
  'derived report snapshot preserves unknown metrics',
);

const keyBase = {
  org_id: ORG_ID,
  external_source: 'external_erp',
  external_customer_id: 'C-10001',
};
assert(
  buildCustomerReferenceIdentityKey(keyBase)
    !== buildCustomerReferenceIdentityKey({ ...keyBase, org_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
  'customer identity key changes with org',
);
assert(
  buildCustomerReferenceIdentityKey(keyBase)
    !== buildCustomerReferenceIdentityKey({ ...keyBase, external_source: 'other' }),
  'customer identity key changes with source',
);
assert(
  buildCustomerReferenceIdentityKey(keyBase)
    !== buildCustomerReferenceIdentityKey({ ...keyBase, external_customer_id: 'C-10002' }),
  'customer identity key changes with external ID',
);

assert(
  isValidExpectedAmountCurrency(1000, 'CNY'),
  'amount and currency pair valid',
);
assert(
  !isValidExpectedAmountCurrency(1000, null),
  'amount without currency invalid',
);
assert(
  !isValidExpectedAmountCurrency(null, 'CNY'),
  'currency without amount invalid',
);
assert(
  !isValidExpectedAmountCurrency(10.5, 'CNY'),
  'amount must use integer minor units',
);

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
  'delete',
  'accept',
  'submit',
  'manage',
];
for (const role of ['operator', 'viewer'] as CustomerProjectDomainRole[]) {
  for (const resource of CUSTOMER_PROJECT_DOMAIN_RESOURCES) {
    for (const action of mutationActions) {
      assert(
        !canAccessCustomerProjectDomain({ role, resource, action }),
        `${role} has no mutation capability: ${resource}/${action}`,
      );
    }
  }
}

assert(
  !canAccessCustomerProjectDomain({
    role: 'unrelated_sales',
    resource: 'project',
    action: 'read',
  }),
  'unrelated sales cannot read project',
);
assert(
  canAccessCustomerProjectDomain({
    role: 'sales_owner',
    resource: 'project',
    action: 'update',
  }),
  'sales owner can update owned project',
);
assert(
  !canAccessCustomerProjectDomain({
    role: 'sales_collaborator',
    resource: 'project',
    action: 'update',
  }),
  'sales collaborator cannot change project core fields',
);
assert(
  canAccessCustomerProjectDomain({
    role: 'sales_collaborator',
    resource: 'work_item',
    action: 'create',
  }),
  'sales collaborator can create work item',
);
assert(
  !canAccessCustomerProjectDomain({
    role: 'manager',
    resource: 'settings',
    action: 'manage',
  }),
  'manager cannot manage settings',
);
assert(
  !canAccessCustomerProjectDomain({
    role: 'manager',
    resource: 'project',
    action: 'delete',
  }),
  'manager cannot delete projects',
);
assert(
  !canAccessCustomerProjectDomain({
    role: 'manager',
    resource: 'project_event',
    action: 'accept',
  }),
  'manager cannot accept an event action',
);
assert(
  canAccessCustomerProjectDomain({
    role: 'admin',
    resource: 'settings',
    action: 'manage',
  }),
  'admin can manage settings',
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
  assert(
    typeof action === 'string',
    `domain action available: ${action}`,
  );
}

console.log(`Customer Project Domain tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
