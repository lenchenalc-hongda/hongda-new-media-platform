import { z } from 'zod';

export const CASE_BUSINESS_CODES = [
  'FORBIDDEN',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'INVALID_TRANSITION',
  'INVALID_CASE',
  'SOURCE_NOT_CLOSED',
  'SOURCE_VERSION_CONFLICT',
  'CASE_METADATA_INCOMPLETE',
  'CASE_CURATION_INCOMPLETE',
  'INVALID_DICTIONARY',
  'ALREADY_EXISTS',
  'CASE_NUMBER_EXHAUSTED',
] as const;

export type CaseBusinessCode = typeof CASE_BUSINESS_CODES[number];

export class CaseBusinessError extends Error {
  readonly code: CaseBusinessCode;
  readonly data: unknown;

  constructor(code: CaseBusinessCode, data: unknown) {
    super(`Case business error: ${code}`);
    this.name = 'CaseBusinessError';
    this.code = code;
    this.data = data;
  }
}

export class CaseRpcUnexpectedError extends Error {
  constructor(message = 'Case RPC transport or database failure') {
    super(message);
    this.name = 'CaseRpcUnexpectedError';
  }
}

export class CaseRpcContractError extends Error {
  constructor(message = 'Case RPC response contract mismatch') {
    super(message);
    this.name = 'CaseRpcContractError';
  }
}

const CASE_BUSINESS_HTTP_STATUS: Record<CaseBusinessCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  SOURCE_VERSION_CONFLICT: 409,
  INVALID_TRANSITION: 409,
  SOURCE_NOT_CLOSED: 409,
  ALREADY_EXISTS: 409,
  INVALID_CASE: 400,
  CASE_METADATA_INCOMPLETE: 422,
  CASE_CURATION_INCOMPLETE: 422,
  INVALID_DICTIONARY: 422,
  CASE_NUMBER_EXHAUSTED: 409,
};

const CASE_BUSINESS_MESSAGES: Record<CaseBusinessCode, string> = {
  FORBIDDEN: '没有权限执行该操作',
  NOT_FOUND: '案例不存在或不可访问',
  VERSION_CONFLICT: '案例已发生变化，请刷新后重试',
  SOURCE_VERSION_CONFLICT: '源复盘已发生变化，请刷新并重新确认',
  INVALID_TRANSITION: '当前案例状态不允许执行此操作',
  SOURCE_NOT_CLOSED: '源复盘尚未关闭，不能执行此操作',
  ALREADY_EXISTS: '该源复盘已创建案例',
  INVALID_CASE: '案例请求无效',
  CASE_METADATA_INCOMPLETE: '案例分类信息不完整',
  CASE_CURATION_INCOMPLETE: '案例策展内容不完整',
  INVALID_DICTIONARY: '包含无效分类字典',
  CASE_NUMBER_EXHAUSTED: '案例编号已用尽，请稍后重试',
};

const METADATA_MISSING_WHITELIST = [
  'PROBLEM_DOMAIN',
  'PROBLEM_SYMPTOM',
  'PRIMARY_MATERIAL',
  'PROCESS',
  'MATERIAL_OTHER_TEXT',
  'PROCESS_OTHER_TEXT',
  'PROBLEM_DOMAIN_OTHER_TEXT',
  'PROBLEM_SYMPTOM_OTHER_TEXT',
] as const;

const CURATION_MISSING_WHITELIST = [
  'TITLE',
  'SUMMARY',
  'LESSON_SUMMARY',
  'PREVENTION_SUMMARY',
] as const;

export function isCaseBusinessCode(value: string): value is CaseBusinessCode {
  return (CASE_BUSINESS_CODES as readonly string[]).includes(value);
}

export function getCaseBusinessHttpStatus(code: CaseBusinessCode): number {
  return CASE_BUSINESS_HTTP_STATUS[code];
}

export function getCaseBusinessMessage(code: CaseBusinessCode): string {
  return CASE_BUSINESS_MESSAGES[code];
}

function sanitizeStringArray(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    if (!(allowed as readonly string[]).includes(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

export function sanitizeCaseBusinessErrorData(
  code: CaseBusinessCode,
  rawData: unknown,
): unknown {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return null;
  const data = rawData as Record<string, unknown>;

  if (code === 'CASE_METADATA_INCOMPLETE') {
    return {
      missingDimensions: sanitizeStringArray(
        data.missingDimensions,
        METADATA_MISSING_WHITELIST,
      ),
    };
  }

  if (code === 'CASE_CURATION_INCOMPLETE') {
    return {
      missingFields: sanitizeStringArray(
        data.missingFields,
        CURATION_MISSING_WHITELIST,
      ),
    };
  }

  return null;
}

export function createCaseBusinessError(
  code: string,
  rawData: unknown,
): CaseBusinessError {
  if (!isCaseBusinessCode(code)) {
    throw new CaseRpcContractError('unknown Case business code');
  }
  return new CaseBusinessError(
    code,
    sanitizeCaseBusinessErrorData(code, rawData),
  );
}

export function parseCaseBusinessErrorEnvelope(value: unknown): CaseBusinessError {
  const schema = z.object({
    ok: z.literal(false),
    code: z.string(),
    message: z.string(),
    data: z.unknown(),
  }).strict();
  const parsed = schema.safeParse(value);
  if (!parsed.success || !isCaseBusinessCode(parsed.data.code)) {
    throw new CaseRpcContractError('malformed or unknown Case business envelope');
  }
  return new CaseBusinessError(
    parsed.data.code,
    sanitizeCaseBusinessErrorData(parsed.data.code, parsed.data.data),
  );
}
