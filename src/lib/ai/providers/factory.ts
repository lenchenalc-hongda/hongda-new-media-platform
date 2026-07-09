// ===== Provider Factory =====
// Returns the appropriate AI provider based on config
// No business code references a provider directly - always go through factory.

import { AIProvider, AIProviderName, loadProviderConfig, ProviderConfig } from './types';

let cachedProvider: AIProvider | null = null;

export async function getProvider(): Promise<AIProvider> {
  if (cachedProvider) return cachedProvider;
  const config = loadProviderConfig();
  cachedProvider = await createProvider(config);
  return cachedProvider;
}

export async function createProvider(config: ProviderConfig): Promise<AIProvider> {
  switch (config.provider) {
    case 'deepseek': {
      const { DeepSeekProvider } = await import('./deepseek');
      const provider = new DeepSeekProvider(config);
      if (provider.available) return provider;
      if (config.fallbackToMock) { console.warn('[AI] DeepSeek not available, falling back to mock'); break; }
      throw new Error('DeepSeek API key not configured');
    }
    case 'openai': {
      const { OpenAIProvider } = await import('./openai');
      const provider = new OpenAIProvider(config);
      if (provider.available) return provider;
      if (config.fallbackToMock) { console.warn('[AI] OpenAI not available, falling back to mock'); break; }
      throw new Error('OpenAI API key not configured');
    }
    case 'mock':
    default:
      break;
  }
  const { MockProvider } = await import('./mock');
  return new MockProvider();
}

export function resetProvider(): void {
  cachedProvider = null;
}

export function getCurrentProviderName(): AIProviderName {
  return (process.env.AI_PROVIDER || 'mock') as AIProviderName;
}

export function isMockMode(): boolean {
  const config = loadProviderConfig();
  if (config.provider === 'mock') return true;
  if (config.provider === 'deepseek' && !config.deepseekApiKey) return true;
  if (config.provider === 'openai' && !config.openaiApiKey) return true;
  return false;
}
