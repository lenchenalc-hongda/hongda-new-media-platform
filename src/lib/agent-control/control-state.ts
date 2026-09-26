import { z } from 'zod';

export const AGENT_CONTROL_STATUSES = [
  'READY_FOR_CODEX',
  'CODEX_WORKING',
  'WAITING_REVIEW',
  'FIX_REQUIRED',
  'NEEDS_DECISION',
  'APPROVED_FOR_MERGE',
  'MERGED',
  'BLOCKED',
  'FAILED',
] as const;

export type AgentControlStatus = (typeof AGENT_CONTROL_STATUSES)[number];

const shaSchema = z.string().regex(/^[0-9a-f]{40}$/, 'expected lowercase 40-character SHA');

export const agentControlStateSchema = z.object({
  schema_version: z.literal(1),
  project: z.literal('customer-project-center'),
  status: z.enum(AGENT_CONTROL_STATUSES),
  current_phase: z.string().trim().min(1).max(200),
  current_task_id: z.string().trim().min(1).max(200).nullable(),
  active_pr: z.number().int().positive().nullable(),
  active_branch: z.string().trim().min(1).max(300).nullable(),
  verified_head: shaSchema,
  master_sha: shaSchema,
  fix_round: z.number().int().min(0),
  max_fix_rounds: z.number().int().min(1).max(10),
  auto_merge: z.literal(false),
  auto_production: z.literal(false),
}).strict().superRefine((state, context) => {
  if (state.fix_round > state.max_fix_rounds) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fix_round'],
      message: 'fix_round must be less than or equal to max_fix_rounds',
    });
  }

  if (
    (
      state.status === 'READY_FOR_CODEX'
      || state.status === 'CODEX_WORKING'
      || state.status === 'WAITING_REVIEW'
      || state.status === 'FIX_REQUIRED'
      || state.status === 'APPROVED_FOR_MERGE'
    )
    && !state.current_task_id
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['current_task_id'],
      message: `${state.status} requires current_task_id`,
    });
  }

  if (state.status === 'FIX_REQUIRED' && state.fix_round < 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fix_round'],
      message: 'FIX_REQUIRED requires fix_round >= 1',
    });
  }

  if (
    state.status === 'APPROVED_FOR_MERGE'
    && (state.active_pr === null || !state.verified_head)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'APPROVED_FOR_MERGE requires active_pr and verified_head',
    });
  }
});

export type AgentControlState = z.infer<typeof agentControlStateSchema>;

export function isExecutableAgentControlState(state: AgentControlState): boolean {
  return state.status === 'READY_FOR_CODEX' || state.status === 'FIX_REQUIRED';
}

export function buildAgentControlIdempotencyKey(
  repository: string,
  state: AgentControlState,
): string {
  if (!state.current_task_id) {
    throw new Error('current_task_id is required for the v1 idempotency key');
  }
  return `${repository}:${state.current_task_id}:${state.verified_head}`;
}
