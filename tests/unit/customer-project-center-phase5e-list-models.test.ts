import {
  buildProjectList,
  buildTaskList,
  type ListCustomerRow,
  type ListProjectRow,
  type ListWorkItemRow,
} from '../../src/lib/customer-projects/list-read-models';

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

console.log('\n=== Customer Project Center Phase 5E List Read Models ===');

const customer: ListCustomerRow = {
  id: 'customer-1',
  display_name_snapshot: '测试客户',
};

const projects: ListProjectRow[] = [
  {
    id: 'project-active',
    customer_reference_id: customer.id,
    title: '正常推进',
    project_type: 'transfer_film',
    status: 'active',
    stage: 'quotation',
    waiting_on: 'none',
    next_check_at: null,
    risk_level: null,
    priority: 'high',
    owner_profile_id: 'profile-1',
    version: 2,
    updated_at: '2026-10-02T03:00:00.000Z',
  },
  {
    id: 'project-waiting',
    customer_reference_id: customer.id,
    title: '等待客户',
    project_type: 'uv',
    status: 'active',
    stage: 'customer_confirmation',
    waiting_on: 'customer',
    next_check_at: '2026-10-03T02:00:00.000Z',
    risk_level: 'medium',
    priority: 'medium',
    owner_profile_id: 'profile-1',
    version: 3,
    updated_at: '2026-10-02T02:00:00.000Z',
  },
  {
    id: 'project-missing',
    customer_reference_id: customer.id,
    title: '缺下一步',
    project_type: 'equipment',
    status: 'active',
    stage: 'solution_definition',
    waiting_on: 'none',
    next_check_at: null,
    risk_level: 'high',
    priority: 'critical',
    owner_profile_id: 'profile-2',
    version: 1,
    updated_at: '2026-10-02T01:00:00.000Z',
  },
];

const workItems: ListWorkItemRow[] = [
  {
    id: 'next-1',
    customer_reference_id: customer.id,
    project_id: 'project-active',
    work_item_type: 'NEXT_ACTION',
    title: '发送正式报价',
    due_at: '2026-10-03T02:00:00.000Z',
    status: 'pending',
    priority: 'high',
    blocked_reason: null,
    version: 1,
    updated_at: '2026-10-02T03:00:00.000Z',
  },
  {
    id: 'collab-1',
    customer_reference_id: customer.id,
    project_id: 'project-active',
    work_item_type: 'INTERNAL_COLLABORATION',
    title: '技术确认',
    due_at: null,
    status: 'blocked',
    priority: 'critical',
    blocked_reason: '等待技术评估',
    version: 2,
    updated_at: '2026-10-02T03:10:00.000Z',
  },
  {
    id: 'follow-1',
    customer_reference_id: customer.id,
    project_id: null,
    work_item_type: 'FOLLOW_UP',
    title: '老客户回访',
    due_at: '2026-10-04T02:00:00.000Z',
    status: 'pending',
    priority: 'low',
    blocked_reason: null,
    version: 1,
    updated_at: '2026-10-02T01:00:00.000Z',
  },
];

const projectList = buildProjectList({
  projects,
  workItems,
  customers: [customer],
});

const active = projectList.find(project => project.id === 'project-active');
const waiting = projectList.find(project => project.id === 'project-waiting');
const missing = projectList.find(project => project.id === 'project-missing');

assert(active?.customerDisplayName === '测试客户', 'Project list hydrates customer name');
assert(active?.nextAction?.id === 'next-1', 'Project list resolves open NEXT_ACTION');
assert(active?.blocked === true, 'Project list surfaces project blocker');
assert(active?.needsAction === false, 'Project with NEXT_ACTION is not missing next step');
assert(waiting?.needsAction === false, 'Project with waiting/check is not missing next step');
assert(missing?.needsAction === true, 'active Project without next action/check is flagged');
assert(missing?.riskLevel === 'high', 'risk state preserved for Project filters');

const taskList = buildTaskList({
  workItems,
  projects,
  customers: [customer],
});

const projectTask = taskList.find(task => task.id === 'next-1');
const customerTask = taskList.find(task => task.id === 'follow-1');

assert(projectTask?.project?.id === 'project-active', 'Task list hydrates Project context');
assert(projectTask?.project?.waitingOn === 'none', 'Task list carries Project waiting state');
assert(projectTask?.customerDisplayName === '测试客户', 'Task list hydrates customer name');
assert(customerTask?.project === null, 'customer-level FOLLOW_UP remains customer-level');
assert(customerTask?.customerReferenceId === customer.id, 'customer-level task preserves customer reference');

console.log('Phase 5E list-model tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
