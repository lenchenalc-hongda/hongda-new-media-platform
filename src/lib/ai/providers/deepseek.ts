// ===== DeepSeek Provider =====
// Uses OpenAI-compatible SDK for DeepSeek API calls

import OpenAI from 'openai';
import { AIProvider, ProviderRequest, ProviderResponse, AIProviderName, ProviderConfig } from './types';

export class DeepSeekProvider implements AIProvider {
  readonly name: AIProviderName = 'deepseek';
  readonly available: boolean;
  private client: OpenAI | null = null;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.available = !!config.deepseekApiKey;
    this.baseUrl = config.deepseekBaseUrl || 'https://api.deepseek.com';
    if (this.available) {
      this.client = new OpenAI({
        apiKey: config.deepseekApiKey,
        baseURL: this.baseUrl,
        timeout: 30000,
        maxRetries: 0,
      });
    }
  }

  async generateStructured<T = Record<string, unknown>>(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.client) return this.fallback(request);

    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const messages = [
      { role: 'system', content: request.systemPrompt || 'You are a helpful assistant. Output JSON.' },
      { role: 'user', content: request.userPrompt },
    ];

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    };

    // DeepSeek supports response_format for JSON mode
    if (request.outputFormat === 'json' || request.outputFormat === 'structured') {
      body.response_format = { type: 'json_object' };
    }

    // Reasoning/thinking mode (DeepSeek-R1)
    if (request.enableReasoning) {
      body.model = 'deepseek-reasoner';
    }

    try {
      const completion = await this.client.chat.completions.create(body as any);
      const content = completion.choices[0]?.message?.content || '{}';
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(content); } catch {
        // Try to extract JSON from the content (DeepSeek may add text before/after JSON)
        const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = { raw: content }; }
        } else {
          parsed = { raw: content };
        }
      }
      return {
        content, parsed, provider: 'deepseek', mock: false,
        usage: { promptTokens: completion.usage?.prompt_tokens || 0, completionTokens: completion.usage?.completion_tokens || 0, totalTokens: completion.usage?.total_tokens || 0 },
      };
    } catch (err: any) {
      if (process.env.AI_FALLBACK_TO_MOCK !== 'false') {
        console.warn('[DeepSeek] API error, falling back to mock:', err.message);
        return this.fallback(request);
      }
      throw err;
    }
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
