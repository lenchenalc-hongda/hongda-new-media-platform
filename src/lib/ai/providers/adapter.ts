// ===== LLMProviderAdapter =====
// Canonical adapter interface that ALL providers (DeepSeek/OpenAI/Mock) implement.
// Providers generate candidate content. They NEVER own scoring, risk, or status.
// Local rules ALWAYS run after any AI generation.

import { z } from 'zod';
import { getProvider, getCurrentProviderName, isMockMode } from './factory';
import type { AIProvider, ProviderRequest } from './types';

// ===== Zod Schemas for Adapter Inputs/Outputs =====

export const AngleCandidateSchema = z.object({
  id: z.string(),
  title: z.string().max(30),
  angleType: z.string(),
  targetCustomer: z.string(),
  customerPain: z.string(),
  coreConflict: z.string(),
  whyItWorks: z.string(),
  recommendedAccount: z.string(),
  riskLevel: z.enum(['低', '中', '高']),
  score: z.number(),
});

export const HookCandidateSchema = z.object({
  id: z.string(),
  hookText: z.string().max(28, '钩子不能超过28字'),
  hookType: z.string(),
  tensionType: z.string(),
  targetCustomer: z.string(),
  whyItWorks: z.string(),
  riskNotes: z.string(),
});

export const DraftSchema = z.object({
  hook: z.string().max(30),
  body: z.string().min(1),
  wordCount: z.number().min(10).max(500),
  subtitlePoints: z.array(z.string()).optional(),
});

export const RewriteResultSchema = z.object({
  hook: z.string().max(30),
  body: z.string().min(1),
  wordCount: z.number(),
  changes: z.array(z.string()).optional(),
});

export const AIJudgeSchema = z.object({
  structureScore: z.number().min(0).max(25),
  spokenScore: z.number().min(0).max(25),
  painScore: z.number().min(0).max(25),
  ctaScore: z.number().min(0).max(25),
  suggestions: z.array(z.string()).optional(),
});

export type AngleCandidate = z.infer<typeof AngleCandidateSchema>;
export type HookCandidate = z.infer<typeof HookCandidateSchema>;
export type AiDraft = z.infer<typeof DraftSchema>;
export type RewriteResult = z.infer<typeof RewriteResultSchema>;
export type AIJudge = z.infer<typeof AIJudgeSchema>;

// ===== Adapter Interface =====

export interface LLMProviderAdapter {
  readonly name: 'deepseek' | 'openai' | 'mock';
  readonly available: boolean;

  /** Generate 8-12 angle candidates from input */
  generateAngles(input: {
    account?: any;
    productOrProcess?: string;
    customerPain?: string;
    material?: string;
    platform?: string;
    knowledgeCards?: any[];
  }): Promise<{ angles: AngleCandidate[]; method: string }>;

  /** Generate 12-20 hook candidates */
  generateHooks(input: {
    account?: any;
    productOrProcess?: string;
    customerPain?: string;
    material?: string;
    angle?: any;
    knowledgeCards?: any[];
    recentScripts?: any[];
  }): Promise<{ hooks: HookCandidate[]; method: string }>;

  /** Generate draft from input + selected angle + selected hook */
  generateDraft(input: {
    hook: string;
    angle: any;
    targetCustomer: string;
    customerPain: string;
    productOrProcess?: string;
    material?: string;
    account?: any;
    knowledgeCards?: any[];
  }): Promise<AiDraft>;

  /** Rewrite script based on feedback */
  rewriteScript(input: {
    script: string;
    hook: string;
    feedback: string;
    targetCustomer?: string;
  }): Promise<RewriteResult>;

  /** Judge script quality (for reference only — final score is local) */
  judgeScript(input: {
    script: string;
    duration: string;
  }): Promise<AIJudge>;
}

// ===== Adapter Factory =====

let cachedAdapter: LLMProviderAdapter | null = null;

export async function getLLMAdapter(): Promise<LLMProviderAdapter> {
  if (cachedAdapter) return cachedAdapter;
  const providerName = getCurrentProviderName();

  const { DeepSeekProvider } = await import('./deepseek');
      const { OpenAIProvider } = await import('./openai');
      const { MockProvider } = await import('./mock');

  switch (providerName) {
    case 'deepseek': {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (apiKey) {
        const provider = new DeepSeekProvider({ provider: 'deepseek', deepseekApiKey: apiKey, deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', fallbackToMock: process.env.AI_FALLBACK_TO_MOCK !== 'false' });
        if (provider.available) {
          cachedAdapter = new DeepSeekLLMAdapter(provider);
          return cachedAdapter;
        }
      }
      if (process.env.AI_FALLBACK_TO_MOCK !== 'false') {
        console.warn('[Adapter] DeepSeek not available, falling back to mock');
      }
      break;
    }
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        const provider = new OpenAIProvider({ provider: 'openai', openaiApiKey: apiKey, openaiBaseUrl: process.env.OPENAI_BASE_URL, fallbackToMock: process.env.AI_FALLBACK_TO_MOCK !== 'false' });
        if (provider.available) {
          cachedAdapter = new DeepSeekLLMAdapter(provider);
          return cachedAdapter;
        }
      }
      break;
    }
  }

  // Default: Mock adapter
  cachedAdapter = new MockLLMAdapter();
  return cachedAdapter;
}

export function resetAdapter(): void {
  cachedAdapter = null;
}

export function getCurrentAdapterName(): string {
  return cachedAdapter?.name || getCurrentProviderName();
}

// ===== DeepSeek Adapter =====

class DeepSeekLLMAdapter implements LLMProviderAdapter {
  readonly name = 'deepseek' as const;
  readonly available: boolean;
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
    this.available = provider.available;
  }

  private async call(prompt: string, systemPrompt?: string): Promise<any> {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 45000));
    const response = await Promise.race([
      this.provider.generateStructured({
        systemPrompt: systemPrompt || '你是宏达印业的新媒体策划顾问。输出JSON，不要markdown包裹。',
        userPrompt: prompt,
        outputFormat: 'json',
        temperature: 0.7,
      }),
      timeout,
    ]);
    if (!response) {
      console.warn('[Adapter] AI provider timeout after 45s');
      throw new Error('AI provider timeout (45s)');
    }
    return response.parsed || {};
  }

  async generateAngles(input: any): Promise<{ angles: AngleCandidate[]; method: string }> {
    try {
      const parsed = await this.call(`请生成8-12个短视频内容角度。客户痛点：${input.customerPain || ''} 产品/工艺：${input.productOrProcess || ''} 材质：${input.material || ''} 账号人设：${input.account?.persona || ''} 目标客户：${input.account?.target_audience || ''}。要求每个角度标题不超过20字，类型多样化，标注风险等级。输出JSON格式：{"angles":[{"id":"...","title":"...","angleType":"...","targetCustomer":"...","customerPain":"...","coreConflict":"...","whyItWorks":"...","riskLevel":"低/中/高"}]}`);
      if (Array.isArray(parsed.angles)) {
        return { angles: parsed.angles.slice(0, 12), method: 'ai' };
      }
    } catch {}
    return { angles: [], method: 'fallback' };
  }

  async generateHooks(input: any): Promise<{ hooks: HookCandidate[]; method: string }> {
    try {
      const parsed = await this.call(`请生成12-20个不同角度的开头钩子。角度：${input.angle?.title || ''} 冲突：${input.angle?.coreConflict || ''} 客户痛点：${input.customerPain || ''} 产品/工艺：${input.productOrProcess || ''} 材质：${input.material || ''}。要求每个钩子不超过28字，类型包含直接提问、客户原话、风险警告、反常识、价格冲突、材质风险、测试风险。输出JSON格式：{"hooks":[{"id":"...","hookText":"...不超过28字","hookType":"direct_question/...","tensionType":"price/...","targetCustomer":"...","whyItWorks":"..."}]}`);
      if (Array.isArray(parsed.hooks)) {
        return { hooks: parsed.hooks.slice(0, 20), method: 'ai' };
      }
    } catch {}
    return { hooks: [], method: 'fallback' };
  }

  async generateDraft(input: any): Promise<AiDraft> {
    const startTime = Date.now();
    console.log('[Adapter] generateDraft starting for hook:', (input.hook || '').slice(0, 30));
    const kcInfo = (input.knowledgeCards || []).slice(0, 3).map((k: any) =>
      k.title + '：' + (k.core_conclusion || '').slice(0, 100)
    ).join('\n');
    const prompt = `你是宏达印业（专业热转印工厂）的新媒体文案顾问。

请根据以下信息生成一条短视频口播脚本。脚本必须自然流畅，从选择的钩子开始，围绕一个核心判断展开，结尾自然引导下一步。

## 输入信息
选择钩子：${input.hook || ''}
内容角度：${input.angle?.title || ''}（${input.angle?.coreConflict || ''}）
目标客户：${input.targetCustomer || ''}
客户痛点：${input.customerPain || ''}
产品/工艺：${input.productOrProcess || ''}
材质：${input.material || ''}
${kcInfo ? '\n## 参考知识\n' + kcInfo : ''}

## 品牌要求
1. 语气：专业、可信、不过度营销
2. 句式：每句话不超过30个字
3. 语言像工厂老板/业务员在跟客户说话，不要像文章
4. 结尾自然引导：发产品图/发材质/发数量/发测试要求/寄样

## 禁止表达
绝对不做、很多客户问我这个问题、今天统一回答一下、今天给大家讲一下、首先、其次、最后、综上所述

## 输出要求
输出JSON格式（不要任何额外文字）：
{
  "hook": "开头钩子（直接用选择钩子）",
  "body": "完整口播稿\n每行一句\n自然流畅\n从钩子开始",
  "wordCount": 中文字数
}`;

    const parsed = await this.call(prompt);
    const validated = DraftSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn('[Adapter] DraftSchema validation failed, using fallback');
    }
    return validated.success ? validated.data : { hook: input.hook, body: parsed.body || parsed.script || '', wordCount: 0 };
  }

  async rewriteScript(input: any): Promise<RewriteResult> {
    const prompt = `你是宏达印业（专业热转印工厂）的新媒体文案顾问。

请根据反馈意见重写以下短视频口播脚本。

## 原脚本
${input.script}

## 反馈意见
${input.feedback}

## 品牌要求
1. 语气：专业、可信、不过度营销
2. 句式：短段落，每句话不超过30字
3. 语言像工厂老板/业务员说话，不是文章
4. 第一句话直接点出客户具体问题
5. 结尾自然引导下一步动作

## 禁止表达
大量绝对不做、很多客户问我这个问题、今天统一回答一下、首先、其次、最后、综上所述

## 输出要求
保持核心信息不变，只改进表达方式。输出JSON：
{
  "hook": "开头钩子",
  "body": "完整口播稿\n每行一句",
  "wordCount": 数字,
  "changes": ["改进了什么"]
}`;

    const parsed = await this.call(prompt);
    return RewriteResultSchema.safeParse(parsed).success
      ? parsed as RewriteResult
      : { hook: input.hook || '', body: parsed.body || input.script, wordCount: 0 };
  }

  async judgeScript(input: any): Promise<AIJudge> {
    const parsed = await this.call(`请评分以下脚本：${input.script}（目标${input.duration}秒）。评分维度：structureScore(0-25)、spokenScore(0-25)、painScore(0-25)、ctaScore(0-25)。输出JSON`);
    const validated = AIJudgeSchema.safeParse(parsed);
    return validated.success ? validated.data : { structureScore: 15, spokenScore: 15, painScore: 15, ctaScore: 10, suggestions: [] };
  }
}



// ===== Mock Adapter =====
// Context-aware mock — varies by input
class MockLLMAdapter implements LLMProviderAdapter {
  readonly name = 'mock' as const;
  readonly available = true;

  async generateAngles(input: any): Promise<{ angles: AngleCandidate[]; method: string }> {
    const pain = input.customerPain || input.productOrProcess || '热转印';
    const mat = input.material || '';
    const accName = input.account?.name?.split('-')[0] || '';
    const targetAud = input.account?.target_audience || '';
    const angles: AngleCandidate[] = [
      { id: 'ma_1', title: '客户对' + pain.slice(0,10) + '最常犯的错', angleType: 'customer_misunderstanding', targetCustomer: targetAud, customerPain: pain, coreConflict: '客户以为很简单，实际很多细节要注意', whyItWorks: '客户想知道自己是不是做错了', recommendedAccount: accName, riskLevel: '低', score: 82 },
      { id: 'ma_2', title: (mat || pain) + '能不能做？判断逻辑', angleType: 'material_risk', targetCustomer: targetAud, customerPain: pain, coreConflict: mat ? mat + '看着能印，但附着力不一定过关' : '不先确认风险很大', whyItWorks: '客户怕做错了浪费钱', recommendedAccount: accName, riskLevel: '中', score: 88 },
      { id: 'ma_3', title: (mat || pain) + '的报价逻辑', angleType: 'cost_logic', targetCustomer: '正在询价的客户', customerPain: pain, coreConflict: '只看图片报的价格不靠谱', whyItWorks: '客户想知道价格但不知道怎么问', recommendedAccount: accName, riskLevel: '低', score: 80 },
      { id: 'ma_4', title: '老师傅说' + (mat || pain.slice(0,6)), angleType: 'factory_experience', targetCustomer: '关心工艺细节的客户', customerPain: pain, coreConflict: '看起来一样的工艺，细节差很多', whyItWorks: '老师傅经验值得信', recommendedAccount: accName, riskLevel: '低', score: 86 },
      { id: 'ma_5', title: '一个做' + (pain.slice(0,8) || '热转印') + '客户的经历', angleType: 'case_story', targetCustomer: '有类似需求的客户', customerPain: pain, coreConflict: '客户之前踩过坑，换对方法才做对', whyItWorks: '真实案例有说服力', recommendedAccount: accName, riskLevel: '低', score: 87 },
      { id: 'ma_6', title: (mat || pain) + '要不要先测试？', angleType: 'test_requirement', targetCustomer: '有测试要求的客户', customerPain: pain, coreConflict: '不打样直接大货翻车是迟早的事', whyItWorks: '客户怕测试太麻烦但更怕出问题', recommendedAccount: accName, riskLevel: '低', score: 84 },
      { id: 'ma_7', title: '回答一下关于' + pain.slice(0,8) + '的最高赞问题', angleType: 'comment_reply', targetCustomer: '正搜索相关问题的客户', customerPain: pain, coreConflict: '很多人问但答案没那么简单', whyItWorks: '真实问题引起共鸣', recommendedAccount: accName, riskLevel: '低', score: 79 },
      { id: 'ma_8', title: (mat || '价格') + '的3个误区', angleType: 'customer_misunderstanding', targetCustomer: targetAud, customerPain: pain, coreConflict: '客户以为知道其实搞反了', whyItWorks: '纠正认知有传播力', recommendedAccount: accName, riskLevel: '低', score: 81 },
    ];
    return { angles, method: 'mock' };
  }

  async generateHooks(input: any): Promise<{ hooks: HookCandidate[]; method: string }> {
    const pain = input.customerPain || input.angle?.customerPain || input.productOrProcess || '热转印';
    const mat = input.material || '';
    const accTarget = input.account?.target_audience || '';
    const hookTexts = [
      { txt: mat ? mat + '能不能做热转印？先别急着回答。' : pain.slice(0,10) + '先别急着回答。', type: 'direct_question', tension: 'can_or_cannot', why: '客户自己也在问' + pain.slice(0,12) + '的问题' },
      { txt: '客户问' + pain.slice(0,14) + '，怎么回？', type: 'direct_question', tension: 'fear_of_failure', why: '直接回答客户最关心的问题' },
      { txt: mat ? mat + '不是不能印，是不能直接承诺。' : pain.slice(0,10) + '不是不能做，是不能直接承诺。', type: 'material_risk', tension: 'can_or_cannot', why: '帮客户理解风险边界' },
      { txt: '只看图片就报价的，建议你不要信。', type: 'warning', tension: 'cost_waste', why: '客户怕踩坑，预警天然吸引关注' },
      { txt: '"按上次一样做就行"——这话不能直接听。', type: 'customer_quote', tension: 'quality_risk', why: '这句话客户太熟悉了，想知道正确的做法' },
      { txt: mat ? mat + '的价格不是一张图能报的。' : pain.slice(0,8) + '的价格不是一句话能说清的。', type: 'cost_conflict', tension: 'price', why: '跟价格有关客户都在意' },
      { txt: '不打样就直接做大货，十个有八个翻车。', type: 'warning', tension: 'fear_of_failure', why: '怕翻车是客户最大的顾虑' },
      { txt: '客户只发一张图，我必须问三个问题。', type: 'direct_question', tension: 'price', why: '帮客户理解报价需要什么信息' },
      { txt: '同样的' + (mat || '产品') + '，不一样的工艺，效果差一倍。', type: 'comparison', tension: 'wrong_assumption', why: '纠正客户的错误认知' },
      { txt: '做了20年印刷，最大的坑是沟通问题。', type: 'boss_experience', tension: 'fear_of_failure', why: '老板身份自带权威感' },
      { txt: '刚入行的时候，看材质我也分不清。', type: 'nini_perspective', tension: 'wrong_assumption', why: '新手视角更容易代入' },
      { txt: '客户说之前做的掉了，原因可能不是附着力。', type: 'test_risk', tension: 'fear_of_failure', why: '怕翻车是客户最大的顾虑' },
    ].sort(() => Math.random() - 0.5).slice(0, 5);
    const hooks: HookCandidate[] = hookTexts.map((h, i) => ({
      id: 'mh_' + i, hookText: h.txt, hookType: h.type, tensionType: h.tension,
      targetCustomer: accTarget, whyItWorks: h.why, riskNotes: '',
    }));
    return { hooks, method: 'mock' };
  }

  async generateDraft(input: any): Promise<AiDraft> {
    const body = `${input.hook}\n客户问这个问题，我不能直接回答。\n因为材质不一样，方案完全不一样。\n你把材质、数量和测试要求发我，我帮你判断。`;
    return { hook: input.hook, body, wordCount: body.replace(/[\u4e00-\u9fff]/g, '').length };
  }

  async rewriteScript(input: any): Promise<RewriteResult> {
    return { hook: input.hook || '', body: input.script, wordCount: 0 };
  }

  async judgeScript(input: any): Promise<AIJudge> {
    return { structureScore: 15, spokenScore: 16, painScore: 14, ctaScore: 10, suggestions: ['建议更口语化'] };
  }
}

export { DeepSeekLLMAdapter, MockLLMAdapter };
