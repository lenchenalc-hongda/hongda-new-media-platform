import { z } from 'zod';
import {
  WOS_BASELINE_STATUSES,
  WOS_BLOCKER_STATUSES,
  WOS_CONFIRMATION_TYPES,
  WOS_ENTITY_TYPES,
  WOS_PRIORITIES,
  WOS_REFERENCE_IMAGE_STATUSES,
  WOS_REQUEST_STAGES,
  WOS_RESOURCE_TYPES,
  WOS_SAMPLING_OBJECTIVES,
} from './domain';

const uuid = z.string().uuid();
const nonEmpty = z.string().trim().min(1);
const positiveInt = z.number().int().positive();
const nullableUuid = uuid.nullable().optional();

export const productionOrderCreateSchema = z.object({
  organizationId: uuid,
  customerId: nullableUuid,
  customerNameSnapshot: nonEmpty.max(300),
  projectId: nullableUuid,
  projectNameSnapshot: z.string().trim().min(1).max(300).nullable().optional(),
  orderNumber: nonEmpty.max(120),
  productName: nonEmpty.max(300),
  salesOwnerProfileId: uuid,
  projectOwnerProfileId: uuid,
  priority: z.enum(WOS_PRIORITIES),
  isUrgent: z.boolean(),
  versionLabel: nonEmpty.max(120),
  requestedQuantity: positiveInt,
  currentBatchQuantity: positiveInt,
  plannedShipDate: z.string().date().nullable().optional(),
  splitDelivery: z.boolean().default(false),
  productMaterial: nonEmpty.max(200),
  surfaceTreatment: z.string().trim().min(1).max(300).nullable().optional(),
  patternScope: z.string().trim().min(1).max(300).nullable().optional(),
  seamTolerance: z.string().trim().min(1).max(300).nullable().optional(),
  positionReference: z.string().trim().min(1).max(500).nullable().optional(),
  customerAcceptanceStandard: z.string().trim().min(1).max(2000).nullable().optional(),
  packagingMethod: z.string().trim().min(1).max(500).nullable().optional(),
  cartonQuantity: z.number().int().positive().nullable().optional(),
  labelMarkingRule: z.string().trim().min(1).max(1000).nullable().optional(),
  createdByProfileId: uuid,
}).strict().superRefine((value, ctx) => {
  if (value.currentBatchQuantity > value.requestedQuantity) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['currentBatchQuantity'],
      message: 'current batch quantity cannot exceed requested quantity',
    });
  }
});

export const samplingRequestCreateSchema = z.object({
  organizationId: uuid,
  customerId: nullableUuid,
  customerNameSnapshot: nonEmpty.max(300),
  projectId: nullableUuid,
  projectNameSnapshot: z.string().trim().min(1).max(300).nullable().optional(),
  productName: nonEmpty.max(300),
  productOwnerProfileId: uuid,
  requestStage: z.enum(WOS_REQUEST_STAGES),
  objectives: z.array(z.enum(WOS_SAMPLING_OBJECTIVES)).min(1),
  versionLabel: nonEmpty.max(120),
  isUrgent: z.boolean(),
  productMaterial: nonEmpty.max(200),
  surfaceTreatment: z.string().trim().min(1).max(300).nullable().optional(),
  sampleInputQuantity: positiveInt,
  requiredGoodQuantity: positiveInt,
  specialFixtureRequired: z.boolean(),
  filmType: z.string().trim().min(1).max(200).nullable().optional(),
  riskNotes: z.string().trim().min(1).max(3000).nullable().optional(),
  createdByProfileId: uuid,
}).strict().superRefine((value, ctx) => {
  if (value.requiredGoodQuantity > value.sampleInputQuantity) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requiredGoodQuantity'],
      message: 'required good quantity cannot exceed sample input quantity',
    });
  }
});

export const resourceReadinessSchema = z.object({
  organizationId: uuid,
  entityType: z.enum(WOS_ENTITY_TYPES),
  entityId: uuid,
  resourceType: z.enum(WOS_RESOURCE_TYPES),
  status: nonEmpty.max(80),
  expectedAt: z.string().datetime({ offset: true }).nullable().optional(),
  arrivedAt: z.string().datetime({ offset: true }).nullable().optional(),
  quantityExpected: z.number().int().nonnegative().nullable().optional(),
  quantityArrived: z.number().int().nonnegative().nullable().optional(),
  versionLabel: z.string().trim().min(1).max(120).nullable().optional(),
  confirmedByProfileId: nullableUuid,
  confirmedAt: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().trim().min(1).max(2000).nullable().optional(),
}).strict();

export const referenceImageCreateSchema = z.object({
  organizationId: uuid,
  entityType: z.enum(WOS_ENTITY_TYPES),
  entityId: uuid,
  category: z.enum([
    'FILM_PATTERN',
    'PRODUCT',
    'CUSTOMER_APPROVED_SAMPLE',
    'SIGNED_SAMPLE',
    'SAMPLING_RESULT',
    'PACKAGING_LABEL',
    'DEFECT_RISK',
    'OTHER',
  ]),
  storageBucket: nonEmpty.max(120),
  storagePath: nonEmpty.max(1000),
  fileName: nonEmpty.max(500),
  mimeType: nonEmpty.max(200),
  fileSize: z.number().int().positive(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  caption: z.string().trim().min(1).max(1000).nullable().optional(),
  versionLabel: nonEmpty.max(120),
  imageStatus: z.enum(WOS_REFERENCE_IMAGE_STATUSES).default('UPLOADING'),
  supersedesImageId: nullableUuid,
  uploadedByProfileId: uuid,
}).strict();

export const visualBaselineCreateSchema = z.object({
  organizationId: uuid,
  entityType: z.enum(WOS_ENTITY_TYPES),
  entityId: uuid,
  versionLabel: nonEmpty.max(120),
  status: z.enum(WOS_BASELINE_STATUSES).default('DRAFT'),
  imageIds: z.array(uuid).min(1),
  requiredImageIds: z.array(uuid).default([]),
  confirmedByOfficeProfileId: nullableUuid,
}).strict().superRefine((value, ctx) => {
  const imageSet = new Set(value.imageIds);
  for (const requiredId of value.requiredImageIds) {
    if (!imageSet.has(requiredId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requiredImageIds'],
        message: 'required image must belong to imageIds',
      });
      break;
    }
  }
});

export const blockerCreateSchema = z.object({
  organizationId: uuid,
  entityType: z.enum(WOS_ENTITY_TYPES),
  entityId: uuid,
  blockerCode: nonEmpty.max(120),
  blockerCategory: nonEmpty.max(120),
  description: nonEmpty.max(2000),
  status: z.enum(WOS_BLOCKER_STATUSES).default('OPEN'),
  openedByProfileId: uuid,
}).strict();

export const confirmationCreateSchema = z.object({
  organizationId: uuid,
  entityType: z.enum(WOS_ENTITY_TYPES),
  entityId: uuid,
  confirmationType: z.enum(WOS_CONFIRMATION_TYPES),
  decision: z.enum(['CONFIRMED', 'REJECTED']),
  profileId: uuid,
  roleSnapshot: nonEmpty.max(120),
  note: z.string().trim().min(1).max(2000).nullable().optional(),
}).strict();

export const samplingTechnicalAttemptSchema = z.object({
  organizationId: uuid,
  samplingRequestId: uuid,
  attemptNumber: positiveInt,
  machineLabel: nonEmpty.max(200),
  temperature: z.number().finite().nullable().optional(),
  transferSeconds: z.number().positive().nullable().optional(),
  rollerHardness: z.string().trim().min(1).max(120).nullable().optional(),
  fixtureMode: z.string().trim().min(1).max(120).nullable().optional(),
  pressureLevel: z.enum(['LIGHT', 'MEDIUM', 'HEAVY']).nullable().optional(),
  pressureNote: z.string().trim().min(1).max(500).nullable().optional(),
  pretreatment: z.string().trim().min(1).max(1000).nullable().optional(),
  filmVersionLabel: z.string().trim().min(1).max(120).nullable().optional(),
  estimatedBulkEfficiency: z.string().trim().min(1).max(500).nullable().optional(),
  resultDecision: z.enum(['PASS', 'FAIL', 'CANNOT_SAMPLE']),
  failureReason: z.string().trim().min(1).max(2000).nullable().optional(),
  bulkRiskNotes: z.string().trim().min(1).max(2000).nullable().optional(),
  improvementRecommendation: z.string().trim().min(1).max(3000).nullable().optional(),
  technicianProfileId: uuid,
}).strict().superRefine((value, ctx) => {
  if (value.resultDecision !== 'PASS' && !value.failureReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['failureReason'],
      message: 'non-PASS result requires failureReason',
    });
  }
});

export const statusTransitionSchema = z.object({
  entityType: z.enum(WOS_ENTITY_TYPES),
  entityId: uuid,
  expectedVersion: z.number().int().positive(),
  fromStatus: nonEmpty.max(80),
  toStatus: nonEmpty.max(80),
  actorProfileId: uuid,
  reasonCode: nonEmpty.max(120),
  note: z.string().trim().min(1).max(2000).nullable().optional(),
}).strict();

export const directClientWorkflowMutationSchema = z.object({
  workflowStatus: z.never().optional(),
  resultDecision: z.never().optional(),
  startReleased: z.never().optional(),
}).strict();

export type ProductionOrderCreateInput = z.infer<typeof productionOrderCreateSchema>;
export type SamplingRequestCreateInput = z.infer<typeof samplingRequestCreateSchema>;
export type ResourceReadinessInput = z.infer<typeof resourceReadinessSchema>;
export type ReferenceImageCreateInput = z.infer<typeof referenceImageCreateSchema>;
export type VisualBaselineCreateInput = z.infer<typeof visualBaselineCreateSchema>;
export type BlockerCreateInput = z.infer<typeof blockerCreateSchema>;
export type ConfirmationCreateInput = z.infer<typeof confirmationCreateSchema>;
export type SamplingTechnicalAttemptInput = z.infer<typeof samplingTechnicalAttemptSchema>;
export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>;
