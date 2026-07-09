// ===== Provider Interface Types =====

export type AIProviderName = 'mock' | 'openai' | 'deepseek';

/** Standardized prompt request */
export interface ProviderRequest {
  systemPrompt?: string;
  userPrompt: string;
  /** Expected output format */
  outputFormat?: 'json' | 'text' | 'structured';
  /** JSON schema for structured output */
  jsonSchema?: Record<string, unknown>;
  /** Temperature (0-2) */
  temperature?: number;
  /** Max output tokens */
  maxTokens?: number;
  /** DeepSeek-specific: enable reasoning mode */
  enableReasoning?: boolean;
  /** DeepSeek-specific: thinking budget tokens */
  thinkingBudget?: number;
}

/** Standardized provider response */
export interface ProviderResponse {
  content: string;
  /** Parsed JSON if outputFormat was 'json' or 'structured' */
  parsed?: Record<string, unknown>;
  /** Usage info */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Provider name that served this request */
  provider: AIProviderName;
  /** Whether this was a mock response */
  mock: boolean;
}

/** Provider adapter interface */
export interface AIProvider {
  readonly name: AIProviderName;
  readonly available: boolean;
  /** Generate structured output (JSON guaranteed) */
  generateStructured<T = Record<string, unknown>>(request: ProviderRequest): Promise<ProviderResponse>;
  /** Generate free text */
  generateText(request: ProviderRequest): Promise<ProviderResponse>;
}

// ===== Provider Config =====

export interface ProviderConfig {
  provider: AIProviderName;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  fallbackToMock: boolean;
}

export function loadProviderConfig(): ProviderConfig {
  const provider = (process.env.AI_PROVIDER || 'mock') as AIProviderName;
  return {
    provider,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    fallbackToMock: process.env.AI_FALLBACK_TO_MOCK !== 'false',
  };
}
