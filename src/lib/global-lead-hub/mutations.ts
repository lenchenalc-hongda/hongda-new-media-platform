import type { GlhAccessContext } from './access';
import {
  type GlhLeadAssignmentInput,
  type GlhManualLeadCreateInput,
  type GlhTaskOrFollowupInput,
} from './validation';

interface GlhRpcError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

interface GlhRpcResult {
  data: unknown;
  error: GlhRpcError | null;
}

export interface GlhMutationClient {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<GlhRpcResult>;
}

export type GlhMutationErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'ACCESS_DENIED'
  | 'INVALID_INPUT'
  | 'VERSION_CONFLICT'
  | 'MANUAL_CREATION_DISABLED'
  | 'RPC_UNAVAILABLE'
  | 'MUTATION_FAILED';

export class GlhMutationError extends Error {
  readonly code: GlhMutationErrorCode;
  readonly status: number;

  constructor(code: GlhMutationErrorCode, message: string, status: number) {
    super(message);
    this.name = 'GlhMutationError';
    this.code = code;
    this.status = status;
  }
}

function mapRpcError(error: GlhRpcError): GlhMutationError {
  const message = error.message ?? '';
  if (error.code === '42501' || message.includes('ACCESS_DENIED')) {
    return new GlhMutationError('ACCESS_DENIED', 'Access denied', 403);
  }
  if (message.includes('MANUAL_CREATION_DISABLED')) {
    return new GlhMutationError(
      'MANUAL_CREATION_DISABLED',
      'Manual test/dev lead creation is disabled',
      403,
    );
  }
  if (error.code === '40001' || message.includes('VERSION_CONFLICT')) {
    return new GlhMutationError(
      'VERSION_CONFLICT',
      'The lead changed before this action completed',
      409,
    );
  }
  if (error.code === '22023' || error.code === '22P02' || message.includes('INVALID_')) {
    return new GlhMutationError('INVALID_INPUT', 'The submitted values are invalid', 400);
  }
  return new GlhMutationError('MUTATION_FAILED', 'The GLH action could not be completed', 500);
}

function requireRpcData(result: GlhRpcResult): Record<string, unknown> {
  if (result.error) throw mapRpcError(result.error);
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
    throw new GlhMutationError('RPC_UNAVAILABLE', 'The GLH action returned no result', 500);
  }
  return result.data as Record<string, unknown>;
}

export async function createGlhManualTestLead(
  client: GlhMutationClient,
  input: GlhManualLeadCreateInput,
  guard: string,
) {
  const result = await client.rpc('glh_create_manual_test_lead', {
    p_manual_creation_guard: guard,
    p_display_name: input.displayName,
    p_company_name: input.companyName ?? null,
    p_country_code: input.countryCode ?? null,
    p_whatsapp: input.whatsapp ?? null,
    p_email: input.email ?? null,
    p_source_platform: input.sourcePlatform,
    p_requirement_type: input.requirementType ?? null,
    p_lifecycle_state: input.lifecycleState,
    p_conversation_mode: input.conversationMode,
    p_priority_grade: input.priorityGrade ?? null,
    p_score: input.score,
    p_completeness: input.completeness,
    p_owner_profile_id: input.ownerProfileId ?? null,
    p_product: input.product ?? null,
    p_material: input.material ?? null,
    p_quantity: input.quantity ?? null,
    p_notes: input.notes ?? null,
  });
  return requireRpcData(result);
}

export async function assignGlhLead(
  client: GlhMutationClient,
  context: GlhAccessContext,
  leadId: string,
  input: GlhLeadAssignmentInput,
) {
  if (context.role !== 'ADMIN' && context.role !== 'MANAGER') {
    throw new GlhMutationError('ACCESS_DENIED', 'Manager or Admin role required', 403);
  }

  const result = await client.rpc('glh_assign_lead', {
    p_lead_id: leadId,
    p_assignee_profile_id: input.assigneeProfileId,
    p_expected_version: input.expectedVersion,
    p_reason: input.reason ?? null,
  });
  return requireRpcData(result);
}

export async function createGlhTaskOrFollowup(
  client: GlhMutationClient,
  input: GlhTaskOrFollowupInput,
) {
  const result = await client.rpc('glh_create_task_or_followup', {
    p_lead_id: input.leadId,
    p_work_kind: input.kind,
    p_work_type: input.type,
    p_title: input.title,
    p_due_at: input.dueAt ?? null,
    p_assignee_profile_id: input.assigneeProfileId ?? null,
  });
  return requireRpcData(result);
}
