// GET /api/ai/health
// Returns AI service status, including whether mock mode is active.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';

  return NextResponse.json({
    status: 'ok',
    ai_enabled: !!openaiApiKey,
    mock_mode: !openaiApiKey,
    model: openaiModel,
    endpoints_available: [
      'account-diagnosis', 'generate-topics', 'generate-script', 'rewrite-script',
      'viral-teardown', 'post-review', 'lead-score', 'lead-reply', 'weekly-report',
    ],
    // If a key is set but blank, still report mock
    key_configured: typeof openaiApiKey === 'string' && openaiApiKey.length > 0,
    message: openaiApiKey
      ? `OpenAI API 已配置，模型：${openaiModel}`
      : 'OpenAI API Key 未配置，所有 AI 功能将以 mock 模式运行，返回模拟数据',
    timestamp: new Date().toISOString(),
  });
}
