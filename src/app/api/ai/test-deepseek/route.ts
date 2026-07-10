// GET /api/ai/test-deepseek
// Simple test to verify DeepSeek is working

import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const logs: string[] = [];
  const results: Record<string, any> = {};

  // 1. Check env vars
  results.env = {
    AI_PROVIDER: process.env.AI_PROVIDER || 'not set',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ? 'set (' + process.env.DEEPSEEK_API_KEY.slice(0, 8) + '...)' : 'not set',
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL || 'not set (default: https://api.deepseek.com)',
  };

  // 2. Try to get provider
  try {
    const provider = await getProvider();
    results.provider = {
      name: provider.name,
      available: provider.available,
    };

    // 3. Try a simple API call
    const response = await provider.generateStructured({
      systemPrompt: '你是一个助手。输出JSON。',
      userPrompt: '请回复JSON: {"test": "hello","status":"ok"}',
      outputFormat: 'json',
      temperature: 0.1,
    });

    results.apiResponse = {
      content: response.content.slice(0, 200),
      parsed: response.parsed,
      provider: response.provider,
      mock: response.mock,
      usage: response.usage,
    };
    results.success = true;
  } catch (err: any) {
    results.error = err.message;
    results.errorStack = err.stack?.split('\n').slice(0, 5).join('\n');
    results.success = false;
  }

  return NextResponse.json({ ...results, timestamp: new Date().toISOString() });
}
