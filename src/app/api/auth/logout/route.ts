// POST /api/auth/logout — clear session (mock + supabase)
import { NextResponse } from 'next/server';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { getAuthMode, isSupabaseConfigured } from '@/lib/auth/types';

export async function POST() {
  try {
    // Always clear the legacy mock cookie so it cannot persist as trusted identity
    const res = NextResponse.json({ ok: true });
    res.cookies.set('nmc_user', '', { path: '/', maxAge: 0, sameSite: 'lax' });

    if (getAuthMode() === 'supabase') {
      if (isSupabaseConfigured()) {
        const client = await createServerSupabaseClient();
        if (client) {
          await client.auth.signOut();
        }
      }
    }

    return res;
  } catch (err: any) {
    console.error('[auth/logout] Error:', err.message);
    const res = NextResponse.json({ ok: false, error: '退出失败' });
    res.cookies.set('nmc_user', '', { path: '/', maxAge: 0 });
    return res;
  }
}
