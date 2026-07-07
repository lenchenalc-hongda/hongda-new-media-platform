// GET /api/health
// Returns app version, build time, and environment diagnostics.
// No auth required — used by deployment health checks.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const openaiConfigured = !!process.env.OPENAI_API_KEY;

  return NextResponse.json({
    status: 'ok',
    app: '宏达新媒体作战中台',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    build: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'dev',
    services: {
      supabase: supabaseConfigured ? 'configured' : 'not_configured',
      openai: openaiConfigured ? 'configured' : 'not_configured',
      weixin: !!(process.env.WECHAT_VIDEO_ACCESS_TOKEN && process.env.WECHAT_APP_ID) ? 'configured' : 'not_configured',
      douyin: !!(process.env.DOUYIN_CLIENT_KEY && process.env.DOUYIN_CLIENT_SECRET) ? 'configured' : 'not_configured',
    },
    env: process.env.NODE_ENV,
    memory: process.memoryUsage ? {
      rss: Math.round((process.memoryUsage().rss || 0) / 1024 / 1024) + 'MB',
      heap: Math.round((process.memoryUsage().heapUsed || 0) / 1024 / 1024) + 'MB',
    } : null,
  });
}
