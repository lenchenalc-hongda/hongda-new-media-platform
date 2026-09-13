// ===== Review Center Management Audit Sanitizer / DTO Tests =====
import {
  buildAuditDTO,
  buildAuditPageInfo,
  parseAuditPageResponse,
  parseAuditPagination,
  sanitizeAuditDetails,
  type AuditRow,
} from '../../src/lib/review-center/audit';

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

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

console.log('\n=== Review Center Management Audit Helpers ===');

const defaults = parseAuditPagination(new URLSearchParams(''));
assert(defaults.ok && defaults.data.limit === 30 && defaults.data.offset === 0, 'audit pagination defaults');
const bounded = parseAuditPagination(new URLSearchParams('limit=1&offset=10'));
assert(bounded.ok && bounded.data.limit === 1 && bounded.data.offset === 10, 'audit pagination accepts bounded');
for (const badLimit of ['0', '51', '-1', '1.5', 'NaN', 'Infinity', 'abc', '']) {
  assert(!parseAuditPagination(new URLSearchParams('limit=' + badLimit)).ok, 'audit invalid limit: ' + badLimit);
}
for (const badOffset of ['-1', '1.5', 'NaN', 'Infinity', 'abc', '']) {
  assert(!parseAuditPagination(new URLSearchParams('offset=' + badOffset)).ok, 'audit invalid offset: ' + badOffset);
}
assert(!parseAuditPagination(new URLSearchParams('limit=1&limit=2')).ok, 'audit duplicate limit rejected');
assert(!parseAuditPagination(new URLSearchParams('offset=1&offset=2')).ok, 'audit duplicate offset rejected');

const hasMore = buildAuditPageInfo(30, 0, 30, true);
assert(hasMore.hasMore === true && hasMore.nextOffset === 30, 'audit hasMore nextOffset');
const noMore = buildAuditPageInfo(30, 30, 2, false);
assert(noMore.hasMore === false && noMore.nextOffset === null, 'audit no more nextOffset');

const created = sanitizeAuditDetails('REVIEW', 'REVIEW_CREATED', {
  review_no: 'REV-2026-000002',
  review_type: 'A',
  title: '标题',
  secret: 'SECRET_DESCRIPTION',
  org_id: 'SECRET_ORG',
});
assert(
  deepEqual(created, { reviewNo: 'REV-2026-000002', reviewType: 'A', title: '标题' }),
  'REVIEW_CREATED whitelist',
);

const updated = sanitizeAuditDetails('REVIEW', 'REVIEW_UPDATED', {
  title: { before: '旧标题', after: '新标题' },
  review_type: { before: 'A', after: 'B' },
  occurred_at: { before: '2026-08-20T10:00:00Z', after: '2026-08-21T10:00:00Z' },
  customer_name: { before: 'SECRET_CUSTOMER', after: 'SECRET_CUSTOMER2' },
  order_no: { before: 'SECRET_ORDER', after: 'SECRET_ORDER2' },
  project_name: { before: 'SECRET_PROJECT', after: 'SECRET_PROJECT2' },
  product_name: { before: 'SECRET_PRODUCT', after: 'SECRET_PRODUCT2' },
  process_name: { before: 'SECRET_PROCESS', after: 'SECRET_PROCESS2' },
  description: { before: 'SECRET_DESCRIPTION_OLD', after: 'SECRET_DESCRIPTION_NEW' },
  impact_summary: { before: 'SECRET_IMPACT', after: 'SECRET_IMPACT2' },
  risk_level: { before: 'RED', after: 'YELLOW' },
  risk_reason: { before: 'SECRET_RISK_REASON', after: 'SECRET_RISK_REASON2' },
  unknown_key: { before: 1, after: 2 },
});
assert(
  deepEqual(updated.changedFields, [
    'title',
    'review_type',
    'occurred_at',
    'customer_name',
    'order_no',
    'project_name',
    'product_name',
    'process_name',
    'description',
    'impact_summary',
    'risk_level',
    'risk_reason',
  ]),
  'REVIEW_UPDATED changedFields all allowed',
);
assert(
  deepEqual(updated.safeChanges, {
    review_type: { before: 'A', after: 'B' },
    occurred_at: { before: '2026-08-20T10:00:00Z', after: '2026-08-21T10:00:00Z' },
    risk_level: { before: 'RED', after: 'YELLOW' },
  }),
  'REVIEW_UPDATED safeChanges only safe scalars',
);
const updatedText = JSON.stringify(updated);
for (const marker of [
  'SECRET_CUSTOMER',
  'SECRET_ORDER',
  'SECRET_PROJECT',
  'SECRET_PRODUCT',
  'SECRET_PROCESS',
  'SECRET_DESCRIPTION',
  'SECRET_IMPACT',
  'SECRET_RISK_REASON',
]) {
  assert(!updatedText.includes(marker), 'REVIEW_UPDATED hides marker: ' + marker);
}

const submitted = sanitizeAuditDetails('REVIEW', 'REVIEW_SUBMITTED', {
  status: { before: 'draft', after: 'submitted' },
  reason: 'SECRET_REASON',
  email: 'SECRET_EMAIL',
});
assert(deepEqual(submitted, { status: { before: 'draft', after: 'submitted' } }), 'REVIEW_SUBMITTED safe');
assert(!JSON.stringify(submitted).includes('SECRET_REASON'), 'REVIEW_SUBMITTED hides reason');

const closed = sanitizeAuditDetails('REVIEW', 'REVIEW_CLOSED', {
  status: { before: 'submitted', after: 'closed' },
});
assert(deepEqual(closed, { status: { before: 'submitted', after: 'closed' } }), 'REVIEW_CLOSED safe');

const reopenedSubmitted = sanitizeAuditDetails('REVIEW', 'REVIEW_REOPENED', {
  status: { before: 'submitted', after: 'draft' },
  reason: 'SECRET_REOPEN_REASON',
});
assert(
  deepEqual(reopenedSubmitted, {
    fromStatus: 'submitted',
    status: { before: 'submitted', after: 'draft' },
  }),
  'REVIEW_REOPENED submitted safe',
);
assert(!JSON.stringify(reopenedSubmitted).includes('SECRET_REOPEN_REASON'), 'REVIEW_REOPENED hides reason');

const reopenedClosed = sanitizeAuditDetails('REVIEW', 'REVIEW_REOPENED', {
  status: { before: 'closed', after: 'draft' },
  reason: 'SECRET_REOPEN_REASON',
});
assert(reopenedClosed.fromStatus === 'closed', 'REVIEW_REOPENED closed fromStatus');

const typeCreated = sanitizeAuditDetails('TYPE_DETAILS', 'TYPE_DETAILS_SAVED', {
  created: true,
  review_type: 'C',
  secret: 'SECRET_NESTED',
});
assert(
  deepEqual(typeCreated, {
    created: true,
    reviewType: 'C',
    changedFields: [],
    safeChanges: {},
  }),
  'TYPE_DETAILS_SAVED created safe',
);

const typeUpdated = sanitizeAuditDetails('TYPE_DETAILS', 'TYPE_DETAILS_SAVED', {
  created: false,
  review_type: 'B',
  additional_notes: { before: { note: 'SECRET_ADDITIONAL_NOTES' }, after: {} },
  root_cause_summary: { before: 'SECRET_ROOT_CAUSE', after: 'x' },
  improvement_advice: { before: 'SECRET_IMPROVEMENT', after: 'y' },
  customer_notified: { before: false, after: true },
  defect_rate: { before: 1.5, after: 2 },
  onsite_records: { before: 'SECRET_RECORDS', after: 'z' },
});
assert(
  deepEqual(typeUpdated.changedFields, [
    'additional_notes',
    'customer_notified',
    'defect_rate',
    'onsite_records',
    'root_cause_summary',
    'improvement_advice',
  ]),
  'TYPE_DETAILS_SAVED changedFields',
);
assert(
  deepEqual(typeUpdated.safeChanges, {
    customer_notified: { before: false, after: true },
    defect_rate: { before: 1.5, after: 2 },
  }),
  'TYPE_DETAILS_SAVED safe changes only booleans/numbers',
);
const typeText = JSON.stringify(typeUpdated);
for (const marker of ['SECRET_ADDITIONAL_NOTES', 'SECRET_ROOT_CAUSE', 'SECRET_IMPROVEMENT', 'SECRET_RECORDS']) {
  assert(!typeText.includes(marker), 'TYPE_DETAILS_SAVED hides marker: ' + marker);
}

const memberAdded = sanitizeAuditDetails('MEMBER', 'MEMBER_ADDED', {
  member_id: 'SECRET_UUID_MEMBER',
  profile_id: 'SECRET_UUID_PROFILE',
  member_role: 'QUALITY',
  is_primary: true,
});
assert(
  deepEqual(memberAdded, { memberRole: 'QUALITY', isPrimary: true }),
  'MEMBER_ADDED strips ids',
);

const memberRemoved = sanitizeAuditDetails('MEMBER', 'MEMBER_REMOVED', {
  member_id: 'SECRET_UUID_MEMBER',
  profile_id: 'SECRET_UUID_PROFILE',
  member_role: 'PRODUCTION',
  is_primary: false,
});
assert(
  deepEqual(memberRemoved, { memberRole: 'PRODUCTION', isPrimary: false }),
  'MEMBER_REMOVED strips ids',
);

const memberPrimary = sanitizeAuditDetails('MEMBER', 'MEMBER_PRIMARY_SET', {
  member_role: 'TECH_PROCESS',
  previous_primary_id: 'SECRET_OLD_ID',
  previous_primary_profile_id: 'SECRET_OLD_PROFILE',
  new_primary_id: 'SECRET_NEW_ID',
  new_primary_profile_id: 'SECRET_NEW_PROFILE',
});
assert(
  deepEqual(memberPrimary, { memberRole: 'TECH_PROCESS', hadPreviousPrimary: true }),
  'MEMBER_PRIMARY_SET strips ids and keeps safe boolean',
);

const assignment = sanitizeAuditDetails('ASSIGNMENT', 'ASSIGNMENT_UPDATED', {
  owner_id: { before: 'SECRET_OWNER_UUID', after: 'SECRET_OWNER_UUID2' },
  pmo_id: { before: 'SECRET_PMO_UUID', after: 'SECRET_PMO_UUID2' },
});
assert(
  deepEqual(assignment, { changedFields: ['owner_id', 'pmo_id'] }),
  'ASSIGNMENT_UPDATED no UUIDs',
);

const actionCreated = sanitizeAuditDetails('ACTION', 'ACTION_CREATED', {
  sequence: 1,
  title: '调整杯身印刷定位',
  description: 'SECRET_ACTION_DESCRIPTION',
  action_type: 'CORRECTIVE',
  owner_profile_id: 'SECRET_OWNER_UUID',
  due_date: '2026-08-30',
  status: 'OPEN',
});
assert(
  deepEqual(actionCreated, {
    sequence: 1,
    title: '调整杯身印刷定位',
    actionType: 'CORRECTIVE',
    dueDate: '2026-08-30',
    status: 'OPEN',
  }),
  'ACTION_CREATED safe fields',
);
assert(!JSON.stringify(actionCreated).includes('SECRET_ACTION_DESCRIPTION'), 'ACTION_CREATED hides description');
assert(!JSON.stringify(actionCreated).includes('SECRET_OWNER_UUID'), 'ACTION_CREATED hides owner');

const actionUpdated = sanitizeAuditDetails('ACTION', 'ACTION_UPDATED', {
  title: { before: '旧', after: '新' },
  description: { before: 'SECRET_DESCRIPTION', after: 'SECRET_DESCRIPTION2' },
  action_type: { before: 'IMMEDIATE', after: 'PREVENTIVE' },
  owner_profile_id: { before: 'SECRET_OWNER_UUID', after: 'SECRET_OWNER_UUID2' },
  due_date: { before: '2026-08-20', after: '2026-08-25' },
});
assert(
  deepEqual(actionUpdated.changedFields, ['title', 'description', 'action_type', 'owner_profile_id', 'due_date']),
  'ACTION_UPDATED changedFields',
);
assert(
  deepEqual(actionUpdated.safeChanges, {
    action_type: { before: 'IMMEDIATE', after: 'PREVENTIVE' },
    due_date: { before: '2026-08-20', after: '2026-08-25' },
  }),
  'ACTION_UPDATED safe changes',
);
const actionUpdatedText = JSON.stringify(actionUpdated);
assert(!actionUpdatedText.includes('SECRET_DESCRIPTION'), 'ACTION_UPDATED hides description');
assert(!actionUpdatedText.includes('SECRET_OWNER_UUID'), 'ACTION_UPDATED hides owner');

const started = sanitizeAuditDetails('ACTION', 'ACTION_STARTED', {
  status: { before: 'OPEN', after: 'IN_PROGRESS' },
});
assert(deepEqual(started, { status: { before: 'OPEN', after: 'IN_PROGRESS' } }), 'ACTION_STARTED safe');

const submittedForVerification = sanitizeAuditDetails(
  'ACTION',
  'ACTION_SUBMITTED_FOR_VERIFICATION',
  {
    status: { before: 'IN_PROGRESS', after: 'PENDING_VERIFICATION' },
    completion_note: { before: null, after: 'SECRET_COMPLETION' },
    completed_at: { before: null, after: '2026-08-25T10:00:00Z' },
  },
);
assert(
  deepEqual(submittedForVerification, {
    status: { before: 'IN_PROGRESS', after: 'PENDING_VERIFICATION' },
    completedAt: { before: null, after: '2026-08-25T10:00:00Z' },
  }),
  'ACTION_SUBMITTED_FOR_VERIFICATION safe status/timestamp only',
);
assert(!JSON.stringify(submittedForVerification).includes('SECRET_COMPLETION'), 'ACTION_SUBMITTED hides completion note');

const verified = sanitizeAuditDetails('ACTION', 'ACTION_VERIFIED', {
  status: { before: 'PENDING_VERIFICATION', after: 'VERIFIED' },
  verification_note: { before: 'SECRET_VERIFY', after: 'SECRET_VERIFY2' },
  verified_by_profile_id: { before: 'SECRET_UUID', after: 'SECRET_UUID2' },
  verified_at: { before: '2026-08-25T10:00:00Z', after: '2026-08-25T10:00:00Z' },
});
assert((verified as any).status.after === 'VERIFIED', 'ACTION_VERIFIED status safe');
assert((verified as any).verifiedAt.before === '2026-08-25T10:00:00Z', 'ACTION_VERIFIED verifiedAt safe');
assert(!JSON.stringify(verified).includes('SECRET_VERIFY'), 'ACTION_VERIFIED hides verification note');
assert(!JSON.stringify(verified).includes('SECRET_UUID'), 'ACTION_VERIFIED hides verified by UUID');

const returned = sanitizeAuditDetails('ACTION', 'ACTION_RETURNED', {
  status: { before: 'PENDING_VERIFICATION', after: 'IN_PROGRESS' },
  verification_note: { before: 'SECRET_RETURN_REASON', after: 'SECRET_RETURN_REASON2' },
  completed_at: { before: '2026-08-25T10:00:00Z', after: null },
  verified_by_profile_id: { before: 'SECRET_UUID', after: null },
  verified_at: { before: '2026-08-25T10:00:00Z', after: null },
});
assert((returned as any).status.after === 'IN_PROGRESS', 'ACTION_RETURNED status safe');
assert(!JSON.stringify(returned).includes('SECRET_RETURN_REASON'), 'ACTION_RETURNED hides return reason');
assert(!JSON.stringify(returned).includes('SECRET_UUID'), 'ACTION_RETURNED hides verified by UUID');

const cancelled = sanitizeAuditDetails('ACTION', 'ACTION_CANCELLED', {
  status: { before: 'IN_PROGRESS', after: 'CANCELLED' },
  cancelled_at: { before: null, after: '2026-08-25T10:00:00Z' },
  cancel_reason: { before: null, after: 'SECRET_CANCEL_REASON' },
  verified_by_profile_id: { before: 'SECRET_UUID', after: null },
});
assert((cancelled as any).status.after === 'CANCELLED', 'ACTION_CANCELLED status safe');
assert(!JSON.stringify(cancelled).includes('SECRET_CANCEL_REASON'), 'ACTION_CANCELLED hides cancel reason');
assert(!JSON.stringify(cancelled).includes('SECRET_UUID'), 'ACTION_CANCELLED hides UUID');

for (const malformed of [null, ['x'], 'raw string', 42]) {
  assert(deepEqual(sanitizeAuditDetails('REVIEW', 'REVIEW_UPDATED', malformed), {}), 'malformed changes safe');
}

const emptyObjectDetails = sanitizeAuditDetails('REVIEW', 'REVIEW_UPDATED', {});
assert(
  Array.isArray(emptyObjectDetails.changedFields)
    && emptyObjectDetails.changedFields.length === 0,
  'empty object changes returns safe empty changedFields',
);
assert(!JSON.stringify(emptyObjectDetails).includes('SECRET_'), 'empty object changes exposes no raw values');

const nestedMalformedDetails = sanitizeAuditDetails('REVIEW', 'REVIEW_UPDATED', {
  description: {
    before: { nested: { secret: 'SECRET_NESTED_OBJECT' } },
    after: { unexpected: true },
  },
  strange: { nested: 'SECRET_UNKNOWN_NESTED' },
});
assert(
  Array.isArray(nestedMalformedDetails.changedFields)
    && nestedMalformedDetails.changedFields.includes('description'),
  'known nested malformed field keeps safe field category',
);
const nestedText = JSON.stringify(nestedMalformedDetails);
assert(!nestedText.includes('SECRET_NESTED_OBJECT'), 'nested malformed object secret hidden');
assert(!nestedText.includes('SECRET_UNKNOWN_NESTED'), 'unknown nested secret hidden');

const unknown = sanitizeAuditDetails('FUTURE_ENTITY', 'FUTURE_ACTION', {
  secret: 'x',
  email: 'SECRET_EMAIL',
  user_id: 'SECRET_USER_ID',
});
assert(deepEqual(unknown, {}), 'unknown entity/action returns empty');

const createRow: AuditRow = {
  id: 'log-1',
  entity_type: 'REVIEW',
  action: 'REVIEW_CREATED',
  actor_profile_id: 'p1',
  changes: { review_no: 'REV-2026-000002', review_type: 'A', title: '标题' },
  version_before: null,
  version_after: 1,
  created_at: '2026-08-25T00:00:00Z',
};
const createDto = buildAuditDTO(createRow, [
  { profile_id: 'p1', display_name: '张三', role: 'admin', is_active: true },
])!;
assert(createDto.versionBefore === null && createDto.versionAfter === 1, 'create version null -> 1');
assert(createDto.actor.displayName === '张三', 'create actor resolved');
assert(!('org_id' in (createDto as any)) && !('review_id' in (createDto as any)), 'DTO excludes ids');

const updateDto = buildAuditDTO({
  ...createRow,
  id: 'log-2',
  entity_type: 'REVIEW',
  action: 'REVIEW_UPDATED',
  changes: { title: { before: '旧', after: '新' }, description: { before: 'SECRET_DESCRIPTION', after: 'x' } },
  version_before: 1,
  version_after: 2,
}, [])!;
assert(updateDto.versionBefore === 1 && updateDto.versionAfter === 2, 'update version 1 -> 2');
assert(deepEqual(updateDto.details.changedFields, ['title', 'description']), 'update DTO details sanitized');
assert(!JSON.stringify(updateDto).includes('SECRET_DESCRIPTION'), 'update DTO hides description');

const malformedVersion = buildAuditDTO({
  ...createRow,
  version_after: 0,
}, []);
assert(malformedVersion === null, 'malformed core version fails closed');

const activeActor = buildAuditDTO(createRow, [
  { profile_id: 'p1', display_name: '张三', role: 'admin', is_active: true },
])!;
assert(activeActor.actor.role === 'admin' && activeActor.actor.isActive === true, 'active actor DTO');

const inactiveActor = buildAuditDTO(createRow, [
  { profile_id: 'p1', display_name: '李四', role: 'manager', is_active: false },
])!;
assert(inactiveActor.actor.displayName === '李四' && inactiveActor.actor.isActive === false, 'inactive actor preserved');

const nullActor = buildAuditDTO({ ...createRow, actor_profile_id: null }, [])!;
assert(nullActor.actor.displayName === '系统操作' && nullActor.actor.role === null, 'null actor safe');

const unresolvedActor = buildAuditDTO({ ...createRow, actor_profile_id: 'missing' }, [])!;
assert(unresolvedActor.actor.displayName === '历史操作人' && unresolvedActor.actor.role === null, 'unresolved actor safe');

const validBody = {
  ok: true,
  code: 'OK',
  message: 'success',
  data: {
    logs: [createDto],
    pageInfo: { limit: 30, offset: 0, hasMore: false, nextOffset: null },
  },
};
const parsed = parseAuditPageResponse(validBody, 200);
assert(parsed.ok && Array.isArray(parsed.items) && parsed.items.length === 1, 'client response parse ok');
assert(!parseAuditPageResponse({ ok: false, data: null }, 200).ok, 'client rejects failed envelope');
assert(!parseAuditPageResponse({ ok: true, data: { logs: [{ bad: true }], pageInfo: { limit: 30 } } }, 200).ok, 'client rejects malformed log');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
