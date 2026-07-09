// GET /api/ai/health
// Returns provider status, mock mode, and connectivity info

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const aiProvider = process.env.AI_PROVIDER || 'mock';
  const openaiKey = !!process.env.OPENAI_API_KEY;
  const deepseekKey = !!process.env.DEEPSEEK_API_KEY;

  let isMock = true;
  if (aiProvider === 'openai' && openaiKey) isMock = false;
  if (aiProvider === 'deepseek' && deepseekKey) isMock = false;
  if (aiProvider === 'mock') isMock = true;

  return NextResponse.json({
    aiProvider,
    mockMode: isMock,
    configured_provider: aiProvider,
    envKeysPresent: {
      OPENAI_API_KEY: openaiKey,
      DEEPSEEK_API_KEY: deepseekKey,
    },
    webResearchEnabled: process.env.ENABLE_WEB_RESEARCH === 'true',
    fallbackToMock: process.env.AI_FALLBACK_TO_MOCK !== 'false',
    timestamp: new Date().toISOString(),
  });
}
