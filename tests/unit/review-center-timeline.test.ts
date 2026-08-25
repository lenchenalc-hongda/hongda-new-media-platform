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

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
