// ===== Hook Candidate Generator =====
// Generates 20 hook candidates before script generation
// Uses DeepSeek when available, falls back to rule-based templates

export const HOOK_TYPES = [
  'direct_question', 'customer_quote', 'warning',
  'counterintuitive', 'cost_conflict', 'material_risk',
  'test_risk', 'comparison', 'factory_secret',
  'comment_reply', 'boss_experience', 'nini_perspective',
] as const;

export type HookType = typeof HOOK_TYPES[number];

export const TENSION_TYPES = [
  'price', 'can_or_cannot', 'fear_of_failure',
  'cost_waste', 'quality_risk', 'time_delay',
  'wrong_assumption', 'before_after',
] as const;

export type TensionType = typeof TENSION_TYPES[number];

export interface HookCandidate {
  id: string;
  hookText: string;
  hookType: HookType;
  tensionType: TensionType;
  targetCustomer: string;
  score: number;
  scoreDetail: {
    specificity: number;
    conflictStrength: number;
    spokenNaturalness: number;
    ctaPotential: number;
    riskSafety: number;
  };
  whyItWorks: string;
  riskNotes: string;
  similarityToRecentScripts: number;
}

interface HookInput {
  account?: any;
  platform?: string;
  productOrProcess?: string;
  customerPain?: string;
  material?: string;
  angle?: { title?: string; coreConflict?: string; customerPain?: string; angleType?: string };
  knowledgeCards?: any[];
  recentScripts?: any[];
}

// ===== Metadata for each hook type =====

const HOOK_TYPE_META: Record<HookType, { label: string; painType: string; strength: string }> = {
  direct_question: { label: '直接提问', painType: '客户问题', strength: '最直接的冲突' },
  customer_quote: { label: '客户原话', painType: '客户误区', strength: '真实感强' },
  warning: { label: '风险警告', painType: '怕踩坑', strength: '紧迫感' },
  counterintuitive: { label: '反常识', painType: '认知冲突', strength: '产生好奇' },
  cost_conflict: { label: '价格反转', painType: '价格不透明', strength: '算账心理' },
  material_risk: { label: '材质风险', painType: '材质不确定', strength: '工厂专业感' },
  test_risk: { label: '测试风险', painType: '怕翻车', strength: '安全顾虑' },
  comparison: { label: '对比', painType: '选择困难', strength: '帮客户决策' },
  factory_secret: { label: '工厂内幕', painType: '行业秘密', strength: '专家身份' },
  comment_reply: { label: '高赞评论', painType: '客户真实疑问', strength: '评论区引流' },
  boss_experience: { label: '老板经验', painType: '经验借鉴', strength: '权威感' },
  nini_perspective: { label: '小林/小陈视角', painType: '年轻人视角', strength: '接地气' },
};

const TENSION_TYPE_META: Record<TensionType, { label: string }> = {
  price: { label: '价格冲突' },
  can_or_cannot: { label: '能做不能做的冲突' },
  fear_of_failure: { label: '怕翻车' },
  cost_waste: { label: '浪费钱' },
  quality_risk: { label: '质量风险' },
  time_delay: { label: '时间冲突' },
  wrong_assumption: { label: '错误认知' },
  before_after: { label: '前后对比' },
};

export { HOOK_TYPE_META, TENSION_TYPE_META };

// ===== Rule-Based Hook Templates (60+ hooks organized by type) =====

const HOOK_TEMPLATES: { hookText: string; hookType: HookType; tensionType: TensionType }[] = [
  // direct_question
  { hookText: 'PE瓶能不能做热转印？先别急着回答。', hookType: 'direct_question', tensionType: 'can_or_cannot' },
  { hookText: '500个杯子做热转印，起步价多少？', hookType: 'direct_question', tensionType: 'price' },
  { hookText: '客户说按图片颜色做，你敢直接答应吗？', hookType: 'direct_question', tensionType: 'quality_risk' },
  { hookText: '一张图就想要报价，我怎么给？', hookType: 'direct_question', tensionType: 'price' },
  { hookText: '客户问会不会掉，这种问题怎么回？', hookType: 'direct_question', tensionType: 'fear_of_failure' },
  { hookText: '打样做了三次还不满意，问题出在哪？', hookType: 'direct_question', tensionType: 'time_delay' },
  { hookText: '小批量多图案，选什么工艺最省？', hookType: 'direct_question', tensionType: 'cost_waste' },
  { hookText: 'PE和PP都是塑料，热转印区别大吗？', hookType: 'direct_question', tensionType: 'wrong_assumption' },
  // customer_quote
  { hookText: '"之前的厂家能做，你们为什么不能？"', hookType: 'customer_quote', tensionType: 'wrong_assumption' },
  { hookText: '"别家报价更便宜，你怎么看？"', hookType: 'customer_quote', tensionType: 'price' },
  { hookText: '"按上次一样做就行"——这话不能听。', hookType: 'customer_quote', tensionType: 'quality_risk' },
  { hookText: '"不打样，直接做大货"——风险在哪。', hookType: 'customer_quote', tensionType: 'fear_of_failure' },
  { hookText: '"有没有现成的，打样太慢了。"', hookType: 'customer_quote', tensionType: 'time_delay' },
  { hookText: '"颜色差不多就行"——色差风险最大的话。', hookType: 'customer_quote', tensionType: 'quality_risk' },
  // warning
  { hookText: '只看图片报价的，建议你不要信。', hookType: 'warning', tensionType: 'cost_waste' },
  { hookText: '不看材质就承诺能做的，风险很大。', hookType: 'warning', tensionType: 'fear_of_failure' },
  { hookText: '不打样就直接大货，十个有八个翻车。', hookType: 'warning', tensionType: 'fear_of_failure' },
  { hookText: '不问测试标准就说不会掉的，小心。', hookType: 'warning', tensionType: 'quality_risk' },
  { hookText: 'PE瓶不做表面处理直接印，附着力堪忧。', hookType: 'warning', tensionType: 'fear_of_failure' },
  { hookText: '手上一滑就是几千个报废，防背粘不能省。', hookType: 'warning', tensionType: 'cost_waste' },
  // counterintuitive
  { hookText: '报价不是越便宜越好，是越准越好。', hookType: 'counterintuitive', tensionType: 'price' },
  { hookText: '有些订单利润很高，但我选择不接。', hookType: 'counterintuitive', tensionType: 'cost_waste' },
  { hookText: '客户说急要货，我反而让他慢一点。', hookType: 'counterintuitive', tensionType: 'time_delay' },
  { hookText: '免费打样，反而让我更谨慎了。', hookType: 'counterintuitive', tensionType: 'price' },
  { hookText: '打样和大货不一样，其实是正常的。', hookType: 'counterintuitive', tensionType: 'wrong_assumption' },
  { hookText: '色差不可避免，但可以提前管理。', hookType: 'counterintuitive', tensionType: 'quality_risk' },
  // cost_conflict
  { hookText: '一个杯子印上去，成本到底多少？', hookType: 'cost_conflict', tensionType: 'price' },
  { hookText: '小批量和批量差多少？不是单价翻倍那么简单。', hookType: 'cost_conflict', tensionType: 'cost_waste' },
  { hookText: '同样的图案，不同材质价格能差一倍。', hookType: 'cost_conflict', tensionType: 'price' },
  { hookText: '你以为贵在印刷？其实贵在前期打样。', hookType: 'cost_conflict', tensionType: 'cost_waste' },
  { hookText: '十个产品和一百个产品，单价差在哪？', hookType: 'cost_conflict', tensionType: 'price' },
  // material_risk
  { hookText: 'PE瓶不是不能印，是不能直接承诺。', hookType: 'material_risk', tensionType: 'can_or_cannot' },
  { hookText: 'ABS、PP、PE都叫塑料，热转印效果差一倍。', hookType: 'material_risk', tensionType: 'wrong_assumption' },
  { hookText: '客户问PE会不会掉，我最怕直接说不会。', hookType: 'material_risk', tensionType: 'fear_of_failure' },
  { hookText: '同样的瓶子，不一样的材质，结果是两个方案。', hookType: 'material_risk', tensionType: 'can_or_cannot' },
  { hookText: '不锈钢做热转印，前提条件了解一下。', hookType: 'material_risk', tensionType: 'quality_risk' },
  { hookText: '玻璃、陶瓷、塑料，热转印附着力完全不一样。', hookType: 'material_risk', tensionType: 'wrong_assumption' },
  // test_risk
  { hookText: '客户说之前做的掉了，原因不是附着力。', hookType: 'test_risk', tensionType: 'fear_of_failure' },
  { hookText: '附着力测试不是"能不能过"，是怎么测。', hookType: 'test_risk', tensionType: 'quality_risk' },
  { hookText: '耐酒精测试，一句"能不能过"回答不了。', hookType: 'test_risk', tensionType: 'quality_risk' },
  { hookText: '客户说要过洗碗机，你得先问洗几次。', hookType: 'test_risk', tensionType: 'fear_of_failure' },
  { hookText: '不测试就做大货，翻车是迟早的事。', hookType: 'test_risk', tensionType: 'fear_of_failure' },
  // comparison
  { hookText: '数码热转印和凹版热转印，别搞混了。', hookType: 'comparison', tensionType: 'wrong_assumption' },
  { hookText: '热转印和丝印，哪个工艺更省？', hookType: 'comparison', tensionType: 'cost_waste' },
  { hookText: '水转印还是热转印？看你产品来决定。', hookType: 'comparison', tensionType: 'wrong_assumption' },
  { hookText: '同样做热转印，花膜和数码区别在哪？', hookType: 'comparison', tensionType: 'wrong_assumption' },
  { hookText: '小批量选什么？数码还是凹印？', hookType: 'comparison', tensionType: 'cost_waste' },
  // factory_secret
  { hookText: '做印刷20年，最大的坑是沟通问题。', hookType: 'factory_secret', tensionType: 'fear_of_failure' },
  { hookText: '很多工厂不敢接的订单，我为什么敢？', hookType: 'factory_secret', tensionType: 'quality_risk' },
  { hookText: '花膜不止一层，做对了效果翻倍。', hookType: 'factory_secret', tensionType: 'quality_risk' },
  { hookText: '防背粘不是多加一张纸那么简单。', hookType: 'factory_secret', tensionType: 'fear_of_failure' },
  { hookText: '热转印参数调一天，就为了客户满意。', hookType: 'factory_secret', tensionType: 'time_delay' },
  // comment_reply
  { hookText: '上条视频问最多的：小批量多少钱？', hookType: 'comment_reply', tensionType: 'price' },
  { hookText: '评论区有人说PE瓶做不了，真的吗？', hookType: 'comment_reply', tensionType: 'can_or_cannot' },
  { hookText: '很多人问打样收不收费，今天说清楚。', hookType: 'comment_reply', tensionType: 'price' },
  { hookText: '有客户问：为什么我一刮就掉了？', hookType: 'comment_reply', tensionType: 'fear_of_failure' },
  { hookText: '评论区最热门问题：热转印环保吗？', hookType: 'comment_reply', tensionType: 'wrong_assumption' },
  // boss_experience
  { hookText: '做了20年印刷，我告诉你最大的坑。', hookType: 'boss_experience', tensionType: 'fear_of_failure' },
  { hookText: '有些订单我不做的原因，不是钱的问题。', hookType: 'boss_experience', tensionType: 'cost_waste' },
  { hookText: '客户催货的时候，我一般先问一个关键问题。', hookType: 'boss_experience', tensionType: 'time_delay' },
  { hookText: '年底赶单，最怕的不是产能不够。', hookType: 'boss_experience', tensionType: 'time_delay' },
  { hookText: '报价不是比谁低，是比谁准。', hookType: 'boss_experience', tensionType: 'price' },
  // nini_perspective
  { hookText: '刚入行的时候，看材质我也分不清。', hookType: 'nini_perspective', tensionType: 'wrong_assumption' },
  { hookText: '以为颜色按图片做到一模一样就行，后来发现不是。', hookType: 'nini_perspective', tensionType: 'quality_risk' },
  { hookText: '第一次客户跟我说不打样，差点答应了。', hookType: 'nini_perspective', tensionType: 'fear_of_failure' },
  { hookText: '客户只发一张图，作为新手我怎么回？', hookType: 'nini_perspective', tensionType: 'wrong_assumption' },
  { hookText: '学了一年的工艺知识，才发现最关键的其实是沟通。', hookType: 'nini_perspective', tensionType: 'time_delay' },
];

// ===== Similarity Check =====

function checkHookSimilarity(hookText: string, recentScripts: any[], threshold: number = 0.7): number {
  if (!recentScripts || recentScripts.length === 0) return 0;
  const hookLower = hookText.toLowerCase();
  let maxSimilarity = 0;
  recentScripts.slice(0, 20).forEach((s: any) => {
    const scriptHook = ((s.hook || s.hookText || s.title || '') + '').toLowerCase();
    const hookChars = new Set(hookLower.replace(/[^a-zA-Z\u4e00-\u9fff]/g, ''));
    const scriptChars = new Set(scriptHook.replace(/[^a-zA-Z\u4e00-\u9fff]/g, ''));
    if (hookChars.size === 0) return;
    let overlap = 0;
    hookChars.forEach(c => { if (scriptChars.has(c)) overlap++; });
    const similarity = overlap / hookChars.size;
    if (similarity > maxSimilarity) maxSimilarity = similarity;
  });
  return maxSimilarity;
}

// ===== Main Generation Function =====

export async function generateHookCandidates(input: HookInput): Promise<{ hooks: HookCandidate[]; method: string }> {
  const accountName = input.account?.name?.split('-')[0] || input.account?.persona?.slice(0, 6) || '';
  const pain = input.customerPain || input.angle?.customerPain || '';
  const product = input.productOrProcess || '';
  const material = input.material || '';
  const angleConflict = input.angle?.coreConflict || '';

  // 1. Try DeepSeek first
  try {
    const { getProvider } = await import('./providers');
    const provider = await getProvider();

    const cardInfo = (input.knowledgeCards || []).slice(0, 3).map((k: any) =>
      `${k.title}：${(k.core_conclusion || '').slice(0, 80)}`
    ).join('\n');

    const prompt = `请为以下短视频内容生成20个不同的开头钩子。

内容角度：${input.angle?.title || ''}
角度冲突：${angleConflict}
客户痛点：${pain || '无'}
产品/工艺：${product || '无'}
材质：${material || '无'}
账号人设：${accountName}（${input.account?.persona || '热转印工厂业务员'}）
${cardInfo ? '参考知识：\n' + cardInfo : ''}

要求：
1. 每个钩子不超过28个中文字
2. 第一眼必须能看出具体客户问题，不要铺垫
3. 不要用"这个问题""今天讲一下""很多客户问我"
4. 每个钩子必须有明确的冲突点
5. 至少覆盖以下钩子类型各2-3个：直接提问、客户原话、风险警告、反常识、价格冲突、材质风险、测试风险
6. 每个钩子要写清楚：为什么客户愿意看、对应哪种张力类型

输出JSON格式：
{
  "hooks": [
    {
      "hookText": "钩子文本（不超过28字）",
      "hookType": "direct_question|customer_quote|warning|counterintuitive|cost_conflict|material_risk|test_risk|comparison|factory_secret|comment_reply|boss_experience|nini_perspective",
      "tensionType": "price|can_or_cannot|fear_of_failure|cost_waste|quality_risk|time_delay|wrong_assumption|before_after",
      "targetCustomer": "一句话目标客户",
      "whyItWorks": "为什么这个钩子有效"
    }
  ]
}`;

    const dsResponse = await Promise.race([
      provider.generateStructured({
        systemPrompt: '你是宏达印业的新媒体文案专家。输出JSON，不要markdown包裹。',
        userPrompt: prompt,
        outputFormat: 'json',
        temperature: 0.9,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 45000)),
    ]);
    if (!dsResponse) throw new Error('DeepSeek timeout');
    const response = dsResponse;

    if (response.parsed && Array.isArray(response.parsed.hooks)) {
      const hooks: HookCandidate[] = response.parsed.hooks.map((h: any, i: number) => ({
        id: 'hook_ai_' + i,
        hookText: h.hookText || '',
        hookType: HOOK_TYPES.includes(h.hookType) ? h.hookType : 'direct_question',
        tensionType: TENSION_TYPES.includes(h.tensionType) ? h.tensionType : 'can_or_cannot',
        targetCustomer: h.targetCustomer || input.account?.target_audience || '',
        score: 0,
        scoreDetail: { specificity: 0, conflictStrength: 0, spokenNaturalness: 0, ctaPotential: 0, riskSafety: 0 },
        whyItWorks: h.whyItWorks || '',
        riskNotes: '',
        similarityToRecentScripts: 0,
      }));
      hooks.forEach(h => { h.similarityToRecentScripts = checkHookSimilarity(h.hookText, input.recentScripts || []); });
      return { hooks: hooks.slice(0, 20), method: 'ai' };
    }
  } catch (e) { console.warn('[Hooks] AI failed, using rule templates:', (e as any)?.message); }

  // 2. Fallback to rule-based templates
  let hooks = generateRuleBasedHooks(input);

  hooks.forEach(h => { h.similarityToRecentScripts = checkHookSimilarity(h.hookText, input.recentScripts || []); });

  // Deduplicate by hookText
  const seen = new Set<string>();
  hooks = hooks.filter(h => {
    const key = h.hookText.slice(0, 15);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { hooks: hooks.slice(0, 20), method: 'rules' };
}

// ===== Rule-based hook generation =====

function generateRuleBasedHooks(input: HookInput): HookCandidate[] {
  const pain = input.customerPain || input.angle?.customerPain || '';
  const product = input.productOrProcess || '';
  const material = input.material || '';
  const angleType = input.angle?.angleType || '';
  const accountName = input.account?.name?.split('-')[0] || input.account?.persona?.slice(0, 6) || '';

  let candidates: HookCandidate[] = [];

  const relevantPainTypes = new Set<string>();
  if (pain.includes('多少钱') || pain.includes('价格') || pain.includes('报价') || pain.includes('成本')) relevantPainTypes.add('price');
  if (pain.includes('PE') || pain.includes('PP') || pain.includes('ABS') || pain.includes('材质') || pain.includes('材料')) relevantPainTypes.add('material');
  if (pain.includes('测试') || pain.includes('附着力') || pain.includes('掉') || pain.includes('酒精')) relevantPainTypes.add('test');
  if (pain.includes('打样') || pain.includes('样品')) relevantPainTypes.add('sample');
  if (pain.includes('小批量') || pain.includes('少量')) relevantPainTypes.add('small');
  if (pain.includes('颜色') || pain.includes('色差')) relevantPainTypes.add('color');
  if (material) relevantPainTypes.add('material');
  if (product) relevantPainTypes.add('process');

  const relevantHookTypes = new Set<HookType>();
  if (relevantPainTypes.has('price')) { relevantHookTypes.add('cost_conflict'); relevantHookTypes.add('direct_question'); }
  if (relevantPainTypes.has('material')) { relevantHookTypes.add('material_risk'); relevantHookTypes.add('direct_question'); }
  if (relevantPainTypes.has('test')) { relevantHookTypes.add('test_risk'); relevantHookTypes.add('warning'); }
  if (relevantPainTypes.has('sample')) { relevantHookTypes.add('warning'); relevantHookTypes.add('factory_secret'); }
  if (relevantPainTypes.has('small')) { relevantHookTypes.add('cost_conflict'); relevantHookTypes.add('comparison'); }
  if (relevantPainTypes.has('color')) { relevantHookTypes.add('warning'); relevantHookTypes.add('counterintuitive'); }
  relevantHookTypes.add('direct_question');
  relevantHookTypes.add('customer_quote');
  relevantHookTypes.add('boss_experience');

  const angleHookMap: Record<string, HookType[]> = {
    customer_question: ['direct_question', 'customer_quote'],
    customer_misunderstanding: ['warning', 'counterintuitive'],
    cost_logic: ['cost_conflict', 'counterintuitive'],
    material_risk: ['material_risk', 'warning'],
    test_requirement: ['test_risk', 'warning'],
    sample_before_bulk: ['warning', 'factory_secret'],
    factory_experience: ['boss_experience', 'factory_secret'],
    comparison: ['comparison', 'counterintuitive'],
    comment_reply: ['comment_reply', 'direct_question'],
    case_story: ['boss_experience', 'nini_perspective'],
    visual_factory_scene: ['factory_secret', 'boss_experience'],
    after_sales_trust: ['warning', 'counterintuitive'],
  };
  if (angleType && angleHookMap[angleType]) {
    angleHookMap[angleType].forEach(ht => relevantHookTypes.add(ht));
  }

  let index = 0;
  for (const template of HOOK_TEMPLATES) {
    if (relevantHookTypes.has(template.hookType)) {
      const painText = pain || product || material || '热转印';
      let hookText = template.hookText;
      if (material && hookText.includes('PE')) hookText = hookText.replace('PE', material);
      if (product && hookText.includes('热转印')) hookText = hookText.replace('热转印', product);

      candidates.push({
        id: 'hook_r_' + index++,
        hookText,
        hookType: template.hookType,
        tensionType: template.tensionType,
        targetCustomer: input.account?.target_audience || '有热转印需求的客户',
        score: 0,
        scoreDetail: { specificity: 0, conflictStrength: 0, spokenNaturalness: 0, ctaPotential: 0, riskSafety: 0 },
        whyItWorks: getRuleWhyItWorks(template.hookType, template.tensionType, painText),
        riskNotes: getRuleRiskNotes(template.hookType),
        similarityToRecentScripts: 0,
      });
    }
  }

  if (candidates.length < 20) {
    for (const template of HOOK_TEMPLATES) {
      if (candidates.length >= 20) break;
      if (!candidates.find(c => c.hookText === template.hookText)) {
        candidates.push({
          id: 'hook_g_' + index++,
          hookText: template.hookText,
          hookType: template.hookType,
          tensionType: template.tensionType,
          targetCustomer: input.account?.target_audience || '有热转印需求的客户',
          score: 0,
          scoreDetail: { specificity: 0, conflictStrength: 0, spokenNaturalness: 0, ctaPotential: 0, riskSafety: 0 },
          whyItWorks: getRuleWhyItWorks(template.hookType, template.tensionType, '热转印'),
          riskNotes: getRuleRiskNotes(template.hookType),
          similarityToRecentScripts: 0,
        });
      }
    }
  }

  candidates = candidates.map(c => {
    const chineseChars = c.hookText.match(/[\u4e00-\u9fff]/g);
    if (chineseChars && chineseChars.length > 28) {
      return { ...c, hookText: c.hookText.slice(0, 35) };
    }
    return c;
  });

  return candidates;
}

function getRuleWhyItWorks(hookType: HookType, tensionType: TensionType, painText: string): string {
  const whyMap: Record<string, string> = {
    direct_question: `客户自己也有${painText}的问题，点进来找答案`,
    customer_quote: '这些话客户太熟悉了，想知道正确做法',
    warning: '客户怕踩坑，预警内容天然吸引',
    counterintuitive: '反常识让人想了解原因',
    cost_conflict: '跟钱有关客户都在意',
    material_risk: '材料相关的坑客户最怕',
    test_risk: '怕翻车是客户最大的顾虑',
    comparison: '帮客户做选择，省时间',
    factory_secret: '工厂内幕增加可信度',
    comment_reply: '真实问题引起共鸣',
    boss_experience: '老板身份自带权威感',
    nini_perspective: '新手视角更容易代入',
  };
  return whyMap[hookType] || '引起客户关注';
}

function getRuleRiskNotes(hookType: HookType): string {
  const riskMap: Record<string, string> = {
    warning: '注意不要过度放大风险',
    cost_conflict: '不要报具体价格',
    material_risk: '不要绝对承诺能做不能做',
    test_risk: '不承诺测试结果',
    boss_experience: '不要说得太绝对',
  };
  return riskMap[hookType] || '';
}
