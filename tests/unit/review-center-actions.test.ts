// ===== Review Center Action Read DTO Unit Tests =====
import type { ReviewParticipant } from '../../src/lib/review-center/types';
import {
  ActionReadError,
  mapActionRowToDto,
  type ActionReadDto,
} from '../../src/lib/review-center/actions';

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

const OWNER_ID = '00000000-0000-0000-0000-000000000001';
const CREATED_BY_ID = '00000000-0000-0000-0000-000000000002';
const VERIFIER_ID = '00000000-0000-0000-0000-000000000003';
const ACTION_ID = '00000000-0000-0000-0000-000000000004';

function participant(id: string, overrides: Partial<ReviewParticipant> = {}): ReviewParticipant {
  return {
    profile_id: id,
    display_name: id === OWNER_ID ? '负责人' : '验证人',
    role: 'admin',
    department: null,
    is_active: true,
    ...overrides,
  };
}

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTION_ID,
    review_id: '00000000-0000-0000-0000-000000000005',
    org_id: '00000000-0000-0000-0000-000000000006',
    sequence: 1,
    title: 'QA ACTION',
    description: 'full description',
    action_type: 'CORRECTIVE',
    status: 'OPEN',
    due_date: '2026-08-26',
    owner_profile_id: OWNER_ID,
    created_by_profile_id: CREATED_BY_ID,
    completion_note: null,
    verification_note: null,
    verified_by_profile_id: null,
    completed_at: null,
    verified_at: null,
    cancelled_at: null,
    cancel_reason: null,
    version: 1,
    created_at: '2026-08-25T00:00:00Z',
    updated_at: '2026-08-25T00:00:00Z',
    ...overrides,
  };
}

const participants = [
  participant(OWNER_ID),
  participant(CREATED_BY_ID, { display_name: '创建人' }),
  participant(VERIFIER_ID, { display_name: '验证人', is_active: false }),
];

const now = new Date('2026-08-25T16:01:00Z');

console.log('\n=== Review Center Action Read DTO ===');

const openDto = mapActionRowToDto(baseRow(), participants, now);
assert(openDto.id === ACTION_ID, 'action id returned');
assert(openDto.sequence === 1 && openDto.version === 1, 'sequence and version returned');
assert(openDto.title === 'QA ACTION' && openDto.description === 'full description', 'title and full description returned');
assert(openDto.actionType === 'CORRECTIVE' && openDto.status === 'OPEN', 'type/status mapped');
assert(openDto.dueDate === '2026-08-26', 'dueDate YYYY-MM-DD');
assert(openDto.isOverdue === false, 'OPEN today not overdue');
assert(openDto.owner.profileId === OWNER_ID && openDto.owner.displayName === '负责人', 'owner safe profile');
assert(openDto.createdBy.profileId === CREATED_BY_ID && openDto.createdBy.displayName === '创建人', 'createdBy safe profile');
assert(openDto.verifiedBy === null && openDto.verifiedAt === null, 'OPEN verified metadata null');
assert(openDto.completedAt === null && openDto.cancelledAt === null && openDto.cancelReason === null, 'OPEN status metadata null');
assert(openDto.completionNote === null && openDto.verificationNote === null, 'OPEN notes null');

const verifiedDto = mapActionRowToDto(baseRow({
  status: 'VERIFIED',
  verified_by_profile_id: VERIFIER_ID,
  verified_at: '2026-08-26T01:00:00Z',
  completed_at: '2026-08-25T10:00:00Z',
  completion_note: 'done',
  verification_note: 'ok',
}), participants, now);
assert(verifiedDto.status === 'VERIFIED', 'verified status');
assert(verifiedDto.verifiedBy?.profileId === VERIFIER_ID && verifiedDto.verifiedBy.isActive === false, 'inactive verifier preserved');
assert(verifiedDto.verifiedAt === '2026-08-26T01:00:00Z' && verifiedDto.completedAt === '2026-08-25T10:00:00Z', 'verified metadata mapped');
assert(verifiedDto.cancelledAt === null && verifiedDto.cancelReason === null, 'verified cancel metadata null');
assert(verifiedDto.completionNote === 'done' && verifiedDto.verificationNote === 'ok', 'verified notes returned');

const cancelledDto = mapActionRowToDto(baseRow({
  status: 'CANCELLED',
  cancelled_at: '2026-08-26T02:00:00Z',
  cancel_reason: 'cancelled',
  completion_note: 'historical completion',
  verification_note: 'historical verification',
}), participants, now);
assert(cancelledDto.status === 'CANCELLED', 'cancelled status');
assert(cancelledDto.cancelledAt === '2026-08-26T02:00:00Z' && cancelledDto.cancelReason === 'cancelled', 'cancel metadata mapped');
assert(cancelledDto.completedAt === null && cancelledDto.verifiedAt === null && cancelledDto.verifiedBy === null, 'cancel clears completed/verified');
assert(cancelledDto.completionNote === 'historical completion' && cancelledDto.verificationNote === 'historical verification', 'cancel preserves history notes');

const pendingDto = mapActionRowToDto(baseRow({
  status: 'PENDING_VERIFICATION',
  completed_at: '2026-08-25T10:00:00Z',
  completion_note: 'submitted note',
  verification_note: 'old return reason',
}), participants, now);
assert(pendingDto.status === 'PENDING_VERIFICATION' && pendingDto.completedAt === '2026-08-25T10:00:00Z', 'pending completedAt mapped');
assert(pendingDto.verificationNote === 'old return reason', 'pending preserves return feedback');

const unknownStatusDto = mapActionRowToDto(baseRow({
  status: 'SECRET_STATUS_MARKER',
  completed_at: '2026-08-25T10:00:00Z',
  verified_at: '2026-08-25T11:00:00Z',
  cancelled_at: '2026-08-25T12:00:00Z',
  cancel_reason: 'raw cancel',
  completion_note: 'kept note',
  verification_note: 'kept verification',
}), participants, now);
assert(unknownStatusDto.status === 'UNKNOWN', 'unknown status fallback UNKNOWN');
assert(unknownStatusDto.completedAt === null && unknownStatusDto.verifiedAt === null && unknownStatusDto.cancelledAt === null, 'unknown status metadata null');
assert(unknownStatusDto.verifiedBy === null && unknownStatusDto.cancelReason === null, 'unknown status identity null');
assert(unknownStatusDto.completionNote === 'kept note' && unknownStatusDto.verificationNote === 'kept verification', 'unknown status notes preserved');

const unknownTypeDto = mapActionRowToDto(baseRow({ action_type: 'SECRET_TYPE_MARKER' }), participants, now);
assert(unknownTypeDto.actionType === 'UNKNOWN', 'unknown action type fallback UNKNOWN');

const unresolvedDto = mapActionRowToDto(baseRow({ owner_profile_id: '00000000-0000-0000-0000-000000000099' }), participants, now);
assert(unresolvedDto.owner.profileId === '00000000-0000-0000-0000-000000000099', 'unresolved profileId preserved');
assert(unresolvedDto.owner.displayName === '历史人员', 'unresolved fallback display');
assert(unresolvedDto.owner.role === null && unresolvedDto.owner.department === null && unresolvedDto.owner.isActive === false, 'unresolved fallback fields');
assert(!unresolvedDto.owner.displayName.includes('00000000'), 'raw UUID not used as display name');

const unresolvedVerifier = mapActionRowToDto(baseRow({
  status: 'VERIFIED',
  verified_by_profile_id: '00000000-0000-0000-0000-000000000098',
  verified_at: '2026-08-26T01:00:00Z',
  completed_at: '2026-08-25T10:00:00Z',
}), participants, now);
assert(unresolvedVerifier.verifiedBy?.displayName === '历史人员', 'unresolved verifier fallback');

const rawDto = mapActionRowToDto(baseRow({
  email: 'SECRET_EMAIL_MARKER',
  user_id: 'SECRET_USER_MARKER',
  token: 'SECRET_TOKEN_MARKER',
  secret: 'SECRET_SECRET_MARKER',
}), participants, now);
const rawText = JSON.stringify(rawDto);
assert(!rawText.includes('SECRET_EMAIL_MARKER') && !rawText.includes('SECRET_USER_MARKER'), 'email/user markers excluded');
assert(!rawText.includes('SECRET_TOKEN_MARKER') && !rawText.includes('SECRET_SECRET_MARKER'), 'token/secret markers excluded');
assert(!('org_id' in rawDto) && !('review_id' in rawDto), 'org_id/review_id not in DTO');
assert(!('owner_profile_id' in rawDto) && !('created_by_profile_id' in rawDto) && !('verified_by_profile_id' in rawDto), 'raw profile ids not top-level');
assert(rawDto.description === 'full description', 'description remains allowed business content');

function expectMalformed(row: any, msg: string) {
  let caught: any = null;
  try {
    mapActionRowToDto(row, participants, now);
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof ActionReadError && caught.status === 500, msg);
}

expectMalformed(baseRow({ sequence: 0 }), 'bad sequence malformed');
expectMalformed(baseRow({ version: 0 }), 'bad version malformed');
expectMalformed(baseRow({ due_date: '2026-99-99' }), 'bad due_date malformed');
expectMalformed(baseRow({ id: 'not-uuid' }), 'missing id malformed');
expectMalformed(baseRow({ title: 123 }), 'bad title malformed');
expectMalformed(baseRow({ created_at: null }), 'missing created_at malformed');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
