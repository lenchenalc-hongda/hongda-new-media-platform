// GET /api/data/diagnostic
// 诊断：检查 Supabase 环境变量是否配置正确

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const envStatus: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl
      ? '已设置 (' + supabaseUrl.slice(0, 25) + '...)'
      : '未设置',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey ? '已设置' : '未设置',
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey ? '已设置' : '未设置',
  };

  const allSet = !!(supabaseUrl && supabaseAnonKey && supabaseServiceKey);

  let connectionTest: any = null;
  if (allSet) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      });
      const { data, error } = await sb.from('site_data').select('key').limit(1);
      if (error) {
        const isMissingTable =
          error.message.includes('relation') ||
          error.message.includes('does not exist');
        connectionTest = {
          status: '连接失败',
          error: error.message,
          hint: isMissingTable
            ? '表 site_data 还没创建，去 SQL Editor 运行建表语句'
            : '其他错误',
        };
      } else {
        connectionTest = { status: '连接成功', message: '表可用' };
      }
    } catch (e: any) {
      connectionTest = { status: '异常', error: e.message };
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    node_env: process.env.NODE_ENV,
    envStatus,
    canConnectSupabase: allSet,
    connectionTest,
    advice: allSet
      ? '环境变量已配置。如果连接测试报「表不存在」，去 SQL Editor 运行建表语句'
      : '请在 Vercel 环境变量中设置以上三个变量后 Redeploy',
  });
}
