// @server-only - narrow authenticated-read gate for Case routes.

import type { NextRequest } from 'next/server';
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { requireUserFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';
import { CaseRpcUnexpectedError } from './case-errors';

export class CaseReadAuthForbiddenError extends Error {
  constructor() {
    super('Case read auth forbidden');
    this.name = 'CaseReadAuthForbiddenError';
  }
}

export async function requireCaseReadUser(req: NextRequest): Promise<void> {
  try {
    await requireUserFromRequest(req);
    return;
  } catch (err) {
    if (!(err instanceof AuthError) || err.code !== 'UNAUTHENTICATED') {
      throw err;
    }

    // Known auth/profile denial: distinguish missing session (401)
    // from a session whose profile is inactive/missing (403).
    const supabase = await createClient();
    if (!supabase) {
      throw new CaseRpcUnexpectedError('Case auth session lookup unavailable');
    }
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (isAuthSessionMissingError(error)) {
        throw err;
      }
      throw new CaseRpcUnexpectedError('Case auth session lookup failure');
    }
    if (data?.user) {
      throw new CaseReadAuthForbiddenError();
    }
    throw err;
  }
}
