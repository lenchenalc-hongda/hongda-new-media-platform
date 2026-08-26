// ===== Review Center Timeline Read Helper Tests =====
import {
  buildTimelineDTO,
  buildTimelinePageInfo,
  parseTimelinePagination,
  resolveTimelineActor,
  sanitizeTimelineDetails,
  type TimelineRow,
} from '../../src/lib/review-center/timeline';

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

console.log('\n=== Review Center Timeline Read Helpers ===');

const defaults = parseTimelinePagination(new URLSearchParams(''));
assert(defaults.ok && defaults.data.limit === 30 && defaults.data.offset === 0, 'pagination defaults limit 30 offset 0');

const bounded = parseTimelinePagination(new URLSearchParams('limit=1&offset=10'));
assert(bounded.ok && bounded.data.limit === 1 && bounded.data.offset === 10, 'pagination accepts limit 1 offset 10');

const maxLimit = parseTimelinePagination(new URLSearchParams('limit=50'));
assert(maxLimit.ok && maxLimit.data.limit === 50, 'pagination accepts limit 50');

for (const badLimit of ['0', '51', '-1', '1.5', 'NaN', 'Infinity', 'abc', '']) {
  const result = parseTimelinePagination(new URLSearchParams('limit=' + badLimit));
  assert(!result.ok, 'invalid limit rejected: ' + badLimit);
}

for (const badOffset of ['-1', '1.5', 'NaN', 'Infinity', 'abc', '']) {
  const result = parseTimelinePagination(new URLSearchParams('offset=' + badOffset));
  assert(!result.ok, 'invalid offset rejected: ' + badOffset);
}

assert(!parseTimelinePagination(new URLSearchParams('limit=1&limit=2')).ok, 'duplicate limit rejected');
assert(!parseTimelinePagination(new URLSearchParams('offset=1&offset=2')).ok, 'duplicate offset rejected');

const pageHasMore = buildTimelinePageInfo(30, 0, 30, true);
assert(pageHasMore.hasMore === true && pageHasMore.nextOffset === 30, 'hasMore nextOffset uses offset + returned count');
const pageNoMore = buildTimelinePageInfo(30, 60, 5, false);
assert(pageNoMore.hasMore === false && pageNoMore.nextOffset === null, 'no more nextOffset null');

const created = sanitizeTimelineDetails('REVIEW_CREATED', {
  review_no: 'REV-2026-000002',
  review_type: 'A',
  title: '标题',
  secret: 'x',
});
assert(deepEqual(created, {
  reviewNo: 'REV-2026-000002',
  reviewType: 'A',
  title: '标题',
}), 'REVIEW_CREATED whitelist only');

const updated = sanitizeTimelineDetails('REVIEW_UPDATED', {
  changes: {
    customer_name: { before: 'A', after: 'B' },
    description: { before: 'x', after: 'y' },
    unknown_secret: { before: 1, after: 2 },
  },
});
assert(
  deepEqual(updated.changedFields, ['customer_name', 'description']),
  'REVIEW_UPDATED changedFields excludes unknown and values',
);

const typeDetails = sanitizeTimelineDetails('TYPE_DETAILS_SAVED', {
  changes: {
    created: true,
    review_type: 'C',
    additional_notes: { before: {}, after: { note: 'secret' } },
    root_cause_summary: { before: 'old', after: 'new' },
    unknown_key: { before: 1, after: 2 },
  },
});
assert(
  deepEqual(typeDetails, {
    reviewType: 'C',
    created: true,
    changedFields: ['additional_notes', 'root_cause_summary'],
  }),
  'TYPE_DETAILS_SAVED returns metadata and whitelisted changed fields only',
);

const assignments = sanitizeTimelineDetails('ASSIGNMENT_UPDATED', {
  owner_id: { before: 'owner-before', after: 'owner-after' },
  pmo_id: { before: 'pmo-before', after: 'pmo-before' },
});
assert(
  deepEqual(assignments, { ownerChanged: true, pmoChanged: true }),
  'ASSIGNMENT_UPDATED returns booleans only and no UUIDs',
);

const memberAdded = sanitizeTimelineDetails('MEMBER_ADDED', {
  member_id: 'm1',
  profile_id: 'p1',
  member_role: 'QUALITY',
  is_primary: false,
});
assert(deepEqual(memberAdded, { memberRole: 'QUALITY', isPrimary: false }), 'MEMBER_ADDED strips ids');

const memberRemoved = sanitizeTimelineDetails('MEMBER_REMOVED', {
  member_id: 'm1',
  profile_id: 'p1',
  member_role: 'PRODUCTION',
  is_primary: true,
});
assert(deepEqual(memberRemoved, { memberRole: 'PRODUCTION', wasPrimary: true }), 'MEMBER_REMOVED maps is_primary to wasPrimary');

const memberPrimary = sanitizeTimelineDetails('MEMBER_PRIMARY_SET', {
  member_role: 'TECH_PROCESS',
  previous_primary_id: null,
  previous_primary_profile_id: null,
  new_primary_id: 'new-id',
  new_primary_profile_id: 'new-profile',
});
assert(deepEqual(memberPrimary, { memberRole: 'TECH_PROCESS', hadPreviousPrimary: false }), 'MEMBER_PRIMARY_SET strips all primary UUIDs');

const withPrevious = sanitizeTimelineDetails('MEMBER_PRIMARY_SET', {
  member_role: 'QUALITY',
  previous_primary_id: 'old-id',
  previous_primary_profile_id: 'old-profile',
  new_primary_id: 'new-id',
  new_primary_profile_id: 'new-profile',
});
assert(withPrevious.hadPreviousPrimary === true, 'MEMBER_PRIMARY_SET detects previous primary without leaking ids');

const unknown = sanitizeTimelineDetails('CAPA_FUTURE_EVENT', {
  secret: 'x',
  user_id: 'u1',
  org_id: 'o1',
});
assert(deepEqual(unknown, {}), 'unknown event returns empty details');

const actionCreated = sanitizeTimelineDetails('ACTION_CREATED', {
  action_id: 'SECRET_UUID',
  sequence: 1,
  title: '调整杯身印刷定位',
  description: 'SECRET_DESCRIPTION',
  owner_profile_id: 'SECRET_OWNER',
  email: 'SECRET_EMAIL',
  nested: { secret: 'SECRET_NESTED' },
});
assert(
  deepEqual(actionCreated, { sequence: 1, title: '调整杯身印刷定位' }),
  'ACTION_CREATED whitelist only',
);
assert(!JSON.stringify(actionCreated).includes('SECRET_UUID'), 'ACTION_CREATED action id hidden');
assert(!JSON.stringify(actionCreated).includes('SECRET_DESCRIPTION'), 'ACTION_CREATED description hidden');
assert(!JSON.stringify(actionCreated).includes('SECRET_OWNER'), 'ACTION_CREATED owner hidden');
assert(!JSON.stringify(actionCreated).includes('SECRET_EMAIL'), 'ACTION_CREATED email hidden');
assert(!JSON.stringify(actionCreated).includes('SECRET_NESTED'), 'ACTION_CREATED nested secret hidden');

const actionUpdated = sanitizeTimelineDetails('ACTION_UPDATED', {
  action_id: 'SECRET_UUID',
  sequence: 2,
  title: '更新后标题',
  changed_fields: [
    'title',
    'owner_profile_id',
    'due_date',
    'SECRET_FIELD',
    'title',
    'owner_profile_id',
    'due_date',
    'due_date',
    'description',
    'action_type',
  ],
  old_value: 'x',
  new_value: 'y',
  owner_uuid: 'SECRET_UUID',
  description: 'SECRET_DESCRIPTION',
});
assert(
  deepEqual(actionUpdated, {
    sequence: 2,
    title: '更新后标题',
    changedFields: ['title', 'owner_profile_id', 'due_date', 'description', 'action_type'],
  }),
  'ACTION_UPDATED changedFields whitelist dedup order cap',
);
assert(!JSON.stringify(actionUpdated).includes('SECRET_FIELD'), 'ACTION_UPDATED unknown field hidden');
assert(!JSON.stringify(actionUpdated).includes('old_value'), 'ACTION_UPDATED old value hidden');
assert(!JSON.stringify(actionUpdated).includes('owner_uuid'), 'ACTION_UPDATED owner uuid hidden');
assert(!JSON.stringify(actionUpdated).includes('SECRET_DESCRIPTION'), 'ACTION_UPDATED description hidden');

for (const badPayload of [
  null,
  ['x'],
  {},
  { sequence: 0, title: 'x' },
  { sequence: -1, title: 'x' },
  { sequence: 1.5, title: 'x' },
  { sequence: '1', title: 'x' },
  { sequence: 1, title: '' },
  { sequence: 1, title: '   ' },
  { sequence: 1, title: 'x'.repeat(201) },
  { sequence: 1, title: { bad: true } },
]) {
  const result = sanitizeTimelineDetails('ACTION_STARTED', badPayload);
  assert(!('sequence' in result) || (result.sequence as number) >= 1, 'ACTION_STARTED bad sequence safe');
  assert(!('title' in result) || typeof result.title === 'string', 'ACTION_STARTED bad title safe');
}

const actionUpdatedBadChanged = sanitizeTimelineDetails('ACTION_UPDATED', {
  sequence: 3,
  title: '标题',
  changed_fields: 'bad',
});
assert(
  deepEqual(actionUpdatedBadChanged, {
    sequence: 3,
    title: '标题',
    changedFields: [],
  }),
  'ACTION_UPDATED malformed changed_fields becomes empty array',
);

const actionUpdatedNullChanged = sanitizeTimelineDetails('ACTION_UPDATED', {
  sequence: 3,
  title: '标题',
  changed_fields: null,
});
assert(
  deepEqual(actionUpdatedNullChanged.changedFields, []),
  'ACTION_UPDATED null changed_fields becomes empty array',
);

const activeActor = resolveTimelineActor('p1', [
  { profile_id: 'p1', display_name: '张三', role: 'admin', is_active: true },
]);
assert(deepEqual(activeActor, { displayName: '张三', role: 'admin', isActive: true }), 'active actor resolved');

const inactiveActor = resolveTimelineActor('p2', [
  { profile_id: 'p2', display_name: '李四', role: 'manager', is_active: false },
]);
assert(deepEqual(inactiveActor, { displayName: '李四', role: 'manager', isActive: false }), 'inactive actor preserved');

const nullActor = resolveTimelineActor(null, []);
assert(deepEqual(nullActor, { displayName: '系统操作', role: null, isActive: null }), 'null actor uses system label');

const unresolvedActor = resolveTimelineActor('missing', []);
assert(deepEqual(unresolvedActor, { displayName: '历史操作人', role: null, isActive: null }), 'unresolved actor uses safe fallback');

const row: TimelineRow = {
  id: 'event-1',
  event_type: 'REVIEW_UPDATED',
  actor_profile_id: 'p1',
  payload: {
    changes: {
      title: { before: 'old', after: 'new' },
      email: { before: 'a@b.com', after: 'c@d.com' },
    },
  },
  version: 4,
  created_at: '2026-08-25T00:00:00Z',
};
const dto = buildTimelineDTO(row, [
  { profile_id: 'p1', display_name: '张三', role: 'admin', is_active: true },
]);
assert(dto.eventType === 'REVIEW_UPDATED' && dto.actor.displayName === '张三', 'DTO event and actor');
const dtoChangedFields = dto.details.changedFields as string[];
assert(dtoChangedFields.length === 1 && dtoChangedFields[0] === 'title', 'DTO details whitelisted');
assert(!('version' in dto) && !('payload' in dto) && !('actor_profile_id' in dto), 'DTO excludes raw fields');

assert(deepEqual(sanitizeTimelineDetails('REVIEW_SUBMITTED', {
  from_status: 'draft',
  to_status: 'submitted',
  reason: 'x',
  email: 'e@example.com',
  token: 't',
  secret: 's',
}), {}), 'REVIEW_SUBMITTED details empty');

assert(deepEqual(sanitizeTimelineDetails('REVIEW_CLOSED', {
  from_status: 'submitted',
  to_status: 'closed',
  owner_id: 'o',
  pmo_id: 'p',
}), {}), 'REVIEW_CLOSED details empty');

assert(deepEqual(sanitizeTimelineDetails('REVIEW_REOPENED', {
  from_status: 'submitted',
  to_status: 'draft',
  reason: 'should not expose',
}), { fromStatus: 'submitted' }), 'REVIEW_REOPENED submitted hides reason');

assert(deepEqual(sanitizeTimelineDetails('REVIEW_REOPENED', {
  from_status: 'closed',
  to_status: 'draft',
  reason: '  closed reason  ',
}), { fromStatus: 'closed', reason: 'closed reason' }), 'REVIEW_REOPENED closed trims reason');

assert(deepEqual(sanitizeTimelineDetails('REVIEW_REOPENED', {
  from_status: 'closed',
  reason: '   ',
}), { fromStatus: 'closed' }), 'REVIEW_REOPENED whitespace reason omitted');

assert(
  sanitizeTimelineDetails('REVIEW_REOPENED', {
    from_status: 'closed',
    reason: 'x'.repeat(1000),
  }).reason === 'x'.repeat(1000),
  'REVIEW_REOPENED exact 1000 reason accepted',
);

assert(
  !('reason' in sanitizeTimelineDetails('REVIEW_REOPENED', {
    from_status: 'closed',
    reason: 'x'.repeat(1001),
  })),
  'REVIEW_REOPENED oversized reason omitted',
);

for (const badReason of [123, {}, [], null, true]) {
  const sanitized = sanitizeTimelineDetails('REVIEW_REOPENED', {
    from_status: 'closed',
    reason: badReason,
  });
  assert(deepEqual(sanitized, { fromStatus: 'closed' }), 'REVIEW_REOPENED non-string reason omitted');
}

assert(deepEqual(sanitizeTimelineDetails('REVIEW_REOPENED', {
  from_status: 'approved_secret',
}), {}), 'REVIEW_REOPENED unknown from_status empty');

assert(deepEqual(sanitizeTimelineDetails('REVIEW_REOPENED', {}), {}), 'REVIEW_REOPENED missing from_status empty');
assert(deepEqual(sanitizeTimelineDetails('REVIEW_REOPENED', null), {}), 'REVIEW_REOPENED null payload empty');
assert(deepEqual(sanitizeTimelineDetails('REVIEW_REOPENED', ['x']), {}), 'REVIEW_REOPENED array payload empty');

const lifecycleSecretRow: TimelineRow = {
  id: 'event-secret',
  event_type: 'REVIEW_REOPENED',
  actor_profile_id: null,
  payload: {
    from_status: 'closed',
    to_status: 'draft',
    reason: 'QA reason',
    email: 'SECRET_EMAIL_MARKER',
    token: 'SECRET_TOKEN_MARKER',
    owner_id: 'SECRET_OWNER_MARKER',
    org_id: 'SECRET_ORG_MARKER',
    review_id: 'SECRET_REVIEW_MARKER',
    actor_profile_id: 'SECRET_ACTOR_MARKER',
  },
  version: 2,
  created_at: '2026-08-25T00:00:00Z',
};
const lifecycleSecretDto = buildTimelineDTO(lifecycleSecretRow, []);
const lifecycleSecretText = JSON.stringify(lifecycleSecretDto);
assert(deepEqual(lifecycleSecretDto.details, { fromStatus: 'closed', reason: 'QA reason' }), 'lifecycle DTO details whitelist');
for (const marker of [
  'SECRET_EMAIL_MARKER',
  'SECRET_TOKEN_MARKER',
  'SECRET_OWNER_MARKER',
  'SECRET_ORG_MARKER',
  'SECRET_REVIEW_MARKER',
  'SECRET_ACTOR_MARKER',
]) {
  assert(!lifecycleSecretText.includes(marker), 'lifecycle DTO excludes marker: ' + marker);
}
assert(!('version' in lifecycleSecretDto) && !('payload' in lifecycleSecretDto), 'lifecycle DTO top-level unchanged');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
