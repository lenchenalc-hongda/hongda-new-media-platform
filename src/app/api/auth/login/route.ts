// POST /api/auth/login — verify credentials AND trusted HongdaOS profile.
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { getAuthMode, isSupabaseConfigured } from '@/lib/auth/types';
import { evaluatePostLoginProfile, safePostLoginRedirect } from '@/lib/auth/login-access';

export const dynamic = 'force-dynamic';

function reply(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Cookie' },
  });
}

export async function POST(req: NextRequest) {
  try {
    if (getAuthMode() !== 'supabase') {
      return reply({ error: '当前为 mock 模式，请使用页面演示登录' }, 400);
    }
    if (!isSupabaseConfigured()) {
      return reply({ error: 'Supabase 配置缺失，请联系管理员' }, 500);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return reply({ error: '登录请求格式错误' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply({ error: '登录请求格式错误' }, 400);
    }
    const { email, password, redirect } = body as Record<string, unknown>;
    if (typeof email !== 'string' || typeof password !== 'string'
        || !email.trim() || !password || email.length > 320 || password.length > 2048) {
      return reply({ error: '请输入有效邮箱和密码' }, 400);
    }

    const client = await createServerSupabaseClient();
    if (!client) {
      return reply({ error: 'Supabase 客户端不可用' }, 500);
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      return reply(
        { error: error.status === 429 ? '登录尝试过于频繁，请稍后重试' : '邮箱或密码错误' },
        error.status === 429 ? 429 : 401,
      );
    }

    // A valid Auth session is necessary but not sufficient for application access.
    // The authenticated query is governed by profiles RLS (own profile only).
    const authUserId = data?.user?.id;
    let profileResult: ReturnType<typeof evaluatePostLoginProfile>;
    if (!authUserId || !data?.session) {
      profileResult = evaluatePostLoginProfile('', null, new Error('missing-auth-session'));
    } else {
      try {
        const { data: profile, error: profileError } = await client
          .from('profiles')
          .select('user_id,org_id,role,is_active')
          .eq('user_id', authUserId)
          .maybeSingle();
        profileResult = evaluatePostLoginProfile(authUserId, profile, profileError);
      } catch {
        profileResult = evaluatePostLoginProfile(authUserId, null, new Error('profile-query-failed'));
      }
    }
    if (!profileResult.ok) {
      // Do not leave a partly authenticated session after a denied login.
      // Local scope cannot sign other employee devices out globally.
      try {
        await client.auth.signOut({ scope: 'local' });
      } catch {
        // The middleware independently denies missing/inactive profiles.
      }
      console.warn('[auth/login] PROFILE_GATE_REJECTED', profileResult.code);
      return reply(
        { error: profileResult.message, code: profileResult.code },
        profileResult.status,
      );
    }

    return reply({ ok: true, redirect: safePostLoginRedirect(redirect) }, 200);
  } catch (err) {
    // Never log passwords, JWTs, email addresses or provider error bodies.
    console.error('[auth/login] UNEXPECTED_FAILURE', err instanceof Error ? err.name : 'unknown');
    return reply({ error: '登录服务异常，请稍后重试' }, 500);
  }
}
