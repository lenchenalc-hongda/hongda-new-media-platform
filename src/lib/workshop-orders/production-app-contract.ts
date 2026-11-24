import { z } from 'zod';
import {
  classifyWosSupabaseRuntime,
  WOS_QA_SUPABASE_REF,
  type WosSupabaseRuntime,
} from './production-runtime-contract';

export const WOS_V1_APP_OPERATIONS = [
  'CREATE_ORDER',
  'REGISTER_IMAGE',
  'CONFIRM_OFFICE',
  'SUBMIT_ORDER',
  'OPERATOR_ACTION',
  'SAVE_CORRECTION',
  'RESUBMIT_ORDER',
  'REVIEW_CORRECTION',
] as const;

export type WosV1AppOperation = (typeof WOS_V1_APP_OPERATIONS)[number];
export const WOS_V1_IMAGE_CATEGORIES = [
  'PRODUCT',
  'FILM_PATTERN',
  'CUSTOMER_APPROVED_SAMPLE',
  'SIGNED_SAMPLE',
] as const;
export const WOS_V1_IMAGE_CATEGORY_SLUGS = {
  PRODUCT: 'product',
  FILM_PATTERN: 'film-pattern',
  CUSTOMER_APPROVED_SAMPLE: 'customer-approved-sample',
  SIGNED_SAMPLE: 'signed-sample',
} as const;
export const WOS_V1_APP_READ_ROLES = ['admin', 'manager', 'sales', 'operator'] as const;
export const WOS_V1_APP_OFFICE_ROLES = ['admin', 'manager', 'sales'] as const;
export const WOS_V1_APP_OPERATOR_ROLES = ['admin', 'manager', 'operator'] as const;

const uuid = z.string().uuid();
const version = z.number().int().positive().max(2147483646);
const versionLabel = z.string().regex(/^V[1-9][0-9]{0,20}$/);
const note = z.string().trim().min(10).max(500);
const imageCategory = z.enum(WOS_V1_IMAGE_CATEGORIES);

export const wosV1CreateOrderPayloadSchema = z.object({
  orderNumber: z.string().trim().min(1).max(80),
  customerId: uuid,
  customerNameSnapshot: z.string().trim().min(1).max(300),
  projectId: uuid,
  projectNameSnapshot: z.string().trim().min(1).max(300),
  productName: z.string().trim().min(1).max(300),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  isUrgent: z.boolean().optional(),
  requestedQuantity: z.number().int().positive().max(2147483647),
  currentBatchQuantity: z.number().int().positive().max(2147483647),
  plannedShipDate: z.string().date().optional(),
  splitDelivery: z.literal(false).optional(),
  productMaterial: z.string().trim().min(1).max(200),
  surfaceTreatment: z.string().trim().max(200).optional(),
  patternScope: z.string().trim().max(200).optional(),
  seamTolerance: z.string().trim().max(200).optional(),
  positionReference: z.string().trim().max(2000).optional(),
  customerAcceptanceStandard: z.string().trim().max(2000).optional(),
  packagingMethod: z.string().trim().max(300).optional(),
  cartonQuantity: z.number().int().positive().max(2147483647).optional(),
  labelMarkingRule: z.string().trim().max(1000).optional(),
}).strict().superRefine((payload, ctx) => {
  if (payload.currentBatchQuantity > payload.requestedQuantity) {
    ctx.addIssue({
      code: 'custom',
      path: ['currentBatchQuantity'],
      message: 'BATCH_EXCEEDS_ORDER',
    });
  }
});

const correctionPatch = z.object({
  productName: z.string().trim().min(1).max(200).optional(),
  productMaterial: z.string().trim().min(1).max(200).optional(),
  requestedQuantity: z.number().int().positive().max(2147483647).optional(),
  currentBatchQuantity: z.number().int().positive().max(2147483647).optional(),
  customerAcceptanceStandard: z.string().trim().min(1).max(2000).optional(),
  positionReference: z.string().trim().min(1).max(2000).optional(),
}).strict();

const operation = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('CREATE_ORDER'),
    requestId: uuid,
    payload: wosV1CreateOrderPayloadSchema,
  }).strict(),
  z.object({
    operation: z.literal('REGISTER_IMAGE'),
    orderId: uuid,
    imageId: uuid,
    category: imageCategory,
    storagePath: z.string().min(1).max(600).refine(value =>
      !value.includes('..'), 'UNSAFE_STORAGE_PATH'),
  }).strict(),
  z.object({
    operation: z.literal('CONFIRM_OFFICE'),
    orderId: uuid,
    expectedVersion: version,
    expectedLabel: versionLabel,
    note: z.string().trim().min(10).max(2000),
  }).strict(),
  z.object({
    operation: z.literal('SUBMIT_ORDER'),
    orderId: uuid,
    expectedVersion: version,
    expectedLabel: versionLabel,
    requestId: uuid,
  }).strict(),
  z.object({
    operation: z.literal('OPERATOR_ACTION'),
    orderId: uuid,
    expectedVersion: version,
    requestId: uuid,
    action: z.enum(['ACCEPT', 'RETURN_FOR_INFORMATION']),
    reason: note,
  }).strict(),
  z.object({
    operation: z.literal('SAVE_CORRECTION'),
    orderId: uuid,
    expectedVersion: version,
    requestId: uuid,
    reason: note,
    patch: correctionPatch.refine(value => Object.keys(value).length > 0,
      'AT_LEAST_ONE_CORRECTION_REQUIRED'),
  }).strict(),
  z.object({
    operation: z.literal('RESUBMIT_ORDER'),
    orderId: uuid,
    expectedVersion: version,
    requestId: uuid,
    reason: note,
  }).strict(),
  z.object({
    operation: z.literal('REVIEW_CORRECTION'),
    orderId: uuid,
    expectedVersion: version,
    requestId: uuid,
    note,
  }).strict(),
]).superRefine((value, ctx) => {
  if (value.operation === 'SAVE_CORRECTION'
    && value.patch.requestedQuantity !== undefined
    && value.patch.currentBatchQuantity !== undefined
    && value.patch.currentBatchQuantity > value.patch.requestedQuantity) {
    ctx.addIssue({
      code: 'custom',
      path: ['patch', 'currentBatchQuantity'],
      message: 'BATCH_EXCEEDS_ORDER',
    });
  }
});

export type WosV1AppRequest = z.infer<typeof operation>;

export function parseWosV1AppRequest(value: unknown): WosV1AppRequest | null {
  const parsed = operation.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const wosV1ReadQuerySchema = z.object({
  view: z.enum(['inbox', 'office', 'returned']).default('inbox'),
  orderId: uuid.optional(),
  orderNumber: z.string().trim().min(1).max(80).optional(),
  cursor: z.string().max(200).optional().refine(value =>
    value === undefined || parseWosV1Cursor(value) !== null,
    'INVALID_PAGE_CURSOR'),
}).strict();

export type WosV1ReadQuery = z.infer<typeof wosV1ReadQuerySchema>;

export function parseWosV1Cursor(value: string): {
  readonly updatedAt: string;
  readonly id: string;
} | null {
  const separator = value.lastIndexOf('|');
  if (separator <= 0 || separator >= value.length - 1) return null;
  const updatedAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  return Number.isFinite(Date.parse(updatedAt)) && uuid.safeParse(id).success
    ? { updatedAt, id }
    : null;
}

export function encodeWosV1Cursor(input: {
  readonly updatedAt: string;
  readonly id: string;
}): string {
  return input.updatedAt + '|' + input.id;
}

export function parseWosV1ReadQuery(requestUrl: string): WosV1ReadQuery | null {
  try {
    const search = new URL(requestUrl).searchParams;
    const keys = Array.from(search.keys());
    if (keys.some(key => !['view', 'orderId', 'orderNumber', 'cursor'].includes(key))
      || keys.length !== new Set(keys).size) return null;
    const parsed = wosV1ReadQuerySchema.safeParse({
      view: search.get('view') ?? undefined,
      orderId: search.get('orderId') ?? undefined,
      orderNumber: search.get('orderNumber') ?? undefined,
      cursor: search.get('cursor') ?? undefined,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface WosV1AppRuntimeInput {
  readonly vercelEnv?: string;
  readonly supabaseUrl?: string;
  readonly authMode?: string;
  readonly appEnabled?: string;
  readonly writesEnabled?: string;
}

export interface WosV1AppRuntimeState {
  readonly project: WosSupabaseRuntime;
  readonly readsEnabled: boolean;
  readonly writesEnabled: boolean;
}

export interface WosV1QaAppRuntimeInput {
  readonly vercelEnv?: string;
  readonly supabaseUrl?: string;
  readonly authMode?: string;
  readonly qaEnabled?: string;
  readonly qaWritesEnabled?: string;
}

export interface WosV1QaAppRuntimeState extends WosV1AppRuntimeState {
  readonly adapter: 'qa-preview';
}

export function resolveWosV1AppRuntime(
  input: WosV1AppRuntimeInput,
): WosV1AppRuntimeState {
  const project = classifyWosSupabaseRuntime(input.supabaseUrl);
  const readsEnabled = project === 'production'
    && input.vercelEnv === 'production'
    && input.authMode === 'supabase'
    && input.appEnabled === 'true';
  return {
    project,
    readsEnabled,
    writesEnabled: readsEnabled && input.writesEnabled === 'true',
  };
}

export function canExposeWosV1App(input: WosV1AppRuntimeInput): boolean {
  return resolveWosV1AppRuntime(input).readsEnabled;
}

export function resolveWosV1QaAppRuntime(
  input: WosV1QaAppRuntimeInput,
): WosV1QaAppRuntimeState {
  const project = classifyWosSupabaseRuntime(input.supabaseUrl);
  const qaProjectPinned = project === 'qa'
    && input.supabaseUrl === 'https://' + WOS_QA_SUPABASE_REF + '.supabase.co';
  const readsEnabled = qaProjectPinned
    && input.vercelEnv === 'preview'
    && input.authMode === 'supabase'
    && input.qaEnabled === 'true';
  return {
    project,
    readsEnabled,
    // QA writes remain disabled in source until an order-scoped database Gate
    // and activation package are independently installed and reviewed.
    writesEnabled: false,
    adapter: 'qa-preview',
  };
}

export function canWosV1Read(role: unknown): boolean {
  return typeof role === 'string'
    && (WOS_V1_APP_READ_ROLES as readonly string[]).includes(role);
}

export function canWosV1OfficeWrite(role: unknown): boolean {
  return typeof role === 'string'
    && (WOS_V1_APP_OFFICE_ROLES as readonly string[]).includes(role);
}

export function canWosV1OperatorWrite(role: unknown): boolean {
  return typeof role === 'string'
    && (WOS_V1_APP_OPERATOR_ROLES as readonly string[]).includes(role);
}

export function wosV1RpcInvocation(request: WosV1AppRequest): {
  readonly rpc: string;
  readonly args: Record<string, unknown>;
} {
  switch (request.operation) {
    case 'CREATE_ORDER':
      return {
        rpc: 'wos_create_production_order',
        args: { p_request_id: request.requestId, p_payload: request.payload },
      };
    case 'REGISTER_IMAGE':
      return {
        rpc: 'wos_register_uploaded_reference_image',
        args: {
          p_order_id: request.orderId,
          p_image_id: request.imageId,
          p_category: request.category,
          p_storage_path: request.storagePath,
        },
      };
    case 'CONFIRM_OFFICE':
      return {
        rpc: 'wos_confirm_office_completeness',
        args: {
          p_order_id: request.orderId,
          p_expected_revision: request.expectedVersion,
          p_expected_label: request.expectedLabel,
          p_note: request.note,
        },
      };
    case 'SUBMIT_ORDER':
      return {
        rpc: 'wos_submit_production_order',
        args: {
          p_order_id: request.orderId,
          p_expected_revision: request.expectedVersion,
          p_expected_label: request.expectedLabel,
          p_idempotency_key: request.requestId,
        },
      };
    case 'OPERATOR_ACTION':
      return {
        rpc: 'wos_operator_order_action',
        args: {
          p_order_id: request.orderId,
          p_expected_version: request.expectedVersion,
          p_request_id: request.requestId,
          p_action: request.action,
          p_reason: request.reason,
        },
      };
    case 'SAVE_CORRECTION':
      return {
        rpc: 'wos_office_save_correction',
        args: {
          p_order_id: request.orderId,
          p_expected_version: request.expectedVersion,
          p_request_id: request.requestId,
          p_patch: request.patch,
          p_reason: request.reason,
        },
      };
    case 'RESUBMIT_ORDER':
      return {
        rpc: 'wos_office_resubmit_order',
        args: {
          p_order_id: request.orderId,
          p_expected_version: request.expectedVersion,
          p_request_id: request.requestId,
          p_reason: request.reason,
        },
      };
    case 'REVIEW_CORRECTION':
      return {
        rpc: 'wos_operator_review_correction',
        args: {
          p_order_id: request.orderId,
          p_expected_version: request.expectedVersion,
          p_request_id: request.requestId,
          p_note: request.note,
        },
      };
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isWosV1RpcResult(
  request: WosV1AppRequest,
  value: unknown,
): boolean {
  if (request.operation === 'CONFIRM_OFFICE') {
    return typeof value === 'string' && uuid.safeParse(value).success;
  }
  const row = object(value);
  if (!row) return false;
  if (request.operation === 'CREATE_ORDER') {
    return ['CREATED', 'REPLAYED'].includes(String(row.status))
      && row.requestId === request.requestId
      && uuid.safeParse(row.orderId).success
      && row.version === 1
      && row.versionLabel === 'V1'
      && row.workflowStatus === 'DRAFT';
  }
  if (request.operation === 'REGISTER_IMAGE') {
    return ['CREATED', 'REPLAYED'].includes(String(row.status))
      && row.imageId === request.imageId
      && row.bucket === 'wos-private';
  }
  if (request.operation === 'SUBMIT_ORDER') {
    return ['CREATED', 'REPLAYED'].includes(String(row.status))
      && row.orderId === request.orderId
      && uuid.safeParse(row.receiptId).success
      && uuid.safeParse(row.inboxTaskId).success
      && row.sourceRevision === request.expectedVersion
      && row.canStart === false;
  }
  if (request.operation === 'OPERATOR_ACTION') {
    return ['APPLIED', 'REPLAYED'].includes(String(row.status))
      && row.orderId === request.orderId
      && row.requestId === request.requestId
      && row.expectedVersion === request.expectedVersion
      && row.version === request.expectedVersion + 1
      && row.workflowStatus === (
        request.action === 'ACCEPT' ? 'WORKSHOP_REVIEW' : 'NEEDS_INFORMATION')
      && row.canStart === false;
  }
  if (request.operation === 'SAVE_CORRECTION'
    || request.operation === 'RESUBMIT_ORDER'
    || request.operation === 'REVIEW_CORRECTION') {
    const expectedStatus = request.operation === 'SAVE_CORRECTION'
      ? 'SAVED'
      : request.operation === 'RESUBMIT_ORDER' ? 'RESUBMITTED' : 'REVIEWED';
    const expectedWorkflow = request.operation === 'SAVE_CORRECTION'
      ? 'NEEDS_INFORMATION'
      : request.operation === 'RESUBMIT_ORDER' ? 'WORKSHOP_REVIEW' : 'WAITING_MATERIAL';
    return (row.status === expectedStatus || row.status === 'REPLAYED')
      && row.orderId === request.orderId
      && row.requestId === request.requestId
      && row.version === request.expectedVersion + 1
      && row.workflowStatus === expectedWorkflow
      && row.canStart === false
      && (request.operation !== 'REVIEW_CORRECTION'
        || (typeof row.resolvedBlockers === 'number'
          && Number.isInteger(row.resolvedBlockers) && row.resolvedBlockers > 0));
  }
  return false;
}

export function wosV1OperationRoleAllowed(
  request: WosV1AppRequest,
  role: unknown,
): boolean {
  return request.operation === 'OPERATOR_ACTION'
    || request.operation === 'REVIEW_CORRECTION'
    ? canWosV1OperatorWrite(role)
    : canWosV1OfficeWrite(role);
}

export function canonicalWosV1ImagePath(input: {
  readonly organizationId: string;
  readonly orderId: string;
  readonly versionLabel: string;
  readonly imageId: string;
  readonly category: (typeof WOS_V1_IMAGE_CATEGORIES)[number];
  readonly fileName: string;
}): string {
  return [
    'organizations',
    input.organizationId,
    'wos',
    'production-order',
    input.orderId,
    'images',
    WOS_V1_IMAGE_CATEGORY_SLUGS[input.category],
    'versions',
    input.versionLabel,
    input.imageId,
    input.fileName,
  ].join('/');
}
