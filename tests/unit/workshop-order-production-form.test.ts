import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProductionOrderForm from '../../src/components/workshop-orders/ProductionOrderForm';
import {
  PRODUCTION_ORDER_ENTRY_FIELD_KEYS,
  PRODUCTION_ORDER_ENTRY_FIELDS,
  PRODUCTION_ORDER_ENTRY_SECTIONS,
  PRODUCTION_ORDER_REQUIRED_FIELD_KEYS,
  createEmptyProductionOrderDraft,
  evaluateProductionOrderCompleteness,
  getProductionOrderEntryFieldLabel,
  validateProductionOrderDraft,
  type ProductionOrderDraft,
} from '../../src/lib/workshop-orders/office-entry';
import { productionOrderCreateSchema } from '../../src/lib/workshop-orders/schemas';
import { WOS_FIXTURE_IDS } from '../../src/lib/workshop-orders/fixtures';

function completeDraft(
  overrides: Partial<ProductionOrderDraft> = {},
): ProductionOrderDraft {
  return {
    ...createEmptyProductionOrderDraft(),
    customerName: '宏达测试客户',
    projectName: '2026 圣诞杯大货',
    orderNumber: 'PO-2026-1001',
    productName: '双层 PP 杯',
    priority: 'HIGH',
    isUrgent: true,
    versionLabel: 'V3',
    requestedQuantity: '12000',
    currentBatchQuantity: '6000',
    plannedShipDate: '2026-11-15',
    splitDelivery: true,
    followUpBatchPlan: '第二批 6000 只，2026-11-30 出货',
    productMaterial: '食品级 PP',
    surfaceTreatment: '外表面哑光',
    patternScope: 'FULL',
    seamTolerance: '接缝限距 ≤ 1.0mm',
    positionReference: '距杯口 12mm 起印，底部避开 3mm',
    customerAcceptanceStandard: '按 V3 签样验收，色差 ΔE ≤ 2.0，无露底、无重影',
    packagingMethod: '单只 OPP 袋 + 五层瓦楞外箱',
    cartonQuantity: '48',
    labelMarkingRule: '外箱唛头标注订单号、版本、数量、批次；杯底喷码版本号',
    ...overrides,
  };
}

const expectedKeys = [
  'customerName',
  'projectName',
  'orderNumber',
  'productName',
  'priority',
  'isUrgent',
  'versionLabel',
  'requestedQuantity',
  'currentBatchQuantity',
  'plannedShipDate',
  'splitDelivery',
  'followUpBatchPlan',
  'productMaterial',
  'surfaceTreatment',
  'patternScope',
  'seamTolerance',
  'positionReference',
  'customerAcceptanceStandard',
  'packagingMethod',
  'cartonQuantity',
  'labelMarkingRule',
] as const;

assert.deepEqual(
  [...PRODUCTION_ORDER_ENTRY_FIELD_KEYS],
  [...expectedKeys],
  'office entry model covers the locked Phase 2 production-order fields',
);
assert.deepEqual(
  PRODUCTION_ORDER_ENTRY_SECTIONS.map((section) => section.title),
  ['基本信息', '数量与交付', '生产细节', '包装与标识'],
);
assert.equal(getProductionOrderEntryFieldLabel('labelMarkingRule'), '唛头/标签规则');
assert.equal(getProductionOrderEntryFieldLabel('seamTolerance'), '接缝限距');
assert.equal(getProductionOrderEntryFieldLabel('customerAcceptanceStandard'), '客户验收标准');

const forbiddenProfileKeys = [
  'profileId',
  'organizationId',
  'customerId',
  'projectId',
  'salesOwnerProfileId',
  'projectOwnerProfileId',
  'createdByProfileId',
];
for (const forbiddenKey of forbiddenProfileKeys) {
  assert(
    !(PRODUCTION_ORDER_ENTRY_FIELD_KEYS as readonly string[]).includes(forbiddenKey),
    `office entry must not expose ${forbiddenKey}`,
  );
}

const emptyValidation = validateProductionOrderDraft(
  createEmptyProductionOrderDraft(),
);
assert.equal(emptyValidation.ok, false);
assert.equal(emptyValidation.completedRequiredCount, 1);
assert.equal(
  emptyValidation.requiredFieldCount,
  PRODUCTION_ORDER_REQUIRED_FIELD_KEYS.length,
);
for (const key of PRODUCTION_ORDER_REQUIRED_FIELD_KEYS) {
  if (key === 'priority') continue;
  assert(
    emptyValidation.missingRequired.includes(key),
    `empty draft reports missing ${key}`,
  );
  assert(emptyValidation.fieldErrors[key], `empty draft explains missing ${key}`);
}
assert.equal(emptyValidation.fieldErrors.customerName, '请填写客户名称');
assert.equal(emptyValidation.fieldErrors.patternScope, '请选择图案范围');
assert(!emptyValidation.missingRequired.includes('followUpBatchPlan'));

const complete = validateProductionOrderDraft(completeDraft());
assert.equal(complete.ok, true);
assert.equal(complete.completenessPercent, 100);
assert.equal(complete.completedRequiredCount, complete.requiredFieldCount);
assert.deepEqual(complete.fieldErrors, {});
assert.deepEqual(complete.missingRequired, []);
assert.equal(complete.normalized.requestedQuantity, 12000);
assert.equal(complete.normalized.currentBatchQuantity, 6000);
assert.equal(complete.normalized.cartonQuantity, 48);
assert.equal(complete.normalized.priority, 'HIGH');
assert.equal(complete.normalized.patternScope, 'FULL');
assert.equal(complete.normalized.isUrgent, true);
assert.equal(complete.normalized.splitDelivery, true);
assert.equal(
  complete.normalized.customerAcceptanceStandard,
  '按 V3 签样验收，色差 ΔE ≤ 2.0，无露底、无重影',
);

const withoutBatch = validateProductionOrderDraft(
  completeDraft({ customerName: '   ' }),
);
assert.equal(withoutBatch.ok, false);
assert(withoutBatch.missingRequired.includes('customerName'));
assert.equal(withoutBatch.fieldErrors.customerName, '请填写客户名称');
assert(withoutBatch.completenessPercent < 100);

const overBatch = validateProductionOrderDraft(
  completeDraft({ currentBatchQuantity: '12001' }),
);
assert.equal(overBatch.ok, false);
assert.equal(
  overBatch.fieldErrors.currentBatchQuantity,
  '当前批次数量不能大于总生产数量',
);
assert(overBatch.completenessPercent < 100);

const invalidQuantities = validateProductionOrderDraft(
  completeDraft({
    requestedQuantity: '0',
    currentBatchQuantity: '2.5',
    cartonQuantity: '0',
  }),
);
assert.equal(invalidQuantities.ok, false);
assert.equal(
  invalidQuantities.fieldErrors.requestedQuantity,
  '总生产数量必须是正整数',
);
assert.equal(
  invalidQuantities.fieldErrors.currentBatchQuantity,
  '当前批次数量必须是正整数',
);
assert.equal(invalidQuantities.fieldErrors.cartonQuantity, '装箱量必须是正整数');

const invalidDate = validateProductionOrderDraft(
  completeDraft({ plannedShipDate: '2026-02-30' }),
);
assert.equal(invalidDate.ok, false);
assert(
  invalidDate.fieldErrors.plannedShipDate?.includes('计划出货日期必须是有效日期'),
);

const invalidOptions = validateProductionOrderDraft(
  completeDraft({ priority: 'RUSH', patternScope: 'SPOT' }),
);
assert.equal(invalidOptions.ok, false);
assert.equal(invalidOptions.fieldErrors.priority, '请选择有效的优先级');
assert.equal(invalidOptions.fieldErrors.patternScope, '请选择有效的图案范围');

const splitWithoutPlan = validateProductionOrderDraft(
  completeDraft({ splitDelivery: true, followUpBatchPlan: '' }),
);
assert.equal(splitWithoutPlan.ok, false);
assert(splitWithoutPlan.missingRequired.includes('followUpBatchPlan'));
assert.equal(
  splitWithoutPlan.fieldErrors.followUpBatchPlan,
  '选择分批交付后，请填写后续批次日期/数量',
);
assert.equal(
  splitWithoutPlan.requiredFieldCount,
  complete.requiredFieldCount,
);

const singleDeliveryWithoutPlan = validateProductionOrderDraft(
  completeDraft({ splitDelivery: false, followUpBatchPlan: '' }),
);
assert.equal(singleDeliveryWithoutPlan.ok, true);

const completeness = evaluateProductionOrderCompleteness(completeDraft());
assert.deepEqual(completeness, {
  requiredFieldCount: complete.requiredFieldCount,
  completedRequiredCount: complete.completedRequiredCount,
  completenessPercent: 100,
  missingRequired: [],
});

const normalized = complete.normalized;
const schemaRecord = productionOrderCreateSchema.parse({
  organizationId: WOS_FIXTURE_IDS.organizationId,
  customerId: null,
  customerNameSnapshot: normalized.customerName,
  projectId: null,
  projectNameSnapshot: normalized.projectName,
  orderNumber: normalized.orderNumber,
  productName: normalized.productName,
  salesOwnerProfileId: WOS_FIXTURE_IDS.salesProfileId,
  projectOwnerProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
  priority: normalized.priority,
  isUrgent: normalized.isUrgent,
  versionLabel: normalized.versionLabel,
  requestedQuantity: normalized.requestedQuantity,
  currentBatchQuantity: normalized.currentBatchQuantity,
  plannedShipDate: normalized.plannedShipDate,
  splitDelivery: normalized.splitDelivery,
  productMaterial: normalized.productMaterial,
  surfaceTreatment: normalized.surfaceTreatment,
  patternScope: normalized.patternScope,
  seamTolerance: normalized.seamTolerance,
  positionReference: normalized.positionReference,
  customerAcceptanceStandard: normalized.customerAcceptanceStandard,
  packagingMethod: normalized.packagingMethod,
  cartonQuantity: normalized.cartonQuantity,
  labelMarkingRule: normalized.labelMarkingRule,
  createdByProfileId: WOS_FIXTURE_IDS.projectOwnerProfileId,
});
assert.equal(schemaRecord.customerNameSnapshot, '宏达测试客户');
assert.equal(schemaRecord.requestedQuantity, 12000);
assert.equal(schemaRecord.currentBatchQuantity, 6000);
assert.equal(schemaRecord.patternScope, 'FULL');

assert.deepEqual(
  validateProductionOrderDraft(completeDraft()),
  validateProductionOrderDraft({ ...completeDraft() }),
  'office entry validation is deterministic',
);

const markup = renderToStaticMarkup(
  React.createElement(ProductionOrderForm),
);
for (const field of PRODUCTION_ORDER_ENTRY_FIELDS) {
  assert(markup.includes(field.label), `form renders ${field.label}`);
}
assert(markup.includes('检查资料完整性'));
assert(markup.includes('本地资料完整性'));
assert(markup.includes('不会保存草稿'));
assert(markup.includes('不会向数据库提交生产单'));
assert(!markup.includes('提交成功'));
for (const forbiddenKey of forbiddenProfileKeys) {
  assert(!markup.includes(forbiddenKey), `rendered form omits ${forbiddenKey}`);
}

const pageSource = fs.readFileSync(
  'src/app/workshop-orders/production/new/page.tsx',
  'utf8',
);
const componentSource = fs.readFileSync(
  'src/components/workshop-orders/ProductionOrderForm.tsx',
  'utf8',
);
const modelSource = fs.readFileSync(
  'src/lib/workshop-orders/office-entry.ts',
  'utf8',
);

assert(pageSource.includes('ProductionOrderForm'));
assert(pageSource.includes('生产下单'));
assert(componentSource.includes('validateProductionOrderDraft'));
assert(componentSource.includes('检查资料完整性'));

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
  ]) {
    assert(
      !forbiddenPattern.test(source),
      `${label} must not use ${forbiddenPattern}`,
    );
  }
}

console.log('workshop-order-production-form.test.ts: PASS');
