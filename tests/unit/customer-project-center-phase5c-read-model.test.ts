import {
  buildWorkbenchSnapshot,
  getShanghaiBusinessWindow,
} from '../../src/lib/customer-projects/read-models';

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

const CUSTOMER_ID = '00000000-0000-0000-0000-000000000101';
const PROJECT_WAITING = '00000000-0000-0000-0000-000000000201';
const PROJECT_MISSING = '00000000-0000-0000-0000-000000000202';
const PROJECT_NORMAL = '00000000-0000-0000-0000-000000000203';
const PROFILE_ID = '00000000-0000-0000-0000-000000000301';

const now = new Date('2026-10-02T02:00:00.000Z');
const window = getShanghaiBusinessWindow(now);

console.log('\n=== Customer Project Center Phase 5C Read Model ===');

assert(window.businessDate === '2026-10-02', 'Shanghai business date derived correctly');
assert(
  new Date(window.startMs).toISOString() === '2026-10-01T16:00:00.000Z',
  'Shanghai day starts at prior UTC 16:00',
);
assert(
  new Date(window.endMs).toISOString() === '2026-10-02T16:00:00.000Z',
  'Shanghai day ends at UTC 16:00',
);

const projects: any[] = [
  {
    id: PROJECT_WAITING,
    customer_reference_id: CUSTOMER_ID,
    title: '等待客户确认样品',
    project_type: 'transfer_film',
    status: 'active',
    stage: 'customer_confirmation',
    waiting_on: 'customer',
    next_check_at: '2026-10-02T12:00:00.000Z',
    risk_level: null,
    priority: 'high',
    owner_profile_id: PROFILE_ID,
    version: 2,
    updated_at: '2026-10-02T01:00:00.000Z',
  },
  {
    id: PROJECT_MISSING,
    customer_reference_id: CUSTOMER_ID,
    title: '缺少下一步',
    project_type: 'uv',
    status: 'active',
    stage: 'sample_validation',
    waiting_on: 'none',
    next_check_at: null,
    risk_level: 'high',
    priority: 'critical',
    owner_profile_id: PROFILE_ID,
    version: 1,
    updated_at: '2026-10-02T01:00:00.000Z',
  },
  {
    id: PROJECT_NORMAL,
    customer_reference_id: CUSTOMER_ID,
    title: '正常推进项目',
    project_type: 'equipment',
    status: 'active',
    stage: 'quotation_negotiation',
    waiting_on: 'none',
    next_check_at: null,
    risk_level: null,
    priority: 'medium',
    owner_profile_id: PROFILE_ID,
    version: 3,
    updated_at: '2026-10-02T01:00:00.000Z',
  },
];

const workItems: any[] = [
  {
    id: '00000000-0000-0000-0000-000000000401',
    customer_reference_id: CUSTOMER_ID,
    project_id: PROJECT_NORMAL,
    work_item_type: 'CUSTOMER_COMMITMENT',
    title: '今天给客户交付确认',
    assignee_profile_id: PROFILE_ID,
    due_at: '2026-10-02T08:00:00.000Z',
    status: 'pending',
    priority: 'high',
    blocked_reason: null,
    version: 1,
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000402',
    customer_reference_id: CUSTOMER_ID,
    project_id: PROJECT_NORMAL,
    work_item_type: 'MANAGEMENT_DECISION',
    title: '关键管理决策',
    assignee_profile_id: PROFILE_ID,
    due_at: '2026-10-02T10:00:00.000Z',
    status: 'pending',
    priority: 'critical',
    blocked_reason: null,
    version: 1,
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000403',
    customer_reference_id: CUSTOMER_ID,
    project_id: PROJECT_NORMAL,
    work_item_type: 'MANAGEMENT_DECISION',
    title: '普通管理决策',
    assignee_profile_id: PROFILE_ID,
    due_at: '2026-10-02T11:00:00.000Z',
    status: 'pending',
    priority: 'medium',
    blocked_reason: null,
    version: 1,
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000404',
    customer_reference_id: CUSTOMER_ID,
    project_id: PROJECT_NORMAL,
    work_item_type: 'NEXT_ACTION',
    title: '今天推进报价',
    assignee_profile_id: PROFILE_ID,
    due_at: '2026-10-02T14:00:00.000Z',
    status: 'pending',
    priority: 'medium',
    blocked_reason: null,
    version: 1,
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000405',
    customer_reference_id: CUSTOMER_ID,
    project_id: PROJECT_NORMAL,
    work_item_type: 'INTERNAL_COLLABORATION',
    title: '关键技术阻塞',
    assignee_profile_id: PROFILE_ID,
    due_at: null,
    status: 'blocked',
    priority: 'critical',
    blocked_reason: '等待技术判断',
    version: 1,
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000406',
    customer_reference_id: CUSTOMER_ID,
    project_id: null,
    work_item_type: 'FOLLOW_UP',
    title: '老客户回访',
    assignee_profile_id: PROFILE_ID,
    due_at: '2026-10-02T15:00:00.000Z',
    status: 'pending',
    priority: 'low',
    blocked_reason: null,
    version: 1,
    updated_at: '2026-10-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000407',
    customer_reference_id: CUSTOMER_ID,
    project_id: PROJECT_NORMAL,
    work_item_type: 'NEXT_ACTION',
    title: '明天的动作',
    assignee_profile_id: PROFILE_ID,
    due_at: '2026-10-02T17:00:00.000Z',
    status: 'pending',
    priority: 'high',
    blocked_reason: null,
    version: 1,
    updated_at: '2026-10-01T00:00:00.000Z',
  },
];

const snapshot = buildWorkbenchSnapshot({
  now,
  projects,
  workItems,
  customers: [{ id: CUSTOMER_ID, display_name_snapshot: '测试客户' }],
});

const queueReasons = snapshot.queue.map(item => item.reason);
assert(snapshot.businessDate === '2026-10-02', 'snapshot carries business date');
assert(snapshot.queue[0].priorityClass === 'P0', 'queue begins with P0');
assert(
  snapshot.queue.filter(item => item.priorityClass === 'P0').length === 3,
  'P0 contains commitment, critical management decision and critical blocker',
);
assert(
  snapshot.queue.find(item => item.title === '普通管理决策')?.priorityClass === 'P1',
  'non-critical due management decision remains P1',
);
assert(
  queueReasons.includes('waiting_check_due'),
  'due waiting/check becomes P1 queue item',
);
assert(
  queueReasons.includes('missing_next_step'),
  'active Project missing next step becomes P2',
);
assert(
  snapshot.queue.find(item => item.reason === 'relationship_follow_up_due')?.priorityClass === 'P3',
  'due customer-level follow-up becomes P3',
);
assert(
  !snapshot.queue.some(item => item.title === '明天的动作'),
  'future NEXT_ACTION does not enter Today queue',
);
assert(
  snapshot.waiting.length === 1
    && snapshot.waiting[0].projectId === PROJECT_WAITING
    && snapshot.waiting[0].due === true,
  'waiting list preserves one Project waiting state without duplicate WorkItem',
);
assert(
  snapshot.attention.some(item => item.reason === 'blocked_work'),
  'blocked work is visible in attention',
);
assert(
  snapshot.attention.some(item => item.reason === 'high_risk_project'),
  'high risk Project is visible in attention',
);
assert(
  snapshot.attention.some(item => item.reason === 'missing_next_step'),
  'missing next step is visible in attention',
);
assert(
  snapshot.queue.every(item => item.customerDisplayName === '测试客户'),
  'queue hydrates customer display name without ownership inference',
);
assert(
  snapshot.quickProjects.length === 3
    && snapshot.quickProjects[0].projectId === PROJECT_WAITING,
  'quickProjects exposes recent active Projects without changing Today priority',
);
assert(
  snapshot.quickProjects.every(project => project.customerDisplayName === '测试客户'),
  'quickProjects hydrates customer display names',
);
assert(snapshot.summary.p0Count === 3, 'summary P0 count derived');
assert(snapshot.summary.blockedCount === 1, 'summary blocked count derived');
assert(snapshot.summary.waitingCount === 1, 'summary waiting count derived');
assert(snapshot.summary.missingNextStepCount === 1, 'summary missing next step count derived');

console.log('Phase 5C read-model tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
