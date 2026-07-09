// ===== Mock Provider =====
// Always available, no API key needed. Returns schema-valid mock data.

import { AIProvider, ProviderRequest, ProviderResponse, AIProviderName } from './types';

export class MockProvider implements AIProvider {
  readonly name: AIProviderName = 'mock';
  readonly available = true;

  async generateStructured<T = Record<string, unknown>>(request: ProviderRequest): Promise<ProviderResponse> {
    const content = this.getMockResponse(request.userPrompt);
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(content); } catch { parsed = { message: content }; }
    return { content, parsed, provider: 'mock', mock: true, usage: { promptTokens: 0, completionTokens: content.length, totalTokens: 0 } };
  }

  async generateText(request: ProviderRequest): Promise<ProviderResponse> {
    const content = this.getMockResponse(request.userPrompt);
    return { content, provider: 'mock', mock: true, usage: { promptTokens: 0, completionTokens: content.length, totalTokens: 0 } };
  }

  private getMockResponse(prompt: string): string {
    if (prompt.includes('generate_script') || prompt.includes('脚本') || prompt.includes('script')) {
      return JSON.stringify({
        title: '客户只发一张图，多少钱？我不敢直接报。',
        hook: '客户只发一张图，多少钱？我不敢直接报。',
        script: '客户只发一张图，问我多少钱。\n我不敢直接报。\n因为图片看不到材质，也看不到测试要求。\n你把材质、数量和图案发我，我先帮你判断工艺。',
        wordCount: 58,
      });
    }
    if (prompt.includes('embedding') || prompt.includes('embed')) {
      return JSON.stringify({ embeddings: Array(384).fill(0).map(() => Math.random() - 0.5) });
    }
    if (prompt.includes('risk') || prompt.includes('风险')) {
      return JSON.stringify({ riskLevel: '低', riskPoints: [], allowSave: true });
    }
    if (prompt.includes('score') || prompt.includes('评分')) {
      return JSON.stringify({ totalScore: 75, grade: 'B', strengths: ['开头有钩子'], weaknesses: ['口语化不足'], recommendedStatus: 'draft' });
    }
    return JSON.stringify({ message: 'Mock response (AI_PROVIDER=mock, no API key configured)' });
  }
}
