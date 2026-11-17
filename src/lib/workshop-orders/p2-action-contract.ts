import { z } from 'zod';

/** QA-only contract. This file never grants database writes. */
export const WOS_P2_WRITE_ROLES = ['admin', 'manager', 'operator'] as const;
export const WOS_P2_RESOURCE_TYPES = ['FILM', 'FIXTURE', 'INCOMING_MATERIAL', 'SIGNED_SAMPLE'] as const;

const identity = {
  orderId: z.string().uuid(),
  expectedVersion: z.number().int().positive().max(2147483646),
  requestId: z.string().uuid(),
  note: z.string().trim().min(10).max(500),
};
const confirmed = z.object({
  ...identity,
  action: z.literal('CONFIRM_MATERIAL'),
  resourceType: z.enum(WOS_P2_RESOURCE_TYPES),
  resourceStatus: z.enum([
    'NOT_ARRIVED','PARTIALLY_ARRIVED','ARRIVED','VERSION_VERIFIED',
    'NOT_AVAILABLE','IN_PRODUCTION','FIT_VERIFIED',
    'QUANTITY_VERIFIED','MISSING','UPLOADED','PHYSICAL_SAMPLE_RECEIVED','VERIFIED',
  ]),
  quantityExpected: z.number().int().nonnegative().max(2147483647).nullable(),
  quantityArrived: z.number().int().nonnegative().max(2147483647).nullable(),
}).strict().superRefine((p,ctx) => {
  const allowed: Record<(typeof WOS_P2_RESOURCE_TYPES)[number], readonly string[]> = {
    FILM: ['NOT_ARRIVED','PARTIALLY_ARRIVED','ARRIVED','VERSION_VERIFIED'],
    FIXTURE: ['NOT_AVAILABLE','IN_PRODUCTION','ARRIVED','FIT_VERIFIED'],
    INCOMING_MATERIAL: ['NOT_ARRIVED','PARTIALLY_ARRIVED','ARRIVED','QUANTITY_VERIFIED'],
    SIGNED_SAMPLE: ['MISSING','UPLOADED','PHYSICAL_SAMPLE_RECEIVED','VERIFIED'],
  };
  if (!allowed[p.resourceType].includes(p.resourceStatus)) {
    ctx.addIssue({ code:'custom',path:['resourceStatus'],message:'INCOMPATIBLE_RESOURCE_STATUS' });
  }
  if (p.resourceType === 'INCOMING_MATERIAL'
      ? p.quantityExpected === null || p.quantityArrived === null
      : p.quantityExpected !== null || p.quantityArrived !== null) {
    ctx.addIssue({ code:'custom',path:['quantityExpected'],message:'QUANTITY_FIELDS_DENIED_OR_REQUIRED' });
  }
  if (p.resourceType === 'INCOMING_MATERIAL' && p.resourceStatus === 'QUANTITY_VERIFIED'
     && (p.quantityArrived === 0 || (p.quantityExpected ?? 0) === 0
       || (p.quantityArrived ?? 0) < (p.quantityExpected ?? 0))) {
    ctx.addIssue({ code:'custom',path:['quantityArrived'],message:'INCOMING_QUANTITY_NOT_VERIFIED' });
  }
});
const accept = z.object({ ...identity, action: z.literal('ACCEPT') }).strict();
const reject = z.object({ ...identity, action: z.literal('RETURN_FOR_INFORMATION') }).strict();

export type WosP2Action = z.infer<typeof accept> | z.infer<typeof reject> | z.infer<typeof confirmed>;

export function parseWosP2Action(raw: unknown): WosP2Action | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const action = (raw as Record<string, unknown>).action;
  const result = action === 'ACCEPT' ? accept.safeParse(raw)
    : action === 'RETURN_FOR_INFORMATION' ? reject.safeParse(raw)
    : action === 'CONFIRM_MATERIAL' ? confirmed.safeParse(raw)
    : null;
  return result?.success ? result.data : null;
}

export function canActOnWosP2(role: unknown): boolean {
  return typeof role === 'string' && (WOS_P2_WRITE_ROLES as readonly string[]).includes(role);
}

export function isWosP2QaMutationEnabled(env: {
  readonly vercelEnv?: string;
  readonly nodeEnv?: string;
  readonly flag?: string;
  readonly supabaseUrl?: string;
}): boolean {
  // Runtime opt-in is separate from code rollout and must be turned on only
  // after independent approval & installation of QA-only atomic RPC.
  if (env.flag !== 'true' || env.vercelEnv !== 'preview') return false;
  try {
    const url = new URL(env.supabaseUrl ?? '');
    return url.protocol === 'https:'
      && url.origin === 'https://xulmpqaknlwqqculbsek.supabase.co'
      && (url.pathname === '/' || url.pathname === '')
      && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export function wosP2RpcArgs(action: WosP2Action) {
  return {
    p_order_id: action.orderId,
    p_expected_version: action.expectedVersion,
    p_request_id: action.requestId,
    p_action: action.action,
    p_resource_type: action.action === 'CONFIRM_MATERIAL' ? action.resourceType : null,
    p_resource_status: action.action === 'CONFIRM_MATERIAL' ? action.resourceStatus : null,
    p_quantity_expected: action.action === 'CONFIRM_MATERIAL' ? action.quantityExpected : null,
    p_quantity_arrived: action.action === 'CONFIRM_MATERIAL' ? action.quantityArrived : null,
    p_note: action.note,
  } as const;
}

export function isWosP2RpcResult(value: unknown, action: WosP2Action): value is {
  status: 'APPLIED' | 'REPLAYED'; orderId: string; version: number;
  workflowStatus: string; requestId: string;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v=value as Record<string,unknown>;
  return (v.status === 'APPLIED' || v.status === 'REPLAYED')
    && v.orderId === action.orderId && v.requestId === action.requestId
    && typeof v.version === 'number' && Number.isInteger(v.version)
    && v.version === action.expectedVersion + 1
    && typeof v.workflowStatus === 'string'
    && ['WORKSHOP_REVIEW','NEEDS_INFORMATION','WAITING_MATERIAL','READINESS_CHECK'].includes(v.workflowStatus);
}
