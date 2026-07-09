// ===== OpenAI Provider =====

import OpenAI from 'openai';
import { AIProvider, ProviderRequest, ProviderResponse, AIProviderName, ProviderConfig } from './types';

export class OpenAIProvider implements AIProvider {
  readonly name: AIProviderName = 'openai';
  readonly available: boolean;
  private client: OpenAI | null = null;

  constructor(config: ProviderConfig) {
    this.available = !!config.openaiApiKey;
    if (this.available) {
      this.client = new OpenAI({
        apiKey: config.openaiApiKey,
        baseURL: config.openaiBaseUrl || undefined,
      });
    }
  }

  async generateStructured<T = Record<string, unknown>>(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.client) return this.fallback(request);
    const completion = await this.client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: request.systemPrompt || 'You are a helpful assistant. Output JSON.' },
        { role: 'user', content: request.userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
    });
    const content = completion.choices[0]?.message?.content || '{}';
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(content); } catch { parsed = { raw: content }; }
    return {
      content, parsed, provider: 'openai', mock: false,
      usage: { promptTokens: completion.usage?.prompt_tokens || 0, completionTokens: completion.usage?.completion_tokens || 0, totalTokens: completion.usage?.total_tokens || 0 },
    };
  }

  async generateText(request: ProviderRequest): Promise<ProviderResponse> {
    const result = await this.generateStructured(request);
    return { ...result, parsed: undefined };
  }

  private async fallback(request: ProviderRequest): Promise<ProviderResponse> {
    const { MockProvider } = await import('./mock');
    return new MockProvider().generateStructured(request);
  }
}
