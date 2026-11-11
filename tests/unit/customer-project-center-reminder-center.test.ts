import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildProjectReminderSnapshot,
  PROJECT_REMINDER_POLICY_V1,
  PROJECT_PROGRESS_EVENT_TYPES,
  type ReminderProjectRow,
  type ReminderWorkItemRow,
  type ReminderProfileRow,
  type ReminderEventRow,
} from '../../src/lib/customer-projects/project-reminder-center';
import { projectEventCountsAsEffectiveProgress } from '../../src/lib/customer-projects/domain';

console.log('\n=== CPC Project Reminder Center V1: Derived, Read-Only, No Push ===');

const now = new Date('2026-11-11T02:00:00Z'); // 北京时间 11/11 10:00
function project(id: string, owner: string, created: string, extras: Partial<ReminderProjectRow> = {}): ReminderProjectRow {
  return {
    id, title: id, owner_profile_id: owner, status: 'active',
    waiting_on: 'none', next_check_at: null, created_at: created,
    ...extras,
  };
}
function work(id: string, projectId: string, due: string | null, overrides: Partial<ReminderWorkItemRow> = {}): ReminderWorkItemRow {
  return {
    id, project_id: projectId, title: id,
    work_item_type: 'NEXT_ACTION', status: 'pending', due_at: due,
    ...overrides,
  };
}
const profiles: ReminderProfileRow[] = [
  { id: 'person-a', full_name: '业务员甲', created_at: '2026-08-01T00:00:00Z', role: 'sales', is_active: true },
  { id: 'person-b', full_name: '业务员乙', created_at: '2026-08-01T00:00:00Z', role: 'sales', is_active: true },
  { id: 'person-c', full_name: '业务员丙', created_at: '2026-10-01T00:00:00Z', role: 'sales', is_active: true },
  { id: 'person-new', full_name: '刚入职的业务员', created_at: '2026-11-07T00:00:00Z', role: 'sales', is_active: true },
  { id: 'person-admin', full_name: '管理员', created_at: '2026-01-01T00:00:00Z', role: 'admin', is_active: true },
  { id: 'person-inactive', full_name: '离职业务员', created_at: '2026-01-01T00:00:00Z', role: 'sales', is_active: false },
];
const projects: ReminderProjectRow[] = [
  project('stale-with-task', 'person-a', '2026-10-01T00:00:00Z'),
  project('future-wait', 'person-b', '2026-10-01T00:00:00Z',
    { waiting_on: 'customer', next_check_at: '2026-11-12T02:00:00Z' }),
  project('past-wait', 'person-b', '2026-10-01T00:00:00Z',
    { waiting_on: 'supplier', next_check_at: '2026-11-09T02:00:00Z' }),
  project('closed', 'person-b', '2026-08-01T00:00:00Z', { status: 'won' }),
  project('recent', 'person-a', '2026-11-09T00:00:00Z'),
  project('contact-only', 'person-b', '2026-10-01T00:00:00Z'),
  project('missing-check', 'person-b', '2026-11-09T00:00:00Z',
    { waiting_on: 'quality', next_check_at: null }),
];
const tasks: ReminderWorkItemRow[] = [
  work('overdue-next', 'stale-with-task', '2026-11-09T00:00:00Z'),
  work('customer-promise', 'stale-with-task', '2026-11-11T05:00:00Z',
    { work_item_type: 'CUSTOMER_COMMITMENT' }),
  work('recent-step', 'recent', '2026-11-13T01:00:00Z'),
  work('closed-step', 'closed', '2026-11-10T00:00:00Z'),
  work('completed-step', 'future-wait', '2026-11-10T00:00:00Z', { status: 'completed' }),
  work('irrelevant-follow-up', 'stale-with-task', '2026-11-10T00:00:00Z', { work_item_type: 'FOLLOW_UP' }),
  work('far-future', 'contact-only', '2026-11-16T00:00:00Z'),
];
const events: ReminderEventRow[] = [
  { project_id: 'stale-with-task', event_type: 'EFFECTIVE_PROGRESS_RECORDED', occurred_at: '2026-11-01T02:00:00Z' },
  { project_id: 'stale-with-task', event_type: 'CONTACT_LOGGED', occurred_at: '2026-11-10T01:00:00Z' },
  { project_id: 'contact-only', event_type: 'CONTACT_LOGGED', occurred_at: '2026-11-10T00:00:00Z' },
  { project_id: 'contact-only', event_type: 'QUOTE_SENT', occurred_at: '2026-11-02T00:00:00Z' },
  { project_id: 'contact-only', event_type: 'EFFECTIVE_PROGRESS_RECORDED', occurred_at: '2026-11-14T00:00:00Z' },
];

const snapshot = buildProjectReminderSnapshot({ now, projects, workItems: tasks, events, profiles });
const byKind = (kind: string) => snapshot.items.filter(item => item.kind === kind);

assert.equal(snapshot.readOnly, true, 'reminder projection is explicitly read-only');
assert.equal(snapshot.deliveryEnabled, false, 'external pushing is disabled');
assert.deepEqual(PROJECT_REMINDER_POLICY_V1, {
  dueSoonHours: 48, staleProjectDays: 7, focusProjectDays: 14,
  noNewProjectDays: 14, focusNewProjectDays: 30,
});
assert.ok(PROJECT_PROGRESS_EVENT_TYPES.every(t =>
  projectEventCountsAsEffectiveProgress(t)), 'stale activity source aligns with existing domain classifier');
assert.ok(!PROJECT_PROGRESS_EVENT_TYPES.includes('CONTACT_LOGGED' as never), 'contact-only log is not effective progress');
assert.ok(snapshot.items.every(i => !('ownerProfileId' in i) && !('owner_profile_id' in i)),
  'employee identity remains an opaque filter key, not an exposed UUID');
assert.equal(new Set(snapshot.items.map(i => i.id)).size, snapshot.items.length,
  'each occurrence emits once even when sources overlap');

assert.ok(snapshot.items.some(item => item.id.startsWith('work:overdue-next:')
  && item.severity === 'urgent' && item.category === 'formal_due'), 'overdue formal next action flagged');
assert.ok(snapshot.items.some(item => item.id.startsWith('work:customer-promise:')
  && item.severity === 'attention'), 'same-day customer commitment flagged as today due');
assert.ok(snapshot.items.some(item => item.id.startsWith('work:recent-step:')
  && item.severity === 'upcoming'), 'next 48h scheduled formal obligation flagged');
assert.ok(!snapshot.items.some(item => item.id.includes('completed-step')),
  'completed tasks are never reminders');
assert.ok(!snapshot.items.some(item => item.id.includes('closed-step')),
  'closed projects are never newly escalated');
assert.ok(!snapshot.items.some(item => item.id.includes('irrelevant-follow-up')),
  'project-specific unsupported FOLLOW_UP is not fabricated as formal due');
assert.ok(!snapshot.items.some(item => item.id.includes('far-future')),
  'far future due dates do not enter a 48h window');

assert.ok(snapshot.items.some(item => item.id.startsWith('check:future-wait:') && item.severity === 'upcoming'),
  'valid waiting check near due is flagged');
assert.ok(snapshot.items.some(item => item.id.startsWith('check:past-wait:') && item.severity === 'urgent'),
  'overdue waiting check remains due');
assert.ok(!snapshot.items.some(item => item.id === 'stale:future-wait' || item.id === 'stale:past-wait'),
  'intentional waiting with a scheduled check is not falsely treated as stalled');
assert.ok(snapshot.items.some(item => item.id === 'missing-check:missing-check'),
  'waiting without check time is a hygiene reminder');
assert.ok(snapshot.items.some(item => item.id === 'missing-next:contact-only'),
  'active project with no next action is an actionable hygiene recommendation');

assert.ok(snapshot.items.some(item => item.id === 'stale:stale-with-task'
  && item.days === 10 && item.category === 'project_attention'),
  'stale progress uses approved effective event, not unrelated CONTACT_LOGGED');
assert.ok(snapshot.items.some(item => item.id === 'stale:contact-only'
  && item.days !== null && item.days >= 7),
  'only verified effective progress events reset the stale clock');
assert.ok(!snapshot.items.some(item => item.id === 'stale:recent'),
  'recently started project must not be falsely flagged stagnant');
assert.ok(byKind('new_project_gap').some(item => item.ownerName === '业务员丙'
  && item.days !== null && item.days >= 30), 'staff with no projects since account creation gets a coaching gap');
assert.ok(!byKind('new_project_gap').some(item => item.ownerName === '业务员甲'),
  'a recently created valid project suppresses no-new-project advice');
assert.ok(!byKind('new_project_gap').some(item => item.ownerName === '刚入职的业务员'),
  'recent hires are not mislabeled inactive');
assert.ok(!byKind('new_project_gap').some(item => item.ownerName === '离职业务员'
  || item.ownerName === '管理员'), 'inactive staff and admins excluded from sales cadence');
assert.ok(byKind('new_project_gap').every(item => item.category === 'development_gap'),
  'sales development gaps remain separate from formal overdue reminders');

const server = fs.readFileSync('src/lib/customer-projects/project-reminder-center-server.ts', 'utf8');
const model = fs.readFileSync('src/lib/customer-projects/project-reminder-center.ts', 'utf8');
const ui = fs.readFileSync('src/app/customer-projects/projects/reminders/ReminderCenterClient.tsx', 'utf8');
const page = fs.readFileSync('src/app/customer-projects/projects/reminders/page.tsx', 'utf8');
const projectsUi = fs.readFileSync('src/app/customer-projects/projects/ProjectsClient.tsx', 'utf8');

assert.ok(server.includes('resolveCpcProfile(supabase)'), 'server checks authenticated CPC identity');
for (const tbl of ['cpc_projects', 'cpc_work_items', 'cpc_project_events', 'profiles']) {
  assert.ok(server.includes(".from('" + tbl + "')"), 'source is existing CPC table ' + tbl);
}
assert.ok(server.includes('MAX_PROJECT_ROWS') && server.includes('MAX_EVENT_ROWS')
  && server.includes('reminder data read failed'), 'fail closed on incomplete evidence or errors');
assert.ok(!server.includes('service_role'), 'no privileged service-role access');
assert.ok(!server.includes('.insert(') && !server.includes('.update(') && !server.includes('.delete('),
  'reminder read must not mutate source tables');
assert.ok(!server.includes('cron.schedule') && !server.includes('net.http_post'),
  'no unauthorized scheduled external delivery');
assert.ok(model.includes('projectEventCountsAsEffectiveProgress'), 'reuse approved effective progress domain semantics');
assert.ok(ui.includes('当前阶段：站内提醒预览，不会主动发送消息'),
  'UI explicitly tells users no external push is enabled');
assert.ok(ui.includes('按提醒责任业务员筛选') && ui.includes('全部业务员'),
  'manager can filter alerts by owner without seeing profile ID');
assert.ok(ui.includes("item.projectId ?"), 'each project alert links to the real project');
assert.ok(page.includes("export const dynamic = 'force-dynamic'"), 'fresh server-rendered snapshot, not cached');
assert.ok(projectsUi.includes('项目推进提醒'), 'reminder center linked from current Projects UI');

console.log('PASS: existing due semantics, real progress, waiting, no-new-project cadence, RLS and no premature pushing');
