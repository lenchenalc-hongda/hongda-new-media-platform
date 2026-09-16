// ===== Review Center Metadata Editor + Presentation Tests =====
import {
  buildMetadataMutationPayload,
  canEditMetadata,
  createMetadataEditorState,
  hasProcessRequirement,
  isMetadataEditorDirty,
  setPrimaryMaterial,
  toggleProblemDomain,
  toggleProcess,
  toggleSecondaryMaterial,
} from '../../src/lib/review-center/metadata-editor';
import {
  buildMissingDimensionsQuery,
  missingDimensionLabel,
} from '../../src/lib/review-center/metadata';
import { classifyLifecycleError } from '../../src/lib/review-center/lifecycle-presentation';
import { formatAuditEvent } from '../../src/lib/review-center/audit-presentation';
import { formatTimelineEvent } from '../../src/lib/review-center/timeline-presentation';
import type { ReviewMetadataDto } from '../../src/lib/review-center/types';
import type { AuditLogDTO } from '../../src/lib/review-center/audit';
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

function makeMetadata(): ReviewMetadataDto {
  return {
    materials: [
      { code: 'PP', label: '聚丙烯', isPrimary: true },
      { code: 'METAL', label: '金属', isPrimary: false },
    ],
    processes: [{ code: 'HEAT_TRANSFER', label: '热转印' }],
    problemDomains: [{ code: 'PROCESS', label: '工艺与参数' }],
    problemSymptoms: [],
    materialOtherText: null,
    processOtherText: null,
    problemDomainOtherText: null,
    problemSymptomOtherText: null,
  };
}

console.log('\n=== Review Center Metadata Editor + Presentation ===');

const empty = createMetadataEditorState(null);
assert(empty.primaryMaterialCode === null, 'null metadata starts empty');
assert(empty.secondaryMaterialCodes.length === 0, 'null metadata starts no secondary');

const initial = createMetadataEditorState(makeMetadata());
assert(initial.primaryMaterialCode === 'PP', 'metadata primary mapped');
assert(initial.secondaryMaterialCodes.includes('METAL'), 'metadata secondary mapped');
assert(isMetadataEditorDirty(initial, initial) === false, 'metadata initial load is clean');

const orderedState = {
  ...initial,
  processCodes: ['HEAT_TRANSFER', 'FILM_MAKING'],
  problemDomainCodes: ['PROCESS', 'MATERIAL_SURFACE'],
};
const reordered = {
  ...orderedState,
  processCodes: ['FILM_MAKING', 'HEAT_TRANSFER'],
  problemDomainCodes: ['MATERIAL_SURFACE', 'PROCESS'],
};
assert(isMetadataEditorDirty(orderedState, reordered) === false, 'metadata semantically equal arrays ignore order');

const changedMetadata = setPrimaryMaterial(initial, 'METAL');
assert(isMetadataEditorDirty(initial, changedMetadata) === true, 'metadata option change becomes dirty');
assert(
  isMetadataEditorDirty(changedMetadata, changedMetadata) === false,
  'metadata save success baseline becomes clean',
);
const changedAfterSave = toggleProcess(changedMetadata, 'FILM_MAKING');
assert(
  isMetadataEditorDirty(changedMetadata, changedAfterSave) === true,
  'metadata change after save becomes dirty again',
);

const promoted = setPrimaryMaterial(initial, 'METAL');
assert(promoted.primaryMaterialCode === 'METAL', 'promote metal to primary');
assert(!promoted.secondaryMaterialCodes.includes('METAL'), 'promoted removed from secondary');

const secondaryToggle = toggleSecondaryMaterial(promoted, 'PP');
assert(secondaryToggle.secondaryMaterialCodes.includes('PP'), 'demoted PP becomes secondary');

const withProcess = toggleProcess(initial, 'FILM_MAKING');
assert(withProcess.processCodes.includes('FILM_MAKING'), 'process toggle adds');
const withoutProcess = toggleProcess(withProcess, 'FILM_MAKING');
assert(!withoutProcess.processCodes.includes('FILM_MAKING'), 'process toggle removes');

const withDomain = toggleProblemDomain(initial, 'MATERIAL_SURFACE');
assert(withDomain.problemDomainCodes.includes('MATERIAL_SURFACE'), 'domain toggle adds');

const payload = buildMetadataMutationPayload(initial);
assert(payload.materials[0].code === 'PP' && payload.materials[0].isPrimary === true, 'primary explicit true');
assert(payload.materials[1].code === 'METAL' && payload.materials[1].isPrimary === false, 'secondary explicit false');
assert(payload.other.materialOtherText === null, 'other text null when OTHER not selected');
assert(payload.processes.length === 1, 'process payload retained');

const otherState = {
  ...initial,
  primaryMaterialCode: 'OTHER',
  secondaryMaterialCodes: ['PP'],
  materialOtherText: '特殊材质',
  processOtherText: '特殊工艺',
  processCodes: ['OTHER'],
};
const otherPayload = buildMetadataMutationPayload(otherState);
assert(otherPayload.materials.some(item => item.code === 'OTHER'), 'OTHER material retained');
assert(otherPayload.other.materialOtherText === '特殊材质', 'OTHER material text kept');
assert(otherPayload.other.processOtherText === '特殊工艺', 'OTHER process text kept');

const noOtherState = { ...otherState, primaryMaterialCode: 'PP', materialOtherText: '残留' };
const noOtherPayload = buildMetadataMutationPayload(noOtherState);
assert(noOtherPayload.other.materialOtherText === null, 'OTHER text cleared when OTHER deselected');

assert(canEditMetadata({ status: 'draft', role: 'admin', currentProfileId: null, ownerId: 'x', pmoId: null }) === true, 'draft admin editable');
assert(canEditMetadata({ status: 'draft', role: 'viewer', currentProfileId: 'x', ownerId: 'x', pmoId: null }) === false, 'draft viewer read only');
assert(canEditMetadata({ status: 'draft', role: 'operator', currentProfileId: 'owner-1', ownerId: 'owner-1', pmoId: null }) === true, 'draft owner editable');
assert(canEditMetadata({ status: 'draft', role: 'operator', currentProfileId: 'other', ownerId: 'owner-1', pmoId: null }) === false, 'draft member read only');
assert(canEditMetadata({ status: 'submitted', role: 'manager', currentProfileId: 'owner-1', ownerId: 'owner-1', pmoId: null }) === true, 'submitted manager editable');
assert(canEditMetadata({ status: 'submitted', role: 'operator', currentProfileId: 'owner-1', ownerId: 'owner-1', pmoId: null }) === false, 'submitted owner read only');
assert(canEditMetadata({ status: 'closed', role: 'manager', currentProfileId: null, ownerId: 'owner-1', pmoId: null }) === true, 'closed manager editable');
assert(canEditMetadata({ status: 'in_review', role: 'admin', currentProfileId: null, ownerId: 'owner-1', pmoId: null }) === false, 'non-mvp status read only');

assert(hasProcessRequirement('B', ['PROCESS']) === true, 'B process domain requires process');
assert(hasProcessRequirement('B', ['EQUIPMENT_FIXTURE']) === true, 'B equipment domain requires process');
assert(hasProcessRequirement('B', ['PLATE_FILM']) === true, 'B plate domain requires process');
assert(hasProcessRequirement('A', ['PROCESS']) === false, 'A no process requirement');
assert(hasProcessRequirement('B', ['TECHNICAL_FEASIBILITY']) === false, 'technical feasibility no process requirement');

assert(missingDimensionLabel('PROBLEM_DOMAIN').includes('问题环节'), 'problem domain label');
assert(missingDimensionLabel('PRIMARY_MATERIAL').includes('主要材质'), 'primary material label');
assert(missingDimensionLabel('PROCESS').includes('工艺'), 'process label');
assert(buildMissingDimensionsQuery(['PROCESS', 'UNKNOWN', 'PROCESS']) === 'PROCESS', 'missing query sanitized');

const metadataError = classifyLifecycleError(422, {
  code: 'METADATA_INCOMPLETE',
  data: { missingDimensions: ['PROBLEM_DOMAIN', 'UNKNOWN', 'PRIMARY_MATERIAL', 'PROBLEM_DOMAIN'] },
});
assert(metadataError.missingDimensions.length === 2, 'metadata incomplete sanitized');
assert(metadataError.missingDimensions[0] === 'PROBLEM_DOMAIN', 'metadata incomplete stable order');
assert(metadataError.message.includes('项目分类'), 'metadata incomplete Chinese message');

const auditDto: AuditLogDTO = {
  id: 'audit-1',
  entityType: 'REVIEW_METADATA',
  action: 'REVIEW_METADATA_UPDATED',
  actor: { displayName: '管理员', role: 'admin', isActive: true },
  details: {},
  versionBefore: 1,
  versionAfter: 2,
  createdAt: '2026-08-26T00:00:00Z',
};
const auditPresentation = formatAuditEvent(auditDto);
assert(auditPresentation.title === '更新了项目分类', 'audit metadata label');
assert(auditPresentation.summaryItems[0].includes('材质'), 'audit metadata safe summary');

const timelineDto: TimelineItemDTO = {
  id: 'timeline-1',
  eventType: 'REVIEW_METADATA_UPDATED',
  actor: { displayName: '管理员', role: 'admin', isActive: true },
  details: {},
  createdAt: '2026-08-26T00:00:00Z',
};
const timelinePresentation = formatTimelineEvent(timelineDto);
assert(timelinePresentation.title === '更新了项目分类', 'timeline metadata label');
assert(timelinePresentation.summaryItems[0].includes('材质'), 'timeline metadata safe summary');

console.log(`Metadata editor tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
