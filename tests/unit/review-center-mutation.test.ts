// ===== Review Center Draft Mutation API Unit Tests =====
import {
  addMemberRequestSchema,
  assignmentsRequestSchema,
  expectedVersionRequestSchema,
  memberRoleSchema,
  reviewIdSchema,
  reviewMemberIdSchema,
  typeDetailsPatchSchema,
  updateDraftRequestSchema,
} from '../../src/lib/review-center/schemas';
import {
  addReviewMember,
  mapReviewMutationResult,
  removeReviewMember,
  setDraftAssignments,
  setPrimaryMember,
  updateDraftReview,
  upsertTypeDetails,
} from '../../src/lib/review-center/mutation';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

const uuid = '00000000-0000-0000-0000-000000000000';

function envelope(code: string, ok = false) {
  return { data: { ok, code, message: 'm', data: null }, error: null };
}

console.log('\n=== Review Center Draft Mutation API ===');

assert(!reviewIdSchema.safeParse({ id: 'abc' }).success, 'invalid review uuid rejected');
assert(reviewIdSchema.safeParse({ id: uuid }).success, 'valid review uuid accepted');

assert(!updateDraftRequestSchema.safeParse({ expectedVersion: 0, patch: { title: 'x' } }).success, 'expectedVersion 0 rejected');
assert(updateDraftRequestSchema.safeParse({ expectedVersion: 1, patch: { title: 'x' } }).success, 'valid update request accepted');
assert(!updateDraftRequestSchema.safeParse({ expectedVersion: 1, patch: { title: 'x', extra: 1 } }).success, 'unknown patch field rejected');

const systemFields = [
  'org_id',
  'status',
  'version',
  'review_no',
  'owner_id',
  'pmo_id',
  'created_by',
  'closed_at',
  'archived_at',
];
for (const field of systemFields) {
  assert(
    !updateDraftRequestSchema.safeParse({ expectedVersion: 1, patch: { [field]: uuid } }).success,
    'system field rejected: ' + field,
  );
}

for (const value of [[], 'abc', 123, true, false]) {
  assert(
    !typeDetailsPatchSchema.safeParse({ additional_notes: value }).success,
    'invalid additional_notes rejected: ' + JSON.stringify(value),
  );
}
assert(typeDetailsPatchSchema.safeParse({ additional_notes: {} }).success, 'empty object accepted');
assert(typeDetailsPatchSchema.safeParse({ additional_notes: null }).success, 'null additional_notes accepted');
assert(typeDetailsPatchSchema.safeParse({ additional_notes: { a: 1 } }).success, 'object additional_notes accepted');

assert(memberRoleSchema.safeParse('QUALITY').success, 'valid member role accepted');
assert(!memberRoleSchema.safeParse('PM').success, 'PM role rejected');
assert(!addMemberRequestSchema.safeParse({ expectedVersion: 1, profileId: 'abc', memberRole: 'QUALITY' }).success, 'invalid profile uuid rejected');
assert(addMemberRequestSchema.safeParse({ expectedVersion: 1, profileId: uuid, memberRole: 'QUALITY' }).success, 'valid add member accepted');

assert(!expectedVersionRequestSchema.safeParse({ expectedVersion: 0 }).success, 'expected version request rejects 0');
assert(expectedVersionRequestSchema.safeParse({ expectedVersion: 2 }).success, 'expected version request accepts 2');
assert(!reviewMemberIdSchema.safeParse({ id: uuid, memberId: 'abc' }).success, 'invalid member uuid rejected');
assert(reviewMemberIdSchema.safeParse({ id: uuid, memberId: uuid }).success, 'valid member params accepted');

assert(!assignmentsRequestSchema.safeParse({ expectedVersion: 1, ownerId: 'abc' }).success, 'invalid owner uuid rejected');
assert(!assignmentsRequestSchema.safeParse({ expectedVersion: 1 }).success, 'missing owner rejected');
assert(assignmentsRequestSchema.safeParse({ expectedVersion: 1, ownerId: uuid, pmoId: null }).success, 'null pmo accepted');
assert(assignmentsRequestSchema.safeParse({ expectedVersion: 1, ownerId: uuid }).success, 'optional pmo accepted');

assert(mapReviewMutationResult(envelope('OK', true)).status === 200, 'OK -> 200');
assert(mapReviewMutationResult(envelope('INVALID_PATCH')).status === 400, 'INVALID_PATCH -> 400');
assert(mapReviewMutationResult(envelope('INVALID_MEMBER')).status === 400, 'INVALID_MEMBER -> 400');
assert(mapReviewMutationResult(envelope('FORBIDDEN')).status === 403, 'FORBIDDEN -> 403');
assert(mapReviewMutationResult(envelope('NOT_FOUND')).status === 404, 'NOT_FOUND -> 404');
assert(mapReviewMutationResult(envelope('DRAFT_ONLY')).status === 409, 'DRAFT_ONLY -> 409');
assert(mapReviewMutationResult(envelope('VERSION_CONFLICT')).status === 409, 'VERSION_CONFLICT -> 409');
assert(mapReviewMutationResult(envelope('TYPE_MISMATCH')).status === 409, 'TYPE_MISMATCH -> 409');
assert(mapReviewMutationResult(envelope('UNIQUE_CONFLICT')).status === 409, 'UNIQUE_CONFLICT -> 409');
assert(mapReviewMutationResult(envelope('UNKNOWN_CODE')).status === 500, 'unknown code -> 500');
assert(mapReviewMutationResult({ data: null, error: { code: 'PGRST301' } }).status === 500, 'rpc error -> 500');
assert(mapReviewMutationResult({ data: null, error: null }).status === 500, 'missing envelope -> 500');

async function runServiceMappingTests() {
  const calls: Array<{ name: string; args: any }> = [];
  const client: any = {
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return envelope('OK', true);
    },
  };

  await updateDraftReview(client, uuid, 1, { title: 'x' });
  await upsertTypeDetails(client, uuid, 2, { additional_notes: {} });
  await addReviewMember(client, uuid, 3, uuid, 'QUALITY');
  await removeReviewMember(client, uuid, 4, uuid);
  await setPrimaryMember(client, uuid, 5, uuid);
  await setDraftAssignments(client, uuid, 6, uuid, null);

  assert(calls.length === 6, 'six rpc calls made');
  assert(calls[0].name === 'review_update_draft_public' && calls[0].args.p_review_id === uuid, 'public rpc mapping');
  assert(calls[1].name === 'review_upsert_type_details' && calls[1].args.p_expected_version === 2, 'details rpc mapping');
  assert(calls[2].name === 'review_add_member' && calls[2].args.p_member_role === 'QUALITY', 'add member rpc mapping');
  assert(calls[3].name === 'review_remove_member' && calls[3].args.p_member_id === uuid, 'remove member rpc mapping');
  assert(calls[4].name === 'review_set_primary_member' && calls[4].args.p_member_id === uuid, 'primary rpc mapping');
  assert(calls[5].name === 'review_set_draft_assignments' && calls[5].args.p_pmo_profile_id === null, 'assignments rpc mapping');
}

runServiceMappingTests().then(() => {
  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
  if (failed > 0) process.exitCode = 1;
}).catch(err => {
  console.error('Mutation tests crashed:', String(err?.message || err));
  process.exit(1);
});
