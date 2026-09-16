import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';
import { reviewIdSchema } from './schemas';
import { sanitizeMissingDimensions } from './metadata';

export type LifecycleCommand = 'SUBMIT' | 'CLOSE' | 'REOPEN';

export interface LifecycleRpcResult {
  data?: any;
  error?: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  } | null;
}

export interface LifecycleHttpResult {
  status: number;
  body: Record<string, unknown>;
}

export interface LifecycleBody {
  expectedVersion: number;
  reason?: string | null;
}

export const lifecycleExpectedVersionSchema = z.number().int().min(1);

export const submitCloseBodySchema = z.object({
  expectedVersion: lifecycleExpectedVersionSchema,
}).strict();

export const reopenBodySchema = z.object({
  expectedVersion: lifecycleExpectedVersionSchema,
  reason: z.string().max(1000).nullable().optional(),
}).strict();

export const MISSING_FIELD_WHITELIST = [
  'title',
  'review_type',
  'description',
  'risk_level',
  'risk_reason',
  'owner_id',
  'type_details',
] as const;

const LOCAL_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: '无权执行此复盘状态操作',
  NOT_FOUND: '复盘不存在或无权访问',
  VERSION_CONFLICT: '复盘已被其他操作更新，请刷新后重试',
  INVALID_TRANSITION: '当前复盘状态不允许执行此操作',
  INCOMPLETE_REVIEW: '复盘内容尚未填写完整，暂不能提交',
  METADATA_INCOMPLETE: '项目分类信息未完整，暂不能提交',
  INVALID_REASON: '重新打开原因无效，请填写有效原因',
  OPEN_ACTIONS_EXIST: '仍有改善行动未完成验证，暂不能关闭复盘。',
  INTERNAL_ERROR: '复盘状态操作失败，请稍后重试',
};

function safeOpenActionCount(value: unknown): number | null {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 1
  ) {
    return null;
  }
  return value;
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function internalError(): LifecycleHttpResult {
  return {
    status: 500,
    body: {
      ok: false,
      code: 'INTERNAL_ERROR',
      message: LOCAL_ERROR_MESSAGES.INTERNAL_ERROR,
      data: null,
    },
  };
}

export function parseLifecycleBody(
  command: LifecycleCommand,
  raw: unknown,
): { ok: true; data: LifecycleBody } | { ok: false } {
  const schema = command === 'REOPEN' ? reopenBodySchema : submitCloseBodySchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  return { ok: true, data: parsed.data as LifecycleBody };
}

export function sanitizeMissingFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const supplied = new Set<string>();
  for (const field of value) {
    if (
      typeof field === 'string'
      && (MISSING_FIELD_WHITELIST as readonly string[]).includes(field)
    ) {
      supplied.add(field);
    }
  }
  return MISSING_FIELD_WHITELIST.filter(field => supplied.has(field));
}

function isLifecycleSuccessData(value: unknown): value is {
  status: string;
  version: number;
  submitted_at: string | null;
  closed_at: string | null;
} {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.status === 'string'
    && data.status.length > 0
    && typeof data.version === 'number'
    && Number.isInteger(data.version)
    && data.version >= 1
    && (typeof data.submitted_at === 'string' || data.submitted_at === null)
    && (typeof data.closed_at === 'string' || data.closed_at === null)
  );
}

export function mapLifecycleRpcResult(
  command: LifecycleCommand,
  result: LifecycleRpcResult,
): LifecycleHttpResult {
  if (result.error) return internalError();

  const envelope = result.data;
  if (!envelope || typeof envelope !== 'object') return internalError();

  if (envelope.ok === true && envelope.code === 'OK') {
    if (!isLifecycleSuccessData(envelope.data)) return internalError();
    return {
      status: 200,
      body: {
        ok: true,
        code: 'OK',
        message: 'success',
        data: {
          status: envelope.data.status,
          version: envelope.data.version,
          submittedAt: envelope.data.submitted_at,
          closedAt: envelope.data.closed_at,
        },
      },
    };
  }

  const code = typeof envelope.code === 'string' ? envelope.code : 'UNKNOWN';

  if (code === 'OPEN_ACTIONS_EXIST') {
    const rawData = envelope.data && typeof envelope.data === 'object'
      ? (envelope.data as Record<string, unknown>)
      : {};
    const count = safeOpenActionCount(rawData.openActionCount);
    return {
      status: 409,
      body: {
        ok: false,
        code,
        message: count === null
          ? LOCAL_ERROR_MESSAGES.OPEN_ACTIONS_EXIST
          : `还有 ${count} 项改善行动未完成验证，暂不能关闭复盘。`,
        data: count === null ? null : { openActionCount: count },
      },
    };
  }

  if (code === 'METADATA_INCOMPLETE') {
    if (command !== 'SUBMIT') return internalError();
    const rawData = envelope.data && typeof envelope.data === 'object'
      ? (envelope.data as Record<string, unknown>)
      : {};
    return {
      status: 422,
      body: {
        ok: false,
        code,
        message: LOCAL_ERROR_MESSAGES.METADATA_INCOMPLETE,
        data: {
          missingDimensions: sanitizeMissingDimensions(rawData.missingDimensions),
        },
      },
    };
  }

  const message = LOCAL_ERROR_MESSAGES[code] ?? LOCAL_ERROR_MESSAGES.INTERNAL_ERROR;

  if (code === 'FORBIDDEN') {
    return { status: 403, body: { ok: false, code, message, data: null } };
  }
  if (code === 'NOT_FOUND') {
    return { status: 404, body: { ok: false, code, message, data: null } };
  }
  if (code === 'VERSION_CONFLICT' || code === 'INVALID_TRANSITION') {
    return { status: 409, body: { ok: false, code, message, data: null } };
  }
  if (code === 'INCOMPLETE_REVIEW') {
    if (command !== 'SUBMIT') return internalError();
    const rawMissing = (envelope.data && typeof envelope.data === 'object')
      ? (envelope.data as Record<string, unknown>).missing_fields
      : undefined;
    return {
      status: 422,
      body: {
        ok: false,
        code,
        message,
        data: {
          missingFields: sanitizeMissingFields(rawMissing),
        },
      },
    };
  }
  if (code === 'INVALID_REASON') {
    if (command !== 'REOPEN') return internalError();
    return { status: 422, body: { ok: false, code, message, data: null } };
  }

  return internalError();
}

export async function runLifecycleCommand(
  req: NextRequest,
  params: Record<string, string>,
  command: LifecycleCommand,
): Promise<NextResponse> {
  try {
    await requireUserFromRequest(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonError(
        '未登录或无权限',
        err.code === 'UNAUTHENTICATED' ? 401 : 403,
      );
    }
    return jsonError('服务异常', 500);
  }

  const parsedParams = reviewIdSchema.safeParse(params);
  if (!parsedParams.success) return jsonError('请求参数无效', 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('请求体不是有效 JSON', 400);
  }

  const parsedBody = parseLifecycleBody(command, body);
  if (!parsedBody.ok) return jsonError('提交内容无效', 400);

  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  let result: LifecycleRpcResult;
  try {
    if (command === 'SUBMIT') {
      result = await supabase.rpc('review_submit', {
        p_review_id: parsedParams.data.id,
        p_expected_version: parsedBody.data.expectedVersion,
      });
    } else if (command === 'CLOSE') {
      result = await supabase.rpc('review_close', {
        p_review_id: parsedParams.data.id,
        p_expected_version: parsedBody.data.expectedVersion,
      });
    } else {
      result = await supabase.rpc('review_reopen', {
        p_review_id: parsedParams.data.id,
        p_expected_version: parsedBody.data.expectedVersion,
        p_reason: parsedBody.data.reason ?? null,
      });
    }
  } catch {
    return NextResponse.json(internalError().body, { status: 500 });
  }

  const mapped = mapLifecycleRpcResult(command, result);
  return NextResponse.json(mapped.body, { status: mapped.status });
}
