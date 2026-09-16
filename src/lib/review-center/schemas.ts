import { z } from 'zod';

export const reviewTypeSchema = z.enum(['A', 'B', 'C']);

export const reviewStatusSchema = z.enum([
  'draft',
  'submitted',
  'in_review',
  'action_required',
  'verifying',
  'closed',
  'archived',
  'rejected',
  'cancelled',
]);

export const riskLevelSchema = z.enum(['RED', 'YELLOW', 'GREEN']);

export function optionalText(maxLength: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(maxLength).nullable().optional(),
  );
}

export function optionalDate() {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.union([
      z.string().datetime({ offset: true }),
      z.string().date(),
    ]).nullable().optional(),
  );
}

export const createDraftSchema = z.object({
  review_type: reviewTypeSchema,
  title: z.string().trim().min(1, '标题不能为空').max(200),
  occurred_at: optionalDate(),
  customer_name: optionalText(200),
  order_no: optionalText(100),
  project_name: optionalText(200),
  product_name: optionalText(200),
  process_name: optionalText(200),
  description: optionalText(5000),
  impact_summary: optionalText(2000),
  risk_level: riskLevelSchema.nullable().optional(),
  risk_reason: optionalText(1000),
}).strict();

export const listQuerySchema = z.object({
  scope: z.enum(['all', 'mine']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: reviewStatusSchema.optional(),
  review_type: reviewTypeSchema.optional(),
  risk_level: riskLevelSchema.optional(),
  q: z.string().trim().max(100).optional(),
});

export const reviewIdSchema = z.object({
  id: z.string().uuid(),
});

export const uuidSchema = z.string().uuid();

export const expectedVersionSchema = z.number().int().min(1);

export const memberRoleSchema = z.enum([
  'TECH_PROCESS',
  'DESIGN_PLATE',
  'PRODUCTION',
  'QUALITY',
  'EXPERT_REVIEWER',
  'OTHER',
]);

export const expectedVersionRequestSchema = z.object({
  expectedVersion: expectedVersionSchema,
}).strict();

export const reviewMemberIdSchema = z.object({
  id: uuidSchema,
  memberId: uuidSchema,
});

export const updateDraftPatchSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200).optional(),
  review_type: reviewTypeSchema.optional(),
  occurred_at: optionalDate(),
  customer_name: optionalText(200),
  order_no: optionalText(100),
  project_name: optionalText(200),
  product_name: optionalText(200),
  process_name: optionalText(200),
  description: optionalText(5000),
  impact_summary: optionalText(2000),
  risk_level: riskLevelSchema.nullable().optional(),
  risk_reason: optionalText(1000),
}).strict();

export const updateDraftRequestSchema = z.object({
  expectedVersion: expectedVersionSchema,
  patch: updateDraftPatchSchema,
}).strict();

export const typeDetailsPatchSchema = z.object({
  additional_notes: z.record(z.string(), z.unknown()).nullable().optional(),
  pre_production_stage: optionalText(5000),
  problem_found_stage: optionalText(5000),
  order_loss_reason: optionalText(5000),
  customer_trust_impact: optionalText(5000),
  customer_notified: z.boolean().nullable().optional(),
  abnormal_phase: optionalText(5000),
  abnormal_phenomenon: optionalText(5000),
  defect_rate: z.number().nullable().optional(),
  defect_items: optionalText(5000),
  delivery_impact: optionalText(5000),
  onsite_records: optionalText(5000),
  frontend_stage: optionalText(5000),
  production_stage: optionalText(5000),
  root_cause_summary: optionalText(5000),
  responsibility: optionalText(5000),
  improvement_advice: optionalText(5000),
}).strict();

export const typeDetailsRequestSchema = z.object({
  expectedVersion: expectedVersionSchema,
  patch: typeDetailsPatchSchema,
}).strict();

export const metadataCodeSchema = z.string().trim().min(1, '分类代码不能为空').max(100);

export function optionalMetadataOtherText() {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(200).nullable(),
  );
}

export const metadataMaterialInputSchema = z.object({
  code: metadataCodeSchema,
  isPrimary: z.boolean(),
}).strict();

export const metadataOtherInputSchema = z.object({
  materialOtherText: optionalMetadataOtherText(),
  processOtherText: optionalMetadataOtherText(),
  problemDomainOtherText: optionalMetadataOtherText(),
  problemSymptomOtherText: optionalMetadataOtherText(),
}).strict();

export const metadataMutationSchema = z.object({
  expectedVersion: expectedVersionSchema,
  materials: z.array(metadataMaterialInputSchema).max(50),
  processes: z.array(metadataCodeSchema).max(50),
  problemDomains: z.array(metadataCodeSchema).max(50),
  problemSymptoms: z.array(metadataCodeSchema).max(50),
  other: metadataOtherInputSchema,
  reason: z.string().trim().max(1000).optional(),
}).strict();

export type MetadataMutationInput = z.infer<typeof metadataMutationSchema>;

export const addMemberRequestSchema = z.object({
  expectedVersion: expectedVersionSchema,
  profileId: uuidSchema,
  memberRole: memberRoleSchema,
}).strict();

export const assignmentsRequestSchema = z.object({
  expectedVersion: expectedVersionSchema,
  ownerId: uuidSchema,
  pmoId: uuidSchema.nullable().optional(),
}).strict();

export const directoryPurposeSchema = z.enum(['MEMBER', 'ASSIGNMENT', 'ACTION_OWNER']);

export const profileDirectoryQuerySchema = z.object({
  purpose: directoryPurposeSchema,
}).strict();

export type CreateDraftSchemaInput = z.infer<typeof createDraftSchema>;
export type ListQuerySchemaInput = z.infer<typeof listQuerySchema>;
