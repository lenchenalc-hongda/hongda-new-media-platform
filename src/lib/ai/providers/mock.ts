// ===== Context-Aware Mock Provider =====
// Always available, no API key needed.
// Is deterministic — same input always produces the same output.
// Context-aware — output varies by: account persona, platform, product/process, material, customer pain, duration.
// All outputs satisfy the same schemas used by DeepSeek/OpenAI.

import { AIProvider, ProviderRequest, ProviderResponse, AIProviderName } from './types';

// ===== Seeded PRNG for deterministic output =====

function hashSeed(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

class SeededRNG {
  private state: number;
  constructor(seed: number) { this.state = seed; }

  next(): number {
    this.state = (this.state * 16807) % 2147483647;
    return (this.state - 1) / 2147483646;
  }

  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  range(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }

  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// ===== Context extraction from prompt =====

interface MockContext {
  persona: string;
  pain: string;
  material: string;
  product: string;
  platform: string;
  duration: string;
}

function extractContext(prompt: string): MockContext {
  const ctx: MockContext = { persona: '', pain: '', material: '', product: '', platform: '', duration: '' };
  if (prompt.includes('账号') || prompt.includes('persona')) {
    const m = prompt.match(/(?:账号人设|persona)[:：]\s*([^\n]+)/);
    if (m) ctx.persona = m[1].trim().split('-')[0];
  }
  if (prompt.includes('痛点') || prompt.includes('pain') || prompt.includes('customerPain')) {
    const m = prompt.match(/(?:客户痛点|customerPain)[:：]\s*([^\n,]+)/);
    if (m) ctx.pain = m[1].trim();
  }
  if (prompt.includes('材质') || prompt.includes('material')) {
    const m = prompt.match(/(?:材质|material)[:：]\s*([^\n,]+)/);
    if (m) ctx.material = m[1].trim();
  }
  if (prompt.includes('工艺') || prompt.includes('productOrProcess')) {
    const m = prompt.match(/(?:产品\/?工艺|productOrProcess)[:：]\s*([^\n,]+)/);
    if (m) ctx.product = m[1].trim();
  }
  if (prompt.includes('平台') || prompt.includes('platform')) {
    const m = prompt.match(/(?:平台|platform)[:：]\s*([^\n,]+)/);
    if (m) ctx.platform = m[1].trim();
  }
  if (prompt.includes('时长') || prompt.includes('duration')) {
    const m = prompt.match(/(\d+)\s*(?:秒|s|second)/);
    if (m) ctx.duration = m[1] + '秒';
  }
  return ctx;
}

// ===== Template Pools =====

const PERSONA_HOOKS: Record<string, string[]> = {
  '小林': ['客户问了我一个尴尬的问题', '刚入行的时候我也分不清', '客户只发一张图，我该怎么回', '以前我也觉得价格越低越好，后来发现错了'],
  '小陈': ['工艺上的事说简单也简单', '这个材质我专门研究过', '客户说的和实际做的经常不是一回事', '今天带你看一个实际案例'],
  '老板': ['做了这么多年我总结了几点', '很多工厂不敢接的订单我为什么敢', '年底了说几句大实话', '问清楚再报价是对双方负责'],
  '': ['PE瓶能不能做热转印', '只看图片就报价的建议你不要信', '不打样就直接做大货翻车概率多大', '客户说按上次一样做这句话风险最大', '一张图就拿不到最低价'],
};

const MATERIAL_HOOKS: Record<string, string[]> = {
  'PE': ['PE瓶不是不能印是不能直接承诺', 'PE和PP附着力差一倍', '客户问PE会不会掉我最怕直接说不会'],
  'PP': ['PP材质表面能低要先处理', 'PP和ABS看着一样印上去效果差很多'],
  'ABS': ['ABS热转印附着力不错但有前提', 'ABS材质做热转印这些细节不能省'],
};

const PERSONA_DRAFTS: Record<string, string> = {
  '小林': '客户问了一个很实在的问题。我不能直接回答，因为材质不一样方案完全不一样。你把材质和数量发我，我帮你判断最合适的方案。',
  '小陈': '工艺上有一个常见误区。很多人以为只要印上去就行，其实前处理才是关键。你先把产品寄过来，我免费帮你测试附着力。',
  '老板': '行业里有一句话：问清楚再报价是对双方负责。所以我一般会先问三个问题：什么材质、什么数量、什么测试要求。你发这三样我给一个靠谱的参考价。',
  '': '客户问这个问题我不能直接回答。因为材质不一样方案完全不一样。你把材质数量和测试要求发我我帮你判断。',
};

// ===== Content Generation =====

function genMockHook(ctx: MockContext, rng: SeededRNG): string {
  const person = ctx.persona || '';
  const hooks = [
    ...(PERSONA_HOOKS[person] || PERSONA_HOOKS['']),
    ...(MATERIAL_HOOKS[ctx.material] || []),
  ];
  return rng.pick(hooks);
}

function genMockDraft(ctx: MockContext, rng: SeededRNG): string {
  return PERSONA_DRAFTS[ctx.persona] || PERSONA_DRAFTS[''];
}

function genMockAngles(ctx: MockContext, rng: SeededRNG): any[] {
  const pain = ctx.pain || '热转印';
  const mat = ctx.material || '';
  const temp = [
    { type: 'customer_misunderstanding', title: '对' + pain.slice(0,10) + '最常犯的错', conflict: '客户以为很简单实际很多细节要注意', why: '客户想知道自己是不是做错了' },
    { type: 'material_risk', title: (mat || pain) + '能不能做判断逻辑', conflict: mat ? mat + '看着能印但附着力不一定过关' : '不先确认风险很大', why: '客户怕做错了浪费钱' },
    { type: 'cost_logic', title: (mat || pain) + '的报价逻辑', conflict: '只看图片报的价格不靠谱', why: '客户想了解价格怎么算' },
    { type: 'factory_experience', title: '老师傅说' + (mat || pain.slice(0,6)), conflict: '看起来一样的工艺细节差很多', why: '老师傅经验值得信' },
    { type: 'case_story', title: '一个做' + (pain.slice(0,8) || '热转印') + '客户的经历', conflict: '客户之前踩过坑换对方法才做对', why: '真实案例有说服力' },
    { type: 'test_requirement', title: (mat || pain) + '要不要先测试', conflict: '不打样直接大货翻车概率大', why: '客户怕测试但更怕出问题' },
    { type: 'comment_reply', title: '回答关于' + pain.slice(0,8) + '的高赞问题', conflict: '很多人问但没有简单答案', why: '真实问题引起共鸣' },
    { type: 'customer_question', title: (mat || '价格') + '的常见误区', conflict: '客户以为知道其实搞反了', why: '纠正认知有传播力' },
  ];
  return rng.shuffle(temp).slice(0, 6).map((t, i) => ({
    id: 'ma_' + i, title: t.title, angleType: t.type,
    targetCustomer: ctx.persona ? ctx.persona + '的目标客户' : '有热转印需求的客户',
    customerPain: pain, coreConflict: t.conflict, whyItWorks: t.why,
    recommendedAccount: ctx.persona, recommendedPlatform: ctx.platform || '视频号',
    riskLevel: rng.pick(['低', '中']), score: rng.range(76, 90),
  }));
}

function genMockHooks(ctx: MockContext, rng: SeededRNG): any[] {
  const count = rng.range(5, 8);
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push({
      id: 'mh_' + i, hookText: genMockHook(ctx, rng),
      hookType: rng.pick(['direct_question', 'warning', 'customer_quote', 'counterintuitive', 'material_risk']),
      tensionType: rng.pick(['can_or_cannot', 'fear_of_failure', 'price', 'quality_risk']),
      targetCustomer: ctx.persona + '的目标客户',
      whyItWorks: '基于' + (ctx.material || ctx.pain || '热转印') + '场景的针对性开头',
      riskNotes: '',
    });
  }
  return result;
}

// ===== Main entry =====

function getContextAwareMockResponse(prompt: string): { content: string; parsed: Record<string, unknown> } {
  const ctx = extractContext(prompt);
  const rng = new SeededRNG(hashSeed(prompt));

  if (prompt.includes('角度') || prompt.includes('Angle')) {
    const angles = genMockAngles(ctx, rng);
    return { content: JSON.stringify({ angles }), parsed: { angles: angles as any } };
  }

  if (prompt.includes('钩子') || prompt.includes('Hook')) {
    const hooks = genMockHooks(ctx, rng);
    return { content: JSON.stringify({ hooks }), parsed: { hooks: hooks as any } };
  }

  if (prompt.includes('脚本') || prompt.includes('script') || prompt.includes('draft')) {
    const hook = genMockHook(ctx, rng);
    const body = genMockDraft(ctx, rng);
    return { content: JSON.stringify({ hook, body, wordCount: body.length }), parsed: { hook, body, wordCount: body.length } };
  }

  if (prompt.includes('risk') || prompt.includes('风险')) {
    const highRisk = rng.next() > 0.85;
    const parsed = {
      riskLevel: highRisk ? '中' : '低', riskPoints: highRisk ? ['存在价格承诺风险'] : [], allowSave: !highRisk, forbiddenExpressions: highRisk ? ['保证不掉'] : [],
    };
    return { content: JSON.stringify(parsed), parsed: parsed as any };
  }

  if (prompt.includes('score') || prompt.includes('评分')) {
    const score = rng.range(62, 85);
    return {
      content: JSON.stringify({
        totalScore: score, grade: score >= 80 ? 'A' : score >= 70 ? 'B' : 'C',
        dimensions: [
          { name: 'hook', label: '开头钩子', maxScore: 20, score: rng.range(10, 18), deduction: 0, reason: ['基于上下文生成'] },
          { name: 'spoken', label: '口语化', maxScore: 20, score: rng.range(12, 18), deduction: 0, reason: ['符合' + (ctx.persona || '业务员') + '人设'] },
        ],
        penalties: [], strengths: ['开头有钩子', '符合' + (ctx.material || '热转印') + '场景'],
        weaknesses: ['可以更口语化'], rewriteSuggestions: ['缩短句子'],
        recommendedStatus: score >= 80 ? 'pending_review' : score >= 70 ? 'draft' : 'needs_rewrite',
        riskLevel: rng.pick(['低', '低', '中']), riskPoints: [], saferExpressions: [],
        wordCount: rng.range(50, 200), duration: ctx.duration || '30',
      }),
      parsed: {} as Record<string, unknown>,
    };
  }

  return {
    content: JSON.stringify({ message: 'Mock response (AI_PROVIDER=mock)', context: ctx }),
    parsed: { message: 'Mock response', context: ctx as any },
  };
}

export class MockProvider implements AIProvider {
  readonly name: AIProviderName = 'mock';
  readonly available = true;

  async generateStructured<T = Record<string, unknown>>(request: ProviderRequest): Promise<ProviderResponse> {
    const { content, parsed } = getContextAwareMockResponse(request.userPrompt || '');
    return { content, parsed: parsed as Record<string, unknown>, provider: 'mock', mock: true, usage: { promptTokens: 0, completionTokens: content.length, totalTokens: 0 } };
  }

  async generateText(request: ProviderRequest): Promise<ProviderResponse> {
    const { content } = getContextAwareMockResponse(request.userPrompt || '');
    return { content, provider: 'mock', mock: true, usage: { promptTokens: 0, completionTokens: content.length, totalTokens: 0 } };
  }
}
