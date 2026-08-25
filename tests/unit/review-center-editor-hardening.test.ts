// ===== Review Center Editor Mutation Lock + Authority Hardening Tests =====
import {
  analyzeBasicFallbackRebase,
  basicInfoDirty,
  createEditorMutationLock,
  deriveEditorAuthority,
  diffBasicInfo,
  normalizeBasicInfo,
  type BasicInfoDraft,
  type EditorMe,
} from '../../src/lib/review-center/editor';
import {
  planTypeDetailsFallbackSync,
  TYPE_DETAILS_FALLBACK_SYNC_FAILURE_MESSAGE,
} from '../../src/lib/review-center/type-details-editor';
import type { ReviewDetail } from '../../src/lib/review-center/types';

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

function makeMe(role: EditorMe['role']): EditorMe {
  return {
    role,
    can_create_review: true,
    profile_id: '00000000-0000-0000-0000-000000000001',
  };
}

function makeDetail(overrides: Record<string, unknown> = {}): ReviewDetail {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    org_id: '00000000-0000-0000-0000-000000000020',
    review_no: 'REV-2026-000001',
    review_type: 'A',
    title: '测试复盘',
    status: 'draft',
    risk_level: 'RED',
    risk_reason: null,
    occurred_at: null,
    customer_name: null,
    order_no: null,
    project_name: null,
    product_name: null,
    process_name: null,
    description: null,
    impact_summary: null,
    created_by: '00000000-0000-0000-0000-000000000002',
    owner_id: '00000000-0000-0000-0000-000000000001',
    pmo_id: null,
    closed_at: null,
    closed_by: null,
    close_override_reason: null,
    report_generated_at: null,
    archived_at: null,
    version: 1,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    type_details: null,
    members: [],
    participants: [],
    ...overrides,
  } as any as ReviewDetail;
}

function makeBasicDraft(customerName: string, overrides: Partial<BasicInfoDraft> = {}) {
  return {
    title: '测试复盘',
    review_type: 'A' as const,
    occurred_at: '',
    customer_name: customerName,
    order_no: '',
    project_name: '',
    product_name: '',
    process_name: '',
    description: '',
    impact_summary: '',
    risk_level: '' as const,
    risk_reason: '',
    ...overrides,
  };
}

console.log('\n=== Review Center Editor Mutation Lock + Authority Hardening ===');

const lock = createEditorMutationLock();
assert(lock.acquire('basic') === true, 'no active mutation -> basic can start');
assert(lock.acquire('type-details') === false, 'basic active -> type details blocked');
assert(lock.acquire('basic') === false, 'same section duplicate blocked');
assert(lock.current() === 'basic', 'lock reports basic owner');
lock.release();
assert(lock.acquire('type-details') === true, 'after release -> type details can start');
assert(lock.acquire('basic') === false, 'type details active -> basic blocked');
lock.release();

const operator = makeMe('operator');
const draftOwner = makeDetail({ status: 'draft', owner_id: operator.profile_id });
assert(deriveEditorAuthority(draftOwner, operator).canEdit === true, 'draft owner permission true');

const submitted = deriveEditorAuthority(makeDetail({ status: 'submitted' }), operator);
assert(submitted.canEdit === false, 'latest non-draft disables editor');

const ownerChanged = deriveEditorAuthority(
  makeDetail({ owner_id: '00000000-0000-0000-0000-000000000099' }),
  operator,
);
assert(ownerChanged.canEdit === false, 'latest owner change loses operator permission');

const adminNonDraft = deriveEditorAuthority(makeDetail({ status: 'closed' }), makeMe('admin'));
assert(adminNonDraft.canEdit === false, 'admin cannot edit non-draft');

const locked = deriveEditorAuthority(makeDetail({ type_details: {} }), operator);
assert(locked.typeDetailsExists === true, 'latest type_details existence locks type');

const latestAuthority = deriveEditorAuthority(makeDetail({ review_type: 'C', version: 12 }), operator);
assert(latestAuthority.persistedReviewType === 'C', 'latest review_type used as persisted type');
assert(latestAuthority.version === 12, 'latest version used');

const latestDetail = makeDetail({
  version: 12,
  review_type: 'C',
  type_details: { root_cause_summary: '权威根因' },
});
const basicInitial = makeBasicDraft('服务器值');
const basicDraft = makeBasicDraft('尚未保存的草稿');
const plan = planTypeDetailsFallbackSync(latestDetail, basicInitial, basicDraft);
assert(plan.version === 12, 'fallback plan uses latest version');
assert(plan.detail.review_type === 'C' && plan.detail.status === 'draft', 'fallback plan uses latest detail snapshot');
assert(plan.initialTypeDetails.root_cause_summary === '权威根因', 'fallback plan rebuilds type details baseline');
assert(plan.basicDraft === basicDraft && plan.basicDraft.customer_name === '尚未保存的草稿', 'fallback plan preserves basic draft');
assert(plan.basicInitial === basicInitial, 'fallback plan does not rebase basic initial');
assert(TYPE_DETAILS_FALLBACK_SYNC_FAILURE_MESSAGE.includes('同步失败'), 'fallback failure message is controlled');

const conflictInitial = makeBasicDraft('Old');
const conflictDraft = makeBasicDraft('Local');
const conflictLatest = makeBasicDraft('Remote');
const conflictAnalysis = analyzeBasicFallbackRebase(conflictInitial, conflictDraft, conflictLatest);
assert(conflictAnalysis.localChangedFields.customer_name === 'Local', 'same-field conflict detects local change');
assert(conflictAnalysis.remoteChangedFields.customer_name === 'Remote', 'same-field conflict detects remote change');
assert(conflictAnalysis.conflictingFields.includes('customer_name'), 'same-field conflict reports overlapping field');
assert(conflictAnalysis.hasConflict === true, 'same-field conflict fails closed');
assert(conflictAnalysis.rebasedDraft.customer_name === 'Local', 'same-field conflict preserves local draft value');

const rebaseInitial = makeBasicDraft('A', { risk_reason: 'Old' });
const rebaseDraft = makeBasicDraft('Local', { risk_reason: 'Old' });
const rebaseLatest = makeBasicDraft('A', { risk_reason: 'Remote' });
const rebaseAnalysis = analyzeBasicFallbackRebase(rebaseInitial, rebaseDraft, rebaseLatest);
assert(rebaseAnalysis.hasConflict === false, 'non-overlapping remote change has no conflict');
assert(
  rebaseAnalysis.rebasedInitial.customer_name === 'A' && rebaseAnalysis.rebasedInitial.risk_reason === 'Remote',
  'remote-only fields sync to rebased initial',
);
assert(
  rebaseAnalysis.rebasedDraft.customer_name === 'Local' && rebaseAnalysis.rebasedDraft.risk_reason === 'Remote',
  'remote-only fields sync to draft while local dirty field is preserved',
);
const rebaseRemaining = diffBasicInfo(rebaseAnalysis.rebasedInitial, rebaseAnalysis.rebasedDraft);
assert(
  Object.keys(rebaseRemaining).length === 1 && rebaseRemaining.customer_name === 'Local',
  'only local dirty field remains in patch after safe rebase',
);

const localOnlyInitial = makeBasicDraft('Server');
const localOnlyDraft = makeBasicDraft('Local');
const localOnlyAnalysis = analyzeBasicFallbackRebase(localOnlyInitial, localOnlyDraft, localOnlyInitial);
assert(localOnlyAnalysis.hasConflict === false, 'local-only change has no conflict');
assert(localOnlyAnalysis.rebasedDraft.customer_name === 'Local', 'local-only change stays dirty');
assert(basicInfoDirty(localOnlyAnalysis.rebasedInitial, localOnlyAnalysis.rebasedDraft), 'local-only change remains editable');

const remoteOnlyInitial = makeBasicDraft('A');
const remoteOnlyLatest = makeBasicDraft('B', { risk_reason: 'New' });
const remoteOnlyAnalysis = analyzeBasicFallbackRebase(remoteOnlyInitial, remoteOnlyInitial, remoteOnlyLatest);
assert(remoteOnlyAnalysis.hasConflict === false, 'remote-only change has no conflict');
assert(
  remoteOnlyAnalysis.rebasedInitial.customer_name === 'B' && remoteOnlyAnalysis.rebasedInitial.risk_reason === 'New',
  'remote-only change syncs to rebased initial',
);
assert(
  remoteOnlyAnalysis.rebasedDraft.customer_name === 'B' && remoteOnlyAnalysis.rebasedDraft.risk_reason === 'New',
  'remote-only change syncs to rebased draft',
);
assert(!basicInfoDirty(remoteOnlyAnalysis.rebasedInitial, remoteOnlyAnalysis.rebasedDraft), 'remote-only change leaves clean baseline');

const partialInitial = makeBasicDraft('A', { description: 'Base', risk_reason: 'X' });
const partialDraft = makeBasicDraft('Local', { description: 'Local Desc', risk_reason: 'X' });
const partialLatest = makeBasicDraft('A', { description: 'Remote Desc', risk_reason: 'Remote' });
const partialAnalysis = analyzeBasicFallbackRebase(partialInitial, partialDraft, partialLatest);
assert(partialAnalysis.hasConflict === true, 'partial overlap still fails closed');
assert(
  partialAnalysis.conflictingFields.length === 1 && partialAnalysis.conflictingFields[0] === 'description',
  'partial overlap reports only intersecting field',
);
assert(!partialAnalysis.conflictingFields.includes('customer_name'), 'non-overlapping local field not reported as conflict');
assert(partialAnalysis.rebasedDraft.customer_name === 'Local', 'partial conflict keeps local draft for review');

const nullInitial = normalizeBasicInfo(makeDetail({ customer_name: null, risk_level: null }));
const nullLatest = normalizeBasicInfo(makeDetail({ customer_name: '', risk_level: '' }));
const nullAnalysis = analyzeBasicFallbackRebase(nullInitial, nullInitial, nullLatest);
assert(!('customer_name' in nullAnalysis.remoteChangedFields), 'null and empty customer normalize without remote change');
assert(!('risk_level' in nullAnalysis.remoteChangedFields), 'null and empty risk level normalize without remote change');
assert(nullAnalysis.hasConflict === false, 'normalized null/empty does not create false conflict');

const datetimeInitial = normalizeBasicInfo(makeDetail({ occurred_at: '2026-08-01T00:00:00.000Z' }));
const datetimeLatest = normalizeBasicInfo(makeDetail({ occurred_at: '2026-08-01T00:00:00Z' }));
const datetimeAnalysis = analyzeBasicFallbackRebase(datetimeInitial, datetimeInitial, datetimeLatest);
assert(!('occurred_at' in datetimeAnalysis.remoteChangedFields), 'equivalent datetime formats do not create remote change');
assert(datetimeAnalysis.hasConflict === false, 'datetime display normalization does not create false conflict');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
