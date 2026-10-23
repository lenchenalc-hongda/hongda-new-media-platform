import {
  WOS_PRIORITIES,
  WOS_REQUEST_STAGES,
  WOS_SAMPLING_OBJECTIVES,
  type WosPriority,
  type WosRequestStage,
  type WosSamplingObjective,
} from './domain';
import type { ReferenceImageCategory } from './spec';

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
  | 'checkbox'
  | 'multiselect';

export interface OfficeEntryFieldDefinition<
  TKey extends string = ProductionOrderEntryFieldKey,
> {
  key: TKey;
  label: string;
  kind: OfficeEntryFieldKind;
  required: boolean;
  placeholder?: string;
  help?: string;
  options?: readonly WorkshopSelectOption[];
}

export interface OfficeEntrySectionDefinition<
  TKey extends string = ProductionOrderEntryFieldKey,
> {
  id: string;
  title: string;
  description: string;
  fields: readonly OfficeEntryFieldDefinition<TKey>[];
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

export const SAMPLING_REQUEST_ENTRY_FIELD_KEYS = [
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

export type SamplingRequestEntryFieldKey =
  (typeof SAMPLING_REQUEST_ENTRY_FIELD_KEYS)[number];

export const REQUEST_STAGE_OPTIONS = [
  { value: 'UNESTABLISHED', label: '未立项：先验证方案与可生产性' },
  { value: 'ESTABLISHED', label: '已立项：验证客户目标与大货条件' },
] as const satisfies readonly WorkshopSelectOption[];

export const SAMPLING_OBJECTIVE_OPTIONS = [
  { value: 'PRODUCIBILITY', label: '可生产性' },
  { value: 'ADHESION', label: '附着力' },
  { value: 'SEAM', label: '接口处理' },
  { value: 'STRETCH', label: '拉伸情况' },
  { value: 'EDGE', label: '切边效果' },
  { value: 'POSITIONING', label: '位置基准/对位' },
  { value: 'MAX_PRINT_POSITION', label: '最大可印刷位置' },
  { value: 'BULK_EFFICIENCY', label: '大货效率预估' },
  { value: 'OTHER', label: '其他目标' },
] as const satisfies readonly WorkshopSelectOption[];

export const REFERENCE_IMAGE_CATEGORY_OPTIONS = [
  { value: 'PRODUCT', label: '产品实物照片' },
  { value: 'FILM_PATTERN', label: '花膜图案/膜样' },
  { value: 'CUSTOMER_APPROVED_SAMPLE', label: '客户目标效果/确认样' },
  { value: 'SIGNED_SAMPLE', label: '签样' },
  { value: 'SAMPLING_RESULT', label: '打烊结果' },
  { value: 'PACKAGING_LABEL', label: '包装/标签' },
  { value: 'DEFECT_RISK', label: '不良/风险细节' },
  { value: 'OTHER', label: '其他技术参考' },
] as const satisfies ReadonlyArray<{
  value: ReferenceImageCategory;
  label: string;
}>;

export const SAMPLING_REQUEST_ENTRY_SECTIONS: readonly OfficeEntrySectionDefinition<SamplingRequestEntryFieldKey>[] =
  [
    {
      id: 'basic',
      title: '申请基本信息',
      description: '客户、项目、产品与日期快照。此处只显示业务名称，不显示员工档案 UUID。',
      fields: [
        {
          key: 'customerName',
          label: '客户名称（快照）',
          kind: 'text',
          required: true,
          placeholder: '例如：宏达客户 / 客户简称',
        },
        {
          key: 'projectName',
          label: '项目名称（快照）',
          kind: 'text',
          required: true,
          placeholder: '例如：2026 圣诞杯打烊',
        },
        {
          key: 'productName',
          label: '产品名称',
          kind: 'text',
          required: true,
          placeholder: '例如：双层 PP 杯',
        },
        {
          key: 'requestStage',
          label: '打烊阶段',
          kind: 'select',
          required: true,
          placeholder: '请选择打烊阶段',
          options: REQUEST_STAGE_OPTIONS,
        },
        {
          key: 'applicationDate',
          label: '申请日期',
          kind: 'date',
          required: true,
        },
        {
          key: 'requestedDate',
          label: '期望完成日期',
          kind: 'date',
          required: true,
          help: '期望完成日期不能早于申请日期。',
        },
        {
          key: 'isUrgent',
          label: '加急申请',
          kind: 'checkbox',
          required: false,
          help: '加急仍需车间确认资源与排期，不会自动跳过 Gate。',
        },
        {
          key: 'versionLabel',
          label: '申请版本号',
          kind: 'text',
          required: true,
          placeholder: '例如：V2',
          help: '产品、花膜图案与参考图必须按同一个有效版本核对。',
        },
      ],
    },
    {
      id: 'objectives',
      title: '打烊目标',
      description: '至少选择一项，明确本次需要验证的技术问题。',
      fields: [
        {
          key: 'objectives',
          label: '打烊目标（可多选）',
          kind: 'multiselect',
          required: true,
          options: SAMPLING_OBJECTIVE_OPTIONS,
        },
      ],
    },
    {
      id: 'product-material',
      title: '产品、来料与花膜',
      description: '描述产品条件、印刷位置与本次打烊需要的样品数量。',
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
          key: 'productDimensions',
          label: '产品尺寸',
          kind: 'text',
          required: true,
          placeholder: '例如：直径 90mm × 高 120mm，杯口壁厚 1.2mm',
        },
        {
          key: 'filmType',
          label: '花膜类型',
          kind: 'text',
          required: true,
          placeholder: '例如：大货数码膜 / 起版膜 / 常规膜',
        },
        {
          key: 'patternName',
          label: '花膜图案',
          kind: 'text',
          required: true,
          placeholder: '例如：客户图稿 A-03 满版雪花',
        },
        {
          key: 'printingPosition',
          label: '印刷位置',
          kind: 'textarea',
          required: true,
          placeholder: '例如：距杯口 12mm 起印，接缝居后，底部避开 3mm',
        },
        {
          key: 'sampleInputQuantity',
          label: '样品来料数量',
          kind: 'number',
          required: true,
          placeholder: '例如：20',
          help: '必须为正整数。',
        },
        {
          key: 'requiredGoodQuantity',
          label: '所需良品数量',
          kind: 'number',
          required: true,
          placeholder: '例如：8',
          help: '必须为正整数，且不能大于样品来料数量。',
        },
        {
          key: 'specialFixtureRequired',
          label: '需要专用夹具',
          kind: 'checkbox',
          required: false,
        },
        {
          key: 'fixtureDetails',
          label: '夹具编号/状态',
          kind: 'text',
          required: false,
          placeholder: '例如：FIX-026，待车间确认',
          help: '勾选需要专用夹具后必填。',
        },
        {
          key: 'riskNotes',
          label: '打烊风险点/其他注意事项',
          kind: 'textarea',
          required: false,
          placeholder: '例如：曲面转角易拉伸；客户不接受明显接缝重影',
        },
      ],
    },
    {
      id: 'acceptance-reference',
      title: '验收与客户参考',
      description: '记录客户目标和可执行的测试验收条件。',
      fields: [
        {
          key: 'acceptanceTestRequirements',
          label: '验收/测试要求',
          kind: 'textarea',
          required: true,
          placeholder: '例如：附着力百格测试通过；色差 ΔE ≤ 2.0；连续 3 件无露底',
        },
        {
          key: 'customerTargetNotes',
          label: '客户目标/参考说明',
          kind: 'textarea',
          required: true,
          placeholder: '例如：以客户邮件确认的 A-03 效果图为目标，优先保证转角覆盖',
        },
      ],
    },
    {
      id: 'reference-image',
      title: '参考图片资料登记',
      description: '当前只登记图片元数据，用于资料核对；本页面不会选择、上传或保存图片文件。',
      fields: [
        {
          key: 'referenceImageCategory',
          label: '参考图类别',
          kind: 'select',
          required: true,
          placeholder: '请选择参考图类别',
          options: REFERENCE_IMAGE_CATEGORY_OPTIONS,
        },
        {
          key: 'referenceImageFileName',
          label: '参考图文件名（仅元数据）',
          kind: 'text',
          required: true,
          placeholder: '例如：A-03-product-front.jpg',
          help: '只登记待上传文件名；填写不代表文件已经上传。',
        },
        {
          key: 'referenceImageVersionLabel',
          label: '参考图版本号',
          kind: 'text',
          required: true,
          placeholder: '例如：V2',
          help: '花膜图案参考图必须与申请版本一致。',
        },
        {
          key: 'referenceImageCaption',
          label: '参考图说明',
          kind: 'text',
          required: false,
          placeholder: '例如：客户确认正面效果与接口位置',
        },
      ],
    },
  ];

export const SAMPLING_REQUEST_ENTRY_FIELDS: readonly OfficeEntryFieldDefinition<SamplingRequestEntryFieldKey>[] =
  SAMPLING_REQUEST_ENTRY_SECTIONS.flatMap((section) => section.fields);

const SAMPLING_FIELD_BY_KEY = new Map<
  SamplingRequestEntryFieldKey,
  OfficeEntryFieldDefinition<SamplingRequestEntryFieldKey>
>(SAMPLING_REQUEST_ENTRY_FIELDS.map((field) => [field.key, field]));

export const SAMPLING_REQUEST_REQUIRED_FIELD_KEYS =
  SAMPLING_REQUEST_ENTRY_FIELDS.filter((field) => field.required).map(
    (field) => field.key,
  );

export interface SamplingRequestDraft {
  customerName: string;
  projectName: string;
  productName: string;
  requestStage: string;
  applicationDate: string;
  requestedDate: string;
  isUrgent: boolean;
  versionLabel: string;
  objectives: WosSamplingObjective[];
  productMaterial: string;
  surfaceTreatment: string;
  productDimensions: string;
  filmType: string;
  patternName: string;
  printingPosition: string;
  sampleInputQuantity: string;
  requiredGoodQuantity: string;
  specialFixtureRequired: boolean;
  fixtureDetails: string;
  riskNotes: string;
  acceptanceTestRequirements: string;
  customerTargetNotes: string;
  referenceImageCategory: string;
  referenceImageFileName: string;
  referenceImageVersionLabel: string;
  referenceImageCaption: string;
}

export interface SamplingReferenceImageMetadata {
  category: ReferenceImageCategory;
  fileName: string;
  versionLabel: string;
  caption: string | null;
  localOnly: true;
  uploadStatus: 'NOT_UPLOADED';
}

export interface NormalizedSamplingRequestDraft {
  customerName: string;
  customerNameSnapshot: string;
  projectName: string;
  projectNameSnapshot: string;
  productName: string;
  requestStage: WosRequestStage | null;
  applicationDate: string | null;
  requestedDate: string | null;
  isUrgent: boolean;
  versionLabel: string;
  objectives: WosSamplingObjective[];
  productMaterial: string;
  surfaceTreatment: string | null;
  productDimensions: string;
  filmType: string;
  patternName: string;
  printingPosition: string;
  sampleInputQuantity: number | null;
  requiredGoodQuantity: number | null;
  specialFixtureRequired: boolean;
  fixtureDetails: string | null;
  riskNotes: string | null;
  acceptanceTestRequirements: string;
  customerTargetNotes: string;
  referenceImageMetadata: SamplingReferenceImageMetadata | null;
}

export type SamplingRequestFieldErrors = Partial<
  Record<SamplingRequestEntryFieldKey, string>
>;

export interface SamplingRequestCompleteness {
  requiredFieldCount: number;
  completedRequiredCount: number;
  completenessPercent: number;
  missingRequired: SamplingRequestEntryFieldKey[];
}

export interface SamplingRequestValidation extends SamplingRequestCompleteness {
  ok: boolean;
  fieldErrors: SamplingRequestFieldErrors;
  normalized: NormalizedSamplingRequestDraft;
}

export function createEmptySamplingRequestDraft(): SamplingRequestDraft {
  return {
    customerName: '',
    projectName: '',
    productName: '',
    requestStage: '',
    applicationDate: '',
    requestedDate: '',
    isUrgent: false,
    versionLabel: '',
    objectives: [],
    productMaterial: '',
    surfaceTreatment: '',
    productDimensions: '',
    filmType: '',
    patternName: '',
    printingPosition: '',
    sampleInputQuantity: '',
    requiredGoodQuantity: '',
    specialFixtureRequired: false,
    fixtureDetails: '',
    riskNotes: '',
    acceptanceTestRequirements: '',
    customerTargetNotes: '',
    referenceImageCategory: 'PRODUCT',
    referenceImageFileName: '',
    referenceImageVersionLabel: '',
    referenceImageCaption: '',
  };
}

function samplingFieldLabel(key: SamplingRequestEntryFieldKey): string {
  return SAMPLING_FIELD_BY_KEY.get(key)?.label ?? key;
}

function addEmptySamplingRequiredError(
  draft: SamplingRequestDraft,
  key: SamplingRequestEntryFieldKey,
  fieldErrors: SamplingRequestFieldErrors,
  missingRequired: SamplingRequestEntryFieldKey[],
): void {
  const field = SAMPLING_FIELD_BY_KEY.get(key);
  if (!field) return;

  const value = draft[key];
  const isEmpty =
    Array.isArray(value)
      ? value.length === 0
      : typeof value === 'string'
        ? value.trim() === ''
        : false;
  if (!isEmpty) return;

  fieldErrors[key] =
    field.kind === 'select' ||
    field.kind === 'date' ||
    field.kind === 'multiselect'
      ? `请选择${field.label}`
      : `请填写${field.label}`;
  missingRequired.push(key);
}

export function validateSamplingRequestDraft(
  draft: SamplingRequestDraft,
): SamplingRequestValidation {
  const fieldErrors: SamplingRequestFieldErrors = {};
  const missingRequired: SamplingRequestEntryFieldKey[] = [];
  const requiredKeys: SamplingRequestEntryFieldKey[] = [
    ...SAMPLING_REQUEST_REQUIRED_FIELD_KEYS,
  ];
  if (draft.specialFixtureRequired) requiredKeys.push('fixtureDetails');

  for (const key of requiredKeys) {
    addEmptySamplingRequiredError(draft, key, fieldErrors, missingRequired);
  }

  const requestStage = trimValue(draft.requestStage);
  const requestStageIsValid = (WOS_REQUEST_STAGES as readonly string[]).includes(
    requestStage,
  );
  if (requestStage && !requestStageIsValid) {
    fieldErrors.requestStage = '请选择有效的打烊阶段';
  }

  const objectives = [...new Set(draft.objectives)];
  const validObjectives = objectives.filter((objective) =>
    (WOS_SAMPLING_OBJECTIVES as readonly string[]).includes(objective),
  );
  if (objectives.length !== validObjectives.length) {
    fieldErrors.objectives = '打烊目标包含无效选项';
  }

  const referenceImageCategory = trimValue(draft.referenceImageCategory);
  const referenceCategoryIsValid = REFERENCE_IMAGE_CATEGORY_OPTIONS.some(
    (option) => option.value === referenceImageCategory,
  );
  if (referenceImageCategory && !referenceCategoryIsValid) {
    fieldErrors.referenceImageCategory = '请选择有效的参考图类别';
  }

  const applicationDate = trimValue(draft.applicationDate);
  if (applicationDate && !isRealIsoDate(applicationDate)) {
    fieldErrors.applicationDate = '申请日期必须是有效日期，格式为 YYYY-MM-DD';
  }

  const requestedDate = trimValue(draft.requestedDate);
  if (requestedDate && !isRealIsoDate(requestedDate)) {
    fieldErrors.requestedDate = '期望完成日期必须是有效日期，格式为 YYYY-MM-DD';
  }
  if (
    isRealIsoDate(applicationDate) &&
    isRealIsoDate(requestedDate) &&
    requestedDate < applicationDate
  ) {
    fieldErrors.requestedDate = '期望完成日期不能早于申请日期';
  }

  const sampleInputQuantity = parsePositiveInteger(draft.sampleInputQuantity);
  if (trimValue(draft.sampleInputQuantity) && sampleInputQuantity === null) {
    fieldErrors.sampleInputQuantity = '样品来料数量必须是正整数';
  }

  const requiredGoodQuantity = parsePositiveInteger(draft.requiredGoodQuantity);
  if (trimValue(draft.requiredGoodQuantity) && requiredGoodQuantity === null) {
    fieldErrors.requiredGoodQuantity = '所需良品数量必须是正整数';
  }
  if (
    sampleInputQuantity !== null &&
    requiredGoodQuantity !== null &&
    requiredGoodQuantity > sampleInputQuantity
  ) {
    fieldErrors.requiredGoodQuantity = '所需良品数量不能大于样品来料数量';
  }

  if (draft.specialFixtureRequired && !trimValue(draft.fixtureDetails)) {
    fieldErrors.fixtureDetails = '勾选需要专用夹具后，请填写夹具编号/状态';
  }

  const versionLabel = trimValue(draft.versionLabel);
  const referenceImageVersionLabel = trimValue(
    draft.referenceImageVersionLabel,
  );
  if (
    versionLabel &&
    referenceImageVersionLabel &&
    referenceImageCategory === 'FILM_PATTERN' &&
    versionLabel !== referenceImageVersionLabel
  ) {
    fieldErrors.referenceImageVersionLabel =
      '花膜图案参考图的版本必须与申请版本一致';
  }

  const uniqueRequiredKeys = [...new Set(requiredKeys)];
  const completedRequiredCount = uniqueRequiredKeys.filter(
    (key) => !fieldErrors[key],
  ).length;
  const referenceImageMetadata =
    referenceCategoryIsValid &&
    trimValue(draft.referenceImageFileName) &&
    referenceImageVersionLabel
      ? {
          category: referenceImageCategory as ReferenceImageCategory,
          fileName: trimValue(draft.referenceImageFileName),
          versionLabel: referenceImageVersionLabel,
          caption: nullableText(draft.referenceImageCaption),
          localOnly: true as const,
          uploadStatus: 'NOT_UPLOADED' as const,
        }
      : null;

  const normalizedCustomerName = trimValue(draft.customerName);
  const normalizedProjectName = trimValue(draft.projectName);

  return {
    ok: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    normalized: {
      customerName: normalizedCustomerName,
      customerNameSnapshot: normalizedCustomerName,
      projectName: normalizedProjectName,
      projectNameSnapshot: normalizedProjectName,
      productName: trimValue(draft.productName),
      requestStage: requestStageIsValid
        ? (requestStage as WosRequestStage)
        : null,
      applicationDate: isRealIsoDate(applicationDate)
        ? applicationDate
        : null,
      requestedDate: isRealIsoDate(requestedDate) ? requestedDate : null,
      isUrgent: draft.isUrgent,
      versionLabel,
      objectives: validObjectives,
      productMaterial: trimValue(draft.productMaterial),
      surfaceTreatment: nullableText(draft.surfaceTreatment),
      productDimensions: trimValue(draft.productDimensions),
      filmType: trimValue(draft.filmType),
      patternName: trimValue(draft.patternName),
      printingPosition: trimValue(draft.printingPosition),
      sampleInputQuantity,
      requiredGoodQuantity,
      specialFixtureRequired: draft.specialFixtureRequired,
      fixtureDetails: nullableText(draft.fixtureDetails),
      riskNotes: nullableText(draft.riskNotes),
      acceptanceTestRequirements: trimValue(
        draft.acceptanceTestRequirements,
      ),
      customerTargetNotes: trimValue(draft.customerTargetNotes),
      referenceImageMetadata,
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

export function evaluateSamplingRequestCompleteness(
  draft: SamplingRequestDraft,
): SamplingRequestCompleteness {
  const validation = validateSamplingRequestDraft(draft);
  return {
    requiredFieldCount: validation.requiredFieldCount,
    completedRequiredCount: validation.completedRequiredCount,
    completenessPercent: validation.completenessPercent,
    missingRequired: validation.missingRequired,
  };
}

export function getSamplingRequestEntryFieldLabel(
  key: SamplingRequestEntryFieldKey,
): string {
  return samplingFieldLabel(key);
}
