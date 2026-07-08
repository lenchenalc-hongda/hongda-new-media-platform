import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const envStatus: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ? '已设置' : '未设置',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey ? '已设置' : '未设置',
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey ? '已设置' : '未设置',
  };

  // 方法1：用 @supabase/supabase-js 客户端
  let clientTest: any = null;
  if (supabaseUrl && supabaseServiceKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      });
      const { data, error } = await sb.from('site_data').select('key').limit(1);
      clientTest = { ok: !error, data, error: error?.message || null };
    } catch (e: any) {
      clientTest = { ok: false, error: e.message };
    }
  }

  // 方法2：直接用 REST API fetch
  let restTest: any = null;
  if (supabaseUrl && supabaseServiceKey) {
    try {
      const url = supabaseUrl.replace(/\/$/, '') + '/rest/v1/site_data?select=key&limit=1';
      const res = await fetch(url, {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: 'Bearer ' + supabaseServiceKey,
        },
      });
      const text = await res.text();
      restTest = { status: res.status, ok: res.ok, body: text.slice(0, 200) };
    } catch (e: any) {
      restTest = { ok: false, error: e.message };
    }
  }

  // 方法3：用 anon key + REST API（测试 RLS 是否生效）
  let anonRestTest: any = null;
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const url = supabaseUrl.replace(/\/$/, '') + '/rest/v1/site_data?select=key&limit=1';
      const res = await fetch(url, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: 'Bearer ' + supabaseAnonKey,
        },
      });
      const text = await res.text();
      anonRestTest = { status: res.status, ok: res.ok, body: text.slice(0, 200) };
    } catch (e: any) {
      anonRestTest = { ok: false, error: e.message };
    }
  }

  // 构建建议
  let advice = '';
  if (restTest?.ok) {
    advice = '✅ REST API 可用，将更新 /api/data 使用 REST API 方式';
  } else if (clientTest?.ok) {
    advice = '✅ Supabase 客户端可用';
  } else {
    advice = '❌ 都无法连接。请在 SQL Editor 运行 DROP TABLE IF EXISTS site_data; 然后重新运行完整建表语句。';
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    envStatus,
    clientLibraryTest: clientTest,
    restApiTest: restTest,
    anonKeyRestTest: anonRestTest,
    advice,
  });
}
