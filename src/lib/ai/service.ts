// @server-only - AI service layer using provider abstraction
// Switch providers by setting AI_PROVIDER=mock|openai|deepseek
// No business code calls providers directly - always through this module.

import { getProvider, getCurrentProviderName, isMockMode } from './providers';
import type { ProviderRequest } from './providers';

// ===== Logger =====
import { logAiRun } from './logger';

function detectRunType(prompt: string): string {
  if (prompt.includes('诊断') || prompt.includes('account_diagnosis')) return 'account_diagnosis';
  if (prompt.includes('选题') || prompt.includes('topic')) return 'generate_topics';
  if (prompt.includes('脚本') || prompt.includes('script')) return 'generate_script';
  if (prompt.includes('改写') || prompt.includes('rewrite')) return 'rewrite_script';
  if (prompt.includes('拆解') || prompt.includes('teardown')) return 'viral_teardown';
  if (prompt.includes('复盘') || prompt.includes('review')) return 'post_review';
  if (prompt.includes('线索') || prompt.includes('lead')) return 'lead_score';
  if (prompt.includes('回复') || prompt.includes('reply')) return 'lead_reply';
  if (prompt.includes('周报') || prompt.includes('weekly')) return 'weekly_report';
  if (prompt.includes('文章') || prompt.includes('article')) return 'generate_article';
  if (prompt.includes('检索') || prompt.includes('retrieve')) return 'retrieve';
  return 'generate';
}

// ===== Unified callAI =====
// All AI calls go through this function, which delegates to the provider factory.

export async function callAI(prompt: string, systemPrompt?: string, options?: Partial<ProviderRequest>): Promise<any> {
  const startTime = Date.now();
  const runType = detectRunType(prompt) as any;
  const provider = await getProvider();

  try {
    const response = await provider.generateStructured({
      systemPrompt: systemPrompt || 'You are a helpful assistant. Output valid JSON only, no markdown wrapping.',
      userPrompt: prompt,
      outputFormat: 'json',
      ...options,
    });

    logAiRun({
      run_type: runType,
      input: { prompt: prompt.slice(0, 200) },
      output: response.parsed || response.content,
      success: true,
      duration_ms: Date.now() - startTime,

    });

    return response.parsed || { message: response.content };
  } catch (error: any) {
    console.error('[AI] callAI failed:', error.message);
    logAiRun({
      run_type: runType,
      input: { prompt: prompt.slice(0, 200) },
      output: null,
      success: false,
      error: error.message,
      duration_ms: Date.now() - startTime,
    });

    // Fallback to mock via the provider's own fallback
    const { MockProvider } = await import('./providers/mock');
    const mock = new MockProvider();
    const mockResponse = await mock.generateStructured({
      systemPrompt, userPrompt: prompt,
    });
    return mockResponse.parsed || { message: mockResponse.content };
  }
}

// ===== Convenience methods =====

export async function callAIText(prompt: string, systemPrompt?: string, options?: Partial<ProviderRequest>): Promise<string> {
  const provider = await getProvider();
  const response = await provider.generateText({
    systemPrompt: systemPrompt || 'You are a helpful assistant.',
    userPrompt: prompt,
    ...options,
  });
  return response.content;
}

// ===== Exports =====

export const AI_MOCK_MODE = isMockMode();
export const AI_PROVIDER = getCurrentProviderName();
export { getProvider, isMockMode, getCurrentProviderName } from './providers';
export { getLLMAdapter, getCurrentAdapterName, resetAdapter } from './providers/adapter';
