import type {
  CaseAdminDetail,
  CaseCandidateItem,
  CaseCandidateQuery,
  CaseCandidateResponseData,
  CaseLibraryItem,
  CaseLibraryQuery,
  CaseLibraryResponseData,
  CaseMutationResult,
  CasePublicDetail,
} from './case-schemas';
import type { MetadataOptionDto, MetadataOptionsDto } from './types';

export class CaseApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly safeData: unknown;

  constructor(status: number, code: string, message: string, safeData: unknown = null) {
    super(message);
    this.name = 'CaseApiError';
    this.status = status;
    this.code = code;
    this.safeData = safeData;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(): CaseApiError {
  return new CaseApiError(200, 'INVALID_RESPONSE', '案例数据格式异常');
}

function statusMessage(status: number): string {
  if (status === 401) return '登录状态已失效，请重新登录。';
  if (status === 403) return '没有权限查看此内容。';
  if (status === 404) return '案例不存在或当前不可查看';
  return '案例加载失败，请稍后重试';
}

async function requestJson(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    response = await fetch(url, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body,
      signal: init?.signal,
    });
  } catch {
    throw new CaseApiError(0, 'NETWORK_ERROR', '网络请求失败，请稍后重试');
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const errorBody = isRecord(body) ? body : null;
    const code = errorBody && typeof errorBody.code === 'string'
      ? errorBody.code
      : 'INTERNAL_ERROR';
    const safeData = errorBody && 'data' in errorBody ? errorBody.data : null;
    throw new CaseApiError(response.status, code, statusMessage(response.status), safeData);
  }

  return { status: response.status, body };
}

function readData(body: unknown): unknown {
  if (!isRecord(body) || body.ok !== true || !('data' in body)) {
    throw invalidResponse();
  }
  return body.data;
}

function assertLibraryItem(value: unknown): CaseLibraryItem {
  if (
    !isRecord(value)
    || typeof value.caseNo !== 'string'
    || typeof value.title !== 'string'
    || typeof value.publishedAt !== 'string'
    || !isRecord(value.metadata)
  ) {
    throw invalidResponse();
  }
  return value as CaseLibraryItem;
}

export function parseCaseLibraryResponse(body: unknown): CaseLibraryResponseData {
  const data = readData(body);
  if (
    !isRecord(data)
    || !Array.isArray(data.items)
    || !Number.isInteger(data.limit)
    || (data.limit as number) < 1
    || !Number.isInteger(data.offset)
    || (data.offset as number) < 0
    || typeof data.hasMore !== 'boolean'
  ) {
    throw invalidResponse();
  }
  return {
    items: data.items.map(assertLibraryItem),
    limit: data.limit as number,
    offset: data.offset as number,
    hasMore: data.hasMore,
  };
}

export function parseCasePublicDetailResponse(body: unknown): CasePublicDetail {
  const data = readData(body);
  if (
    !isRecord(data)
    || typeof data.caseNo !== 'string'
    || typeof data.title !== 'string'
    || typeof data.publishedAt !== 'string'
    || !isRecord(data.metadata)
  ) {
    throw invalidResponse();
  }
  return data as CasePublicDetail;
}

export function buildCaseLibraryQueryString(query: CaseLibraryQuery): string {
  const search = new URLSearchParams();
  if (query.q) search.set('q', query.q);
  for (const code of query.materialCodes) search.append('material', code);
  for (const code of query.processCodes) search.append('process', code);
  for (const code of query.problemDomainCodes) search.append('problemDomain', code);
  for (const code of query.problemSymptomCodes) search.append('problemSymptom', code);
  for (const value of query.reviewTypes) search.append('reviewType', value);
  for (const value of query.riskLevels) search.append('risk', value);
  if (query.publishedFrom) search.set('publishedFrom', query.publishedFrom);
  if (query.publishedTo) search.set('publishedTo', query.publishedTo);
  search.set('limit', String(query.limit));
  search.set('offset', String(query.offset));
  return search.toString();
}

export async function fetchCaseLibrary(
  query: CaseLibraryQuery,
  options?: { signal?: AbortSignal },
): Promise<CaseLibraryResponseData> {
  const url = `/api/review-center/cases?${buildCaseLibraryQueryString(query)}`;
  const { body } = await requestJson(url, options);
  return parseCaseLibraryResponse(body);
}

export async function fetchCasePublicDetail(
  caseNo: string,
  options?: { signal?: AbortSignal },
): Promise<CasePublicDetail> {
  const { body } = await requestJson(
    `/api/review-center/cases/${encodeURIComponent(caseNo)}`,
    options,
  );
  return parseCasePublicDetailResponse(body);
}

function parseOption(value: unknown): MetadataOptionDto {
  if (!isRecord(value) || typeof value.code !== 'string' || typeof value.label !== 'string') {
    throw invalidResponse();
  }
  return {
    code: value.code,
    label: value.label,
    description: typeof value.description === 'string' ? value.description : null,
    sortOrder: typeof value.sortOrder === 'number' ? value.sortOrder : 0,
  };
}

function parseOptionArray(value: unknown): MetadataOptionDto[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value.map(parseOption);
}

export function parseMetadataOptionsResponse(body: unknown): MetadataOptionsDto {
  const data = readData(body);
  if (!isRecord(data)) throw invalidResponse();
  return {
    materials: parseOptionArray(data.materials),
    processes: parseOptionArray(data.processes),
    problemDomains: parseOptionArray(data.problemDomains),
    problemSymptoms: parseOptionArray(data.problemSymptoms),
  };
}

export async function fetchCaseMetadataOptions(
  options?: { signal?: AbortSignal },
): Promise<MetadataOptionsDto> {
  const { body } = await requestJson('/api/review-center/metadata/options', options);
  return parseMetadataOptionsResponse(body);
}

const CASE_NO_PATTERN = /^CASE-[0-9]{4}-[0-9]{6}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPositiveInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function parseExistingCase(value: unknown): CaseCandidateItem['existingCase'] {
  if (value === null) return null;
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || !UUID_PATTERN.test(value.id)
    || typeof value.caseNo !== 'string'
    || !CASE_NO_PATTERN.test(value.caseNo)
    || !['DRAFT', 'PUBLISHED', 'HIDDEN'].includes(value.status as string)
    || !isPositiveInt(value.version)
    || typeof value.isSourceChanged !== 'boolean'
  ) {
    throw invalidResponse();
  }
  return value as CaseCandidateItem['existingCase'];
}

function parseCandidateItem(value: unknown): CaseCandidateItem {
  if (
    !isRecord(value)
    || typeof value.sourceReviewId !== 'string'
    || !UUID_PATTERN.test(value.sourceReviewId)
    || typeof value.reviewNo !== 'string'
    || !['A', 'B', 'C'].includes(value.reviewType as string)
    || !isPositiveInt(value.sourceVersion)
    || !Array.isArray(value.metadataSummary)
  ) {
    throw invalidResponse();
  }
  const existingCase = parseExistingCase(value.existingCase);
  return { ...(value as CaseCandidateItem), existingCase };
}

export function parseCaseCandidateResponse(body: unknown): CaseCandidateResponseData {
  const data = readData(body);
  if (
    !isRecord(data)
    || !Array.isArray(data.items)
    || !Number.isInteger(data.limit)
    || (data.limit as number) < 1
    || !Number.isInteger(data.offset)
    || (data.offset as number) < 0
    || typeof data.hasMore !== 'boolean'
  ) {
    throw invalidResponse();
  }
  return {
    items: data.items.map(parseCandidateItem),
    limit: data.limit as number,
    offset: data.offset as number,
    hasMore: data.hasMore,
  };
}

export function buildCaseCandidateQueryString(query: CaseCandidateQuery): string {
  const search = new URLSearchParams();
  if (query.q) search.set('q', query.q);
  search.set('limit', String(query.limit));
  search.set('offset', String(query.offset));
  return search.toString();
}

export async function fetchCaseCandidates(
  query: CaseCandidateQuery,
  options?: { signal?: AbortSignal },
): Promise<CaseCandidateResponseData> {
  const url = `/api/review-center/case-candidates?${buildCaseCandidateQueryString(query)}`;
  const { body } = await requestJson(url, options);
  return parseCaseCandidateResponse(body);
}

export interface CaseCreateInput {
  sourceReviewId: string;
  expectedReviewVersion: number;
  title: string;
}

export function parseCaseMutationResult(body: unknown): CaseMutationResult {
  if (
    !isRecord(body)
    || typeof body.id !== 'string'
    || !UUID_PATTERN.test(body.id)
    || typeof body.caseNo !== 'string'
    || !CASE_NO_PATTERN.test(body.caseNo)
    || !['DRAFT', 'PUBLISHED', 'HIDDEN'].includes(body.status as string)
    || !isPositiveInt(body.version)
    || !isPositiveInt(body.sourceReviewVersion)
  ) {
    throw invalidResponse();
  }
  return body as CaseMutationResult;
}

export async function createCase(
  input: CaseCreateInput,
  options?: { signal?: AbortSignal },
): Promise<CaseMutationResult> {
  const { body } = await requestJson('/api/review-center/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceReviewId: input.sourceReviewId,
      expectedReviewVersion: input.expectedReviewVersion,
      title: input.title,
    }),
    signal: options?.signal,
  });
  return parseCaseMutationResult(body);
}

function parseSnapshotMetadata(value: unknown): CaseAdminDetail['caseSnapshotMetadata'] {
  if (
    !isRecord(value)
    || !Array.isArray(value.materials)
    || !Array.isArray(value.processes)
    || !Array.isArray(value.problemDomains)
    || !Array.isArray(value.problemSymptoms)
  ) {
    throw invalidResponse();
  }

  const parseMaterial = (item: unknown) => {
    if (!isRecord(item) || typeof item.code !== 'string' || typeof item.label !== 'string' || typeof item.isPrimary !== 'boolean') {
      throw invalidResponse();
    }
    return { code: item.code, label: item.label, isPrimary: item.isPrimary };
  };
  const parseCode = (item: unknown) => {
    if (!isRecord(item) || typeof item.code !== 'string' || typeof item.label !== 'string') {
      throw invalidResponse();
    }
    return { code: item.code, label: item.label };
  };

  return {
    materials: value.materials.map(parseMaterial),
    processes: value.processes.map(parseCode),
    problemDomains: value.problemDomains.map(parseCode),
    problemSymptoms: value.problemSymptoms.map(parseCode),
  };
}

function parseCurrentSourceMetadata(value: unknown): CaseAdminDetail['currentSourceMetadata'] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value.map(item => {
    if (
      !isRecord(item)
      || typeof item.code !== 'string'
      || typeof item.label !== 'string'
      || typeof item.isPrimary !== 'boolean'
      || !['MATERIAL', 'PROCESS', 'PROBLEM_DOMAIN', 'PROBLEM_SYMPTOM'].includes(item.metadataType as string)
    ) {
      throw invalidResponse();
    }
    return {
      metadataType: item.metadataType as CaseAdminDetail['currentSourceMetadata'][number]['metadataType'],
      code: item.code,
      label: item.label,
      isPrimary: item.isPrimary,
    };
  });
}

export function parseCaseAdminDetailResponse(body: unknown): CaseAdminDetail {
  const data = readData(body);
  if (
    !isRecord(data)
    || typeof data.id !== 'string'
    || !UUID_PATTERN.test(data.id)
    || typeof data.caseNo !== 'string'
    || !CASE_NO_PATTERN.test(data.caseNo)
    || !['DRAFT', 'PUBLISHED', 'HIDDEN'].includes(data.status as string)
    || !isPositiveInt(data.version)
    || typeof data.title !== 'string'
    || !isNullableString(data.summary)
    || !isNullableString(data.lessonSummary)
    || !isNullableString(data.preventionSummary)
    || !isNullableString(data.applicabilityNotes)
    || (data.reviewTypeSnapshot !== null && !['A', 'B', 'C'].includes(data.reviewTypeSnapshot as string))
    || (data.riskSnapshot !== null && !['RED', 'YELLOW', 'GREEN'].includes(data.riskSnapshot as string))
    || !isNullableString(data.occurredAtSnapshot)
    || !isNullableString(data.publishedAt)
    || !isNullableString(data.hiddenAt)
    || !isNullableString(data.hiddenReason)
    || typeof data.sourceReviewId !== 'string'
    || !UUID_PATTERN.test(data.sourceReviewId)
    || !isNullableString(data.sourceReviewNo)
    || !isNullableString(data.sourceCurrentStatus)
    || (data.sourceCurrentVersion !== null && !isPositiveInt(data.sourceCurrentVersion))
    || !isPositiveInt(data.caseSourceReviewVersion)
    || typeof data.sourceChangedSinceSnapshot !== 'boolean'
    || typeof data.isStale !== 'boolean'
    || !Array.isArray(data.staleReasons)
    || data.staleReasons.some(item => item !== 'SOURCE_NOT_CLOSED' && item !== 'SOURCE_VERSION_CHANGED')
  ) {
    throw invalidResponse();
  }

  return {
    id: data.id,
    caseNo: data.caseNo,
    status: data.status as CaseAdminDetail['status'],
    version: data.version as number,
    title: data.title,
    summary: data.summary as string | null,
    lessonSummary: data.lessonSummary as string | null,
    preventionSummary: data.preventionSummary as string | null,
    applicabilityNotes: data.applicabilityNotes as string | null,
    reviewTypeSnapshot: data.reviewTypeSnapshot as CaseAdminDetail['reviewTypeSnapshot'],
    riskSnapshot: data.riskSnapshot as CaseAdminDetail['riskSnapshot'],
    occurredAtSnapshot: data.occurredAtSnapshot as string | null,
    publishedAt: data.publishedAt as string | null,
    hiddenAt: data.hiddenAt as string | null,
    hiddenReason: data.hiddenReason as string | null,
    sourceReviewId: data.sourceReviewId,
    sourceReviewNo: data.sourceReviewNo as string | null,
    sourceCurrentStatus: data.sourceCurrentStatus as string | null,
    sourceCurrentVersion: data.sourceCurrentVersion as number | null,
    caseSourceReviewVersion: data.caseSourceReviewVersion as number,
    sourceChangedSinceSnapshot: data.sourceChangedSinceSnapshot,
    isStale: data.isStale,
    staleReasons: data.staleReasons as CaseAdminDetail['staleReasons'],
    currentSourceMetadata: parseCurrentSourceMetadata(data.currentSourceMetadata),
    caseSnapshotMetadata: parseSnapshotMetadata(data.caseSnapshotMetadata),
  };
}

export async function fetchCaseAdminDetail(
  caseNo: string,
  options?: { signal?: AbortSignal },
): Promise<CaseAdminDetail> {
  const { body } = await requestJson(
    `/api/review-center/cases/${encodeURIComponent(caseNo)}/admin`,
    options,
  );
  return parseCaseAdminDetailResponse(body);
}

export interface CaseUpdateInput {
  expectedVersion: number;
  patch: Record<string, unknown>;
}

export async function updateCase(
  caseNo: string,
  input: CaseUpdateInput,
  options?: { signal?: AbortSignal },
): Promise<CaseMutationResult> {
  const { body } = await requestJson(
    `/api/review-center/cases/${encodeURIComponent(caseNo)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: input.expectedVersion,
        patch: input.patch,
      }),
      signal: options?.signal,
    },
  );
  return parseCaseMutationResult(body);
}

export async function runExclusiveOnce<T>(
  guard: { current: boolean },
  task: () => Promise<T>,
): Promise<T | null> {
  if (guard.current) return null;
  guard.current = true;
  try {
    return await task();
  } finally {
    guard.current = false;
  }
}
