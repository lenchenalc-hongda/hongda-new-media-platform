// ===== Review Center Management Audit Presentation Tests =====
import type { AuditLogDTO } from '../../src/lib/review-center/audit';
import {
  AuditSectionController,
  appendAuditPage,
  auditErrorMessage,
  canViewManagementAudit,
  formatAuditEvent,
  formatAuditTimestamp,
  formatAuditVersion,
  type AuditPageFetchResult,
} from '../../src/lib/review-center/audit-presentation';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

function item(
  action: string,
  details: Record<string, unknown>,
  entityType = 'REVIEW',
  overrides: Partial<AuditLogDTO> = {},
): AuditLogDTO {
  return {
    id: 'log-' + action,
    entityType,
    action,
    actor: { displayName: '张三', role: 'admin', isActive: true },
    details,
    versionBefore: null,
    versionAfter: 1,
    createdAt: '2026-08-25T08:00:00+08:00',
    ...overrides,
  };
}

console.log('\n=== Review Center Management Audit Presentation ===');

assert(canViewManagementAudit('admin'), 'admin can view audit');
assert(canViewManagementAudit('manager'), 'manager can view audit');
assert(!canViewManagementAudit('operator'), 'operator cannot view audit');
assert(!canViewManagementAudit('sales'), 'sales cannot view audit');
assert(!canViewManagementAudit('viewer'), 'viewer cannot view audit');
assert(!canViewManagementAudit('future_role'), 'unknown role cannot view audit');
assert(!canViewManagementAudit(null), 'null role cannot view audit');

assert(formatAuditVersion(null, 1) === '版本 1', 'create version presentation');
assert(formatAuditVersion(1, 2) === '版本 1 → 2', 'update version presentation');
assert(formatAuditVersion(2, 2) === '版本 2', 'same version no fake change');
assert(formatAuditVersion(0, 1) === '版本 1', 'invalid before falls back to after only');
assert(formatAuditVersion(null, 0) === '版本未知', 'invalid after safe');

assert(formatAuditTimestamp('2026-08-25T00:00:00Z') === '2026-08-25 08:00', 'audit timestamp formats');
assert(formatAuditTimestamp('not-a-date') === '时间未知', 'audit invalid timestamp fallback');

const createdEvent = formatAuditEvent(item('REVIEW_CREATED', {
  reviewNo: 'REV-2026-000002',
  reviewType: 'A',
  title: '标题',
}));
assert(createdEvent.title === '创建了复盘', 'REVIEW_CREATED title');
assert(createdEvent.summaryItems[0] === '复盘编号：REV-2026-000002', 'REVIEW_CREATED number summary');
assert(createdEvent.summaryItems[1] === '复盘类型：A类 · 生产前 / 订单与信任风险', 'REVIEW_CREATED type summary');

const updatedEvent = formatAuditEvent(item('REVIEW_UPDATED', {
  changedFields: ['title', 'risk_level', 'description'],
  safeChanges: {
    risk_level: { before: 'RED', after: 'YELLOW' },
  },
}));
assert(updatedEvent.title === '更新了复盘基本信息', 'REVIEW_UPDATED title');
assert(updatedEvent.summaryItems[0] === '修改了：复盘标题、风险等级、问题描述', 'REVIEW_UPDATED changed labels');
assert(updatedEvent.summaryItems[1] === '风险等级：高 → 中', 'REVIEW_UPDATED safe value summary');

const submittedEvent = formatAuditEvent(item('REVIEW_SUBMITTED', {
  status: { before: 'draft', after: 'submitted' },
}));
assert(submittedEvent.title === '提交了复盘', 'REVIEW_SUBMITTED title');
assert(submittedEvent.summaryItems[0] === '状态：草稿 → 待确认', 'REVIEW_SUBMITTED status summary');

const closedEvent = formatAuditEvent(item('REVIEW_CLOSED', {
  status: { before: 'submitted', after: 'closed' },
}));
assert(closedEvent.title === '关闭了复盘', 'REVIEW_CLOSED title');
assert(closedEvent.summaryItems[0] === '状态：待确认 → 已关闭', 'REVIEW_CLOSED status summary');

const reopenSubmitted = formatAuditEvent(item('REVIEW_REOPENED', {
  fromStatus: 'submitted',
  status: { before: 'submitted', after: 'draft' },
}));
assert(reopenSubmitted.title === '退回了复盘修改', 'REVIEW_REOPENED submitted title');

const reopenClosed = formatAuditEvent(item('REVIEW_REOPENED', {
  fromStatus: 'closed',
  status: { before: 'closed', after: 'draft' },
}));
assert(reopenClosed.title === '重新打开了复盘', 'REVIEW_REOPENED closed title');
assert(!JSON.stringify(reopenClosed).includes('SECRET_REOPEN_REASON'), 'REVIEW_REOPENED reason never shown');

const detailsCreated = formatAuditEvent(item('TYPE_DETAILS_SAVED', {
  created: true,
  reviewType: 'C',
  changedFields: [],
  safeChanges: {},
}, 'TYPE_DETAILS'));
assert(detailsCreated.title === '填写了专项复盘内容', 'TYPE_DETAILS_SAVED created title');
assert(detailsCreated.summaryItems[0] === 'C类专项复盘', 'TYPE_DETAILS_SAVED review type summary');

const detailsUpdated = formatAuditEvent(item('TYPE_DETAILS_SAVED', {
  created: false,
  reviewType: null,
  changedFields: ['additional_notes', 'root_cause_summary'],
  safeChanges: {
    customer_notified: { before: false, after: true },
    defect_rate: { before: 1.5, after: 2 },
  },
}, 'TYPE_DETAILS'));
assert(detailsUpdated.title === '更新了专项复盘内容', 'TYPE_DETAILS_SAVED update title');
assert(detailsUpdated.summaryItems[0] === '修改了：补充说明、根因总结', 'TYPE_DETAILS_SAVED changed labels');
assert(detailsUpdated.summaryItems[1] === '客户是否已通知：否 → 是', 'TYPE_DETAILS_SAVED boolean summary');
assert(detailsUpdated.summaryItems[2] === '不良率：1.5% → 2%', 'TYPE_DETAILS_SAVED number summary');

const memberAdded = formatAuditEvent(item('MEMBER_ADDED', {
  memberRole: 'QUALITY',
  isPrimary: true,
}, 'MEMBER'));
assert(memberAdded.title === '添加了项目成员', 'MEMBER_ADDED title');
assert(memberAdded.summaryItems[0] === '角色：品质 · 主负责人', 'MEMBER_ADDED role summary');

const memberRemoved = formatAuditEvent(item('MEMBER_REMOVED', {
  memberRole: 'PRODUCTION',
  isPrimary: false,
}, 'MEMBER'));
assert(memberRemoved.title === '移除了项目成员', 'MEMBER_REMOVED title');
assert(memberRemoved.summaryItems[0] === '角色：生产', 'MEMBER_REMOVED role summary');

const memberPrimary = formatAuditEvent(item('MEMBER_PRIMARY_SET', {
  memberRole: 'TECH_PROCESS',
  hadPreviousPrimary: true,
}, 'MEMBER'));
assert(memberPrimary.title === '更换了角色主负责人', 'MEMBER_PRIMARY_SET replacement title');
assert(memberPrimary.summaryItems[0] === '技术 / 工艺 · 更换主负责人', 'MEMBER_PRIMARY_SET summary');

const memberPrimaryFirst = formatAuditEvent(item('MEMBER_PRIMARY_SET', {
  memberRole: 'TECH_PROCESS',
  hadPreviousPrimary: false,
}, 'MEMBER'));
assert(memberPrimaryFirst.title === '设置了角色主负责人', 'MEMBER_PRIMARY_SET first title');

const ownerOnly = formatAuditEvent(item('ASSIGNMENT_UPDATED', {
  changedFields: ['owner_id'],
}, 'ASSIGNMENT'));
assert(ownerOnly.title === '调整了项目负责人', 'ASSIGNMENT owner only title');

const pmoOnly = formatAuditEvent(item('ASSIGNMENT_UPDATED', {
  changedFields: ['pmo_id'],
}, 'ASSIGNMENT'));
assert(pmoOnly.title === '调整了项目 PMO', 'ASSIGNMENT pmo only title');

const bothAssignment = formatAuditEvent(item('ASSIGNMENT_UPDATED', {
  changedFields: ['owner_id', 'pmo_id'],
}, 'ASSIGNMENT'));
assert(bothAssignment.title === '调整了项目负责人和 PMO', 'ASSIGNMENT both title');
assert(bothAssignment.summaryItems[0] === '变更字段：负责人、PMO', 'ASSIGNMENT summary labels');

const actionCreated = formatAuditEvent(item('ACTION_CREATED', {
  sequence: 1,
  title: '调整杯身印刷定位',
  actionType: 'CORRECTIVE',
  dueDate: '2026-08-30',
  status: 'OPEN',
}, 'ACTION'));
assert(actionCreated.title === '创建了改善行动 #1：调整杯身印刷定位', 'ACTION_CREATED full title');
assert(actionCreated.summaryItems[0] === '行动类型：纠正措施', 'ACTION_CREATED type summary');
assert(actionCreated.summaryItems[1] === '截止日期：2026/08/30', 'ACTION_CREATED due date summary');

const actionCreatedMalformed = formatAuditEvent(item('ACTION_CREATED', {
  sequence: 0,
  title: '',
}, 'ACTION'));
assert(actionCreatedMalformed.title === '创建了一项改善行动', 'ACTION_CREATED malformed fallback');

const actionUpdated = formatAuditEvent(item('ACTION_UPDATED', {
  changedFields: ['title', 'description', 'owner_profile_id'],
  safeChanges: {
    action_type: { before: 'IMMEDIATE', after: 'PREVENTIVE' },
    due_date: { before: '2026-08-20', after: '2026-08-25' },
  },
}, 'ACTION'));
assert(actionUpdated.title === '更新了一项改善行动', 'ACTION_UPDATED generic title');
assert(actionUpdated.summaryItems[0] === '修改了：标题、描述、负责人', 'ACTION_UPDATED changed labels');
assert(actionUpdated.summaryItems[1] === '行动类型：立即纠正 → 预防措施', 'ACTION_UPDATED type summary');
assert(actionUpdated.summaryItems[2] === '截止日期：2026/08/20 → 2026/08/25', 'ACTION_UPDATED due date summary');

const actionStarted = formatAuditEvent(item('ACTION_STARTED', {
  status: { before: 'OPEN', after: 'IN_PROGRESS' },
}, 'ACTION'));
assert(actionStarted.title === '开始执行了一项改善行动', 'ACTION_STARTED title');
assert(actionStarted.summaryItems[0] === '状态：待开始 → 进行中', 'ACTION_STARTED status summary');

const actionSubmitted = formatAuditEvent(item('ACTION_SUBMITTED_FOR_VERIFICATION', {
  status: { before: 'IN_PROGRESS', after: 'PENDING_VERIFICATION' },
  completedAt: { before: '2026-08-25T10:00:00Z', after: '2026-08-25T10:00:00Z' },
}, 'ACTION'));
assert(actionSubmitted.title === '提交了一项改善行动等待验证', 'ACTION_SUBMITTED title');
assert(actionSubmitted.summaryItems[0] === '状态：进行中 → 待验证', 'ACTION_SUBMITTED status summary');
assert(!JSON.stringify(actionSubmitted).includes('SECRET_COMPLETION'), 'ACTION_SUBMITTED completion note hidden');

const actionVerified = formatAuditEvent(item('ACTION_VERIFIED', {
  status: { before: 'PENDING_VERIFICATION', after: 'VERIFIED' },
  verifiedAt: { before: '2026-08-25T10:00:00Z', after: '2026-08-25T10:00:00Z' },
}, 'ACTION'));
assert(actionVerified.title === '验证通过了一项改善行动', 'ACTION_VERIFIED title');
assert(!JSON.stringify(actionVerified).includes('SECRET_VERIFY'), 'ACTION_VERIFIED note hidden');

const actionReturned = formatAuditEvent(item('ACTION_RETURNED', {
  status: { before: 'PENDING_VERIFICATION', after: 'IN_PROGRESS' },
}, 'ACTION'));
assert(actionReturned.title === '退回了一项改善行动', 'ACTION_RETURNED title');
assert(!JSON.stringify(actionReturned).includes('SECRET_RETURN_REASON'), 'ACTION_RETURNED reason hidden');

const actionCancelled = formatAuditEvent(item('ACTION_CANCELLED', {
  status: { before: 'IN_PROGRESS', after: 'CANCELLED' },
  cancelledAt: { before: null, after: '2026-08-25T10:00:00Z' },
}, 'ACTION'));
assert(actionCancelled.title === '取消了一项改善行动', 'ACTION_CANCELLED title');
assert(!JSON.stringify(actionCancelled).includes('SECRET_CANCEL_REASON'), 'ACTION_CANCELLED reason hidden');

const unknownEvent = formatAuditEvent(item('CAPA_FUTURE_INTERNAL_EVENT', {
  secret: 'x',
}, 'FUTURE_ENTITY'));
assert(unknownEvent.title === '记录了一项管理操作', 'unknown audit event global fallback');
assert(unknownEvent.summaryItems.length === 0, 'unknown audit event empty summary');
assert(!JSON.stringify(unknownEvent).includes('CAPA_FUTURE_INTERNAL_EVENT'), 'unknown action string not shown');
assert(!JSON.stringify(unknownEvent).includes('FUTURE_ENTITY'), 'unknown entity string not shown');

const inactiveActor = formatAuditEvent(item('REVIEW_CREATED', {
  reviewType: 'A',
}, 'REVIEW', { actor: { displayName: '李四', role: 'manager', isActive: false } }));
assert(inactiveActor.actorLabel === '李四' && inactiveActor.actorStateLabel === '已停用', 'inactive actor badge');

const nullActor = formatAuditEvent(item('REVIEW_CREATED', {
  reviewType: 'A',
}, 'REVIEW', { actor: { displayName: '系统操作', role: null, isActive: null } }));
assert(nullActor.actorLabel === '系统操作' && nullActor.actorRoleLabel === null, 'null actor reuse');

const allPresentation = JSON.stringify([
  createdEvent,
  updatedEvent,
  submittedEvent,
  closedEvent,
  reopenSubmitted,
  reopenClosed,
  detailsCreated,
  detailsUpdated,
  memberAdded,
  memberRemoved,
  memberPrimary,
  ownerOnly,
  pmoOnly,
  bothAssignment,
  actionCreated,
  actionCreatedMalformed,
  actionUpdated,
  actionStarted,
  actionSubmitted,
  actionVerified,
  actionReturned,
  actionCancelled,
  unknownEvent,
]);
for (const marker of [
  'REVIEW_CREATED',
  'REVIEW_UPDATED',
  'REVIEW_SUBMITTED',
  'REVIEW_CLOSED',
  'REVIEW_REOPENED',
  'TYPE_DETAILS_SAVED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'MEMBER_PRIMARY_SET',
  'ASSIGNMENT_UPDATED',
  'ACTION_CREATED',
  'ACTION_UPDATED',
  'ACTION_STARTED',
  'ACTION_SUBMITTED_FOR_VERIFICATION',
  'ACTION_VERIFIED',
  'ACTION_RETURNED',
  'ACTION_CANCELLED',
  'owner_id',
  'pmo_id',
  'SECRET_DESCRIPTION',
  'SECRET_COMPLETION',
  'SECRET_VERIFY',
  'SECRET_RETURN_REASON',
  'SECRET_CANCEL_REASON',
  'SECRET_EMAIL',
  'SECRET_USER_ID',
  'SECRET_UUID',
  'SECRET_NESTED',
]) {
  assert(!allPresentation.includes(marker), 'presentation excludes internal marker: ' + marker);
}

assert(auditErrorMessage(401) === '管理日志加载失败，请稍后重试。', 'audit 401 error text');
assert(auditErrorMessage(500) === '管理日志加载失败，请稍后重试。', 'audit 500 error text');

const pageOne: AuditLogDTO[] = [item('REVIEW_CREATED', {}, 'REVIEW', { id: 'e1' })];
const pageTwo: AuditLogDTO[] = [item('REVIEW_UPDATED', {}, 'REVIEW', { id: 'e2' })];
const appended = appendAuditPage(pageOne, [...pageTwo, { ...pageOne[0] }]);
assert(appended.map(entry => entry.id).join(',') === 'e1,e2', 'appendAuditPage dedupes by id');

let fetchCalls = 0;
const fetchPages: AuditPageFetchResult[] = [
  {
    status: 200,
    ok: true,
    items: pageOne,
    pageInfo: { limit: 30, offset: 0, hasMore: true, nextOffset: 1 },
  },
  {
    status: 200,
    ok: true,
    items: pageTwo,
    pageInfo: { limit: 30, offset: 1, hasMore: false, nextOffset: null },
  },
];
const controller = new AuditSectionController({
  fetchPage: async () => {
    fetchCalls++;
    return fetchPages[fetchCalls - 1] ?? { status: 500, ok: false };
  },
  onStateChange: () => undefined,
});
controller.start('review-1');
assert(controller.getState().expanded === false && fetchCalls === 0, 'audit section starts collapsed without fetch');
controller.expand();
await new Promise(resolve => setTimeout(resolve, 0));
assert(fetchCalls === 1 && controller.getState().status === 'ready', 'audit section lazy loads on expand');
controller.collapse();
assert(controller.getState().expanded === false, 'audit section collapses');
controller.expand();
await new Promise(resolve => setTimeout(resolve, 0));
assert(fetchCalls === 1, 'collapse/expand does not refetch');
controller.loadMore();
await new Promise(resolve => setTimeout(resolve, 0));
assert(fetchCalls === 2 && controller.getState().items.length === 2, 'audit load more appends page');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
