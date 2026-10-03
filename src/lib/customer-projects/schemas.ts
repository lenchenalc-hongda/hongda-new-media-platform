import { z } from 'zod';
import {
  AI_DRAFT_PROPOSAL_TYPES,
  AI_DRAFT_STATUSES,
  CANONICAL_CUSTOMER_REFERENCE_STATUSES,
  PROJECT_COLLABORATOR_ROLES,
  PROJECT_EVENT_CATEGORIES,
  PROJECT_EVENT_SOURCES,
  PROJECT_EVENT_TYPES,
  PROJECT_LIFECYCLE_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_TYPES,
  PROVISIONAL_CUSTOMER_REFERENCE_STATUSES,
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

export const canonicalCustomerReferenceSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  reference_kind: z.literal('canonical'),
  external_source: z.string().trim().min(1).max(100),
  external_customer_id: z.string().trim().min(1).max(200),
  display_name_snapshot: z.string().trim().min(1).max(300),
  external_owner_reference: z.string().trim().min(1).max(300).nullable(),
  source_synced_at: isoDateTimeSchema,
  status: z.enum(CANONICAL_CUSTOMER_REFERENCE_STATUSES),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
}).strict();

export const provisionalCustomerReferenceSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  reference_kind: z.literal('provisional'),
  provisional_source_reference: z.string().trim().min(1).max(300),
  display_name_snapshot: z.string().trim().min(1).max(300),
  status: z.enum(PROVISIONAL_CUSTOMER_REFERENCE_STATUSES),
  mapped_canonical_reference_id: uuidSchema.nullable(),
  created_by_profile_id: uuidSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
}).strict();

export const customerReferenceSchema = z.discriminatedUnion('reference_kind', [
  canonicalCustomerReferenceSchema,
  provisionalCustomerReferenceSchema,
]).superRefine((reference, context) => {
  if (
    reference.reference_kind === 'provisional'
    && reference.status === 'mapped'
    && !reference.mapped_canonical_reference_id
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mapped_canonical_reference_id'],
      message: 'mapped provisional references require mapped_canonical_reference_id',
    });
  }
});

export const projectSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  customer_reference_id: uuidSchema,
  title: z.string().trim().min(1).max(300),
  objective_summary: z.string().trim().min(1).max(2000),
  project_type: z.enum(PROJECT_TYPES),
  owner_profile_id: uuidSchema,
  status: z.enum(PROJECT_LIFECYCLE_STATUSES),
  stage: z.string().trim().min(1).max(100),
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
  if (project.status === 'paused' && !project.next_check_at) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['next_check_at'],
      message: 'paused projects require next_check_at',
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
  actor_profile_id: uuidSchema.nullable(),
  source: z.enum(PROJECT_EVENT_SOURCES),
  source_reference_id: z.string().trim().min(1).max(300).nullable(),
  raw_input: z.string().trim().min(1).max(10000).nullable(),
  payload_schema_version: z.number().int().min(1),
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
  if (
    [
      'QUOTE_SENT',
      'SAMPLE_SENT',
      'CUSTOMER_CONFIRMED',
      'COMMERCIAL_CONFIRMED',
      'ORDER_CONFIRMED',
    ].includes(event.event_type)
    && (
      typeof event.payload.evidence_reference !== 'string'
      || event.payload.evidence_reference.trim().length === 0
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payload', 'evidence_reference'],
      message: 'commercial confirmation events require payload.evidence_reference',
    });
  }
  if (
    event.event_type === 'PROJECT_PAUSED'
    && (
      typeof event.payload.pause_reason !== 'string'
      || event.payload.pause_reason.trim().length === 0
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payload', 'pause_reason'],
      message: 'pausing a project requires payload.pause_reason',
    });
  }
  if (
    event.event_type === 'PROJECT_REOPENED'
    && (
      typeof event.payload.reopen_reason !== 'string'
      || event.payload.reopen_reason.trim().length === 0
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payload', 'reopen_reason'],
      message: 'reopening a lost project requires payload.reopen_reason',
    });
  }
  if (event.source === 'user' && !event.actor_profile_id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['actor_profile_id'],
      message: 'user events require actor_profile_id',
    });
  }
  if (event.source === 'accepted_ai_draft' && (
    !event.actor_profile_id || !event.source_reference_id
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['actor_profile_id'],
      message: 'accepted AI events require human actor and source reference',
    });
  }
  if (event.source === 'integration' && !event.source_reference_id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['source_reference_id'],
      message: 'integration events require source_reference_id',
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
  const hasAcceptedMetadata =
    draft.accepted_by_profile_id !== null || draft.accepted_at !== null;
  const hasRejectedMetadata =
    draft.rejected_by_profile_id !== null || draft.rejected_at !== null;

  if (draft.status === 'accepted' && (
    !draft.accepted_by_profile_id
    || !draft.accepted_at
    || hasRejectedMetadata
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'accepted drafts require only complete acceptance metadata',
    });
  }
  if (draft.status === 'rejected' && (
    !draft.rejected_by_profile_id
    || !draft.rejected_at
    || hasAcceptedMetadata
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'rejected drafts require only complete rejection metadata',
    });
  }
  if ((draft.status === 'draft' || draft.status === 'expired') && (
    hasAcceptedMetadata || hasRejectedMetadata
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'draft and expired AI drafts cannot carry terminal metadata',
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

export const ingestionCursorSchema = z.discriminatedUnion('cursor_kind', [
  z.object({
    cursor_kind: z.literal('recorded_at_id'),
    recorded_at: isoDateTimeSchema,
    record_id: uuidSchema,
  }).strict(),
  z.object({
    cursor_kind: z.literal('monotonic_sequence'),
    sequence: z.number().int().min(0),
  }).strict(),
]);

export const derivedReportSnapshotSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  subject_profile_id: uuidSchema,
  period_type: z.enum(['daily', 'weekly']),
  period_start: isoDateSchema,
  period_end: isoDateSchema,
  revision_no: z.number().int().min(1),
  status: z.enum(['draft', 'submitted']),
  metrics_schema_version: z.number().int().min(1),
  deterministic_metrics: z.record(z.string(), metricValueSchema),
  narrative: z.string().trim().max(20000).nullable(),
  unknowns: z.array(z.unknown()),
  source_event_seq: z.number().int().min(0).nullable(),
  source_audit_seq: z.number().int().min(0).nullable(),
  supersedes_report_id: uuidSchema.nullable(),
  created_by_profile_id: uuidSchema,
  submitted_by_profile_id: uuidSchema.nullable(),
  submitted_at: isoDateTimeSchema.nullable(),
  version: expectedVersionSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
}).strict().superRefine((report, context) => {
  if (report.period_start > report.period_end) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['period_end'],
      message: 'report period_start must be <= period_end',
    });
  }

  const hasSubmissionMetadata = report.submitted_by_profile_id !== null
    || report.submitted_at !== null;

  if (report.status === 'draft' && hasSubmissionMetadata) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'draft reports cannot carry submission metadata',
    });
  }
  if (report.status === 'submitted' && (
    !report.submitted_by_profile_id || !report.submitted_at
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'submitted reports require complete submission metadata',
    });
  }
});

export type CustomerReferenceInput = z.infer<typeof customerReferenceSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type ProjectCollaboratorInput = z.infer<typeof projectCollaboratorSchema>;
export type ProjectEventInput = z.infer<typeof projectEventSchema>;
export type WorkItemInput = z.infer<typeof workItemSchema>;
export type AIDraftInput = z.infer<typeof aiDraftSchema>;
export type DerivedReportSnapshotInput = z.infer<typeof derivedReportSnapshotSchema>;
