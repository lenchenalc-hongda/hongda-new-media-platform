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
    duration?: string;
    platform?: string;
    knowledgeCards?: any[];
  }): Promise<{ angles: AngleCandidate[]; method: string }>;

  /** Generate 12-20 hook candidates */
  generateHooks(input: {
    account?: any;
    productOrProcess?: string;
    customerPain?: string;
    material?: string;
    duration?: string;
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
    duration?: string;
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

  private async call(prompt: string, systemPrompt?: string, retries = 1): Promise<any> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 60000));
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
          console.warn(`[Adapter] AI provider timeout on attempt ${attempt + 1}`);
          continue;
        }
        return response.parsed || {};
      } catch (err: any) {
        console.warn(`[Adapter] AI call failed on attempt ${attempt + 1}: ${err.message}`);
        if (attempt < retries) continue;
        throw err;
      }
    }
    throw new Error('AI provider failed after ' + (retries + 1) + ' attempts');
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
      const parsed = await this.call(`请生成12-20个不同角度的开头钩子。角度：${input.angle?.title || ''} 冲突：${input.angle?.coreConflict || ''} 客户痛点：${input.customerPain || ''} 产品/工艺：${input.productOrProcess || ''} 材质：${input.material || ''}
${input.account ? `
## 账号信息
账号名称：${input.account?.name || ''}
人设：${input.account?.persona || ''}
目标受众：${input.account?.target_audience || ''}
内容风格：${input.account?.content_style || ''}
${input.account?.dos ? '✅ 应该做的：' + input.account.dos : ''}
${input.account?.donts ? '❌ 不应该做的：' + input.account.donts : ''}
` : ''}
。要求每个钩子不超过28字，类型包含直接提问、客户原话、风险警告、反常识、价格冲突、材质风险、测试风险。输出JSON格式：{"hooks":[{"id":"...","hookText":"...不超过28字","hookType":"direct_question/...","tensionType":"price/...","targetCustomer":"...","whyItWorks":"..."}]}`);
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
### ⚠️ 核心问题（必须优先回答）
客户痛点：${input.customerPain || '（无具体痛点，生成通用内容）'}

### 其他参考信息
选择钩子：${input.hook || ''}
内容角度：${input.angle?.title || ''}（${input.angle?.coreConflict || ''}）
目标客户：${input.targetCustomer || ''}
产品/工艺：${input.productOrProcess || ''}
材质：${input.material || ''}
${input.account ? `
## 账号信息
账号名称：${input.account?.name || ''}
人设：${input.account?.persona || ''}
目标受众：${input.account?.target_audience || ''}
内容风格：${input.account?.content_style || ''}
${input.account?.dos ? '✅ 应该做的：' + input.account.dos : ''}
${input.account?.donts ? '❌ 不应该做的：' + input.account.donts : ''}
` : ''}
${kcInfo ? '\n## 参考知识\n' + kcInfo : ''}

## 品牌要求
1. 语气：专业、可信、不过度营销
2. 句式：每句话不超过30个字
3. 语言像工厂老板/业务员在跟客户说话，不要像文章
4. 结尾自然引导：发产品图/发材质/发数量/发测试要求/寄样

## 禁止表达
绝对不做、很多客户问我这个问题、今天统一回答一下、今天给大家讲一下、首先、其次、最后、综上所述

## 输出要求
生成一个较完整的内容（目标60秒版本，约300-400字），15秒和30秒版本会自动截取。
内容需要包含：核心问题分析 → 判断逻辑 → 自然引导，三个环节。
输出JSON格式（不要任何额外文字）：
{
  "hook": "开头钩子（直接用选择钩子）",
  "body": "完整口播稿\n每行一句\n自然流畅\n从核心问题开始\n包含判断逻辑\n结尾引导下一步",
  "wordCount": 中文字数（应大于200字）
}`;

    try {
      const parsed = await this.call(prompt, undefined, 1);
      const validated = DraftSchema.safeParse(parsed);
      if (validated.success) {
        console.log(`[Adapter] generateDraft succeeded in ${Date.now() - startTime}ms`);
        return validated.data;
      }
      throw new Error('Schema validation failed');
    } catch (err: any) {
      console.warn(`[Adapter] generateDraft failed: ${err.message}, retrying with simpler prompt`);
      // Retry with simpler prompt
      const simplePrompt = `口播脚本。账号：${input.account?.name || ''}。人设：${input.account?.persona || ''}。目标受众：${input.account?.target_audience || ''}。钩子：${input.hook || ''}。角度：${input.angle?.title || ''}。客户：${input.customerPain || ''}。工艺：${input.productOrProcess || ''}。材质：${input.material || ''}。${kcInfo ? '参考知识：' + kcInfo.slice(0, 200) : ''}。每句话不超过30字，总共5-8句，从钩子开始，结尾引导下一步。输出JSON格式：{"hook":"${input.hook || ''}","body":"完整口播稿，每行一句","wordCount":数字}`;
      try {
        const sResult = await this.call(simplePrompt, '输出JSON，不要markdown包裹。', 1);
        const sValidated = DraftSchema.safeParse(sResult);
        if (sValidated.success) return sValidated.data;
        return { hook: input.hook || '', body: sResult.body || sResult.script || input.hook || '', wordCount: 0 };
      } catch (retryErr: any) {
        console.warn(`[Adapter] generateDraft retry also failed: ${retryErr.message}`);
        throw new Error('AI draft generation failed after retry');
      }
    }
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
    const topicPairs = [
      { conflict: '客户以为很简单，实际很多细节要注意', why: '客户想知道自己是不是做错了' },
      { conflict: mat ? mat + '看着能印，但附着力不一定过关' : '不先确认风险很大', why: '客户怕做错了浪费钱' },
      { conflict: '只看图片报的价格不靠谱，需要知道材质和数量', why: '客户想知道价格但不知道怎么问' },
      { conflict: '看起来一样的工艺，细节差很多', why: '老师傅经验值得信' },
      { conflict: '客户之前踩过坑，换对方法才做对', why: '真实案例有说服力' },
      { conflict: '不打样直接大货翻车是迟早的事', why: '客户怕测试太麻烦但更怕出问题' },
      { conflict: '很多人问但答案没那么简单', why: '真实问题引起共鸣' },
      { conflict: '客户以为知道其实搞反了', why: '纠正认知有传播力' },
    ];
    const types = ['customer_misunderstanding', 'material_risk', 'cost_logic', 'factory_experience', 'case_story', 'test_requirement', 'comment_reply', 'customer_question'];
    const titles = [
      '客户对' + pain.slice(0,8) + '最常犯的错',
      (mat || pain.slice(0,8)) + '能不能做？先看这个判断逻辑',
      (mat || pain.slice(0,6)) + '的价格到底怎么算的？',
      '做了20年' + (mat || pain.slice(0,6)) + '的老师傅说',
      '一个客户做' + (pain.slice(0,8) || '热转印') + '踩过的坑',
      (mat || pain.slice(0,6)) + '要不要先测试？不打样风险多大',
      '评论区最多人问的' + pain.slice(0,8) + '问题',
      (mat || '价格') + '的3个常见误区，你中了几个？',
    ];
    const riskLevels = ['低', '中', '低', '低', '低', '低', '低', '低'];
    const angles: AngleCandidate[] = [];
    for (let i = 0; i < 8; i++) {
      const idx = (i + new Date().getMilliseconds()) % 8;
      angles.push({
        id: 'mk_' + i,
        title: titles[idx],
        angleType: types[idx],
        targetCustomer: targetAud || '有' + pain + '需求的客户',
        customerPain: pain,
        coreConflict: topicPairs[idx].conflict,
        whyItWorks: topicPairs[idx].why,
        recommendedAccount: accName,
        riskLevel: riskLevels[idx] as '低' | '中',
        score: 75 + Math.floor(Math.random() * 15),
      });
    }
    return { angles, method: 'mock' };
  }

  async generateHooks(input: any): Promise<{ hooks: HookCandidate[]; method: string }> {
    const pain = input.customerPain || input.angle?.customerPain || input.productOrProcess || '热转印';
    const mat = input.material || '';
    const accTarget = input.account?.target_audience || '';
    const product = input.productOrProcess || '';
    // Build hooks dynamically from input, ensuring variety
    const hooks: HookCandidate[] = [];
    const types = ['direct_question', 'warning', 'customer_quote', 'cost_conflict', 'material_risk', 'test_risk', 'comparison', 'boss_experience'];
    const tensions = ['can_or_cannot', 'fear_of_failure', 'cost_waste', 'quality_risk', 'price', 'wrong_assumption'];
    const now = Date.now();
    for (let i = 0; i < 12; i++) {
      const t = types[Math.abs((now * (i+1)) % types.length)];
      const tn = tensions[Math.abs((now * (i+3)) % tensions.length)];
      let hookText = '';
      if (t === 'direct_question') {
        const qs = [pain.slice(0,12) + '怎么判断？', mat + '能不能做' + product + '？', '客户问' + pain.slice(0,10) + '，怎么回？'];
        hookText = qs[i % qs.length];
      } else if (t === 'warning') {
        const ws = ['直接回答' + pain.slice(0,8) + '，小心踩坑。', '不看' + mat + '就报价？风险很大。', '不打样直接做，十个有八个翻车。'];
        hookText = ws[i % ws.length];
      } else if (t === 'customer_quote') {
        const qs = ['"别人能做你们为什么不能"——这话怎么回？', '"按上次一样做"——这句话最危险。', '"价格高了"——不一定，可能是工艺不同。'];
        hookText = qs[i % qs.length];
      } else if (t === 'cost_conflict') {
        const cs = [(mat || product || pain.slice(0,6)) + '的价格不是一张图能报的。', '报价低不代表总成本低。', mat + '和PP价格差一倍，你知道吗？'];
        hookText = cs[i % cs.length];
      } else if (t === 'material_risk') {
        const rs = [(mat || '材质') + '看着能印，附着力不一定行。', (mat || '材质') + '和' + (product || '工艺') + '要匹配。', '同样的' + (mat || '材质') + '，不同批次效果不同。'];
        hookText = rs[i % rs.length];
      } else if (t === 'test_risk') {
        const ts = [(pain.includes('测试') ? '' : '客户没提测试要求？') + '附着力测试不做，后面麻烦。', '你以为' + (mat || '产品') + '印上去就行？先测一下。'];
        hookText = ts[i % ts.length];
      } else if (t === 'comparison') {
        const cs = [mat + '和PP做热转印，区别不只是价格。', product + '跟丝印比哪个好？看你什么材质。'];
        hookText = cs[i % cs.length];
      } else {
        const bs = ['做了这么多年' + (mat || '印刷') + '，最大的坑是没问清楚。', '很多工厂不接的' + (mat || '工艺') + '，我为什么敢接？'];
        hookText = bs[i % bs.length];
      }
      if (hookText.length > 28) hookText = hookText.slice(0, 27) + '？';
      hooks.push({
        id: 'mh_' + i, hookText, hookType: t, tensionType: tn,
        targetCustomer: accTarget || '有' + pain + '需求的客户',
        whyItWorks: [pain, product, mat].filter(Boolean).join('、') + '场景下的针对性开头',
        riskNotes: '',
      });
    }
    return { hooks: hooks.slice(0, 8), method: 'mock' };
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
