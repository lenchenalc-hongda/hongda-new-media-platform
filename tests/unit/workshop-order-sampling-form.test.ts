import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SamplingRequestForm from '../../src/components/workshop-orders/SamplingRequestForm';
import {
  SAMPLING_REQUEST_ENTRY_FIELD_KEYS,
  SAMPLING_REQUEST_ENTRY_FIELDS,
  SAMPLING_REQUEST_ENTRY_SECTIONS,
  SAMPLING_REQUEST_REQUIRED_FIELD_KEYS,
  createEmptySamplingRequestDraft,
  evaluateSamplingRequestCompleteness,
  getSamplingRequestEntryFieldLabel,
  validateSamplingRequestDraft,
  type SamplingRequestDraft,
} from '../../src/lib/workshop-orders/office-entry';
import { WOS_SAMPLING_OBJECTIVES } from '../../src/lib/workshop-orders/domain';
import { samplingRequestCreateSchema } from '../../src/lib/workshop-orders/schemas';
import { WOS_FIXTURE_IDS } from '../../src/lib/workshop-orders/fixtures';

function completeSamplingDraft(
  overrides: Partial<SamplingRequestDraft> = {},
): SamplingRequestDraft {
  return {
    ...createEmptySamplingRequestDraft(),
    customerName: '宏达测试客户',
    projectName: '2026 圣诞杯打烊',
    productName: '双层 PP 杯',
    requestStage: 'ESTABLISHED',
    applicationDate: '2026-10-22',
    requestedDate: '2026-10-29',
    isUrgent: true,
    versionLabel: 'V2',
    objectives: ['PRODUCIBILITY', 'POSITIONING', 'BULK_EFFICIENCY'],
    productMaterial: '食品级 PP',
    surfaceTreatment: '外表面哑光',
    productDimensions: '直径 90mm × 高 120mm，杯口壁厚 1.2mm',
    filmType: '大货数码膜',
    patternName: '客户图稿 A-03 满版雪花',
    printingPosition: '距杯口 12mm 起印，接缝居后，底部避开 3mm',
    sampleInputQuantity: '20',
    requiredGoodQuantity: '8',
    specialFixtureRequired: true,
    fixtureDetails: 'FIX-026，待车间确认',
    riskNotes: '曲面转角易拉伸，客户不接受明显接缝重影',
    acceptanceTestRequirements: '附着力百格测试通过；色差 ΔE ≤ 2.0；连续 3 件无露底',
    customerTargetNotes: '以客户邮件确认的 A-03 效果图为目标，优先保证转角覆盖',
    referenceImageCategory: 'PRODUCT',
    referenceImageFileName: 'A-03-product-front.jpg',
    referenceImageVersionLabel: 'V2',
    referenceImageCaption: '客户确认正面效果与接口位置',
    ...overrides,
  };
}

const expectedKeys = [
  'customerName',
  'projectName',
  'productName',
  'requestStage',
  'applicationDate',
  'requestedDate',
  'isUrgent',
  'versionLabel',
  'objectives',
  'productMaterial',
  'surfaceTreatment',
  'productDimensions',
  'filmType',
  'patternName',
  'printingPosition',
  'sampleInputQuantity',
  'requiredGoodQuantity',
  'specialFixtureRequired',
  'fixtureDetails',
  'riskNotes',
  'acceptanceTestRequirements',
  'customerTargetNotes',
  'referenceImageCategory',
  'referenceImageFileName',
  'referenceImageVersionLabel',
  'referenceImageCaption',
] as const;

assert.deepEqual(
  [...SAMPLING_REQUEST_ENTRY_FIELD_KEYS],
  [...expectedKeys],
  'sampling office entry covers the bounded Phase 2 fields',
);
assert.deepEqual(
  SAMPLING_REQUEST_ENTRY_SECTIONS.map((section) => section.title),
  ['申请基本信息', '打烊目标', '产品、来料与花膜', '验收与客户参考', '参考图片资料登记'],
);
assert.equal(getSamplingRequestEntryFieldLabel('patternName'), '花膜图案');
assert.equal(getSamplingRequestEntryFieldLabel('requestedDate'), '期望完成日期');
assert.equal(
  getSamplingRequestEntryFieldLabel('acceptanceTestRequirements'),
  '验收/测试要求',
);

assert.deepEqual(
  SAMPLING_REQUEST_ENTRY_SECTIONS.find(
    (section) => section.id === 'objectives',
  )?.fields[0].options?.map((option) => option.value),
  [...WOS_SAMPLING_OBJECTIVES],
  'sampling objectives reuse the Phase 1 domain enum',
);

const forbiddenProfileKeys = [
  'profileId',
  'organizationId',
  'customerId',
  'projectId',
  'productOwnerProfileId',
  'createdByProfileId',
  'uploadedByProfileId',
];
for (const forbiddenKey of forbiddenProfileKeys) {
  assert(
    !(SAMPLING_REQUEST_ENTRY_FIELD_KEYS as readonly string[]).includes(forbiddenKey),
    `sampling entry must not expose ${forbiddenKey}`,
  );
}

const emptyValidation = validateSamplingRequestDraft(
  createEmptySamplingRequestDraft(),
);
assert.equal(emptyValidation.ok, false);
assert.equal(emptyValidation.completedRequiredCount, 1);
assert.equal(
  emptyValidation.requiredFieldCount,
  SAMPLING_REQUEST_REQUIRED_FIELD_KEYS.length,
);
for (const key of SAMPLING_REQUEST_REQUIRED_FIELD_KEYS) {
  if (key === 'referenceImageCategory') continue;
  assert(
    emptyValidation.missingRequired.includes(key),
    `empty sampling draft reports missing ${key}`,
  );
  assert(
    emptyValidation.fieldErrors[key],
    `empty sampling draft explains missing ${key}`,
  );
}
assert.equal(emptyValidation.fieldErrors.customerName, '请填写客户名称（快照）');
assert.equal(emptyValidation.fieldErrors.objectives, '请选择打烊目标（可多选）');
assert(!emptyValidation.missingRequired.includes('fixtureDetails'));

const complete = validateSamplingRequestDraft(completeSamplingDraft());
assert.equal(complete.ok, true);
assert.equal(complete.completenessPercent, 100);
assert.equal(complete.completedRequiredCount, complete.requiredFieldCount);
assert.deepEqual(complete.fieldErrors, {});
assert.deepEqual(complete.missingRequired, []);
assert.equal(complete.normalized.customerNameSnapshot, '宏达测试客户');
assert.equal(complete.normalized.projectNameSnapshot, '2026 圣诞杯打烊');
assert.equal(complete.normalized.requestStage, 'ESTABLISHED');
assert.equal(complete.normalized.applicationDate, '2026-10-22');
assert.equal(complete.normalized.requestedDate, '2026-10-29');
assert.deepEqual(complete.normalized.objectives, [
  'PRODUCIBILITY',
  'POSITIONING',
  'BULK_EFFICIENCY',
]);
assert.equal(complete.normalized.sampleInputQuantity, 20);
assert.equal(complete.normalized.requiredGoodQuantity, 8);
assert.equal(complete.normalized.specialFixtureRequired, true);
assert.equal(complete.normalized.fixtureDetails, 'FIX-026，待车间确认');
assert.deepEqual(complete.normalized.referenceImageMetadata, {
  category: 'PRODUCT',
  fileName: 'A-03-product-front.jpg',
  versionLabel: 'V2',
  caption: '客户确认正面效果与接口位置',
  localOnly: true,
  uploadStatus: 'NOT_UPLOADED',
});

const overRequiredGood = validateSamplingRequestDraft(
  completeSamplingDraft({ requiredGoodQuantity: '21' }),
);
assert.equal(overRequiredGood.ok, false);
assert.equal(
  overRequiredGood.fieldErrors.requiredGoodQuantity,
  '所需良品数量不能大于样品来料数量',
);
assert(overRequiredGood.completenessPercent < 100);

const invalidQuantities = validateSamplingRequestDraft(
  completeSamplingDraft({
    sampleInputQuantity: '0',
    requiredGoodQuantity: '2.5',
  }),
);
assert.equal(invalidQuantities.ok, false);
assert.equal(
  invalidQuantities.fieldErrors.sampleInputQuantity,
  '样品来料数量必须是正整数',
);
assert.equal(
  invalidQuantities.fieldErrors.requiredGoodQuantity,
  '所需良品数量必须是正整数',
);

const invalidDate = validateSamplingRequestDraft(
  completeSamplingDraft({ requestedDate: '2026-02-30' }),
);
assert.equal(invalidDate.ok, false);
assert(
  invalidDate.fieldErrors.requestedDate?.includes(
    '期望完成日期必须是有效日期',
  ),
);

const dateBeforeApplication = validateSamplingRequestDraft(
  completeSamplingDraft({
    applicationDate: '2026-10-22',
    requestedDate: '2026-10-21',
  }),
);
assert.equal(dateBeforeApplication.ok, false);
assert.equal(
  dateBeforeApplication.fieldErrors.requestedDate,
  '期望完成日期不能早于申请日期',
);

const invalidSelections = validateSamplingRequestDraft(
  completeSamplingDraft({
    requestStage: 'PRODUCTION',
    objectives: ['PRODUCIBILITY', 'MAGIC' as 'PRODUCIBILITY'],
    referenceImageCategory: 'UNKNOWN',
  }),
);
assert.equal(invalidSelections.ok, false);
assert.equal(
  invalidSelections.fieldErrors.requestStage,
  '请选择有效的打烊阶段',
);
assert.equal(
  invalidSelections.fieldErrors.objectives,
  '打烊目标包含无效选项',
);
assert.equal(
  invalidSelections.fieldErrors.referenceImageCategory,
  '请选择有效的参考图类别',
);

const fixtureWithoutDetails = validateSamplingRequestDraft(
  completeSamplingDraft({ specialFixtureRequired: true, fixtureDetails: '' }),
);
assert.equal(fixtureWithoutDetails.ok, false);
assert(fixtureWithoutDetails.missingRequired.includes('fixtureDetails'));
assert.equal(
  fixtureWithoutDetails.fieldErrors.fixtureDetails,
  '勾选需要专用夹具后，请填写夹具编号/状态',
);

const noFixtureWithoutDetails = validateSamplingRequestDraft(
  completeSamplingDraft({ specialFixtureRequired: false, fixtureDetails: '' }),
);
assert.equal(noFixtureWithoutDetails.ok, true);

const filmVersionMismatch = validateSamplingRequestDraft(
  completeSamplingDraft({
    referenceImageCategory: 'FILM_PATTERN',
    referenceImageVersionLabel: 'V1',
  }),
);
assert.equal(filmVersionMismatch.ok, false);
assert.equal(
  filmVersionMismatch.fieldErrors.referenceImageVersionLabel,
  '花膜图案参考图的版本必须与申请版本一致',
);

const completeness = evaluateSamplingRequestCompleteness(
  completeSamplingDraft(),
);
assert.deepEqual(completeness, {
  requiredFieldCount: complete.requiredFieldCount,
  completedRequiredCount: complete.completedRequiredCount,
  completenessPercent: 100,
  missingRequired: [],
});

assert.deepEqual(
  validateSamplingRequestDraft(completeSamplingDraft()),
  validateSamplingRequestDraft({ ...completeSamplingDraft() }),
  'sampling office entry validation is deterministic',
);

const normalized = complete.normalized;
const schemaRecord = samplingRequestCreateSchema.parse({
  organizationId: WOS_FIXTURE_IDS.organizationId,
  customerId: null,
  customerNameSnapshot: normalized.customerNameSnapshot,
  projectId: null,
  projectNameSnapshot: normalized.projectNameSnapshot,
  productName: normalized.productName,
  productOwnerProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
  requestStage: normalized.requestStage,
  objectives: normalized.objectives,
  versionLabel: normalized.versionLabel,
  isUrgent: normalized.isUrgent,
  productMaterial: normalized.productMaterial,
  surfaceTreatment: normalized.surfaceTreatment,
  sampleInputQuantity: normalized.sampleInputQuantity,
  requiredGoodQuantity: normalized.requiredGoodQuantity,
  specialFixtureRequired: normalized.specialFixtureRequired,
  filmType: normalized.filmType,
  riskNotes: normalized.riskNotes,
  createdByProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
});
assert.equal(schemaRecord.customerNameSnapshot, '宏达测试客户');
assert.equal(schemaRecord.objectives.length, 3);
assert.equal(schemaRecord.sampleInputQuantity, 20);
assert.equal(schemaRecord.requiredGoodQuantity, 8);

const markup = renderToStaticMarkup(React.createElement(SamplingRequestForm));
for (const field of SAMPLING_REQUEST_ENTRY_FIELDS) {
  assert(markup.includes(field.label), `sampling form renders ${field.label}`);
}
assert(markup.includes('检查打烊申请资料'));
assert(markup.includes('本地资料完整性'));
assert(markup.includes('不会保存草稿'));
assert(markup.includes('填写不代表文件已经上传'));
assert(!markup.includes('提交成功'));
assert(!markup.includes('上传成功'));
assert(!markup.includes('type="file"'));
for (const forbiddenKey of forbiddenProfileKeys) {
  assert(
    !markup.includes(forbiddenKey),
    `rendered sampling form omits ${forbiddenKey}`,
  );
}

const pageSource = fs.readFileSync(
  'src/app/workshop-orders/sampling/new/page.tsx',
  'utf8',
);
const componentSource = fs.readFileSync(
  'src/components/workshop-orders/SamplingRequestForm.tsx',
  'utf8',
);
const modelSource = fs.readFileSync(
  'src/lib/workshop-orders/office-entry.ts',
  'utf8',
);

assert(pageSource.includes('SamplingRequestForm'));
assert(pageSource.includes('打烊申请'));
assert(pageSource.includes('独立入口'));
assert(!pageSource.includes('ProductionOrderForm'));
assert(componentSource.includes('validateSamplingRequestDraft'));
assert(componentSource.includes('检查打烊申请资料'));

for (const [label, source] of [
  ['page', pageSource],
  ['component', componentSource],
  ['office entry model', modelSource],
] as const) {
  for (const forbiddenPattern of [
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /from\s+['"][^'"]*supabase|require\(['"][^'"]*supabase|supabase\s*\./i,
    /\bfetch\s*\(/,
    /\bDate\.now\b/,
    /type=["']file["']/,
  ]) {
    assert(
      !forbiddenPattern.test(source),
      `${label} must not use ${forbiddenPattern}`,
    );
  }
}

console.log('workshop-order-sampling-form.test.ts: PASS');
