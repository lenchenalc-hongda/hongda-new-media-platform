// @server-only - Case read route error adapter.

import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth/types';
import {
  CaseBusinessError,
  CaseRpcContractError,
  CaseRpcUnexpectedError,
  getCaseBusinessHttpStatus,
  getCaseBusinessMessage,
} from './case-errors';
import { CaseReadAuthForbiddenError } from './case-route-auth';

function internalError(): NextResponse {
  return NextResponse.json({
    ok: false,
    code: 'INTERNAL_ERROR',
    message: '服务异常',
    data: null,
  }, { status: 500 });
}

export function toCaseRouteErrorResponse(
  error: unknown,
  context?: { route?: string },
): NextResponse {
  if (error instanceof CaseReadAuthForbiddenError) {
    return NextResponse.json({
      ok: false,
      code: 'FORBIDDEN',
      message: '没有权限执行该操作',
      data: null,
    }, { status: 403 });
  }

  if (error instanceof AuthError && error.code === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: '未登录或无权限' }, { status: 401 });
  }

  if (error instanceof CaseBusinessError) {
    return NextResponse.json({
      ok: false,
      code: error.code,
      message: getCaseBusinessMessage(error.code),
      data: error.data,
    }, { status: getCaseBusinessHttpStatus(error.code) });
  }

  const errorType = error instanceof Error ? error.name : 'Unknown';
  console.error('[case-read] unexpected route error', {
    route: context?.route,
    errorType,
  });
  return internalError();
}
