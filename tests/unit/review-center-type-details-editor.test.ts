// ===== Review Center Type Details Editor Pure Helper Tests =====
import {
  buildAdditionalNotes,
  classifyTypeDetailsMutationResponse,
  diffTypeDetails,
  extractTypeDetailsSaveResult,
  getReviewTypeChangeBlockReason,
  getVisibleTypeDetailFields,
  isTypeDetailsDirty,
  normalizeTypeDetails,
  rebuildTypeDetailsBaseline,
  shouldBlockReviewTypeSaveForDirtyDetails,
  typeDetailsSaveBlockedByBasic,
  validateNoteRows,
  TYPE_DETAIL_GROUPS,
  type TypeDetailsDraft,
} from '../../src/lib/review-center/type-details-editor';

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

function emptyDraft(): TypeDetailsDraft {
  return normalizeTypeDetails(null);
}

console.log('\n=== Review Center Type Details Editor Pure Helpers ===');

const aFields = getVisibleTypeDetailFields('A');
const bFields = getVisibleTypeDetailFields('B');
const cFields = getVisibleTypeDetailFields('C');
assert(aFields.includes('pre_production_stage') && aFields.includes('customer_notified'), 'A includes common+A fields');
assert(!aFields.includes('abnormal_phase'), 'A excludes B fields');
assert(bFields.includes('abnormal_phase') && bFields.includes('defect_rate'), 'B includes common+B fields');
assert(!bFields.includes('frontend_stage'), 'B excludes C fields');
assert(cFields.includes('pre_production_stage') && cFields.includes('abnormal_phase') && cFields.includes('improvement_advice'), 'C includes A+B+C fields');

const clean = emptyDraft();
assert(clean.pre_production_stage === '' && clean.customer_notified === '' && clean.defect_rate === '' && clean.noteRows.length === 0, 'null details -> clean initial draft');

const existing = normalizeTypeDetails({
  additional_notes: { note: 'hello', complex: { a: 1 } },
  pre_production_stage: '阶段A',
  customer_notified: true,
  defect_rate: 12.5,
});
assert(existing.noteRows.length === 1 && existing.noteRows[0].key === 'note', 'string note editable row');
assert(!!(existing.preservedNotes.complex && typeof existing.preservedNotes.complex === 'object'), 'complex note preserved');
assert(existing.customer_notified === 'true' && existing.defect_rate === '12.5', 'existing values normalized to UI strings');

const oneChanged = diffTypeDetails(clean, { ...clean, root_cause_summary: '根因' });
assert(oneChanged.valid && Object.keys(oneChanged.patch).length === 1 && oneChanged.patch.root_cause_summary === '根因', 'one text change -> one patch field');

const cleared = diffTypeDetails(
  normalizeTypeDetails({ pre_production_stage: '旧值' }),
  emptyDraft(),
);
assert(cleared.valid && cleared.patch.pre_production_stage === null, 'clear text -> null');

const booleanTrue = diffTypeDetails(clean, { ...clean, customer_notified: 'true' });
assert(booleanTrue.valid && booleanTrue.patch.customer_notified === true, 'boolean null -> true');
const booleanFalse = diffTypeDetails(clean, { ...clean, customer_notified: 'false' });
assert(booleanFalse.valid && booleanFalse.patch.customer_notified === false, 'boolean null -> false');
const booleanClear = diffTypeDetails(
  normalizeTypeDetails({ customer_notified: false }),
  emptyDraft(),
);
assert(booleanClear.valid && booleanClear.patch.customer_notified === null, 'boolean false -> null clear');

const numberEmpty = diffTypeDetails(normalizeTypeDetails({ defect_rate: 5 }), emptyDraft());
assert(numberEmpty.valid && numberEmpty.patch.defect_rate === null, 'number empty -> null not 0');
const numberValue = diffTypeDetails(clean, { ...clean, defect_rate: '12.5' });
assert(numberValue.valid && numberValue.patch.defect_rate === 12.5, 'number string -> number');
const numberInvalid = diffTypeDetails(clean, { ...clean, defect_rate: 'abc' });
assert(!numberInvalid.valid && numberInvalid.error === '缺陷率格式无效', 'invalid number blocked');

assert(isTypeDetailsDirty(emptyDraft(), emptyDraft()) === false, 'initial empty -> no dirty');
const noteChanged = diffTypeDetails(clean, { ...clean, noteRows: [{ key: 'k', value: 'v' }] });
assert(!!(noteChanged.valid && noteChanged.patch.additional_notes && (noteChanged.patch.additional_notes as Record<string, unknown>).k === 'v'), 'string note editable');

const complexDraft = { ...existing, root_cause_summary: '新根因' };
const complexDiff = diffTypeDetails(existing, complexDraft);
assert(complexDiff.valid && !Object.prototype.hasOwnProperty.call(complexDiff.patch, 'additional_notes'), 'saving other field does not touch notes');
assert(existing.preservedNotes.complex !== undefined, 'complex note still preserved');

const removedString = diffTypeDetails(
  normalizeTypeDetails({ additional_notes: { a: '1', b: '2', complex: { x: 1 } } }),
  normalizeTypeDetails({ additional_notes: { a: '1', complex: { x: 1 } } }),
);
assert(!!(
  removedString.valid
    && (removedString.patch.additional_notes as Record<string, unknown>).a === '1'
    && !Object.prototype.hasOwnProperty.call(removedString.patch.additional_notes as Record<string, unknown>, 'b')
    && ((removedString.patch.additional_notes as Record<string, unknown>).complex as any).x === 1
), 'removing string note keeps other string and complex notes');

const duplicate = diffTypeDetails(emptyDraft(), {
  ...emptyDraft(),
  noteRows: [{ key: 'x', value: '1' }, { key: 'x', value: '2' }],
});
assert(!duplicate.valid && duplicate.error === '补充说明存在重复键', 'duplicate note key blocked');

const blankKey = diffTypeDetails(emptyDraft(), {
  ...emptyDraft(),
  noteRows: [{ key: '  ', value: '1' }],
});
assert(!blankKey.valid && blankKey.error === '补充说明的键不能为空', 'blank note key blocked');

const allRemoved = diffTypeDetails(
  normalizeTypeDetails({ additional_notes: { a: '1', b: '2' } }),
  emptyDraft(),
);
assert(!!(
  allRemoved.valid
    && allRemoved.patch.additional_notes
    && Object.keys(allRemoved.patch.additional_notes as Record<string, unknown>).length === 0
), 'all string notes removed -> {}');

const notesUnchanged = diffTypeDetails(existing, { ...existing });
assert(notesUnchanged.valid && !Object.prototype.hasOwnProperty.call(notesUnchanged.patch, 'additional_notes'), 'notes unchanged -> no notes patch');

assert(typeDetailsSaveBlockedByBasic({ basicInfoDirty: true, persistedReviewType: 'A', draftReviewType: 'C' }) === true, 'unsaved basic review_type change blocks details');
assert(typeDetailsSaveBlockedByBasic({ basicInfoDirty: false, persistedReviewType: 'A', draftReviewType: 'A' }) === false, 'saved review_type does not block details');

assert(shouldBlockReviewTypeSaveForDirtyDetails({ persistedReviewType: 'A', draftReviewType: 'C', typeDetailsDirty: true }) === true, 'dirty details blocks basic review_type save');
assert(getReviewTypeChangeBlockReason({ persistedReviewType: 'A', draftReviewType: 'C', typeDetailsDirty: true }) !== null, 'block reason returned when blocked');
assert(getReviewTypeChangeBlockReason({ persistedReviewType: 'A', draftReviewType: 'A', typeDetailsDirty: true }) === null, 'same review_type not blocked');
assert(getReviewTypeChangeBlockReason({ persistedReviewType: 'A', draftReviewType: 'C', typeDetailsDirty: false }) === null, 'clean details does not block review_type change');

const savedResult = extractTypeDetailsSaveResult({ data: { version: 11, type_details: null } });
assert(savedResult !== null && savedResult.version === 11, 'success version from response data');
assert(savedResult !== null && savedResult.version === 11, 'no client-side +1');
const savedRowResult = extractTypeDetailsSaveResult({
  data: { version: 12, type_details: { root_cause_summary: 'x' } },
});
assert(savedRowResult !== null && savedRowResult.typeDetails !== null, 'authoritative details row returned');

const baseline = rebuildTypeDetailsBaseline(null);
assert(baseline.initial.noteRows.length === 0 && baseline.draft.noteRows.length === 0, 'success baseline resets type details draft');
assert(validateNoteRows([{ key: 'a', value: '1' }]) === null, 'valid note rows accepted');
const built = buildAdditionalNotes([{ key: 'a', value: '1' }], { complex: [1, 2] });
assert(built !== null && built.complex !== undefined, 'complex values merged into notes object');

assert(validateNoteRows([{ key: 'score', value: 'hello' }], { score: 8 }) === '补充说明存在重复键', 'editable key collides with preserved key');
assert(validateNoteRows([{ key: ' score ', value: 'hello' }], { score: 8 }) === '补充说明存在重复键', 'trimmed editable key collides with preserved key');
assert(validateNoteRows([{ key: 'meta', value: 'text' }], { meta: { x: 1 } }) === '补充说明存在重复键', 'object preserved key collision blocked');
assert(validateNoteRows([{ key: 'approved', value: 'yes' }], { approved: false }) === '补充说明存在重复键', 'boolean preserved key collision blocked');
assert(validateNoteRows([{ key: 'other', value: 'x' }], { score: 8 }) === null, 'different editable and preserved keys allowed');
assert(buildAdditionalNotes([{ key: 'score', value: 'hello' }], { score: 8 }) === null, 'build blocks editable/preserved collision');
const preservedBuild = buildAdditionalNotes([{ key: 'other', value: 'x' }], { score: 8, approved: false, meta: { x: 1 } });
assert(
  preservedBuild !== null
    && preservedBuild.score === 8
    && preservedBuild.approved === false
    && (preservedBuild.meta as any).x === 1,
  'complex preserved values keep original types',
);

const zeroDefect = diffTypeDetails(clean, { ...clean, defect_rate: '0' });
assert(zeroDefect.valid && zeroDefect.patch.defect_rate === 0, 'defect rate zero valid');

assert(classifyTypeDetailsMutationResponse(409, { code: 'VERSION_CONFLICT' }).state === 'conflict', 'VERSION_CONFLICT -> global conflict');
assert(classifyTypeDetailsMutationResponse(409, { code: 'TYPE_MISMATCH' }).state === 'reload_required', 'TYPE_MISMATCH -> reload required');
assert(classifyTypeDetailsMutationResponse(409, { code: 'DRAFT_ONLY' }).state === 'non_editable', 'DRAFT_ONLY -> editor disabled');
assert(classifyTypeDetailsMutationResponse(403, { code: 'FORBIDDEN' }).state === 'forbidden', 'FORBIDDEN -> editor disabled');
const validation = classifyTypeDetailsMutationResponse(400, { code: 'INVALID_PATCH' });
assert(validation.state === 'validation' && validation.message === '请检查专项复盘内容后重试。', '400 safe message');
const generic = classifyTypeDetailsMutationResponse(500, { code: 'RAW_DB_CODE' });
assert(generic.state === 'error' && generic.message === '专项内容保存失败，请稍后重试。', '500 generic message');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
