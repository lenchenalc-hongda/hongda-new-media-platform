import { z } from 'zod';
import {
  GLH_CONVERSATION_MODES,
  GLH_LIFECYCLE_STATES,
  GLH_PRIORITY_GRADES,
} from './domain';
import {
  GLH_LEAD_DUE_FILTERS,
  GLH_REQUIREMENT_TYPES,
  GLH_SOURCE_PLATFORMS,
  type GlhLeadListFilters,
} from './read-model';

export const GLH_MANUAL_CREATION_ENABLED_ENV = 'GLH_ENABLE_TEST_DEV_MANUAL_LEAD_CREATION';
export const GLH_MANUAL_CREATION_RUNTIME_ENV = 'GLH_RUNTIME_ENV';
export const GLH_MANUAL_CREATION_GUARD_ENV = 'GLH_MANUAL_CREATION_GUARD';
export const GLH_MANUAL_CREATION_GUARD_VALUE = 'test-dev-only';
export const GLH_MANUAL_CREATION_DB_ENVIRONMENT_SETTING = 'app.environment';
export const GLH_MANUAL_CREATION_DB_GUARD_SETTING = 'app.glh_manual_creation_guard';

const optionalTrimmed = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform(value => value || null);

export const glhManualLeadCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  companyName: optionalTrimmed(300),
  countryCode: optionalTrimmed(16),
  whatsapp: optionalTrimmed(64),
  email: z.string().trim().email().max(320).nullable().optional()
    .transform(value => value || null),
  sourcePlatform: z.enum(GLH_SOURCE_PLATFORMS).default('UNKNOWN'),
  requirementType: z.enum(GLH_REQUIREMENT_TYPES).nullable().optional(),
  lifecycleState: z.enum(GLH_LIFECYCLE_STATES).default('NEW'),
  conversationMode: z.enum(GLH_CONVERSATION_MODES).default('AI_ACTIVE'),
  product: optionalTrimmed(300),
  material: optionalTrimmed(300),
  quantity: optionalTrimmed(200),
  notes: optionalTrimmed(2000),
  ownerProfileId: z.string().uuid().nullable().optional(),
  priorityGrade: z.enum(GLH_PRIORITY_GRADES).nullable().optional(),
  score: z.number().int().min(0).max(100).default(0),
  completeness: z.number().int().min(0).max(100).default(0),
}).strict().superRefine((value, context) => {
  if (!value.priorityGrade) return;
  const expected = value.score >= 80
    ? 'A'
    : value.score >= 60
      ? 'B'
      : value.score >= 30
        ? 'C'
        : 'D';
  if (value.priorityGrade !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['priorityGrade'],
      message: 'priorityGrade must match the validated score band',
    });
  }
});

export const glhLeadAssignmentSchema = z.object({
  assigneeProfileId: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
  reason: z.string().trim().max(500).nullable().optional().transform(value => value || null),
}).strict();

export const GLH_TASK_TYPES = [
  'QUALIFICATION',
  'FOLLOW_UP',
  'QUOTATION',
  'SAMPLE',
  'NEGOTIATION',
  'HANDOFF',
  'OTHER',
] as const;

export const GLH_FOLLOWUP_TYPES = [
  'QUALIFICATION',
  'QUOTATION',
  'SAMPLE',
  'NEGOTIATION',
  'DORMANT_REVIVAL',
  'OTHER',
] as const;

export function serializeGlhLocalDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const glhTaskOrFollowupSchema = z.object({
  leadId: z.string().uuid(),
  kind: z.enum(['TASK', 'FOLLOWUP']),
  type: z.enum([
    'QUALIFICATION',
    'FOLLOW_UP',
    'QUOTATION',
    'SAMPLE',
    'NEGOTIATION',
    'HANDOFF',
    'OTHER',
    'DORMANT_REVIVAL',
  ]),
  title: z.string().trim().min(1).max(300),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  assigneeProfileId: z.string().uuid().nullable().optional(),
}).strict().superRefine((value, context) => {
  const allowed = value.kind === 'TASK' ? GLH_TASK_TYPES : GLH_FOLLOWUP_TYPES;
  if (!(allowed as readonly string[]).includes(value.type)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['type'],
      message: `type is not valid for ${value.kind}`,
    });
  }
  if (value.kind === 'FOLLOWUP' && !value.dueAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dueAt'],
      message: 'follow-up dueAt is required',
    });
  }
});

export type GlhManualLeadCreateInput = z.infer<typeof glhManualLeadCreateSchema>;
export type GlhLeadAssignmentInput = z.infer<typeof glhLeadAssignmentSchema>;
export type GlhTaskOrFollowupInput = z.infer<typeof glhTaskOrFollowupSchema>;

export interface GlhManualCreationGuardInput {
  nodeEnv?: string;
  runtimeEnv?: string;
  enabled?: string;
  guard?: string;
}

export function evaluateGlhManualCreationGuard(
  input: GlhManualCreationGuardInput,
): { allowed: true; guard: string } | { allowed: false; reason: string } {
  if (input.nodeEnv === 'production' || input.runtimeEnv === 'production') {
    return { allowed: false, reason: 'production_is_never_allowed' };
  }
  if (input.enabled !== 'true') {
    return { allowed: false, reason: 'explicit_enable_flag_required' };
  }
  if (input.guard !== GLH_MANUAL_CREATION_GUARD_VALUE) {
    return { allowed: false, reason: 'explicit_test_dev_guard_required' };
  }
  return { allowed: true, guard: input.guard };
}

export function getGlhManualCreationGuard(): ReturnType<typeof evaluateGlhManualCreationGuard> {
  return evaluateGlhManualCreationGuard({
    nodeEnv: process.env.NODE_ENV,
    runtimeEnv: process.env[GLH_MANUAL_CREATION_RUNTIME_ENV],
    enabled: process.env[GLH_MANUAL_CREATION_ENABLED_ENV],
    guard: process.env[GLH_MANUAL_CREATION_GUARD_ENV],
  });
}

export function parseGlhLeadListFilters(
  searchParams: URLSearchParams,
): GlhLeadListFilters {
  const filters: GlhLeadListFilters = {};
  const source = searchParams.get('source');
  const requirement = searchParams.get('requirement');
  const grade = searchParams.get('grade');
  const lifecycle = searchParams.get('lifecycle');
  const due = searchParams.get('due');

  if (source && (GLH_SOURCE_PLATFORMS as readonly string[]).includes(source)) {
    filters.source = source as GlhLeadListFilters['source'];
  }
  if (requirement && (GLH_REQUIREMENT_TYPES as readonly string[]).includes(requirement)) {
    filters.requirement = requirement as GlhLeadListFilters['requirement'];
  }
  if (grade && (GLH_PRIORITY_GRADES as readonly string[]).includes(grade)) {
    filters.grade = grade as GlhLeadListFilters['grade'];
  }
  if (lifecycle && (GLH_LIFECYCLE_STATES as readonly string[]).includes(lifecycle)) {
    filters.lifecycle = lifecycle as GlhLeadListFilters['lifecycle'];
  }
  if (due && (GLH_LEAD_DUE_FILTERS as readonly string[]).includes(due)) {
    filters.due = due as GlhLeadListFilters['due'];
  }

  const country = searchParams.get('country')?.trim();
  const ownerProfileId = searchParams.get('owner')?.trim();
  const adCreative = searchParams.get('adCreative')?.trim();
  const search = searchParams.get('search')?.trim();

  if (country) filters.country = country.slice(0, 100);
  if (ownerProfileId && z.string().uuid().safeParse(ownerProfileId).success) {
    filters.ownerProfileId = ownerProfileId;
  }
  if (adCreative) filters.adCreative = adCreative.slice(0, 200);
  if (search) filters.search = search.slice(0, 200);

  return filters;
}
