import { z } from 'zod';

export const caseNoSchema = z.string().regex(
  /^CASE-[0-9]{4}-[0-9]{6}$/,
  'caseNo must match CASE-YYYY-######',
);

export const caseExpectedVersionSchema = z.number().finite().int().min(1);

export const caseStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']);
export const caseReviewTypeSchema = z.enum(['A', 'B', 'C']);
export const caseRiskLevelSchema = z.enum(['RED', 'YELLOW', 'GREEN']);
export const caseMetadataTypeSchema = z.enum([
  'MATERIAL',
  'PROCESS',
  'PROBLEM_DOMAIN',
  'PROBLEM_SYMPTOM',
]);

export const caseIsoDateSchema = z.string().datetime({ offset: true });

const caseOptionalTrimmedText = (maxLength: number) => z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(maxLength).nullable(),
);

export const caseCreateRequestSchema = z.object({
  sourceReviewId: z.string().uuid(),
  expectedReviewVersion: caseExpectedVersionSchema,
  title: z.string().trim().min(1).max(200),
}).strict();

export const caseUpdatePatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: caseOptionalTrimmedText(5000).optional(),
  lessonSummary: caseOptionalTrimmedText(5000).optional(),
  preventionSummary: caseOptionalTrimmedText(5000).optional(),
  applicabilityNotes: caseOptionalTrimmedText(2000).optional(),
}).strict();

export const caseUpdateRequestSchema = z.object({
  expectedVersion: caseExpectedVersionSchema,
  patch: caseUpdatePatchSchema,
}).strict();

export const casePublishRequestSchema = z.object({
  expectedVersion: caseExpectedVersionSchema,
  expectedSourceReviewVersion: caseExpectedVersionSchema,
}).strict();

export const caseHideRequestSchema = z.object({
  expectedVersion: caseExpectedVersionSchema,
  reason: z.string().trim().min(1).max(1000),
}).strict();

export const caseReopenRequestSchema = z.object({
  expectedVersion: caseExpectedVersionSchema,
}).strict();

export const caseMutationResultSchema = z.object({
  id: z.string().uuid(),
  caseNo: caseNoSchema,
  status: caseStatusSchema,
  version: caseExpectedVersionSchema,
  sourceReviewVersion: caseExpectedVersionSchema,
}).strict();

export const caseMetadataCodeSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
}).strict();

export const caseMaterialItemSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  isPrimary: z.boolean(),
}).strict();

export const caseSnapshotMetadataSchema = z.object({
  materials: z.array(caseMaterialItemSchema),
  processes: z.array(caseMetadataCodeSchema),
  problemDomains: z.array(caseMetadataCodeSchema),
  problemSymptoms: z.array(caseMetadataCodeSchema),
}).strict();

export const caseLibraryMetadataSchema = z.object({
  materials: z.array(caseMaterialItemSchema),
  processes: z.array(caseMetadataCodeSchema),
  problemDomains: z.array(caseMetadataCodeSchema),
  problemSymptoms: z.array(caseMetadataCodeSchema),
  materialOtherText: z.string().nullable(),
  processOtherText: z.string().nullable(),
  problemDomainOtherText: z.string().nullable(),
  problemSymptomOtherText: z.string().nullable(),
}).strict();

export const caseLibraryItemSchema = z.object({
  caseNo: caseNoSchema,
  title: z.string().min(1),
  summary: z.string().nullable(),
  lessonSummary: z.string().nullable(),
  preventionSummary: z.string().nullable(),
  applicabilityNotes: z.string().nullable(),
  reviewType: caseReviewTypeSchema,
  risk: caseRiskLevelSchema.nullable(),
  occurredAt: caseIsoDateSchema.nullable(),
  publishedAt: caseIsoDateSchema,
  metadata: caseLibraryMetadataSchema,
}).strict();

export const casePublicDetailSchema = caseLibraryItemSchema;

export const caseLibraryResponseDataSchema = z.object({
  items: z.array(caseLibraryItemSchema),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0).max(100000),
  hasMore: z.boolean(),
}).strict();

export const caseCurrentSourceMetadataItemSchema = z.object({
  metadataType: caseMetadataTypeSchema,
  code: z.string().min(1),
  label: z.string().min(1),
  isPrimary: z.boolean(),
}).strict();

export const caseCandidateExistingCaseSchema = z.object({
  id: z.string().uuid(),
  caseNo: caseNoSchema,
  status: caseStatusSchema,
  version: caseExpectedVersionSchema,
  isSourceChanged: z.boolean(),
}).strict();

export const caseCandidateItemSchema = z.object({
  sourceReviewId: z.string().uuid(),
  reviewNo: z.string().min(1),
  reviewType: caseReviewTypeSchema,
  risk: caseRiskLevelSchema.nullable(),
  occurredAt: caseIsoDateSchema.nullable(),
  sourceVersion: caseExpectedVersionSchema,
  metadataSummary: z.array(caseCurrentSourceMetadataItemSchema),
  existingCase: caseCandidateExistingCaseSchema.nullable(),
}).strict();

export const caseCandidateResponseDataSchema = z.object({
  items: z.array(caseCandidateItemSchema),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0).max(100000),
  hasMore: z.boolean(),
}).strict();

export const caseStaleReasonSchema = z.enum([
  'SOURCE_NOT_CLOSED',
  'SOURCE_VERSION_CHANGED',
]);

export const caseAdminDetailSchema = z.object({
  id: z.string().uuid(),
  caseNo: caseNoSchema,
  status: caseStatusSchema,
  version: caseExpectedVersionSchema,
  title: z.string().min(1),
  summary: z.string().nullable(),
  lessonSummary: z.string().nullable(),
  preventionSummary: z.string().nullable(),
  applicabilityNotes: z.string().nullable(),
  reviewTypeSnapshot: caseReviewTypeSchema.nullable(),
  riskSnapshot: caseRiskLevelSchema.nullable(),
  occurredAtSnapshot: caseIsoDateSchema.nullable(),
  publishedAt: caseIsoDateSchema.nullable(),
  hiddenAt: caseIsoDateSchema.nullable(),
  hiddenReason: z.string().nullable(),
  sourceReviewId: z.string().uuid(),
  sourceReviewNo: z.string().nullable(),
  sourceCurrentStatus: z.string().nullable(),
  sourceCurrentVersion: z.number().int().min(1).nullable(),
  caseSourceReviewVersion: caseExpectedVersionSchema,
  sourceChangedSinceSnapshot: z.boolean(),
  isStale: z.boolean(),
  staleReasons: z.array(caseStaleReasonSchema),
  currentSourceMetadata: z.array(caseCurrentSourceMetadataItemSchema),
  caseSnapshotMetadata: caseSnapshotMetadataSchema,
}).strict();

export const caseAuditActionSchema = z.enum([
  'CASE_CREATED',
  'CASE_UPDATED',
  'CASE_PUBLISHED',
  'CASE_REPUBLISHED',
  'CASE_HIDDEN',
  'CASE_REOPENED',
]);

export const caseSafeChangeSummarySchema = z.object({
  changedFields: z.array(z.string()).nullable(),
  fromStatus: z.string().nullable(),
  toStatus: z.string().nullable(),
  sourceReviewVersion: z.number().int().min(1).nullable(),
  publishKind: z.string().nullable(),
  status: z.string().nullable(),
}).strict();

export const caseAuditItemSchema = z.object({
  action: caseAuditActionSchema,
  versionBefore: z.number().int().min(1).nullable(),
  versionAfter: caseExpectedVersionSchema,
  actorDisplayName: z.string(),
  createdAt: caseIsoDateSchema,
  safeChangeSummary: caseSafeChangeSummarySchema,
}).strict();

export const caseAuditResponseDataSchema = z.object({
  items: z.array(caseAuditItemSchema),
  limit: z.number().int().min(1).max(50),
  offset: z.number().int().min(0).max(100000),
  hasMore: z.boolean(),
}).strict();

export const caseReadEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: z.unknown(),
}).strict();

export const caseBusinessErrorSchema = z.object({
  ok: z.literal(false),
  code: z.string(),
  message: z.string(),
  data: z.unknown(),
}).strict();

export type CaseCreateRequest = z.infer<typeof caseCreateRequestSchema>;
export type CaseUpdateRequest = z.infer<typeof caseUpdateRequestSchema>;
export type CasePublishRequest = z.infer<typeof casePublishRequestSchema>;
export type CaseHideRequest = z.infer<typeof caseHideRequestSchema>;
export type CaseReopenRequest = z.infer<typeof caseReopenRequestSchema>;
export type CaseMutationResult = z.infer<typeof caseMutationResultSchema>;
export type CaseLibraryItem = z.infer<typeof caseLibraryItemSchema>;
export type CaseLibraryResponseData = z.infer<typeof caseLibraryResponseDataSchema>;
export type CasePublicDetail = z.infer<typeof casePublicDetailSchema>;
export type CaseCandidateItem = z.infer<typeof caseCandidateItemSchema>;
export type CaseCandidateResponseData = z.infer<typeof caseCandidateResponseDataSchema>;
export type CaseAdminDetail = z.infer<typeof caseAdminDetailSchema>;
export type CaseAuditItem = z.infer<typeof caseAuditItemSchema>;
export type CaseAuditResponseData = z.infer<typeof caseAuditResponseDataSchema>;

export interface CaseLibraryQuery {
  q: string | null;
  materialCodes: string[];
  processCodes: string[];
  problemDomainCodes: string[];
  problemSymptomCodes: string[];
  reviewTypes: string[];
  riskLevels: string[];
  publishedFrom: string | null;
  publishedTo: string | null;
  limit: number;
  offset: number;
}

export interface CaseCandidateQuery {
  q: string | null;
  limit: number;
  offset: number;
}

export interface CaseAuditQuery {
  limit: number;
  offset: number;
}

export type CaseQueryParseResult<T> =
  | { ok: true; data: T }
  | { ok: false };

function parseScalar(
  searchParams: URLSearchParams,
  key: string,
): { ok: true; value: string | null } | { ok: false } {
  const values = searchParams.getAll(key);
  if (values.length > 1) return { ok: false };
  const value = values[0] ?? null;
  if (value === null) return { ok: true, value: null };
  if (value.trim() === '') return { ok: false };
  return { ok: true, value };
}

function parseRepeatedCodes(
  searchParams: URLSearchParams,
  key: string,
  maxLength: number,
): { ok: true; value: string[] } | { ok: false } {
  const raw = searchParams.getAll(key);
  if (raw.length > maxLength) return { ok: false };
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim();
    if (trimmed === '') return { ok: false };
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return { ok: true, value: result };
}

function parseEnumArray(
  searchParams: URLSearchParams,
  key: string,
  allowed: readonly string[],
  maxLength: number,
): { ok: true; value: string[] } | { ok: false } {
  const parsed = parseRepeatedCodes(searchParams, key, maxLength);
  if (!parsed.ok) return parsed;
  if (parsed.value.some(value => !allowed.includes(value))) return { ok: false };
  return parsed;
}

function parseBoundedInt(
  searchParams: URLSearchParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): { ok: true; value: number } | { ok: false } {
  const values = searchParams.getAll(key);
  if (values.length > 1) return { ok: false };
  const raw = values[0] ?? null;
  if (raw === null) return { ok: true, value: fallback };
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return { ok: false };
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < min || value > max) return { ok: false };
  return { ok: true, value };
}

function parseOptionalDate(
  searchParams: URLSearchParams,
  key: string,
): { ok: true; value: string | null } | { ok: false } {
  const scalar = parseScalar(searchParams, key);
  if (!scalar.ok) return scalar;
  if (scalar.value === null) return { ok: true, value: null };
  if (!caseIsoDateSchema.safeParse(scalar.value).success) return { ok: false };
  return { ok: true, value: scalar.value };
}

function parseOptionalText(
  searchParams: URLSearchParams,
  key: string,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false } {
  const values = searchParams.getAll(key);
  if (values.length > 1) return { ok: false };
  const raw = values[0] ?? null;
  if (raw === null) return { ok: true, value: null };
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (trimmed.length > maxLength) return { ok: false };
  return { ok: true, value: trimmed };
}

export function parseCaseLibraryQuery(
  searchParams: URLSearchParams,
): CaseQueryParseResult<CaseLibraryQuery> {
  const q = parseOptionalText(searchParams, 'q', 200);
  if (!q.ok) return { ok: false };
  const material = parseRepeatedCodes(searchParams, 'material', 50);
  if (!material.ok) return { ok: false };
  const process = parseRepeatedCodes(searchParams, 'process', 50);
  if (!process.ok) return { ok: false };
  const domain = parseRepeatedCodes(searchParams, 'problemDomain', 50);
  if (!domain.ok) return { ok: false };
  const symptom = parseRepeatedCodes(searchParams, 'problemSymptom', 50);
  if (!symptom.ok) return { ok: false };
  const reviewType = parseEnumArray(
    searchParams,
    'reviewType',
    ['A', 'B', 'C'],
    50,
  );
  if (!reviewType.ok) return { ok: false };
  const risk = parseEnumArray(
    searchParams,
    'risk',
    ['RED', 'YELLOW', 'GREEN'],
    50,
  );
  if (!risk.ok) return { ok: false };
  const from = parseOptionalDate(searchParams, 'publishedFrom');
  if (!from.ok) return { ok: false };
  const to = parseOptionalDate(searchParams, 'publishedTo');
  if (!to.ok) return { ok: false };
  const limit = parseBoundedInt(searchParams, 'limit', 30, 1, 100);
  if (!limit.ok) return { ok: false };
  const offset = parseBoundedInt(searchParams, 'offset', 0, 0, 100000);
  if (!offset.ok) return { ok: false };

  return {
    ok: true,
    data: {
      q: q.value,
      materialCodes: material.value,
      processCodes: process.value,
      problemDomainCodes: domain.value,
      problemSymptomCodes: symptom.value,
      reviewTypes: reviewType.value,
      riskLevels: risk.value,
      publishedFrom: from.value,
      publishedTo: to.value,
      limit: limit.value,
      offset: offset.value,
    },
  };
}

export function parseCaseCandidateQuery(
  searchParams: URLSearchParams,
): CaseQueryParseResult<CaseCandidateQuery> {
  const q = parseOptionalText(searchParams, 'q', 200);
  if (!q.ok) return { ok: false };
  const limit = parseBoundedInt(searchParams, 'limit', 30, 1, 100);
  if (!limit.ok) return { ok: false };
  const offset = parseBoundedInt(searchParams, 'offset', 0, 0, 100000);
  if (!offset.ok) return { ok: false };
  return {
    ok: true,
    data: { q: q.value, limit: limit.value, offset: offset.value },
  };
}

export function parseCaseAuditQuery(
  searchParams: URLSearchParams,
): CaseQueryParseResult<CaseAuditQuery> {
  const limit = parseBoundedInt(searchParams, 'limit', 30, 1, 50);
  if (!limit.ok) return { ok: false };
  const offset = parseBoundedInt(searchParams, 'offset', 0, 0, 100000);
  if (!offset.ok) return { ok: false };
  return {
    ok: true,
    data: { limit: limit.value, offset: offset.value },
  };
}
