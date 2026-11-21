import { z } from 'zod';
import { isApprovedWosSandboxUrl } from './api-contract';

export const WOS_P2_M2_ACTIONS = [
  'MATERIAL_RECORD',
  'BASELINE_SELECT',
  'BASELINE_OFFICE_CONFIRM',
  'BASELINE_WORKSHOP_CONFIRM',
  'FINAL_READINESS_CONFIRM',
] as const;

const identity = {
  orderId: z.string().uuid(),
  expectedVersion: z.number().int().positive().max(2147483646),
  requestId: z.string().uuid(),
};
const note = z.string().trim().min(10).max(500);
const material = z.object({
  ...identity,
  action: z.literal('MATERIAL_RECORD'),
  payload: z.object({
    productionVersionLabel: z.string().min(1).max(80),
    note,
    resourceType: z.enum(['FILM', 'FIXTURE', 'INCOMING_MATERIAL', 'SIGNED_SAMPLE']),
    resourceStatus: z.string().min(1).max(40),
    expectedAt: z.string().datetime({ offset: true }).nullable().optional(),
    arrivedAt: z.string().datetime({ offset: true }).nullable().optional(),
    quantityExpected: z.number().int().nonnegative().max(2147483647).nullable().optional(),
    quantityArrived: z.number().int().nonnegative().max(2147483647).nullable().optional(),
    physicalCheckAttested: z.boolean(),
  }).strict(),
}).strict();
const baselineSelect = z.object({
  ...identity,
  action: z.literal('BASELINE_SELECT'),
  payload: z.object({
    productionVersionLabel: z.string().min(1).max(80),
    note,
    imageIds: z.array(z.string().uuid()).min(4).max(12),
  }).strict(),
}).strict();
const baselineConfirm = z.object({
  ...identity,
  action: z.enum(['BASELINE_OFFICE_CONFIRM', 'BASELINE_WORKSHOP_CONFIRM']),
  payload: z.object({
    productionVersionLabel: z.string().min(1).max(80),
    note,
    baselineId: z.string().uuid(),
  }).strict(),
}).strict();
const finalReadiness = z.object({
  ...identity,
  action: z.literal('FINAL_READINESS_CONFIRM'),
  payload: z.object({
    productionVersionLabel: z.string().min(1).max(80),
    note,
    baselineId: z.string().uuid(),
    physicalCheckAttested: z.literal(true),
    filmArrivedAt: z.string().datetime({ offset: true }),
    fixtureArrivedAt: z.string().datetime({ offset: true }),
    incomingArrivedAt: z.string().datetime({ offset: true }),
    signedSampleArrivedAt: z.string().datetime({ offset: true }),
    quantityExpected: z.number().int().positive().max(2147483647),
    quantityArrived: z.number().int().positive().max(2147483647),
  }).strict(),
}).strict();

export type WosP2M2Action =
  | z.infer<typeof material>
  | z.infer<typeof baselineSelect>
  | z.infer<typeof baselineConfirm>
  | z.infer<typeof finalReadiness>;

export function parseWosP2M2Action(value: unknown): WosP2M2Action | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const action = (value as Record<string, unknown>).action;
  const result = action === 'MATERIAL_RECORD' ? material.safeParse(value)
    : action === 'BASELINE_SELECT' ? baselineSelect.safeParse(value)
    : action === 'BASELINE_OFFICE_CONFIRM' || action === 'BASELINE_WORKSHOP_CONFIRM'
      ? baselineConfirm.safeParse(value)
    : action === 'FINAL_READINESS_CONFIRM'
      ? finalReadiness.safeParse(value)
      : null;
  return result?.success ? result.data : null;
}

export function canActOnWosP2M2(action: unknown, role: unknown): boolean {
  if (typeof role !== 'string') return false;
  if (action === 'MATERIAL_RECORD' || action === 'BASELINE_WORKSHOP_CONFIRM'
    || action === 'FINAL_READINESS_CONFIRM') {
    return ['admin', 'manager', 'operator'].includes(role);
  }
  if (action === 'BASELINE_SELECT' || action === 'BASELINE_OFFICE_CONFIRM') {
    return ['admin', 'manager', 'sales'].includes(role);
  }
  return false;
}

export function isWosP2M2Enabled(env: {
  readonly vercelEnv?: string;
  readonly nodeEnv?: string;
  readonly flag?: string;
  readonly supabaseUrl?: string;
  readonly allowLocal?: string;
  readonly publicAllowLocal?: string;
}): boolean {
  if (env.vercelEnv !== 'preview' || env.flag !== 'true') return false;
  return isApprovedWosSandboxUrl(env.supabaseUrl, {
    nodeEnv: env.nodeEnv,
    allowLocal: env.allowLocal,
    publicAllowLocal: env.publicAllowLocal,
  });
}

export function wosP2M2RpcArgs(action: WosP2M2Action) {
  return {
    p_order_id: action.orderId,
    p_expected_version: action.expectedVersion,
    p_request_id: action.requestId,
    p_action: action.action,
    p_payload: action.payload,
  } as const;
}

export function isWosP2M2Result(
  value: unknown,
  action: WosP2M2Action,
): value is {
  status: 'APPLIED' | 'REPLAYED';
  orderId: string;
  requestId: string;
  version: number;
  productionVersionLabel: string;
  proofStatus: 'UNVERIFIED';
  canStart: false;
  workflowStatus: 'WAITING_MATERIAL' | 'READINESS_CHECK';
  baselineId?: string | null;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (row.status === 'APPLIED' || row.status === 'REPLAYED')
    && row.orderId === action.orderId
    && row.requestId === action.requestId
    && row.version === action.expectedVersion + 1
    && row.productionVersionLabel === action.payload.productionVersionLabel
    && row.proofStatus === 'UNVERIFIED'
    && row.canStart === false
    && (action.action === 'FINAL_READINESS_CONFIRM'
      ? row.workflowStatus === 'READINESS_CHECK'
      : row.workflowStatus === 'WAITING_MATERIAL' || row.workflowStatus === 'READINESS_CHECK');
}
