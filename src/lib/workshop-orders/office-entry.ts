import {
  WOS_PRIORITIES,
  type WosPriority,
} from './domain';

export const PRODUCTION_PATTERN_SCOPES = ['FULL', 'PARTIAL', 'MIXED'] as const;
export type ProductionPatternScope = (typeof PRODUCTION_PATTERN_SCOPES)[number];

export interface WorkshopSelectOption {
  value: string;
  label: string;
}

export const PRODUCTION_PRIORITY_OPTIONS = [
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '普通' },
  { value: 'HIGH', label: '高' },
  { value: 'CRITICAL', label: '特急' },
] as const satisfies readonly WorkshopSelectOption[];

export const PRODUCTION_PATTERN_SCOPE_OPTIONS = [
  { value: 'FULL', label: '满版' },
  { value: 'PARTIAL', label: '局部图案' },
  { value: 'MIXED', label: '满版 + 局部' },
] as const satisfies readonly WorkshopSelectOption[];

export const PRODUCTION_ORDER_ENTRY_FIELD_KEYS = [
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

export type ProductionOrderEntryFieldKey =
  (typeof PRODUCTION_ORDER_ENTRY_FIELD_KEYS)[number];

export type OfficeEntryFieldKind =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'textarea'
  | 'checkbox';

export interface OfficeEntryFieldDefinition {
  key: ProductionOrderEntryFieldKey;
  label: string;
  kind: OfficeEntryFieldKind;
  required: boolean;
  placeholder?: string;
  help?: string;
  options?: readonly WorkshopSelectOption[];
}

export interface OfficeEntrySectionDefinition {
  id: string;
  title: string;
  description: string;
  fields: readonly OfficeEntryFieldDefinition[];
}

export const PRODUCTION_ORDER_ENTRY_SECTIONS: readonly OfficeEntrySectionDefinition[] = [
  {
    id: 'basic',
    title: '基本信息',
    description: '客户、项目与订单身份信息，用于车间识别和后续追溯。',
    fields: [
      {
        key: 'customerName',
        label: '客户名称',
        kind: 'text',
        required: true,
        placeholder: '例如：宏达客户 / 客户简称',
      },
      {
        key: 'projectName',
        label: '项目名称',
        kind: 'text',
        required: true,
        placeholder: '例如：2026 圣诞杯大货',
      },
      {
        key: 'orderNumber',
        label: '订单编号',
        kind: 'text',
        required: true,
        placeholder: '例如：PO-2026-001',
      },
      {
        key: 'productName',
        label: '产品名称',
        kind: 'text',
        required: true,
        placeholder: '例如：双层 PP 杯',
      },
      {
        key: 'priority',
        label: '优先级',
        kind: 'select',
        required: true,
        options: PRODUCTION_PRIORITY_OPTIONS,
      },
      {
        key: 'isUrgent',
        label: '加急订单',
        kind: 'checkbox',
        required: false,
        help: '勾选后车间按加急任务识别，仍需通过正式排期确认。',
      },
      {
        key: 'versionLabel',
        label: '版本号',
        kind: 'text',
        required: true,
        placeholder: '例如：V3',
        help: '版本号必须与后续生产基准图片、花膜版本保持一致。',
      },
    ],
  },
  {
    id: 'quantity-delivery',
    title: '数量与交付',
    description: '填写本次生产总数、当前批次与出货安排。',
    fields: [
      {
        key: 'requestedQuantity',
        label: '总生产数量',
        kind: 'number',
        required: true,
        placeholder: '例如：12000',
      },
      {
        key: 'currentBatchQuantity',
        label: '当前批次数量',
        kind: 'number',
        required: true,
        placeholder: '例如：6000',
        help: '当前批次数量不能大于总生产数量。',
      },
      {
        key: 'plannedShipDate',
        label: '计划出货日期',
        kind: 'date',
        required: true,
      },
      {
        key: 'splitDelivery',
        label: '分批交付',
        kind: 'checkbox',
        required: false,
      },
      {
        key: 'followUpBatchPlan',
        label: '后续批次日期/数量',
        kind: 'text',
        required: false,
        placeholder: '例如：第二批 6000 只，2026-11-30 出货',
        help: '选择分批交付后必填。',
      },
    ],
  },
  {
    id: 'production-detail',
    title: '生产细节',
    description: '图案、材质与验收要求，车间按此核对生产条件。',
    fields: [
      {
        key: 'productMaterial',
        label: '产品材质',
        kind: 'text',
        required: true,
        placeholder: '例如：食品级 PP',
      },
      {
        key: 'surfaceTreatment',
        label: '表面处理',
        kind: 'text',
        required: true,
        placeholder: '例如：外表面哑光；如无请填写“无”',
      },
      {
        key: 'patternScope',
        label: '图案范围',
        kind: 'select',
        required: true,
        placeholder: '请选择图案范围',
        options: PRODUCTION_PATTERN_SCOPE_OPTIONS,
      },
      {
        key: 'seamTolerance',
        label: '接缝限距',
        kind: 'text',
        required: true,
        placeholder: '例如：接缝限距 ≤ 1.0mm',
      },
      {
        key: 'positionReference',
        label: '位置基准',
        kind: 'text',
        required: true,
        placeholder: '例如：距杯口 12mm 起印，底部避开 3mm',
      },
      {
        key: 'customerAcceptanceStandard',
        label: '客户验收标准',
        kind: 'textarea',
        required: true,
        placeholder: '例如：按 V3 签样验收，色差 ΔE ≤ 2.0，无露底、无重影',
      },
    ],
  },
  {
    id: 'packaging-label',
    title: '包装与标识',
    description: '包装方式、装箱量和唛头规则必须让车间可直接执行。',
    fields: [
      {
        key: 'packagingMethod',
        label: '包装方式',
        kind: 'text',
        required: true,
        placeholder: '例如：单只 OPP 袋 + 五层瓦楞外箱',
      },
      {
        key: 'cartonQuantity',
        label: '装箱量',
        kind: 'number',
        required: true,
        placeholder: '例如：48',
        help: '每箱数量必须为正整数。',
      },
      {
        key: 'labelMarkingRule',
        label: '唛头/标签规则',
        kind: 'textarea',
        required: true,
        placeholder: '例如：外箱唛头标注订单号、版本、数量、批次；杯底喷码版本号',
      },
    ],
  },
];

export const PRODUCTION_ORDER_ENTRY_FIELDS: readonly OfficeEntryFieldDefinition[] =
  PRODUCTION_ORDER_ENTRY_SECTIONS.flatMap((section) => section.fields);

const FIELD_BY_KEY = new Map<ProductionOrderEntryFieldKey, OfficeEntryFieldDefinition>(
  PRODUCTION_ORDER_ENTRY_FIELDS.map((field) => [field.key, field]),
);

export const PRODUCTION_ORDER_REQUIRED_FIELD_KEYS =
  PRODUCTION_ORDER_ENTRY_FIELDS.filter((field) => field.required).map(
    (field) => field.key,
  );

export interface ProductionOrderDraft {
  customerName: string;
  projectName: string;
  orderNumber: string;
  productName: string;
  priority: string;
  isUrgent: boolean;
  versionLabel: string;
  requestedQuantity: string;
  currentBatchQuantity: string;
  plannedShipDate: string;
  splitDelivery: boolean;
  followUpBatchPlan: string;
  productMaterial: string;
  surfaceTreatment: string;
  patternScope: string;
  seamTolerance: string;
  positionReference: string;
  customerAcceptanceStandard: string;
  packagingMethod: string;
  cartonQuantity: string;
  labelMarkingRule: string;
}

export interface NormalizedProductionOrderDraft {
  customerName: string;
  projectName: string;
  orderNumber: string;
  productName: string;
  priority: WosPriority | null;
  isUrgent: boolean;
  versionLabel: string;
  requestedQuantity: number | null;
  currentBatchQuantity: number | null;
  plannedShipDate: string | null;
  splitDelivery: boolean;
  followUpBatchPlan: string | null;
  productMaterial: string;
  surfaceTreatment: string | null;
  patternScope: ProductionPatternScope | null;
  seamTolerance: string | null;
  positionReference: string | null;
  customerAcceptanceStandard: string | null;
  packagingMethod: string | null;
  cartonQuantity: number | null;
  labelMarkingRule: string | null;
}

export type ProductionOrderFieldErrors = Partial<
  Record<ProductionOrderEntryFieldKey, string>
>;

export interface ProductionOrderCompleteness {
  requiredFieldCount: number;
  completedRequiredCount: number;
  completenessPercent: number;
  missingRequired: ProductionOrderEntryFieldKey[];
}

export interface ProductionOrderValidation extends ProductionOrderCompleteness {
  ok: boolean;
  fieldErrors: ProductionOrderFieldErrors;
  normalized: NormalizedProductionOrderDraft;
}

export function createEmptyProductionOrderDraft(): ProductionOrderDraft {
  return {
    customerName: '',
    projectName: '',
    orderNumber: '',
    productName: '',
    priority: 'MEDIUM',
    isUrgent: false,
    versionLabel: '',
    requestedQuantity: '',
    currentBatchQuantity: '',
    plannedShipDate: '',
    splitDelivery: false,
    followUpBatchPlan: '',
    productMaterial: '',
    surfaceTreatment: '',
    patternScope: '',
    seamTolerance: '',
    positionReference: '',
    customerAcceptanceStandard: '',
    packagingMethod: '',
    cartonQuantity: '',
    labelMarkingRule: '',
  };
}

function trimValue(value: string): string {
  return value.trim();
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parsePositiveInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function requiredMessage(field: OfficeEntryFieldDefinition): string {
  if (field.kind === 'select' || field.kind === 'date') {
    return `请选择${field.label}`;
  }
  return `请填写${field.label}`;
}

function fieldLabel(key: ProductionOrderEntryFieldKey): string {
  return FIELD_BY_KEY.get(key)?.label ?? key;
}

function addEmptyRequiredError(
  draft: ProductionOrderDraft,
  key: ProductionOrderEntryFieldKey,
  fieldErrors: ProductionOrderFieldErrors,
  missingRequired: ProductionOrderEntryFieldKey[],
): void {
  const field = FIELD_BY_KEY.get(key);
  if (!field || trimValue(draft[key] as string)) return;
  fieldErrors[key] = requiredMessage(field);
  missingRequired.push(key);
}

export function validateProductionOrderDraft(
  draft: ProductionOrderDraft,
): ProductionOrderValidation {
  const fieldErrors: ProductionOrderFieldErrors = {};
  const missingRequired: ProductionOrderEntryFieldKey[] = [];

  const requiredKeys: ProductionOrderEntryFieldKey[] = [
    ...PRODUCTION_ORDER_REQUIRED_FIELD_KEYS,
  ];
  if (draft.splitDelivery) requiredKeys.push('followUpBatchPlan');

  for (const key of requiredKeys) {
    addEmptyRequiredError(draft, key, fieldErrors, missingRequired);
  }

  const priority = trimValue(draft.priority);
  const priorityIsValid = (WOS_PRIORITIES as readonly string[]).includes(priority);
  if (priority && !priorityIsValid) {
    fieldErrors.priority = '请选择有效的优先级';
  }

  const patternScope = trimValue(draft.patternScope);
  const patternScopeIsValid = (PRODUCTION_PATTERN_SCOPES as readonly string[]).includes(
    patternScope,
  );
  if (patternScope && !patternScopeIsValid) {
    fieldErrors.patternScope = '请选择有效的图案范围';
  }

  const requestedQuantity = parsePositiveInteger(draft.requestedQuantity);
  if (trimValue(draft.requestedQuantity) && requestedQuantity === null) {
    fieldErrors.requestedQuantity = '总生产数量必须是正整数';
  }

  const currentBatchQuantity = parsePositiveInteger(draft.currentBatchQuantity);
  if (trimValue(draft.currentBatchQuantity) && currentBatchQuantity === null) {
    fieldErrors.currentBatchQuantity = '当前批次数量必须是正整数';
  }
  if (
    requestedQuantity !== null &&
    currentBatchQuantity !== null &&
    currentBatchQuantity > requestedQuantity
  ) {
    fieldErrors.currentBatchQuantity = '当前批次数量不能大于总生产数量';
  }

  const cartonQuantity = parsePositiveInteger(draft.cartonQuantity);
  if (trimValue(draft.cartonQuantity) && cartonQuantity === null) {
    fieldErrors.cartonQuantity = '装箱量必须是正整数';
  }

  const plannedShipDate = trimValue(draft.plannedShipDate);
  if (plannedShipDate && !isRealIsoDate(plannedShipDate)) {
    fieldErrors.plannedShipDate = '计划出货日期必须是有效日期，格式为 YYYY-MM-DD';
  }

  if (draft.splitDelivery && !trimValue(draft.followUpBatchPlan)) {
    fieldErrors.followUpBatchPlan = '选择分批交付后，请填写后续批次日期/数量';
  }

  const uniqueRequiredKeys = [...new Set(requiredKeys)];
  const completedRequiredCount = uniqueRequiredKeys.filter(
    (key) => !fieldErrors[key],
  ).length;

  return {
    ok: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    normalized: {
      customerName: trimValue(draft.customerName),
      projectName: trimValue(draft.projectName),
      orderNumber: trimValue(draft.orderNumber),
      productName: trimValue(draft.productName),
      priority: priorityIsValid ? (priority as WosPriority) : null,
      isUrgent: draft.isUrgent,
      versionLabel: trimValue(draft.versionLabel),
      requestedQuantity,
      currentBatchQuantity,
      plannedShipDate: plannedShipDate && isRealIsoDate(plannedShipDate)
        ? plannedShipDate
        : null,
      splitDelivery: draft.splitDelivery,
      followUpBatchPlan: nullableText(draft.followUpBatchPlan),
      productMaterial: trimValue(draft.productMaterial),
      surfaceTreatment: nullableText(draft.surfaceTreatment),
      patternScope: patternScopeIsValid
        ? (patternScope as ProductionPatternScope)
        : null,
      seamTolerance: nullableText(draft.seamTolerance),
      positionReference: nullableText(draft.positionReference),
      customerAcceptanceStandard: nullableText(draft.customerAcceptanceStandard),
      packagingMethod: nullableText(draft.packagingMethod),
      cartonQuantity,
      labelMarkingRule: nullableText(draft.labelMarkingRule),
    },
    requiredFieldCount: uniqueRequiredKeys.length,
    completedRequiredCount,
    completenessPercent:
      uniqueRequiredKeys.length === 0
        ? 100
        : Math.round((completedRequiredCount / uniqueRequiredKeys.length) * 100),
    missingRequired: [...new Set(missingRequired)],
  };
}

export function evaluateProductionOrderCompleteness(
  draft: ProductionOrderDraft,
): ProductionOrderCompleteness {
  const validation = validateProductionOrderDraft(draft);
  return {
    requiredFieldCount: validation.requiredFieldCount,
    completedRequiredCount: validation.completedRequiredCount,
    completenessPercent: validation.completenessPercent,
    missingRequired: validation.missingRequired,
  };
}

export function getProductionOrderEntryFieldLabel(
  key: ProductionOrderEntryFieldKey,
): string {
  return fieldLabel(key);
}
