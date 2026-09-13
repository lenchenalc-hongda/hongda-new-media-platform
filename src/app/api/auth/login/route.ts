// POST /api/auth/login — Supabase Auth email+password login (server-side session)
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { getAuthMode, isSupabaseConfigured } from '@/lib/auth/types';

export async function POST(req: NextRequest) {
  try {
    if (getAuthMode() !== 'supabase') {
      return NextResponse.json({ error: '当前为 mock 模式，请使用页面演示登录' }, { status: 400 });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase 配置缺失，请联系管理员' }, { status: 500 });
    }

    const body = await req.json();
    const { email, password, redirect } = body || {};
    if (!email || !password) {
      return NextResponse.json({ error: '请输入邮箱和密码' }, { status: 400 });
    }

    const client = await createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ error: 'Supabase 客户端不可用' }, { status: 500 });
    }

    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    const safeRedirect = typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
      ? redirect : '/workspace-home';
    return NextResponse.json({ ok: true, redirect: safeRedirect });
  } catch (err: any) {
    console.error('[auth/login] Error:', err.message);
    return NextResponse.json({ error: '登录服务异常' }, { status: 500 });
  }
}
