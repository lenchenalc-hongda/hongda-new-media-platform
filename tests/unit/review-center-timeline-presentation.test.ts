// ===== Review Center Timeline Presentation Helper Tests =====
import {
  appendTimelinePage,
  createTimelineRequestGuard,
  formatAuthRoleLabel,
  formatMemberRoleLabel,
  formatReviewTypeLabel,
  formatTimelineActorLabel,
  formatTimelineEvent,
  formatTimelineFieldLabels,
  formatTimelineTimestamp,
  reviewTypeClassName,
  timelineErrorMessage,
  BASIC_FIELD_LABELS,
  TYPE_DETAIL_FIELD_LABELS,
} from '../../src/lib/review-center/timeline-presentation';
import type { TimelineItemDTO } from '../../src/lib/review-center/timeline';

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

function item(overrides: Partial<TimelineItemDTO> & { eventType: string }): TimelineItemDTO {
  return {
    id: 'event-' + overrides.eventType,
    actor: { displayName: '张三', role: 'admin', isActive: true },
    details: {},
    createdAt: '2026-08-25T08:00:00+08:00',
    ...overrides,
  };
}

console.log('\n=== Review Center Timeline Presentation Helpers ===');

assert(formatAuthRoleLabel('admin') === '管理员', 'admin auth role label');
assert(formatAuthRoleLabel('manager') === '管理人员', 'manager auth role label');
assert(formatAuthRoleLabel('operator') === '操作人员', 'operator auth role label');
assert(formatAuthRoleLabel('sales') === '业务人员', 'sales auth role label');
assert(formatAuthRoleLabel('viewer') === '查看人员', 'viewer auth role label');
assert(formatAuthRoleLabel('future_role') === null, 'unknown auth role hidden');
assert(formatAuthRoleLabel(null) === null, 'null auth role hidden');

assert(formatMemberRoleLabel('TECH_PROCESS') === '技术 / 工艺', 'TECH_PROCESS member role label');
assert(formatMemberRoleLabel('DESIGN_PLATE') === '设计 / 制版', 'DESIGN_PLATE member role label');
assert(formatMemberRoleLabel('PRODUCTION') === '生产', 'PRODUCTION member role label');
assert(formatMemberRoleLabel('QUALITY') === '品质', 'QUALITY member role label');
assert(formatMemberRoleLabel('EXPERT_REVIEWER') === '专家评审', 'EXPERT_REVIEWER member role label');
assert(formatMemberRoleLabel('OTHER') === '其他', 'OTHER member role label');
assert(formatMemberRoleLabel('FUTURE_ROLE') === null, 'unknown member role hidden');

assert(formatReviewTypeLabel('A') === 'A类 · 生产前 / 订单与信任风险', 'review type A label');
assert(formatReviewTypeLabel('B') === 'B类 · 生产 / 品质与交付异常', 'review type B label');
assert(formatReviewTypeLabel('C') === 'C类 · 前端问题最终在生产爆发', 'review type C label');
assert(formatReviewTypeLabel('FUTURE') === null, 'unknown review type hidden');
assert(reviewTypeClassName('C') === 'C类', 'review type class C');
assert(reviewTypeClassName(null) === null, 'review type class unknown hidden');

const createdA = formatTimelineEvent(item({
  eventType: 'REVIEW_CREATED',
  details: { reviewNo: 'REV-2026-000003', reviewType: 'A', title: '标题' },
}));
assert(createdA.title === '创建了复盘', 'REVIEW_CREATED title');
assert(
  createdA.summaryItems.length === 1 && createdA.summaryItems[0].includes('A类'),
  'REVIEW_CREATED A type summary',
);

const createdC = formatTimelineEvent(item({
  eventType: 'REVIEW_CREATED',
  details: { reviewType: 'C' },
}));
assert(createdC.summaryItems[0].includes('C类'), 'REVIEW_CREATED C type summary');

const createdUnknownType = formatTimelineEvent(item({
  eventType: 'REVIEW_CREATED',
  details: { reviewType: null },
}));
assert(createdUnknownType.summaryItems.length === 0, 'REVIEW_CREATED unknown type hidden');

const updated = formatTimelineEvent(item({
  eventType: 'REVIEW_UPDATED',
  details: {
    changedFields: ['customer_name', 'risk_level', 'description', 'unknown_field'],
  },
}));
assert(updated.title === '更新了复盘基本信息', 'REVIEW_UPDATED title');
assert(
  updated.summaryItems[0] === '修改了：客户名称、风险等级、问题描述',
  'REVIEW_UPDATED changed field labels',
);
assert(!JSON.stringify(updated).includes('customer_name'), 'REVIEW_UPDATED raw field hidden');
assert(!JSON.stringify(updated).includes('unknown_field'), 'REVIEW_UPDATED unknown field hidden');

const updatedEmpty = formatTimelineEvent(item({
  eventType: 'REVIEW_UPDATED',
  details: { changedFields: [] },
}));
assert(updatedEmpty.summaryItems.length === 0, 'REVIEW_UPDATED empty changed fields no summary');

const detailsCreated = formatTimelineEvent(item({
  eventType: 'TYPE_DETAILS_SAVED',
  details: {
    created: true,
    reviewType: 'A',
    changedFields: ['additional_notes', 'root_cause_summary', 'unknown_key'],
  },
}));
assert(detailsCreated.title === '填写了专项复盘内容', 'TYPE_DETAILS_SAVED created title');
assert(detailsCreated.summaryItems[0] === 'A类专项复盘', 'TYPE_DETAILS_SAVED review type summary');
assert(
  detailsCreated.summaryItems[1] === '修改了：补充说明、根因总结',
  'TYPE_DETAILS_SAVED field labels',
);
assert(!JSON.stringify(detailsCreated).includes('additional_notes'), 'TYPE_DETAILS raw field hidden');
assert(!JSON.stringify(detailsCreated).includes('unknown_key'), 'TYPE_DETAILS unknown field hidden');

const detailsUpdated = formatTimelineEvent(item({
  eventType: 'TYPE_DETAILS_SAVED',
  details: { created: false, reviewType: null, changedFields: [] },
}));
assert(detailsUpdated.title === '更新了专项复盘内容', 'TYPE_DETAILS_SAVED update title');
assert(detailsUpdated.summaryItems.length === 0, 'TYPE_DETAILS_SAVED empty summary');

const ownerOnly = formatTimelineEvent(item({
  eventType: 'ASSIGNMENT_UPDATED',
  details: { ownerChanged: true, pmoChanged: false },
}));
assert(ownerOnly.title === '调整了项目负责人', 'ASSIGNMENT owner only title');

const pmoOnly = formatTimelineEvent(item({
  eventType: 'ASSIGNMENT_UPDATED',
  details: { ownerChanged: false, pmoChanged: true },
}));
assert(pmoOnly.title === '调整了项目 PMO', 'ASSIGNMENT pmo only title');

const both = formatTimelineEvent(item({
  eventType: 'ASSIGNMENT_UPDATED',
  details: { ownerChanged: true, pmoChanged: true },
}));
assert(both.title === '调整了项目负责人和 PMO', 'ASSIGNMENT both title');

const neither = formatTimelineEvent(item({
  eventType: 'ASSIGNMENT_UPDATED',
  details: { ownerChanged: false, pmoChanged: false },
}));
assert(neither.title === '更新了项目分工', 'ASSIGNMENT neither title');
assert(neither.summaryItems.length === 0, 'ASSIGNMENT no uuid summary');

const memberAdded = formatTimelineEvent(item({
  eventType: 'MEMBER_ADDED',
  details: { memberRole: 'QUALITY', isPrimary: true },
}));
assert(memberAdded.title === '添加了项目成员', 'MEMBER_ADDED title');
assert(memberAdded.summaryItems[0] === '角色：品质 · 主负责人', 'MEMBER_ADDED primary summary');

const memberRemoved = formatTimelineEvent(item({
  eventType: 'MEMBER_REMOVED',
  details: { memberRole: 'TECH_PROCESS', wasPrimary: true },
}));
assert(memberRemoved.title === '移除了项目成员', 'MEMBER_REMOVED title');
assert(
  memberRemoved.summaryItems[0] === '角色：技术 / 工艺 · 原主负责人',
  'MEMBER_REMOVED primary summary',
);

const memberPrimary = formatTimelineEvent(item({
  eventType: 'MEMBER_PRIMARY_SET',
  details: { memberRole: 'QUALITY', hadPreviousPrimary: true },
}));
assert(memberPrimary.title === '设置了角色主负责人', 'MEMBER_PRIMARY_SET title');
assert(memberPrimary.summaryItems[0] === '品质 · 更换主负责人', 'MEMBER_PRIMARY_SET replacement');

const memberPrimaryFirst = formatTimelineEvent(item({
  eventType: 'MEMBER_PRIMARY_SET',
  details: { memberRole: 'QUALITY', hadPreviousPrimary: false },
}));
assert(memberPrimaryFirst.summaryItems[0] === '品质 · 设置主负责人', 'MEMBER_PRIMARY_SET first');

const memberUnknownRole = formatTimelineEvent(item({
  eventType: 'MEMBER_ADDED',
  details: { memberRole: 'MYSTERY', isPrimary: false },
}));
assert(memberUnknownRole.summaryItems.length === 0, 'unknown member role hidden');
assert(!JSON.stringify(memberUnknownRole).includes('MYSTERY'), 'unknown member role text hidden');

const unknownEvent = formatTimelineEvent(item({
  eventType: 'CAPA_FUTURE_INTERNAL_EVENT',
  details: { secret: 'x' },
}));
assert(unknownEvent.title === '记录了一项项目动态', 'unknown event safe title');
assert(unknownEvent.summaryItems.length === 0, 'unknown event empty summary');
assert(!JSON.stringify(unknownEvent).includes('CAPA_FUTURE_INTERNAL_EVENT'), 'unknown event type hidden');

const activeActor = formatTimelineEvent(item({
  eventType: 'REVIEW_CREATED',
  actor: { displayName: '张三', role: 'admin', isActive: true },
}));
assert(activeActor.actorLabel === '张三', 'active actor display');
assert(activeActor.actorRoleLabel === '管理员', 'active actor role');
assert(activeActor.actorStateLabel === null, 'active actor no state badge');

const inactiveActor = formatTimelineEvent(item({
  eventType: 'REVIEW_CREATED',
  actor: { displayName: '李四', role: 'manager', isActive: false },
}));
assert(inactiveActor.actorLabel === '李四', 'inactive actor keeps display name');
assert(inactiveActor.actorStateLabel === '已停用', 'inactive actor state badge');

const systemActor = formatTimelineEvent(item({
  eventType: 'REVIEW_CREATED',
  actor: { displayName: '系统操作', role: null, isActive: null },
}));
assert(systemActor.actorLabel === '系统操作', 'system actor display');
assert(systemActor.actorRoleLabel === null, 'system actor role hidden');

const historicalActor = formatTimelineEvent(item({
  eventType: 'REVIEW_CREATED',
  actor: { displayName: '历史操作人', role: null, isActive: null },
}));
assert(historicalActor.actorLabel === '历史操作人', 'historical actor fallback');

const unknownRoleActor = formatTimelineEvent(item({
  eventType: 'REVIEW_CREATED',
  actor: { displayName: '张三', role: 'future_role', isActive: true },
}));
assert(unknownRoleActor.actorRoleLabel === null, 'unknown auth role hidden');
assert(!JSON.stringify(unknownRoleActor).includes('future_role'), 'unknown auth role text hidden');

assert(formatTimelineActorLabel('') === '系统操作', 'empty actor name fallback');
assert(formatTimelineActorLabel(null) === '系统操作', 'null actor name fallback');

const utcTime = formatTimelineTimestamp('2026-08-25T00:00:00Z', { timeZone: 'UTC' });
assert(utcTime === '2026-08-25 00:00', 'valid timestamp UTC');
const shanghaiTime = formatTimelineTimestamp('2026-08-25T00:00:00Z', {
  timeZone: 'Asia/Shanghai',
});
assert(shanghaiTime === '2026-08-25 08:00', 'valid timestamp Shanghai');
assert(formatTimelineTimestamp('not-a-date') === '时间未知', 'invalid timestamp fallback');
assert(formatTimelineTimestamp('') === '时间未知', 'empty timestamp fallback');

assert(
  formatTimelineFieldLabels(['title', 'unknown_field'], BASIC_FIELD_LABELS).join(',') === '复盘标题',
  'basic field label helper',
);
assert(
  formatTimelineFieldLabels(['additional_notes'], TYPE_DETAIL_FIELD_LABELS)[0] === '补充说明',
  'type detail field label helper',
);

const guard = createTimelineRequestGuard();
const first = guard.next();
assert(guard.isCurrent(first), 'guard current request');
guard.invalidate();
assert(!guard.isCurrent(first), 'guard invalidated request');
const second = guard.next();
assert(guard.isCurrent(second), 'guard next request current');

const existing: TimelineItemDTO[] = [
  item({ eventType: 'REVIEW_CREATED', id: 'e1' }),
  item({ eventType: 'REVIEW_UPDATED', id: 'e2' }),
];
const nextPage: TimelineItemDTO[] = [
  item({ eventType: 'REVIEW_UPDATED', id: 'e2' }),
  item({ eventType: 'MEMBER_ADDED', id: 'e3' }),
];
const appended = appendTimelinePage(existing, nextPage);
assert(appended.map(entry => entry.id).join(',') === 'e1,e2,e3', 'append dedupes by id and preserves order');

assert(timelineErrorMessage(401) === '登录状态已失效，请刷新页面后重试。', '401 timeline error text');
assert(timelineErrorMessage(403) === '暂无权限查看项目动态。', '403 timeline error text');
assert(timelineErrorMessage(404) === '项目动态暂不可用，请刷新页面确认复盘状态。', '404 timeline error text');
assert(timelineErrorMessage(400) === '项目动态请求参数异常。', '400 timeline error text');
assert(timelineErrorMessage(500) === '项目动态加载失败，请稍后重试。', '500 timeline error text');
assert(timelineErrorMessage(200) === '项目动态加载失败，请稍后重试。', 'malformed success generic error');

const allOutput = JSON.stringify([
  createdA,
  createdC,
  createdUnknownType,
  updated,
  updatedEmpty,
  detailsCreated,
  detailsUpdated,
  ownerOnly,
  pmoOnly,
  both,
  neither,
  memberAdded,
  memberRemoved,
  memberPrimary,
  memberUnknownRole,
  unknownEvent,
  unknownRoleActor,
]);
for (const internal of [
  'REVIEW_CREATED',
  'REVIEW_UPDATED',
  'TYPE_DETAILS_SAVED',
  'ASSIGNMENT_UPDATED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'MEMBER_PRIMARY_SET',
  'customer_name',
  'risk_level',
  'additional_notes',
  'TECH_PROCESS',
]) {
  assert(!allOutput.includes(internal), 'internal label not exposed: ' + internal);
}

const submittedEvent = formatTimelineEvent(item({
  eventType: 'REVIEW_SUBMITTED',
  details: {},
}));
assert(submittedEvent.title === '提交了复盘' && submittedEvent.summaryItems.length === 0, 'REVIEW_SUBMITTED presentation');

const closedEvent = formatTimelineEvent(item({
  eventType: 'REVIEW_CLOSED',
  details: {},
}));
assert(closedEvent.title === '关闭了复盘' && closedEvent.summaryItems.length === 0, 'REVIEW_CLOSED presentation');

const submittedReopen = formatTimelineEvent(item({
  eventType: 'REVIEW_REOPENED',
  details: { fromStatus: 'submitted', reason: '请补充改善说明' },
}));
assert(
  submittedReopen.title === '退回了复盘'
  && submittedReopen.summaryItems[0] === '退回原因：请补充改善说明',
  'REVIEW_REOPENED submitted presentation',
);

const closedReopenNoReason = formatTimelineEvent(item({
  eventType: 'REVIEW_REOPENED',
  details: { fromStatus: 'closed' },
}));
assert(closedReopenNoReason.title === '重新打开了复盘' && closedReopenNoReason.summaryItems.length === 0, 'REVIEW_REOPENED closed no reason presentation');

const closedReopenReason = formatTimelineEvent(item({
  eventType: 'REVIEW_REOPENED',
  details: { fromStatus: 'closed', reason: '客户确认标准发生调整' },
}));
assert(
  closedReopenReason.title === '重新打开了复盘'
    && closedReopenReason.summaryItems[0] === '重新打开原因：客户确认标准发生调整',
  'REVIEW_REOPENED closed reason summary',
);

const scriptReason = formatTimelineEvent(item({
  eventType: 'REVIEW_REOPENED',
  details: { fromStatus: 'closed', reason: '<script>alert(1)</script>' },
}));
assert(
  scriptReason.summaryItems[0] === '重新打开原因：<script>alert(1)</script>',
  'REVIEW_REOPENED reason stays plain text',
);

const malformedReopen = formatTimelineEvent(item({
  eventType: 'REVIEW_REOPENED',
  details: {},
}));
assert(malformedReopen.title === '更新了复盘状态' && malformedReopen.summaryItems.length === 0, 'REVIEW_REOPENED malformed fallback');

const unknownReopenStatus = formatTimelineEvent(item({
  eventType: 'REVIEW_REOPENED',
  details: { fromStatus: 'approved_secret' },
}));
assert(unknownReopenStatus.title === '更新了复盘状态' && unknownReopenStatus.summaryItems.length === 0, 'REVIEW_REOPENED unknown fromStatus fallback');

const objectReason = formatTimelineEvent(item({
  eventType: 'REVIEW_REOPENED',
  details: { fromStatus: 'closed', reason: { a: 1 } },
}));
assert(objectReason.summaryItems.length === 0 && !JSON.stringify(objectReason).includes('[object Object]'), 'REVIEW_REOPENED object reason ignored');

const fallbackUnknown = formatTimelineEvent(item({
  eventType: 'CAPA_FUTURE_INTERNAL_EVENT',
  details: {},
}));
assert(fallbackUnknown.title === '记录了一项项目动态' && fallbackUnknown.summaryItems.length === 0, 'unknown event fallback preserved');

const actionCreatedEvent = formatTimelineEvent(item({
  eventType: 'ACTION_CREATED',
  details: { sequence: 1, title: '调整杯身印刷定位' },
}));
assert(
  actionCreatedEvent.title === '创建了改善行动 #1：调整杯身印刷定位'
    && actionCreatedEvent.summaryItems.length === 0,
  'ACTION_CREATED presentation',
);

const actionUpdatedEvent = formatTimelineEvent(item({
  eventType: 'ACTION_UPDATED',
  details: {
    sequence: 2,
    title: '更新后标题',
    changedFields: ['title', 'owner_profile_id', 'due_date', 'SECRET_FIELD'],
  },
}));
assert(
  actionUpdatedEvent.title === '更新了改善行动 #2：更新后标题',
  'ACTION_UPDATED presentation',
);
assert(
  actionUpdatedEvent.summaryItems[0] === '变更内容：标题、负责人、截止日期',
  'ACTION_UPDATED changed field labels',
);
assert(!JSON.stringify(actionUpdatedEvent).includes('owner_profile_id'), 'ACTION_UPDATED raw key hidden');
assert(!JSON.stringify(actionUpdatedEvent).includes('SECRET_FIELD'), 'ACTION_UPDATED unknown field hidden');

const actionStartedEvent = formatTimelineEvent(item({
  eventType: 'ACTION_STARTED',
  details: { sequence: 3, title: '开始执行行动' },
}));
assert(
  actionStartedEvent.title === '开始执行改善行动 #3：开始执行行动'
    && actionStartedEvent.summaryItems.length === 0,
  'ACTION_STARTED presentation',
);

const actionSubmittedEvent = formatTimelineEvent(item({
  eventType: 'ACTION_SUBMITTED_FOR_VERIFICATION',
  details: {
    sequence: 4,
    title: '提交验证行动',
    completionNote: 'SECRET_COMPLETION_NOTE',
  },
}));
assert(
  actionSubmittedEvent.title === '提交改善行动 #4 等待验证：提交验证行动',
  'ACTION_SUBMITTED_FOR_VERIFICATION presentation',
);
assert(!JSON.stringify(actionSubmittedEvent).includes('SECRET_COMPLETION_NOTE'), 'ACTION_SUBMITTED completion note hidden');

const actionVerifiedEvent = formatTimelineEvent(item({
  eventType: 'ACTION_VERIFIED',
  details: {
    sequence: 5,
    title: '验证行动',
    verificationNote: 'SECRET_VERIFICATION_NOTE',
  },
}));
assert(
  actionVerifiedEvent.title === '验证通过改善行动 #5：验证行动',
  'ACTION_VERIFIED presentation',
);
assert(!JSON.stringify(actionVerifiedEvent).includes('SECRET_VERIFICATION_NOTE'), 'ACTION_VERIFIED verification note hidden');

const actionReturnedEvent = formatTimelineEvent(item({
  eventType: 'ACTION_RETURNED',
  details: {
    sequence: 6,
    title: '退回行动',
    reason: 'SECRET_RETURN_REASON',
  },
}));
assert(
  actionReturnedEvent.title === '退回了改善行动 #6：退回行动'
    && actionReturnedEvent.summaryItems.length === 0,
  'ACTION_RETURNED presentation',
);
assert(!JSON.stringify(actionReturnedEvent).includes('SECRET_RETURN_REASON'), 'ACTION_RETURNED reason hidden');

const actionCancelledEvent = formatTimelineEvent(item({
  eventType: 'ACTION_CANCELLED',
  details: {
    sequence: 7,
    title: '取消行动',
    cancelReason: 'SECRET_CANCEL_REASON',
  },
}));
assert(
  actionCancelledEvent.title === '取消了改善行动 #7：取消行动'
    && actionCancelledEvent.summaryItems.length === 0,
  'ACTION_CANCELLED presentation',
);
assert(!JSON.stringify(actionCancelledEvent).includes('SECRET_CANCEL_REASON'), 'ACTION_CANCELLED cancel reason hidden');

const malformedActionStarted = formatTimelineEvent(item({
  eventType: 'ACTION_STARTED',
  details: { sequence: 0, title: 'x' },
}));
assert(
  malformedActionStarted.title === '开始执行了一项改善行动'
    && malformedActionStarted.summaryItems.length === 0,
  'ACTION_STARTED malformed fallback',
);

const malformedActionUpdated = formatTimelineEvent(item({
  eventType: 'ACTION_UPDATED',
  details: { sequence: 2, title: '' },
}));
assert(
  malformedActionUpdated.title === '更新了一项改善行动',
  'ACTION_UPDATED malformed fallback',
);

const actionFutureSecret = formatTimelineEvent(item({
  eventType: 'ACTION_FUTURE_SECRET_EVENT',
  details: { secret: 'x' },
}));
assert(
  actionFutureSecret.title === '记录了一项项目动态'
    && actionFutureSecret.summaryItems.length === 0,
  'unknown ACTION_* event stays global fallback',
);
assert(!JSON.stringify(actionFutureSecret).includes('ACTION_FUTURE_SECRET_EVENT'), 'unknown ACTION event type hidden');

const actionInactiveActor = formatTimelineEvent(item({
  eventType: 'ACTION_CREATED',
  actor: { displayName: '李四', role: 'manager', isActive: false },
  details: { sequence: 1, title: '历史行动' },
}));
assert(
  actionInactiveActor.actorLabel === '李四' && actionInactiveActor.actorStateLabel === '已停用',
  'ACTION event inactive actor preserved',
);

const actionNullActor = formatTimelineEvent(item({
  eventType: 'ACTION_CREATED',
  actor: { displayName: '系统操作', role: null, isActive: null },
  details: { sequence: 1, title: '系统行动' },
}));
assert(actionNullActor.actorLabel === '系统操作', 'ACTION event null actor reuse');

const actionSecretPayload = formatTimelineEvent(item({
  eventType: 'ACTION_CREATED',
  details: {
    sequence: 1,
    title: '安全标题',
    action_id: 'SECRET_UUID',
    email: 'SECRET_EMAIL',
    nested: { secret: 'SECRET_NESTED' },
  },
}));
for (const marker of ['SECRET_UUID', 'SECRET_EMAIL', 'SECRET_NESTED']) {
  assert(!JSON.stringify(actionSecretPayload).includes(marker), 'ACTION presentation excludes marker: ' + marker);
}

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
