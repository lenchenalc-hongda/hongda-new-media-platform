import {
  buildCustomerList,
  type CustomerEventRow,
  type CustomerFollowUpRow,
  type CustomerProjectRow,
  type CustomerReferenceRow,
} from '../../src/lib/customer-projects/customer-read-models';

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

console.log('\n=== Customer Project Center Phase 5F Customer Read Model ===');

const actorProfileId = 'profile-me';
const customer: CustomerReferenceRow = {
  id: 'customer-1',
  reference_kind: 'canonical',
  display_name_snapshot: '测试老客户',
  status: 'active',
  external_source: 'workshop',
  external_customer_id: 'C100',
  external_owner_reference: 'E100',
  provisional_source_reference: null,
  updated_at: '2026-10-02T01:00:00.000Z',
};

const projects: CustomerProjectRow[] = [
  {
    id: 'project-active',
    customer_reference_id: customer.id,
    title: '新花膜机会',
    project_type: 'transfer_film',
    status: 'active',
    stage: 'quotation',
    waiting_on: 'none',
    next_check_at: null,
    risk_level: null,
    priority: 'high',
    updated_at: '2026-10-02T02:00:00.000Z',
  },
  {
    id: 'project-won',
    customer_reference_id: customer.id,
    title: '历史项目',
    project_type: 'uv',
    status: 'won',
    stage: 'delivery',
    waiting_on: 'none',
    next_check_at: null,
    risk_level: null,
    priority: 'medium',
    updated_at: '2026-09-01T02:00:00.000Z',
  },
];

const followUps: CustomerFollowUpRow[] = [
  {
    id: 'follow-other',
    customer_reference_id: customer.id,
    project_id: null,
    work_item_type: 'FOLLOW_UP',
    title: '其他同事回访',
    assignee_profile_id: 'profile-other',
    due_at: '2026-10-02T06:00:00.000Z',
    status: 'pending',
    priority: 'medium',
    blocked_reason: null,
    version: 1,
    updated_at: '2026-10-01T02:00:00.000Z',
  },
  {
    id: 'follow-mine',
    customer_reference_id: customer.id,
    project_id: null,
    work_item_type: 'FOLLOW_UP',
    title: '我今天确认新品计划',
    assignee_profile_id: actorProfileId,
    due_at: '2026-10-02T14:00:00.000Z',
    status: 'pending',
    priority: 'high',
    blocked_reason: null,
    version: 2,
    updated_at: '2026-10-01T03:00:00.000Z',
  },
];

const events: CustomerEventRow[] = [
  {
    id: 'event-old',
    customer_reference_id: customer.id,
    project_id: null,
    event_type: 'CONTACT_LOGGED',
    occurred_at: '2026-09-20T02:00:00.000Z',
    raw_input: '上次联系',
  },
  {
    id: 'event-new',
    customer_reference_id: customer.id,
    project_id: null,
    event_type: 'CUSTOMER_RESPONSE_RECEIVED',
    occurred_at: '2026-10-01T03:00:00.000Z',
    raw_input: '客户预计十一月有新品项目',
  },
];

const [item] = buildCustomerList({
  now: new Date('2026-10-02T02:00:00.000Z'),
  actorProfileId,
  customers: [customer],
  projects,
  followUps,
  events,
});

assert(item.displayName === '测试老客户', 'customer display snapshot preserved');
assert(item.sourceLabel === 'workshop', 'canonical external source shown as reference');
assert(item.externalOwnerReference === 'E100', 'external owner is display reference only');
assert(item.activeProjectCount === 1, 'active Project count is derived');
assert(item.hasActiveProject === true, 'active Project flag derived');
assert(
  item.nextFollowUp?.id === 'follow-mine',
  'assigned-to-me follow-up is preferred over another visible follow-up',
);
assert(item.nextFollowUp?.isAssignedToMe === true, 'assignment relation is explicit');
assert(
  item.nextFollowUp?.dueByBusinessEnd === true,
  'assigned follow-up due within Shanghai business day is marked due',
);
assert(item.lastInteraction?.id === 'event-new', 'latest customer-level event selected');
assert(
  item.lastInteraction?.summary === '客户预计十一月有新品项目',
  'latest confirmed relationship summary preserved',
);

const provisional: CustomerReferenceRow = {
  ...customer,
  id: 'customer-2',
  reference_kind: 'provisional',
  external_source: null,
  external_customer_id: null,
  external_owner_reference: null,
  provisional_source_reference: 'WhatsApp-2026-10-02',
  display_name_snapshot: '临时客户',
  status: 'pending_review',
};
const [provisionalItem] = buildCustomerList({
  now: new Date('2026-10-02T02:00:00.000Z'),
  actorProfileId,
  customers: [provisional],
  projects: [],
  followUps: [],
  events: [],
});
assert(
  provisionalItem.sourceLabel === 'WhatsApp-2026-10-02',
  'provisional source is shown without pretending to be external canonical identity',
);
assert(provisionalItem.externalOwnerReference === null, 'provisional customer has no fake owner');
assert(provisionalItem.nextFollowUp === null, 'no follow-up cadence is invented');
assert(provisionalItem.activeProjectCount === 0, 'no Project is invented');

console.log('Phase 5F customer read-model tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
