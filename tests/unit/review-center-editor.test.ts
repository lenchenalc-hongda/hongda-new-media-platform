// ===== Review Center Editor Shell Pure Helper Tests =====
import {
  basicInfoDirty,
  canEditDraft,
  classifyEditorDetailLoadStatus,
  classifyMutationResponse,
  diffBasicInfo,
  extractMutationVersion,
  fromDateTimeLocal,
  isReviewTypeLocked,
  normalizeBasicInfo,
  toDateTimeLocal,
} from '../../src/lib/review-center/editor';

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

const profileA = '00000000-0000-0000-0000-000000000001';
const profileB = '00000000-0000-0000-0000-000000000002';

function draftInput(overrides: Record<string, unknown> = {}) {
  return {
    role: 'admin' as const,
    status: 'draft' as const,
    currentProfileId: profileA,
    ownerId: profileA,
    pmoId: null,
    ...overrides,
  };
}

function detailInput(overrides: Record<string, unknown> = {}) {
  return {
    title: '标题',
    review_type: 'A' as const,
    occurred_at: '2026-08-19T02:30:00.000Z',
    customer_name: '客户A',
    order_no: 'PO-001',
    project_name: '项目A',
    product_name: '产品A',
    process_name: '工艺A',
    description: '描述',
    impact_summary: '影响',
    risk_level: 'RED' as const,
    risk_reason: '原因',
    version: 1,
    ...overrides,
  };
}

console.log('\n=== Review Center Editor Shell Pure Helpers ===');

assert(canEditDraft(draftInput()), 'admin + draft can edit');
assert(canEditDraft(draftInput({ role: 'manager' })), 'manager + draft can edit');
assert(canEditDraft(draftInput({ role: 'operator' })), 'owner + non-viewer + draft can edit');
assert(canEditDraft(draftInput({ role: 'sales', currentProfileId: profileB, pmoId: profileB })), 'pmo + non-viewer + draft can edit');
assert(!canEditDraft(draftInput({ role: 'operator', currentProfileId: profileB })), 'ordinary member cannot edit');
assert(!canEditDraft(draftInput({ role: 'viewer', currentProfileId: profileA })), 'viewer cannot edit even when owner');
assert(!canEditDraft(draftInput({ status: 'submitted' })), 'non-draft admin cannot edit');

assert(!isReviewTypeLocked(null), 'type_details null -> unlocked');
assert(isReviewTypeLocked({}), 'type_details row exists -> locked');
assert(classifyEditorDetailLoadStatus(401) === 'AUTH_REQUIRED', 'detail 401 -> auth required');
assert(classifyEditorDetailLoadStatus(403) === 'FORBIDDEN', 'detail 403 -> forbidden');
assert(classifyEditorDetailLoadStatus(404) === 'NOT_FOUND', 'detail 404 -> not found');
assert(classifyEditorDetailLoadStatus(500) === 'GENERIC_LOAD_ERROR', 'detail 500 -> generic load error');

const baseDetail = detailInput();
const initial = normalizeBasicInfo(baseDetail as any);
assert(Object.keys(diffBasicInfo(initial, { ...initial })).length === 0, 'no changes -> empty patch');

const singlePatch = diffBasicInfo(initial, { ...initial, title: '新标题' });
assert(Object.keys(singlePatch).length === 1 && singlePatch.title === '新标题', 'single changed field only');

const multiPatch = diffBasicInfo(initial, {
  ...initial,
  title: '新标题',
  customer_name: '客户B',
  risk_level: 'GREEN',
});
assert(Object.keys(multiPatch).length === 3, 'multiple changed fields only');
assert(multiPatch.title === '新标题' && multiPatch.customer_name === '客户B' && multiPatch.risk_level === 'GREEN', 'changed patch values correct');

const clearPatch = diffBasicInfo(initial, { ...initial, customer_name: '' });
assert(clearPatch.customer_name === null, 'clearing nullable string sends null');

const versionTwo = normalizeBasicInfo({ ...baseDetail, version: 2 } as any);
assert(!basicInfoDirty(initial, versionTwo), 'version change does not make basic info dirty');

const iso = fromDateTimeLocal('2026-08-19T10:30');
assert(iso !== null, 'datetime-local converts to ISO');
assert(toDateTimeLocal(iso) === '2026-08-19T10:30', 'datetime ISO -> local roundtrip');
assert(fromDateTimeLocal('') === null, 'empty datetime clears to null');

const conflict = classifyMutationResponse(409, { code: 'VERSION_CONFLICT' });
assert(conflict.state === 'conflict', 'VERSION_CONFLICT -> conflict state');
const draftOnly = classifyMutationResponse(409, { code: 'DRAFT_ONLY' });
assert(draftOnly.state === 'non_editable', 'DRAFT_ONLY -> non-editable state');
const typeMismatch = classifyMutationResponse(409, { code: 'TYPE_MISMATCH' });
assert(typeMismatch.state === 'reload_required', 'TYPE_MISMATCH -> reload-required state');
const forbidden = classifyMutationResponse(403, { code: 'FORBIDDEN' });
assert(forbidden.state === 'forbidden', 'FORBIDDEN -> forbidden state');
const generic = classifyMutationResponse(500, { code: 'RAW_DB_CODE' });
assert(generic.state === 'error', 'generic 500 -> error state');
assert(extractMutationVersion({ data: { version: 4 } }) === 4, 'success version extracted from response data');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
