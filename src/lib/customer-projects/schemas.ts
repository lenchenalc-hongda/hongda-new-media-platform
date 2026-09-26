import { z } from 'zod';
import {
  AI_DRAFT_PROPOSAL_TYPES,
  AI_DRAFT_STATUSES,
  CUSTOMER_REFERENCE_STATUSES,
  PROJECT_COLLABORATOR_ROLES,
  PROJECT_EVENT_CATEGORIES,
  PROJECT_EVENT_SOURCES,
  PROJECT_EVENT_TYPES,
  PROJECT_LIFECYCLE_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_TYPES,
  RISK_LEVELS,
  WAITING_ON_VALUES,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_TYPES,
  getProjectEventCategory,
  isValidExpectedAmountCurrency,
} from './domain';

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const isoDateSchema = z.string().date();
export const expectedVersionSchema = z.number().int().min(1);

export const customerReferenceSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  external_source: z.string().trim().min(1).max(100),
  external_customer_id: z.string().trim().min(1).max(200),
  display_name_snapshot: z.string().trim().min(1).max(300),
  external_owner_reference: z.string().trim().min(1).max(300).nullable(),
  source_synced_at: isoDateTimeSchema,
  status: z.enum(CUSTOMER_REFERENCE_STATUSES),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
}).strict();

export const projectSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  customer_reference_id: uuidSchema,
  title: z.string().trim().min(1).max(300),
  project_type: z.enum(PROJECT_TYPES),
  owner_profile_id: uuidSchema,
  status: z.enum(PROJECT_LIFECYCLE_STATUSES),
  stage: z.string().trim().min(1).max(100).nullable(),
  waiting_on: z.enum(WAITING_ON_VALUES),
  next_action_summary: z.string().trim().min(1).max(1000).nullable(),
  next_check_at: isoDateTimeSchema.nullable(),
  risk_level: z.enum(RISK_LEVELS).nullable(),
  priority: z.enum(PROJECT_PRIORITIES),
  expected_amount_minor: z.number().int().min(0).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  expected_close_date: isoDateSchema.nullable(),
  version: expectedVersionSchema,
  created_by_profile_id: uuidSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
}).strict().superRefine((project, context) => {
  if (!isValidExpectedAmountCurrency(project.expected_amount_minor, project.currency)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['currency'],
      message: 'expected_amount_minor and currency must be provided together',
    });
  }
});

export const projectCollaboratorSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  project_id: uuidSchema,
  profile_id: uuidSchema,
  collaborator_role: z.enum(PROJECT_COLLABORATOR_ROLES),
  added_by_profile_id: uuidSchema,
  created_at: isoDateTimeSchema,
}).strict();

export const projectEventSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  customer_reference_id: uuidSchema.nullable(),
  project_id: uuidSchema.nullable(),
  event_type: z.enum(PROJECT_EVENT_TYPES),
  event_category: z.enum(PROJECT_EVENT_CATEGORIES),
  occurred_at: isoDateTimeSchema,
  recorded_at: isoDateTimeSchema,
  actor_profile_id: uuidSchema,
  source: z.enum(PROJECT_EVENT_SOURCES),
  source_reference_id: z.string().trim().min(1).max(300).nullable(),
  raw_input: z.string().trim().min(1).max(10000).nullable(),
  payload: z.record(z.string(), z.unknown()),
  correction_of_event_id: uuidSchema.nullable(),
}).strict().superRefine((event, context) => {
  const expectedCategory = getProjectEventCategory(event.event_type);
  if (event.event_category !== expectedCategory) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['event_category'],
      message: `event_category must be ${expectedCategory} for ${event.event_type}`,
    });
  }
  if (!event.customer_reference_id && !event.project_id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customer_reference_id'],
      message: 'an event must reference a customer or project',
    });
  }
});

export const workItemSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  customer_reference_id: uuidSchema.nullable(),
  project_id: uuidSchema.nullable(),
  work_item_type: z.enum(WORK_ITEM_TYPES),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(5000).nullable(),
  assignee_profile_id: uuidSchema,
  created_by_profile_id: uuidSchema,
  due_at: isoDateTimeSchema.nullable(),
  status: z.enum(WORK_ITEM_STATUSES),
  priority: z.enum(WORK_ITEM_PRIORITIES),
  blocked_reason: z.string().trim().min(1).max(2000).nullable(),
  completed_at: isoDateTimeSchema.nullable(),
  completed_by_profile_id: uuidSchema.nullable(),
  cancelled_at: isoDateTimeSchema.nullable(),
  cancelled_by_profile_id: uuidSchema.nullable(),
  version: expectedVersionSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
}).strict().superRefine((item, context) => {
  if (item.status === 'blocked' && !item.blocked_reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['blocked_reason'],
      message: 'blocked work items require blocked_reason',
    });
  }
  if (item.status === 'completed' && (!item.completed_at || !item.completed_by_profile_id)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['completed_at'],
      message: 'completed work items require completion metadata',
    });
  }
  if (item.status === 'cancelled' && (!item.cancelled_at || !item.cancelled_by_profile_id)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cancelled_at'],
      message: 'cancelled work items require cancellation metadata',
    });
  }
});

export const aiDraftSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  raw_input: z.string().trim().min(1).max(20000),
  structured_proposal: z.unknown(),
  proposal_type: z.enum(AI_DRAFT_PROPOSAL_TYPES),
  customer_reference_id: uuidSchema.nullable(),
  project_id: uuidSchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  status: z.enum(AI_DRAFT_STATUSES),
  accepted_by_profile_id: uuidSchema.nullable(),
  accepted_at: isoDateTimeSchema.nullable(),
  rejected_by_profile_id: uuidSchema.nullable(),
  rejected_at: isoDateTimeSchema.nullable(),
  source_model: z.string().trim().min(1).max(200).nullable(),
  source_run_id: z.string().trim().min(1).max(300).nullable(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
}).strict().superRefine((draft, context) => {
  if (draft.status === 'accepted' && (!draft.accepted_by_profile_id || !draft.accepted_at)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['accepted_by_profile_id'],
      message: 'accepted drafts require acceptance metadata',
    });
  }
  if (draft.status === 'rejected' && (!draft.rejected_by_profile_id || !draft.rejected_at)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rejected_by_profile_id'],
      message: 'rejected drafts require rejection metadata',
    });
  }
});

export const metricValueSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('known'),
    value: z.number(),
  }).strict(),
  z.object({
    state: z.literal('unknown'),
    reason: z.string().trim().min(1).max(500),
  }).strict(),
]);

export const derivedReportSnapshotSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  period: z.enum(['daily', 'weekly']),
  period_start: isoDateSchema,
  period_end: isoDateSchema,
  timezone: z.string().trim().min(1).max(100),
  status: z.enum(['draft', 'submitted', 'superseded']),
  deterministic_metrics: z.record(z.string(), metricValueSchema),
  ai_narrative: z.string().trim().min(1).max(20000).nullable(),
  source_event_watermark: isoDateTimeSchema.nullable(),
  source_work_item_watermark: isoDateTimeSchema.nullable(),
  version: expectedVersionSchema,
  supersedes_report_id: uuidSchema.nullable(),
  submitted_by_profile_id: uuidSchema.nullable(),
  submitted_at: isoDateTimeSchema.nullable(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
}).strict();

export type CustomerReferenceInput = z.infer<typeof customerReferenceSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type ProjectCollaboratorInput = z.infer<typeof projectCollaboratorSchema>;
export type ProjectEventInput = z.infer<typeof projectEventSchema>;
export type WorkItemInput = z.infer<typeof workItemSchema>;
export type AIDraftInput = z.infer<typeof aiDraftSchema>;
export type DerivedReportSnapshotInput = z.infer<typeof derivedReportSnapshotSchema>;
