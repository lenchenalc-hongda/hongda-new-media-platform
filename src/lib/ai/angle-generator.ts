// ===== Angle Generator =====
// Generates 8-12 diverse content angles before script generation
// Uses DeepSeek when available, falls back to rule-based templates

export const ANGLE_TYPES = [
  'customer_question', 'customer_misunderstanding', 'cost_logic',
  'material_risk', 'test_requirement', 'sample_before_bulk',
  'factory_experience', 'comparison', 'comment_reply',
  'case_story', 'visual_factory_scene', 'after_sales_trust',
] as const;

export type AngleType = typeof ANGLE_TYPES[number];

export interface Angle {
  id: string;
  title: string;
  angleType: AngleType;
  targetCustomer: string;
  customerPain: string;
  coreConflict: string;
  whyItWorks: string;
  recommendedAccount: string;
  recommendedPlatform: string;
  riskLevel: '低' | '中' | '高';
  sourceKnowledgeCardIds: string[];
  score: number;
  similarity?: number; // 0-1, lower is better
}

interface AngleInput {
  account?: any;
  platform?: string;
  productOrProcess?: string;
  customerPain?: string;
  material?: string;
  knowledgeCards?: any[];
  recentScripts?: any[];
  count?: number;
}

// ===== Rule-based angle templates =====

interface AngleTemplate {
  angleType: AngleType;
  template: (input: AngleInput) => Angle | null;
}

const ANGLE_TEMPLATES: AngleTemplate[] = [
  {
    angleType: 'customer_question',
    template: (input) => {
      const pain = input.customerPain;
      if (!pain) return null;
      return {
        id: 'angle_cq_1', angleType: 'customer_question',
        title: `客户问题型：${pain.slice(0, 20)}`,
        targetCustomer: input.account?.target_audience || '有热转印需求的客户',
        customerPain: pain,
        coreConflict: `客户问${pain}，但直接回答风险很大`,
        whyItWorks: `客户自己也有这个问题，点进来找答案`,
        recommendedAccount: input.account?.name?.split('-')[0] || '',
        recommendedPlatform: input.platform || '视频号',
        riskLevel: '低',
        sourceKnowledgeCardIds: [],
        score: 85,
      };
    },
  },
  {
    angleType: 'customer_misunderstanding',
    template: (input) => {
      const pain = input.customerPain;
      if (!pain) return null;
      return {
        id: 'angle_cm_1', angleType: 'customer_misunderstanding',
        title: `客户误区型：${pain}的3个常见错误`,
        targetCustomer: input.account?.target_audience || '',
        customerPain: pain,
        coreConflict: `客户以为${pain}很简单，其实要注意3个关键点`,
        whyItWorks: `客户意识到自己之前的做法是错的，产生好奇`,
        recommendedAccount: input.account?.name?.split('-')[0] || '',
        recommendedPlatform: input.platform || '视频号',
        riskLevel: '低',
        sourceKnowledgeCardIds: [],
        score: 82,
      };
    },
  },
  {
    angleType: 'material_risk',
    template: (input) => {
      const material = input.material || '';
      const product = input.productOrProcess || '';
      if (!material && !product) return null;
      const topic = material || product;
      return {
        id: 'angle_mr_1', angleType: 'material_risk',
        title: `材质风险型：${topic}做热转印的风险在哪`,
        targetCustomer: `有${topic}热转印需求的客户`,
        customerPain: `不知道${topic}能不能做热转印`,
        coreConflict: `${topic}看起来可以印，但附着力不一定过关`,
        whyItWorks: `客户怕做错了浪费钱和时间`,
        recommendedAccount: input.account?.name?.split('-')[0] || '',
        recommendedPlatform: input.platform || '视频号',
        riskLevel: '中',
        sourceKnowledgeCardIds: [],
        score: 88,
      };
    },
  },
  {
    angleType: 'cost_logic',
    template: (input) => {
      const product = input.productOrProcess || '';
      if (!product) return null;
      return {
        id: 'angle_cl_1', angleType: 'cost_logic',
        title: `成本逻辑型：${product}的报价逻辑`,
        targetCustomer: '正在询价的客户',
        customerPain: '不知道价格怎么算的',
        coreConflict: '只看图片报的价格不靠谱，需要知道材质和数量',
        whyItWorks: '客户想知道价格但不知道怎么问，教他方法',
        recommendedAccount: input.account?.name?.split('-')[0] || '',
        recommendedPlatform: input.platform || '视频号',
        riskLevel: '低',
        sourceKnowledgeCardIds: [],
        score: 80,
      };
    },
  },
  {
    angleType: 'test_requirement',
    template: (input) => {
      const product = input.productOrProcess || input.material || '';
      return {
        id: 'angle_tr_1', angleType: 'test_requirement',
        title: `测试要求型：${product || '热转印'}要不要先测试`,
        targetCustomer: '有测试要求的客户',
        customerPain: '不知道要做哪些测试',
        coreConflict: '客户说打样OK就做，但不测试后面出问题',
        whyItWorks: '客户怕测试太麻烦，但更怕大货出问题',
        recommendedAccount: input.account?.name?.split('-')[0] || '',
        recommendedPlatform: input.platform || '视频号',
        riskLevel: '低',
        sourceKnowledgeCardIds: [],
        score: 84,
      };
    },
  },
  {
    angleType: 'sample_before_bulk',
    template: (input) => ({
      id: 'angle_sb_1', angleType: 'sample_before_bulk',
      title: '打样先行型：为什么一定要先打样',
      targetCustomer: '想直接做大货的客户',
      customerPain: '觉得打样浪费时间',
      coreConflict: '客户想省时间不打样，但翻车成本更高',
      whyItWorks: '客户有过不打样翻车的经历，产生共鸣',
      recommendedAccount: input.account?.name?.split('-')[0] || '',
      recommendedPlatform: input.platform || '视频号',
      riskLevel: '低',
      sourceKnowledgeCardIds: [],
      score: 83,
    }),
  },
  {
    angleType: 'factory_experience',
    template: (input) => ({
      id: 'angle_fe_1', angleType: 'factory_experience',
      title: '工厂经验型：做过20年印刷的老师傅说',
      targetCustomer: '关心工艺细节的客户',
      customerPain: '不知道哪个工艺最靠谱',
      coreConflict: '看起来一样的工艺，细节差很多',
      whyItWorks: '老师傅的经验值钱，客户信任工厂',
      recommendedAccount: input.account?.name?.includes('老板') ? (input.account?.name?.split('-')[0] || '') : '老板号',
      recommendedPlatform: input.platform || '视频号',
      riskLevel: '低',
      sourceKnowledgeCardIds: [],
      score: 86,
    }),
  },
  {
    angleType: 'comparison',
    template: (input) => {
      const product = input.productOrProcess || '热转印';
      return {
        id: 'angle_cp_1', angleType: 'comparison',
        title: `对比型：${product}和传统印刷的区别`,
        targetCustomer: '纠结工艺选择的客户',
        customerPain: '不知道选什么工艺',
        coreConflict: '客户以为越贵越好，其实看产品',
        whyItWorks: '帮客户做决策，省时间省钱',
        recommendedAccount: input.account?.name?.split('-')[0] || '',
        recommendedPlatform: input.platform || '视频号',
        riskLevel: '低',
        sourceKnowledgeCardIds: [],
        score: 81,
      };
    },
  },
  {
    angleType: 'comment_reply',
    template: (input) => {
      const pain = input.customerPain || '热转印';
      return {
        id: 'angle_cr_1', angleType: 'comment_reply',
        title: `评论区答疑型：${pain}的评论区高赞问题`,
        targetCustomer: '正在搜索相关问题的客户',
        customerPain: pain,
        coreConflict: `很多人问${pain}，但答案没那么简单`,
        whyItWorks: '真实问题引起共鸣',
        recommendedAccount: input.account?.name?.split('-')[0] || '',
        recommendedPlatform: input.platform || '视频号',
        riskLevel: '低',
        sourceKnowledgeCardIds: [],
        score: 79,
      };
    },
  },
  {
    angleType: 'case_story',
    template: (input) => {
      const product = input.productOrProcess || '';
      return {
        id: 'angle_cs_1', angleType: 'case_story',
        title: `案例型：一个${product || '热转印'}客户的真实经历`,
        targetCustomer: '有类似需求的客户',
        customerPain: '怕效果不好、怕沟通麻烦',
        coreConflict: '客户之前踩过坑，换到我们才做对',
        whyItWorks: '真实案例有说服力，客户容易代入',
        recommendedAccount: input.account?.name?.split('-')[0] || '',
        recommendedPlatform: input.platform || '视频号',
        riskLevel: '低',
        sourceKnowledgeCardIds: [],
        score: 87,
      };
    },
  },
  {
    angleType: 'visual_factory_scene',
    template: (input) => ({
      id: 'angle_vf_1', angleType: 'visual_factory_scene',
      title: '工厂实拍型：车间正在赶的一批货',
      targetCustomer: '关心工厂实力的客户',
      customerPain: '不知道工厂靠不靠谱',
      coreConflict: '客户没见过生产现场，担心品质',
      whyItWorks: '实拍画面建立信任感',
      recommendedAccount: input.account?.name?.includes('老板') ? (input.account?.name?.split('-')[0] || '') : '工厂实拍号',
      recommendedPlatform: input.platform || '视频号',
      riskLevel: '低',
      sourceKnowledgeCardIds: [],
      score: 82,
    }),
  },
  {
    angleType: 'after_sales_trust',
    template: (input) => ({
      id: 'angle_at_1', angleType: 'after_sales_trust',
      title: '售后信任型：出了问题我们怎么处理',
      targetCustomer: '担心售后没保障的客户',
      customerPain: '怕出问题了找不到人',
      coreConflict: '客户担心付了钱就不管了',
      whyItWorks: '解决客户最后的顾虑',
      recommendedAccount: input.account?.name?.split('-')[0] || '',
      recommendedPlatform: input.platform || '视频号',
      riskLevel: '低',
      sourceKnowledgeCardIds: [],
      score: 78,
    }),
  },
];

// ===== Similarity Check =====

function checkSimilarity(angle: Angle, recentScripts: any[], threshold: number = 0.7): number {
  if (!recentScripts || recentScripts.length === 0) return 0;
  const angleText = (angle.title + angle.customerPain + angle.coreConflict).toLowerCase();
  let maxSimilarity = 0;
  recentScripts.slice(0, 20).forEach((s: any) => {
    const scriptText = ((s.title || '') + (s.hook || '') + (s.main_script || '')).toLowerCase();
    // Simple keyword overlap similarity
    const angleWords = new Set(angleText.match(/[a-zA-Z\u4e00-\u9fff]+/g) || []);
    const scriptWords = new Set(scriptText.match(/[a-zA-Z\u4e00-\u9fff]+/g) || []);
    if (angleWords.size === 0) return;
    let overlap = 0;
    angleWords.forEach(w => { if (scriptWords.has(w)) overlap++; });
    const similarity = overlap / angleWords.size;
    if (similarity > maxSimilarity) maxSimilarity = similarity;
  });
  return maxSimilarity;
}

// ===== Main Generation Function =====

export async function generateAngles(input: AngleInput): Promise<{ angles: Angle[]; method: string }> {
  const accountName = input.account?.name?.split('-')[0] || input.account?.persona?.slice(0, 6) || '';

  // 1. Try DeepSeek first
  try {
    const { getProvider } = await import('./providers');
    const provider = await getProvider();
    const cardInfo = (input.knowledgeCards || []).slice(0, 3).map((k: any) =>
      `${k.title}：${(k.core_conclusion || '').slice(0, 80)}`
    ).join('\n');

    const prompt = `请为以下热转印短视频内容生成8-12个不同内容角度。

客户痛点：${input.customerPain || '无'}
产品/工艺：${input.productOrProcess || '无'}
材质：${input.material || '无'}
账号人设：${accountName}（${input.account?.persona || ''}）
平台：${input.platform || '视频号'}
参考知识卡：
${cardInfo || '无'}

要求：
1. 每个角度必须有不同的切入点和冲突
2. 不能用同一个意思换几种说法
3. 每个角度要明确：谁在看、痛点是什么、为什么愿意看
4. 必须包含以下角度类型（每个至少一个）：客户疑问、客户误区、材质风险、测试要求、打样先行、工厂经验、对比分析、评论区答疑、案例故事、成本逻辑
5. 标注每个角度的风险等级

输出JSON格式：
{
  "angles": [
    {
      "title": "角度标题（不超过20字）",
      "angleType": "customer_question / customer_misunderstanding / cost_logic / material_risk / test_requirement / sample_before_bulk / factory_experience / comparison / comment_reply / case_story / visual_factory_scene / after_sales_trust",
      "targetCustomer": "目标客户一句话描述",
      "customerPain": "客户痛点",
      "coreConflict": "核心冲突或反转",
      "whyItWorks": "为什么这个角度用户愿意看",
      "riskLevel": "低/中/高"
    }
  ]
}`;

    const angleResponse = await Promise.race([
      provider.generateStructured({
        systemPrompt: '你是宏达印业的新媒体策划顾问。输出JSON，不要markdown包裹。',
        userPrompt: prompt,
        outputFormat: 'json',
        temperature: 0.8,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
    ]);
    if (!angleResponse) throw new Error('Angle generation timeout');
    const response = angleResponse;

    if (response.parsed && Array.isArray(response.parsed.angles)) {
      const angles: Angle[] = response.parsed.angles.map((a: any, i: number) => ({
        id: 'angle_ai_' + i,
        title: a.title || '角度' + (i + 1),
        angleType: (ANGLE_TYPES.includes(a.angleType) ? a.angleType : 'customer_question') as AngleType,
        targetCustomer: a.targetCustomer || '',
        customerPain: a.customerPain || '',
        coreConflict: a.coreConflict || '',
        whyItWorks: a.whyItWorks || '',
        recommendedAccount: accountName,
        recommendedPlatform: input.platform || '视频号',
        riskLevel: a.riskLevel || '低',
        sourceKnowledgeCardIds: (input.knowledgeCards || []).slice(0, 3).map((k: any) => k.id),
        score: Math.round(70 + Math.random() * 25), // 70-95
      }));
      // Check similarity
      angles.forEach(a => { a.similarity = checkSimilarity(a, input.recentScripts || []); });
      return { angles: angles.slice(0, 12), method: 'ai' };
    }
  } catch (e) { console.warn('[Angles] AI failed, using rule templates:', (e as any)?.message); }

  // 2. Fallback to rule-based templates
  let angles: Angle[] = ANGLE_TEMPLATES
    .map(t => t.template(input))
    .filter((a): a is Angle => a !== null);

  // Add variants by shifting the input context
  const pains = [input.customerPain, input.productOrProcess, input.material, '热转印'].filter(Boolean);
  const pain = (pains[0] || '热转印').slice(0, 20);

  // Add extra angles based on available inputs
  const extras: Angle[] = [
    {
      id: 'angle_ex_1', angleType: 'cost_logic',
      title: `成本解释型：${pain}的价格差在哪`,
      targetCustomer: '比价的客户', customerPain: '不知道为什么价格不一样',
      coreConflict: '客户以为越贵越好，其实看材质和数量', whyItWorks: '帮客户理解价格逻辑',
      recommendedAccount: accountName, recommendedPlatform: input.platform || '视频号',
      riskLevel: '低', sourceKnowledgeCardIds: [], score: 80,
    },
    {
      id: 'angle_ex_2', angleType: 'visual_factory_scene',
      title: `工厂实拍型：${pain}的生产流程`,
      targetCustomer: '关心工厂实力的客户', customerPain: '不知道工厂靠不靠谱',
      coreConflict: '看了车间实拍客户直接下单', whyItWorks: '实拍视频建立信任',
      recommendedAccount: accountName, recommendedPlatform: input.platform || '视频号',
      riskLevel: '低', sourceKnowledgeCardIds: [], score: 82,
    },
    {
      id: 'angle_ex_3', angleType: 'after_sales_trust',
      title: `售后保障型：${pain}出问题了怎么办`,
      targetCustomer: '担心售后的客户', customerPain: '怕出问题没人管',
      coreConflict: '客户最担心的不是做不好，是出事了找不到人', whyItWorks: '解决售后焦虑',
      recommendedAccount: accountName, recommendedPlatform: input.platform || '视频号',
      riskLevel: '低', sourceKnowledgeCardIds: [], score: 78,
    },
  ];

  angles = [...angles, ...extras];

  // Check similarity
  angles.forEach(a => { a.similarity = checkSimilarity(a, input.recentScripts || []); });

  // Sort by score descending, filter low-similarity, limit to 12
  angles.sort((a, b) => b.score - a.score);
  angles = angles.filter(a => (a.similarity || 0) < 0.8);

  // Deduplicate by title
  const seen = new Set<string>();
  angles = angles.filter(a => {
    const key = a.title.slice(0, 15);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { angles: angles.slice(0, 12), method: 'rules' };
}
