import type {
  CaseLibraryItem,
  CaseLibraryQuery,
  CaseLibraryResponseData,
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
  options?: { signal?: AbortSignal },
): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: options?.signal,
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
