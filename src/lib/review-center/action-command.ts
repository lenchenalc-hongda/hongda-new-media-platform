import { NextRequest, NextResponse } from 'next/server';
import { requireUserFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';

export const ACTION_COMMAND_RPC_NAMES = [
  'review_action_create',
  'review_action_update',
  'review_action_start',
  'review_action_submit_for_verification',
  'review_action_verify',
  'review_action_return',
  'review_action_cancel',
] as const;

export type ActionCommandRpcName = typeof ACTION_COMMAND_RPC_NAMES[number];

export const ACTION_MUTATION_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'CANCELLED',
] as const;

export interface ActionCommandSuccessData {
  id: string;
  sequence: number;
  status: string;
  version: number;
  updatedAt: string;
  completedAt: string | null;
  verifiedAt: string | null;
  cancelledAt: string | null;
}

export interface ActionCommandHttpResult {
  status: number;
  body: Record<string, unknown>;
}

interface ActionRpcEnvelope {
  ok?: unknown;
  code?: unknown;
  message?: unknown;
  data?: unknown;
}

const ACTION_BUSINESS_CODES: Record<string, { status: number; message: string }> = {
  FORBIDDEN: { status: 403, message: '无权执行此操作' },
  NOT_FOUND: { status: 404, message: '改善行动不存在或不可访问' },
  VERSION_CONFLICT: { status: 409, message: '改善行动已被更新，请刷新后重试' },
  INVALID_TRANSITION: { status: 409, message: '当前状态不允许执行此操作' },
  INVALID_INPUT: { status: 400, message: '提交内容无效' },
  INVALID_OWNER: { status: 400, message: '负责人无效或当前不可分配' },
  INVALID_REASON: { status: 400, message: '原因内容无效' },
  SELF_VERIFICATION_FORBIDDEN: {
    status: 403,
    message: '改善行动负责人不能验证自己的行动',
  },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function internalError(): ActionCommandHttpResult {
  return {
    status: 500,
    body: {
      ok: false,
      code: 'INTERNAL_ERROR',
      message: '服务器处理请求失败',
      data: null,
    },
  };
}

function knownError(code: string): ActionCommandHttpResult {
  const mapped = ACTION_BUSINESS_CODES[code];
  if (!mapped) return internalError();
  return {
    status: mapped.status,
    body: {
      ok: false,
      code,
      message: mapped.message,
      data: null,
    },
  };
}

function optionalTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!isValidTimestamp(value)) throw new Error('invalid optional timestamp');
  return value;
}

function parseSuccessData(
  data: unknown,
  options: {
    reviewId: string;
    actionId?: string;
  },
): ActionCommandSuccessData {
  if (!data || typeof data !== 'object') throw new Error('missing success data');
  const row = data as Record<string, unknown>;

  if (!isUuid(row.review_id) || row.review_id !== options.reviewId) {
    throw new Error('review identity mismatch');
  }
  if (!isUuid(row.id)) throw new Error('invalid action id');
  if (options.actionId && row.id !== options.actionId) {
    throw new Error('action identity mismatch');
  }
  if (!Number.isInteger(row.sequence) || (row.sequence as number) < 1) {
    throw new Error('invalid sequence');
  }
  if (
    typeof row.status !== 'string'
    || !(ACTION_MUTATION_STATUSES as readonly string[]).includes(row.status)
  ) {
    throw new Error('invalid success status');
  }
  if (!Number.isInteger(row.version) || (row.version as number) < 1) {
    throw new Error('invalid version');
  }
  if (!isValidTimestamp(row.updated_at)) throw new Error('invalid updated_at');

  return {
    id: row.id,
    sequence: row.sequence as number,
    status: row.status,
    version: row.version as number,
    updatedAt: row.updated_at,
    completedAt: optionalTimestamp(row.completed_at),
    verifiedAt: optionalTimestamp(row.verified_at),
    cancelledAt: optionalTimestamp(row.cancelled_at),
  };
}

export function parseActionCommandRpcResult(
  result: { data?: unknown; error?: { code?: string } | null },
  options: {
    reviewId: string;
    actionId?: string;
  },
): ActionCommandHttpResult {
  if (result.error) return internalError();

  const envelope = result.data as ActionRpcEnvelope | null | undefined;
  if (!envelope || typeof envelope !== 'object') return internalError();
  if (typeof envelope.ok !== 'boolean' || typeof envelope.code !== 'string') {
    return internalError();
  }

  if (envelope.ok === true && envelope.code === 'OK') {
    try {
      const action = parseSuccessData(envelope.data, options);
      return {
        status: 200,
        body: {
          ok: true,
          code: 'OK',
          message: 'success',
          data: { action },
        },
      };
    } catch {
      return internalError();
    }
  }

  return knownError(envelope.code);
}

export async function runActionCommandRoute(
  req: NextRequest,
  params: Record<string, string>,
  paramsSchema: any,
  bodySchema: any,
  rpcName: ActionCommandRpcName,
  buildArgs: (params: any, body: any) => Record<string, unknown>,
  options: {
    requireActionId?: boolean;
    createStatus201?: boolean;
  } = {},
): Promise<NextResponse> {
  try {
    await requireUserFromRequest(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: '未登录或无权限' },
        { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 },
      );
    }
    return NextResponse.json({ error: '服务异常' }, { status: 500 });
  }

  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '提交内容无效' }, { status: 400 });
  }

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: '提交内容无效' }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '数据库不可用' }, { status: 500 });
  }

  try {
    const args = buildArgs(parsedParams.data, parsedBody.data);
    const result = await supabase.rpc(rpcName, args);
    const mapped = parseActionCommandRpcResult(result, {
      reviewId: parsedParams.data.id,
      actionId: options.requireActionId ? parsedParams.data.actionId : undefined,
    });
    if (options.createStatus201 && mapped.status === 200 && mapped.body.ok === true) {
      return NextResponse.json(mapped.body, { status: 201 });
    }
    return NextResponse.json(mapped.body, { status: mapped.status });
  } catch {
    const mapped = internalError();
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
