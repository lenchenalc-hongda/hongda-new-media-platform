import {
  buildWorkbenchSnapshot,
  type WorkbenchCustomerRow,
  type WorkbenchProjectRow,
  type WorkbenchWorkItemRow,
} from '../../src/lib/customer-projects/read-models';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Customer Project Center Phase 6B Deterministic Reminder Read Model ===');

const customers: WorkbenchCustomerRow[] = [
  { id: 'customer-1', display_name_snapshot: '测试客户' },
];

const projects: WorkbenchProjectRow[] = [
  {
    id: 'project-waiting-due',
    customer_reference_id: 'customer-1',
    title: '等待客户确认',
    project_type: 'transfer_film',
    status: 'active',
    stage: 'customer_confirmation',
    waiting_on: 'customer',
    next_check_at: '2026-10-02T01:30:00.000Z',
    risk_level: null,
    priority: 'high',
    owner_profile_id: 'profile-1',
    version: 3,
    updated_at: '2026-10-02T01:00:00.000Z',
  },
  {
    id: 'project-waiting-future',
    customer_reference_id: 'customer-1',
    title: '下午再检查',
    project_type: 'uv',
    status: 'active',
    stage: 'customer_confirmation',
    waiting_on: 'customer',
    next_check_at: '2026-10-02T08:00:00.000Z',
    risk_level: null,
    priority: 'medium',
    owner_profile_id: 'profile-1',
    version: 2,
    updated_at: '2026-10-02T01:00:00.000Z',
  },
  {
    id: 'project-missing',
    customer_reference_id: 'customer-1',
    title: '缺下一步',
    project_type: 'equipment',
    status: 'active',
    stage: 'solution_definition',
    waiting_on: 'none',
    next_check_at: null,
    risk_level: null,
    priority: 'medium',
    owner_profile_id: 'profile-1',
    version: 1,
    updated_at: '2026-10-02T01:00:00.000Z',
  },
];

const workItems: WorkbenchWorkItemRow[] = [
  {
    id: 'commitment-today',
    customer_reference_id: 'customer-1',
    project_id: null,
    work_item_type: 'CUSTOMER_COMMITMENT',
    title: '上午前回复客户交期',
    assignee_profile_id: 'profile-1',
    due_at: '2026-10-02T01:00:00.000Z',
    status: 'pending',
    priority: 'high',
    blocked_reason: null,
    version: 1,
    updated_at: '2026-10-01T01:00:00.000Z',
  },
  {
    id: 'next-overdue',
    customer_reference_id: 'customer-1',
    project_id: null,
    work_item_type: 'NEXT_ACTION',
    title: '昨天应发送报价',
    assignee_profile_id: 'profile-1',
    due_at: '2026-10-01T01:00:00.000Z',
    status: 'pending',
    priority: 'medium',
    blocked_reason: null,
    version: 4,
    updated_at: '2026-10-01T01:00:00.000Z',
  },
  {
    id: 'collab-blocked',
    customer_reference_id: 'customer-1',
    project_id: null,
    work_item_type: 'INTERNAL_COLLABORATION',
    title: '技术确认胶水',
    assignee_profile_id: 'profile-1',
    due_at: '2026-10-02T01:15:00.000Z',
    status: 'blocked',
    priority: 'high',
    blocked_reason: '等待材料信息',
    version: 2,
    updated_at: '2026-10-02T01:00:00.000Z',
  },
  {
    id: 'follow-up-due',
    customer_reference_id: 'customer-1',
    project_id: null,
    work_item_type: 'FOLLOW_UP',
    title: '老客户回访',
    assignee_profile_id: 'profile-1',
    due_at: '2026-10-02T01:20:00.000Z',
    status: 'pending',
    priority: 'low',
    blocked_reason: null,
    version: 1,
    updated_at: '2026-10-01T01:00:00.000Z',
  },
  {
    id: 'future-today',
    customer_reference_id: 'customer-1',
    project_id: null,
    work_item_type: 'NEXT_ACTION',
    title: '今天下午发送样品照片',
    assignee_profile_id: 'profile-1',
    due_at: '2026-10-02T08:00:00.000Z',
    status: 'pending',
    priority: 'medium',
    blocked_reason: null,
    version: 1,
    updated_at: '2026-10-01T01:00:00.000Z',
  },
  {
    id: 'completed-old',
    customer_reference_id: 'customer-1',
    project_id: null,
    work_item_type: 'CUSTOMER_COMMITMENT',
    title: '已完成承诺',
    assignee_profile_id: 'profile-1',
    due_at: '2026-10-01T01:00:00.000Z',
    status: 'completed',
    priority: 'critical',
    blocked_reason: null,
    version: 2,
    updated_at: '2026-10-01T01:00:00.000Z',
  },
];

const snapshot = buildWorkbenchSnapshot({
  now: new Date('2026-10-02T02:00:00.000Z'),
  projects,
  workItems,
  customers,
});

assert(snapshot.summary.formalReminderCount === 5, 'five confirmed due obligations become formal reminders');
assert(snapshot.summary.reminderOverdueCount === 1, 'only prior Shanghai business-day obligation is overdue');
assert(
  snapshot.reminders.some(item =>
    item.sourceId === 'commitment-today'
    && item.priorityClass === 'P0'
    && item.state === 'due_now'),
  'customer commitment due today is P0 due-now reminder',
);
assert(
  snapshot.reminders.some(item =>
    item.sourceId === 'next-overdue'
    && item.priorityClass === 'P1'
    && item.state === 'overdue'),
  'old NEXT_ACTION is P1 overdue reminder',
);
assert(
  snapshot.reminders.some(item =>
    item.sourceId === 'collab-blocked'
    && item.blocked === true
    && item.priorityClass === 'P1'),
  'blocked due collaboration remains formal reminder without deadline waiver',
);
assert(
  snapshot.reminders.some(item =>
    item.sourceId === 'follow-up-due'
    && item.priorityClass === 'P3'),
  'explicit customer-level FOLLOW_UP becomes P3 reminder',
);
assert(
  snapshot.reminders.some(item =>
    item.source === 'waiting_check'
    && item.sourceId === 'project-waiting-due'),
  'due waiting/check is derived reminder from Project state',
);
assert(
  !snapshot.reminders.some(item => item.sourceId === 'future-today'),
  'future-today WorkItem is not prematurely marked formal reminder',
);
assert(
  snapshot.queue.some(item => item.id === 'future-today'),
  'future-today WorkItem may still appear in Today queue under Phase 2 without becoming reminder',
);
assert(
  !snapshot.reminders.some(item => item.sourceId === 'project-waiting-future'),
  'future waiting check is not formal reminder',
);
assert(
  snapshot.queue.some(item => item.id === 'missing-next:project-missing'),
  'missing-next Project remains P2 workflow exception',
);
assert(
  !snapshot.reminders.some(item => item.sourceId === 'project-missing'),
  'P2 missing-next exception is not misrepresented as confirmed formal due reminder',
);
assert(
  !snapshot.reminders.some(item => item.sourceId === 'completed-old'),
  'terminal WorkItem does not remain active reminder',
);
assert(
  new Set(snapshot.reminders.map(item => item.occurrenceKey)).size === snapshot.reminders.length,
  'formal reminder occurrence keys are deduplicated',
);

console.log('Phase 6B reminder tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
