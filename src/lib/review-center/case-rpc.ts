// @server-only - Case business RPC adapter. Never import this from client code.

import { z } from 'zod';
import {
  caseAdminDetailSchema,
  caseAuditResponseDataSchema,
  caseCandidateResponseDataSchema,
  caseLibraryResponseDataSchema,
  caseMutationResultSchema,
  casePublicDetailSchema,
  caseReadEnvelopeSchema,
  type CaseAdminDetail,
  type CaseAuditQuery,
  type CaseAuditResponseData,
  type CaseCandidateQuery,
  type CaseCandidateResponseData,
  type CaseCreateRequest,
  type CaseHideRequest,
  type CaseLibraryQuery,
  type CaseLibraryResponseData,
  type CaseMutationResult,
  type CasePublicDetail,
  type CasePublishRequest,
  type CaseReopenRequest,
  type CaseUpdateRequest,
} from './case-schemas';
import {
  CaseRpcContractError,
  CaseRpcUnexpectedError,
  parseCaseBusinessErrorEnvelope,
} from './case-errors';

export const CASE_RPC_NAMES = {
  create: 'review_case_create_from_review',
  updateDraft: 'review_case_update_draft',
  publish: 'review_case_publish',
  hide: 'review_case_hide',
  reopen: 'review_case_reopen_curation',
  library: 'review_case_library',
  detail: 'review_case_detail',
  candidates: 'review_case_candidates',
  adminDetail: 'review_case_admin_detail',
  audit: 'review_case_audit',
} as const;

export interface CaseRpcResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

export interface CaseRpcClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<CaseRpcResult>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwIfBusinessError(result: CaseRpcResult): void {
  if (result.error) {
    throw new CaseRpcUnexpectedError('Supabase RPC transport or database failure');
  }
  const data = result.data;
  if (isObject(data) && data.ok === false && typeof data.code === 'string') {
    throw parseCaseBusinessErrorEnvelope(data);
  }
}

function parseMutationResult(result: CaseRpcResult): CaseMutationResult {
  throwIfBusinessError(result);
  const parsed = caseMutationResultSchema.safeParse(result.data);
  if (!parsed.success) {
    throw new CaseRpcContractError('Case mutation response contract mismatch');
  }
  return parsed.data;
}

function parseReadResult<T>(
  schema: z.ZodType<T>,
  result: CaseRpcResult,
): T {
  throwIfBusinessError(result);
  const envelope = caseReadEnvelopeSchema.safeParse(result.data);
  if (!envelope.success) {
    throw new CaseRpcContractError('Case read envelope contract mismatch');
  }
  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) {
    throw new CaseRpcContractError('Case read response contract mismatch');
  }
  return parsed.data;
}

function emptyArrayToNull(values: string[]): string[] | null {
  return values.length > 0 ? values : null;
}

export async function callCaseCreate(
  client: CaseRpcClient,
  input: CaseCreateRequest,
): Promise<CaseMutationResult> {
  const result = await client.rpc(CASE_RPC_NAMES.create, {
    p_review_id: input.sourceReviewId,
    p_expected_review_version: input.expectedReviewVersion,
    p_title: input.title,
  });
  return parseMutationResult(result);
}

export async function callCaseUpdateDraft(
  client: CaseRpcClient,
  caseId: string,
  input: CaseUpdateRequest,
): Promise<CaseMutationResult> {
  const result = await client.rpc(CASE_RPC_NAMES.updateDraft, {
    p_case_id: caseId,
    p_expected_version: input.expectedVersion,
    p_patch: input.patch,
  });
  return parseMutationResult(result);
}

export async function callCasePublish(
  client: CaseRpcClient,
  caseId: string,
  input: CasePublishRequest,
): Promise<CaseMutationResult> {
  const result = await client.rpc(CASE_RPC_NAMES.publish, {
    p_case_id: caseId,
    p_expected_version: input.expectedVersion,
    p_expected_source_review_version: input.expectedSourceReviewVersion,
  });
  return parseMutationResult(result);
}

export async function callCaseHide(
  client: CaseRpcClient,
  caseId: string,
  input: CaseHideRequest,
): Promise<CaseMutationResult> {
  const result = await client.rpc(CASE_RPC_NAMES.hide, {
    p_case_id: caseId,
    p_expected_version: input.expectedVersion,
    p_reason: input.reason,
  });
  return parseMutationResult(result);
}

export async function callCaseReopen(
  client: CaseRpcClient,
  caseId: string,
  input: CaseReopenRequest,
): Promise<CaseMutationResult> {
  const result = await client.rpc(CASE_RPC_NAMES.reopen, {
    p_case_id: caseId,
    p_expected_version: input.expectedVersion,
  });
  return parseMutationResult(result);
}

export async function callCaseLibrary(
  client: CaseRpcClient,
  query: CaseLibraryQuery,
): Promise<CaseLibraryResponseData> {
  const result = await client.rpc(CASE_RPC_NAMES.library, {
    p_query: query.q,
    p_material_codes: emptyArrayToNull(query.materialCodes),
    p_process_codes: emptyArrayToNull(query.processCodes),
    p_problem_domain_codes: emptyArrayToNull(query.problemDomainCodes),
    p_problem_symptom_codes: emptyArrayToNull(query.problemSymptomCodes),
    p_review_types: emptyArrayToNull(query.reviewTypes),
    p_risk_levels: emptyArrayToNull(query.riskLevels),
    p_published_from: query.publishedFrom,
    p_published_to: query.publishedTo,
    p_limit: query.limit,
    p_offset: query.offset,
  });
  return parseReadResult(caseLibraryResponseDataSchema, result);
}

export async function callCasePublicDetail(
  client: CaseRpcClient,
  caseNo: string,
): Promise<CasePublicDetail> {
  const result = await client.rpc(CASE_RPC_NAMES.detail, {
    p_case_no: caseNo,
  });
  return parseReadResult(casePublicDetailSchema, result);
}

export async function callCaseCandidates(
  client: CaseRpcClient,
  query: CaseCandidateQuery,
): Promise<CaseCandidateResponseData> {
  const result = await client.rpc(CASE_RPC_NAMES.candidates, {
    p_limit: query.limit,
    p_offset: query.offset,
    p_query: query.q,
  });
  return parseReadResult(caseCandidateResponseDataSchema, result);
}

export async function callCaseAdminDetail(
  client: CaseRpcClient,
  caseNo: string,
): Promise<CaseAdminDetail> {
  const result = await client.rpc(CASE_RPC_NAMES.adminDetail, {
    p_case_no: caseNo,
  });
  return parseReadResult(caseAdminDetailSchema, result);
}

export async function callCaseAudit(
  client: CaseRpcClient,
  caseId: string,
  query: CaseAuditQuery,
): Promise<CaseAuditResponseData> {
  const result = await client.rpc(CASE_RPC_NAMES.audit, {
    p_case_id: caseId,
    p_limit: query.limit,
    p_offset: query.offset,
  });
  return parseReadResult(caseAuditResponseDataSchema, result);
}
