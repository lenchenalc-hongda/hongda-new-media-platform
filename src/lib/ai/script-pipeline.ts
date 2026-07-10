// ============================================================
// Script Pipeline v3 — 短视频口播脚本工厂
// 真正的短视频脚本，不是文章
// ============================================================

import { scoreScript, ScriptScoreResult } from './script-scoring';

// ===== Adapter-based Pipeline Interfaces =====
export interface PipelineConfig {
  useAI?: boolean;
  aiProvider?: 'mock' | 'openai' | 'deepseek';
  enableAIJudgement?: boolean;
}


// ===== Interfaces =====

export interface ScriptStrategy {
  topic: string;
  hook: string;
  hookType: 'conflict' | 'question' | 'counterintuitive' | 'scenario' | 'data';
  targetCustomer: string;
  customerPain: string;
  corePoint: string;
  whyWatch: string;
  solveWhat: string;
  structure: string;
  conversionGoal: string;
  risksToAvoid: string[];
  suitablePlatform: string;
  suggestedDuration: string;
  suggestedActing: string;
}

export interface ShortVideoScript {
  title: string;
  hook: string;
  corePoint: string;
  script: string;
  shotSuggestion: string;
  subtitlePoints: string;
  commentGuidance: string;
  privateMessageCta: string;
  riskNotes: string;
  wordCount: number;
}

export interface DraftVariant {
  duration: '15' | '30' | '60';
  hook: string;
  script: string;
  wordCount: number;
  estimatedSeconds: number;
  score: ScriptScoreResult | null;
  subtitlePoints: string[];
}

export interface PipelineResult {
  strategy: ScriptStrategy;
  isBroad: boolean;
  subTopics: string[];
  variants: DraftVariant[];
  bestVariant: DraftVariant | null;
  risk: {
    riskLevel: '低' | '中' | '高';
    riskPoints: string[];
    allowSave: boolean;
  };
  recommendedStatus: string;
  mock: boolean;
  angleCandidates: any[];
  hookCandidates: any[];
  selectedHook: string;
  sourceKnowledgeCards: { cards: any[]; conclusions: string[]; risks: string[]; safers: string[] };
  aiUsed: boolean;
}

export interface BatchScriptResult {
  id: string;
  title: string;
  hook: string;
  duration: string;
  wordCount: number;
  score: number;
  grade: string;
  riskLevel: string;
  recommendedStatus: string;
  selected: boolean;
}


// ===== retrieveKnowledgeForScript(): 知识检索 =====
export function retrieveKnowledgeForScript(input: {
  knowledgeCards?: any[];
  topic?: string;
  customerPain?: string;
}): { cards: any[]; conclusions: string[]; risks: string[]; safers: string[] } {
  const cards = (input.knowledgeCards || []).filter((k: any) => k.knowledge_status === '已确认' || !k.knowledge_status).slice(0, 5);
  const conclusions: string[] = [];
  const risks: string[] = [];
  const safers: string[] = [];
  cards.forEach((k: any) => {
    if (k.core_conclusion) conclusions.push(k.core_conclusion);
    if (k.risky_expressions) (Array.isArray(k.risky_expressions) ? risks.push(...k.risky_expressions) : risks.push(k.risky_expressions));
    if (k.safer_alternatives) (Array.isArray(k.safer_alternatives) ? safers.push(...k.safer_alternatives) : safers.push(k.safer_alternatives));
  });
  return { cards, conclusions: [...new Set(conclusions)], risks: [...new Set(risks)], safers: [...new Set(safers)] };
}

// ===== 1. generateHook(): 生成具体钩子 =====
// 规则：
//   - 直接点出客户问题
//   - ≤ 25 个中文字
//   - 不用泛泛铺垫
//   - 不出现"这个问题"
//   - 最好包含数字、材料、场景、冲突或反常识

const HOOK_FRAGMENTS: Record<string, string[]> = {
  price: ['500个杯子，真的不能做热转印吗？','客户只发一张图，为什么我不敢直接报价？','热转印一个多少钱？这句话不能直接回答。','图片看不到材质，我怎么给你报价？','只说数量不说材质，给出来的价格你敢信吗？'],
  material: ['PE瓶能不能做热转印？这句话不能直接回答。','只说"塑料瓶"，为什么我要继续问材质？','不锈钢杯子做热转印，前提是什么？','ABS、PP、PE都叫塑料，热转印效果能差一倍。','一样的瓶子，不一样的材质，结果是两个方案。'],
  test: ['你问我会不会掉，我最怕直接回答"不会"。','耐酒精测试，不是一句"能不能"就能回答的。','客户说要过洗碗机，这话得打样后才能回答。','附着力测试不是"能不能过"，是"怎么测"。','客户说之前做的掉了，我一问才发现不是附着力的问题。'],
  color: ['客户说颜色按图片做，这个风险很大。','手机上看到的颜色，不等于印出来的颜色。','你说"就这个颜色"，我得先问有没有潘通色号。','金色、银色、幻彩色，不是普通印刷能做的。','同一个潘通号，不同材质印出来颜色也不一样。'],
  sample: ['打样和大货做到一模一样，真的那么简单吗？','客户说"不打样直接做大货"，为什么有些订单不能接？','免费打样，不是所有客户都能享受的。','商样确认后换材料，为什么要重新打样？','打样做了三次，客户说行但大货催得紧。'],
  small_batch: ['500个小批量，适不适合热转印？','10个也能做，但单价不会便宜，这话得说清楚。','数码混打样可以，为什么不一定能当大货标准？','小批量多图案，数码热转印是不是最省钱的方案？'],
  customer_pitfall: ['客户只发图片，为什么判断不了能不能做热转印？','"之前的厂家能做，你们为什么不能"，这话怎么回？','客户说"按上次一样"，我们为什么还要找确认样？','"别人家很便宜"，这话不能直接回。','客户说不需要测试，你敢直接做大货吗？'],
  process: ['标准热转印花膜有几层？不是只看图案那么简单。','花膜结构做错了，转印效果差一倍。','你以为热转印只有一张膜？其实有5层。','同样的图案，花膜做错一层，效果天差地别。'],
  anti_back: ['防背粘只是多加一张纸？没那么简单。','客户说图案到了背面，这其实不是转印问题。','防背粘做不好，整批次都要报废。','你以为防背粘只跟温度有关？跟产品表面也有关系。'],
  boss_experience: ['做了20年印刷，我告诉你最大的坑是什么。','很多工厂不敢接的订单，我为什么敢接？','客户催货的时候，我一般会先问一个关键问题。','做印刷最怕的不是技术问题，是沟通问题。'],
  factory_shot: ['今天带你看一下热转印花膜是怎么做出来的。','这个产品为什么难印？拿一个样品给你看看。','车间温度36度，这批活正在赶。你猜印的是什么？','同样的机器，同样的材料，为什么有的印得好有的印不好？'],
  comment_qna: ['评论区有人问：PE瓶到底能不能做热转印？','有个客户在评论区问：为什么我印上去一刮就掉？','上条视频很多人问打样收不收费，今天说清楚。','评论区问最多的一个问题：小批量印什么工艺最省钱？'],
  pre_quote: ['客户只说"报个价"，我一般会先发三个问题过去。','问价之前，先看看你有没有这三个信息。','报完价客户不回了，问题不在价格，在前期沟通。','一张图就想拿到最低价，我给不出也建议你不要信。'],
};
export function generateHook(input: {
  topic?: string;
  category?: string;
  material?: string;
  product?: string;
  pain?: string;
}): string {
  const { topic, category, material, product, pain } = input;

  // 1. Try to generate from input context
  if (pain && topic) {
    const painShort = pain.length > 15 ? pain.slice(0, 12) + '…' : pain;
    return `${painShort}，真的${topic.includes('不能') ? '' : '能'}解决吗？`;
  }
  if (material && product) {
    return `${material}${product}，你做对了吗？`;
  }
  if (material) {
    return `${material}能不能做热转印？这句话不能直接回答。`;
  }
  if (pain && pain.includes('多少钱')) {
    return '客户只发一张图，为什么我不敢直接报价？';
  }
  if (pain && (pain.includes('会不会掉') || pain.includes('附着力'))) {
    return '你问我会不会掉，我最怕直接回答"不会"。';
  }
  if (pain && pain.includes('颜色')) {
    return '客户说颜色按图片做，这个风险很大。';
  }
  if (pain && pain.includes('打样')) {
    return '打样和大货做到一模一样，真的那么简单吗？';
  }

  // 2. Match category
  const catMap: Record<string, string> = {
    '价格': 'price', '材质': 'material', '测试': 'test',
    '颜色': 'color', '打样': 'sample', '小批量': 'small_batch',
    '客户误区': 'customer_pitfall', '误区': 'customer_pitfall',
    '工艺': 'process', '防背粘': 'anti_back',
    '老板经验': 'boss_experience', '经验': 'boss_experience',
    '工厂实拍': 'factory_shot', '车间': 'factory_shot',
    '评论答疑': 'comment_qna', '答疑': 'comment_qna',
    '报价': 'pre_quote', '成本': 'pre_quote', '收资': 'pre_quote',
  };

  const catKey = (category && catMap[category]) ||
    (topic && Object.entries(catMap).find(([k]) => topic.includes(k))?.[1]);

  const hooks = HOOK_FRAGMENTS[catKey || 'price'] || HOOK_FRAGMENTS.price;
  const hook = hooks[Math.floor(Math.random() * hooks.length)];

  const chineseChars = hook.match(/[u4e00-u9fff]/g);
  // 3. Ensure ≤ 25 Chinese characters
  if (chineseChars && chineseChars.length > 25) {
    return hook.slice(0, 30) + '？';
  }

  return hook;
}

// ===== 2. splitBroadTopic(): 拆解大主题 =====
// 如果输入主题太大，拆成 5-10 个具体子选题
const TOPIC_SPLITS: Record<string, string[]> = {
  '客户常见问题': ['客户问多少钱，为什么不能直接报价？','客户问能不能印，为什么要先问材质？','客户问会不会掉，为什么要看测试要求？','客户只发图片，为什么判断不了热转印？','500个小批量，适不适合热转印？','打样和大货，为什么不一定完全一样？','客户说按图片颜色做，为什么风险很大？','客户说不打样直接大货，为什么不能接？','客户说别人家便宜，怎么回？','客户催货怎么处理？'],
  '热转印介绍': ['热转印是什么？一句话说清楚。','热转印适合什么材质？一句话说清楚。','热转印一个多少钱？为什么不能直接报？','数码热转印和传统热转印，区别在哪？','热转印会不会掉？这话不能直接回答。'],
  '注意事项': ['热转印最常见的3个错误，你中了几个？','热转印前不确认这些，容易翻车。','客户说按上次一样，为什么还要找确认样？','热转印颜色不准？问题可能不在机器。','为什么不能只看图片就报价？'],
  '价格': ['客户只发图片问多少钱，怎么回？','报完价客户就不回了，问题出在哪？','小批量和大批量，价格到底差在哪？','客户说太贵了，怎么回答？'],
  '防背粘': ['防背粘做不好，整批次报废怎么办？','图案到了背面，问题可能不是转印本身。','防背粘只跟温度有关吗？','PE瓶的热转印，背粘问题怎么解决？'],
};
// ===== 3. generateScriptStrategy(): 生成策略 =====
// 在生成脚本之前先生成策略卡

export function splitBroadTopic(topic: string): string[] {
  for (const [key, subs] of Object.entries(TOPIC_SPLITS)) {
    if (topic.includes(key)) return subs;
  }
  if (topic.length > 15) return ['客户问多少钱，为什么不能直接报？','热转印一个多少钱？为啥不能直接说？','打样和大货区别在哪？','只说材质不说数量，怎么给你建议？','小批量多图案，怎么选最省钱？'];
  return [];
}

export function generateScriptStrategy(input: {
  account?: any;
  topic?: string;
  customerPain?: string;
  productOrProcess?: string;
  material?: string;
  knowledgeCards?: any[];
}): ScriptStrategy {
  const subTopics = splitBroadTopic(input.topic || '');
  const hook = generateHook({
    topic: input.topic,
    pain: input.customerPain || input.productOrProcess,
    material: input.material,
    product: input.productOrProcess,
  });

  const targetCustomer = input.account?.target_audience || '有热转印需求的客户';
  const customerPain = input.customerPain || input.productOrProcess || '不确定工艺方案';

  return {
    topic: subTopics[0] || input.topic || '热转印工艺讲解',
    hook,
    hookType: hook.includes('？') || hook.includes('吗') ? 'question' : 'scenario',
    targetCustomer,
    customerPain,
    corePoint: `${customerPain}的判断逻辑：看材质、看数量、看测试要求`,
    whyWatch: `${targetCustomer}想知道${customerPain}的答案`,
    solveWhat: `帮客户判断${customerPain}怎么处理`,
    structure: '具体问题 → 一个核心原因 → 客户场景 → 下一步动作',
    conversionGoal: input.account?.conversion_goal || '引导客户发产品图片和数量',
    risksToAvoid: ['不要报具体价格', '不要承诺交期', '不要承诺附着力'],
    suitablePlatform: input.account?.platform === 'douyin' ? '抖音' : '视频号',
    suggestedDuration: '15',
    suggestedActing: input.account?.name?.includes('老板') ? '老板出镜' : '业务员出镜',
  };
}

// ===== 4. generateShortVideoScript(): 生成脚本变体 =====
// 一条脚本只讲一个核心点
// 15s: 80-120字, 1个点
// 30s: 150-220字, max 2个点
// 60s: 280-420字, max 3个点

const WORD_LIMITS: Record<string, number> = {
  '15': 120,
  '30': 220,
  '60': 420,
};

const CHUNK_TEMPLATES: Record<string, {
  hook: string[];
  reason: string[];
  scene: string[];
  action: string[];
  cta: string[];
}> = {
  price: {
    hook: ['客户只发一张图，问我多少钱。'],
    reason: [
      '因为图片看不到材质，也看不到测试要求。',
      '材质不同价格能差一倍，数量不同方案也不一样。',
    ],
    scene: [
      'PP、PE、ABS都叫塑料，但胶水完全不一样。',
      '你发一张瓶子图，我不问材质就报价，那是骗你。',
    ],
    action: [
      '你把材质、数量和图案发我，我先帮你判断工艺。',
    ],
    cta: [
      '发产品图片和数量，免费评估工艺。',
    ],
  },
  material: {
    hook: ['PE瓶能不能做热转印？'],
    reason: [
      'PE材质表面能低，附着力确实不如ABS。',
      '但不是不能做，是得先测一下。',
    ],
    scene: [
      '有的PE瓶表面处理过，效果很好。',
      '有的PE瓶没处理，印上去一刮就掉。',
    ],
    action: [
      '你把产品寄过来，我免费帮你测。',
      '不寄样，我说能做就是不负责任。',
    ],
    cta: [
      '寄样免费测，测完再给答复。',
    ],
  },
  test: {
    hook: ['你问我会不会掉，这话不能直接回答。'],
    reason: [
      '掉不掉不看工艺，看测试标准。',
      '耐酒精和耐水是一个标准吗？不是。',
    ],
    scene: [
      '客户说"要过洗碗机"，我得先问洗几次。',
      '有些说是掉色，其实是刮掉的，不是洗掉的。',
    ],
    action: [
      '你把测试要求和产品寄过来，我按你的标准测。',
    ],
    cta: [
      '发测试要求，我按标准测给你看。',
    ],
  },
  color: {
    hook: ['客户说颜色按图片做，这个风险很大。'],
    reason: [
      '手机屏幕的颜色，不等于印出来的颜色。',
      '电脑显示器和花膜打样，色差一定有。',
    ],
    scene: [
      '你看到的金色在手机里很亮，但花膜金粉效果不一样。',
      '渐变色在屏幕上好看，但印刷不一定能还原。',
    ],
    action: [
      '先打样确认颜色，满意了再做大货。',
      '有潘通色号最好，直接对着调。',
    ],
    cta: [
      '发产品图片，免费打样确认颜色。',
    ],
  },
  sample: {
    hook: ['打样和大货做到一模一样，真的那么简单吗？'],
    reason: [
      '打样是手工做的，大货是机器批量做的。',
      '手工可以慢慢调，机器一跑就是几千个。',
    ],
    scene: [
      '商样确认后换材料，要重新打样。',
      '打样效果好，大货不一定一样，得调参数。',
    ],
    action: [
      '你把确认样保留好，做大货时对着调。',
    ],
    cta: [
      '留好确认样，大货更稳。',
    ],
  },
  misunderstanding: {
    hook: ['客户只发图片，为什么判断不了能不能做热转印？'],
    reason: [
      '图片看不出材质，也看不出表面有没有处理过。',
      '有些产品印上去很牢，有些一碰就掉。',
    ],
    scene: [
      '之前有个客户发了一张瓶子图，我说能做。',
      '寄过来一测，材质是PP没处理，附着力不行。',
    ],
    action: [
      '所以下次发图的时候，把材质和数量一起说了。',
    ],
    cta: [
      '发图的时候带上材质，我更准帮你判断。',
    ],
  },
  process: {
    hook: ['标准热转印花膜有几层？不是只看图案那么简单。'],
    reason: [
      '一张花膜包括承载层、离型层、油墨层、胶水层。',
      '每一层都影响最终的转印效果。',
    ],
    scene: [
      '胶水不对，印上去剥不下来。',
      '离型层不对，图案转印不完整。',
    ],
    action: [
      '所以做花膜不是印个图案那么简单。',
    ],
    cta: [
      '你知道花膜结构吗？评论区聊聊。',
    ],
  },
  anti_back: {
    hook: ['图案到了瓶子背面，这其实不是转印问题。'],
    reason: [
      '防背粘不是多加一张纸，是胶水和温度要配合。',
      '温度太高胶水渗透到背面，温度太低粘不住。',
    ],
    scene: [
      '有些产品壁薄，一加热就变形。',
      '有些产品表面有油，防背粘纸也救不了。',
    ],
    action: [
      '做防背粘之前，先把产品表面处理好。',
    ],
    cta: [
      '你的产品有防背粘需求吗？发图帮你判断。',
    ],
  },
  boss_experience: {
    hook: ['做了20年印刷，我告诉你最大的坑是什么。','很多工厂不敢接的订单，我为什么敢接？','做印刷最怕的不是技术问题，是沟通问题。'],
    reason: ['有些订单看起来利润高，但风险也高。','做了这么多年，我学到了一个道理：问清楚再报价。','很多工厂翻车不是因为技术不行，是因为前期没问清楚。'],
    scene: ['之前有个客户，说了三天急要货。我们赶出来了，但工艺有问题。','去年有个单，对方说什么都能接受，结果寄样后全盘推翻。'],
    action: ['所以我的经验是：订单越急，越要先问清楚工艺要求。','慢一点报价，快一点交付。前期问清楚，后面不翻车。'],
    cta: ['你的订单有什么特殊要求？发图来我帮你评估风险。'],
  },
  factory_shot: {
    hook: ['今天带你看一下热转印花膜是怎么做出来的。','这个产品为什么难印？拿一个样品给你看看。'],
    reason: ['你看这个位置，转印之后颜色特别饱和，因为胶水层是特制的。','这道工序看着简单，但温度差一度效果都不一样。'],
    scene: ['同样的机器，同样的材料，为什么印出来不一样？因为参数不同。','这个产品壁薄，温度高了会变形，低了印不上去。'],
    action: ['所以你的产品能不能做，最好寄样给我试一下。','纸上谈兵没用，只有实际试了才知道。'],
    cta: ['寄样免费测，测完再给方案。'],
  },
  comment_qna: {
    hook: ['评论区有人问：PE瓶能不能做热转印？','有个客户问：为什么我印上去一刮就掉？','上条视频很多人问打样收不收费，今天说清楚。'],
    reason: ['PE材质表面能低，附着力确实不如ABS。','但不是不能做，是得先测表面有没有处理过。'],
    scene: ['很多客户说PE瓶做不了，但有些PE瓶经过处理，效果很好。','关键是看你这个瓶子表面有没有处理过。'],
    action: ['你把这个瓶子寄过来，我免费帮你测。','不寄样就判断，那不是专业做法。'],
    cta: ['发产品图片和材质，我帮你判断能不能做。'],
  },
  customer_pitfall: {
    hook: ['客户只发图片，为什么判断不了能不能做热转印？','"之前的厂家能做，你们为什么不能"，这话怎么回？','客户说"按上次一样"，我们为什么还要找确认样？'],
    reason: ['图片看不出材质，也看不出表面有没有处理过。','上次的产品和这次看起来一样，但批次不同效果也可能不同。'],
    scene: ['之前有个客户，拿之前做的样品来说再做一个。结果材料换了，参数全变了。','有个客户说别人家能做，结果寄样过来材质跟说的完全不一样。'],
    action: ['所以下次一定要求寄样确认。不寄样我不给判断。','不要觉得麻烦，这是对双方负责。'],
    cta: ['发产品图片和材质，免费帮您判断方案。'],
  },
  pre_quote: {
    hook: ['客户只说"报个价"，我一般会先发三个问题过去。','问价之前，先看看你有没有这三个信息。','一张图就想拿到最低价，我给不出也建议你不要信。'],
    reason: ['价格跟三个东西有关：材质、数量、工艺要求。','少一个信息，价格就不准。不准的报价还不如不报。'],
    scene: ['只看图片报低价，后面工艺要求一下来，根本做不了。','报价不是比谁低，是比谁准。'],
    action: ['下次问价之前，先把材质、数量和测试要求准备好。','你发这三样，我给一个靠谱的参考价。'],
    cta: ['发产品图、材质和数量，免费评估工艺和参考价。'],
  },
};

function getChunkType(input: any): string {
  const { customerPain, productOrProcess, knowledgeCards, templateType } = input;
  const pain = customerPain || '';
  const product = productOrProcess || '';
  const firstCard = knowledgeCards?.[0];
  const cardTitle = firstCard?.title || '';
  const cardConclusion = firstCard?.core_conclusion || '';
  if (templateType) return templateType;
  const source = input.source_type || '';
  if (source === 'comment_qna' || source === 'customer_question') return 'comment_qna';
  if (source === 'factory_shot') return 'factory_shot';
  if (source === 'teardown') return 'case_study';
  if (source === 'sales_feedback') return 'boss_experience';
  if (cardConclusion.includes('防背粘') || cardTitle.includes('防背粘') || product.includes('防背粘')) return 'anti_back';
  if (cardConclusion.includes('结构') || cardTitle.includes('花膜') || product.includes('花膜')) return 'process';
  if (cardConclusion.includes('价格') || cardConclusion.includes('成本')) return 'cost_explanation';
  if (pain.includes('价格') || pain.includes('多少钱') || pain.includes('报价') || pain.includes('成本')) return 'pre_quote';
  if (pain.includes('材质') || pain.includes('PE') || pain.includes('PP') || pain.includes('ABS') || pain.includes('材料')) return 'material';
  if (pain.includes('测试') || pain.includes('附着力') || pain.includes('掉') || pain.includes('酒精') || pain.includes('耐磨')) return 'test';
  if (pain.includes('颜色') || pain.includes('色差') || pain.includes('图片') || pain.includes('潘通')) return 'color';
  if (pain.includes('打样') || pain.includes('样品') || pain.includes('确认样') || pain.includes('小样')) return 'sample';
  if (pain.includes('小批量') || pain.includes('少量') || pain.includes('试产')) return 'small_batch';
  if (pain.includes('误区') || pain.includes('注意') || pain.includes('常见') || pain.includes('区别')) return 'customer_pitfall';
  if (pain.includes('经验') || pain.includes('坑') || pain.includes('教训')) return 'boss_experience';
  if (pain.includes('车间') || pain.includes('实拍') || pain.includes('带你') || pain.includes('看')) return 'factory_shot';
  const name = input.account?.name?.toLowerCase() || '';
  const persona = input.account?.persona?.toLowerCase() || '';
  if (name.includes('老板') || persona.includes('老板') || persona.includes('厂长')) return 'boss_experience';
  if (persona.includes('顾问') || persona.includes('业务')) return 'pre_quote';
  if (persona.includes('工艺') || persona.includes('技术')) return 'process';
  if (cardTitle) return 'comment_qna';
  return 'pre_quote';
}

function buildScriptByDuration(
  strategy: ScriptStrategy,
  duration: '15' | '30' | '60',
  chunkType: string,
  input: any,
): { hook: string; script: string; wordCount: number; subtitles: string[] } {
  const template = CHUNK_TEMPLATES[chunkType] || CHUNK_TEMPLATES.price;
  const limit = WORD_LIMITS[duration];

  let hook = strategy.hook;
  if (template.hook.length > 0) {
    hook = template.hook[Math.floor(Math.random() * template.hook.length)];
  }

  const reasonLine = template.reason[Math.floor(Math.random() * template.reason.length)];
  const sceneLine = template.scene[Math.floor(Math.random() * template.scene.length)];
  const actionLine = template.action[Math.floor(Math.random() * template.action.length)];
  const ctaLine = template.cta[Math.floor(Math.random() * template.cta.length)];

  const lines: string[] = [hook];
  const subtitles: string[] = [];

  if (duration === '15') {
    // 15s: hook + reason + action (1 core point)
    lines.push(reasonLine);
    lines.push(actionLine);
    subtitles.push(reasonLine.slice(0, 20));
    subtitles.push(actionLine.slice(0, 20));
  } else if (duration === '30') {
    // 30s: hook + reason + scene + action (max 2 points)
    lines.push(reasonLine);
    lines.push(sceneLine);
    lines.push(actionLine);
    subtitles.push(reasonLine.slice(0, 20));
    subtitles.push(sceneLine.slice(0, 20));
    subtitles.push(actionLine.slice(0, 20));
  } else {
    // 60s: full with cta (max 3 points)
    lines.push(reasonLine);
    lines.push(sceneLine);
    lines.push(actionLine);
    lines.push(ctaLine);
    subtitles.push(reasonLine.slice(0, 25));
    subtitles.push(sceneLine.slice(0, 25));
    subtitles.push(actionLine.slice(0, 25));
    subtitles.push(ctaLine.slice(0, 25));
  }

  let script = lines.join('\n');
  let chineseChars = script.match(/[\u4e00-\u9fff]/g);
  let wordCount = chineseChars ? chineseChars.length : script.length;

  // If over limit, compress
  if (wordCount > limit) {
    const nonHookLines = lines.slice(1).filter(l => l.trim());
    nonHookLines.sort((a, b) => a.length - b.length);
    const keepCount = duration === '15' ? 1 : duration === '30' ? 2 : 3;
    const keptLines = [hook, ...nonHookLines.slice(0, keepCount)];
    script = keptLines.join('\n');
    chineseChars = script.match(/[\u4e00-\u9fff]/g);
    wordCount = chineseChars ? chineseChars.length : script.length;
  }

  return { hook, script, wordCount, subtitles };
}

export function generateShortVideoScript(input: {
  account?: any;
  strategy?: ScriptStrategy;
  customerPain?: string;
  productOrProcess?: string;
  material?: string;
  knowledgeCards?: any[];
  video_length?: string;
}): ShortVideoScript {
  const strategy = input.strategy || generateScriptStrategy(input);
  const duration = (input.video_length || '30') as '15' | '30' | '60';
  const chunkType = getChunkType(input);
  const result = buildScriptByDuration(strategy, duration, chunkType, input);

  return {
    title: strategy.topic,
    hook: result.hook,
    corePoint: strategy.corePoint,
    script: result.script,
    shotSuggestion: `${strategy.suggestedActing} + ${chunkType === 'price' ? '报价单相关画面' : chunkType === 'material' ? '材质对比画面' : chunkType === 'test' ? '测试现场' : '产品展示'}`,
    subtitlePoints: result.subtitles.join(' · '),
    commentGuidance: '你的产品有没有遇到类似问题？评论区聊聊。',
    privateMessageCta: strategy.conversionGoal,
    riskNotes: '不要承诺具体价格和交期，以实际打样为准',
    wordCount: result.wordCount,
  };
}

// ===== 5. runPipeline(): 完整端到端流水线 =====

export function runPipeline(input: {
  account?: any;
  topic?: string;
  customerPain?: string;
  productOrProcess?: string;
  material?: string;
  knowledgeCards?: any[];
  video_length?: string;
  source_type?: string;
  pipelineConfig?: PipelineConfig;
}): PipelineResult {
  const topic = input.customerPain || input.topic || '';
  const config = input.pipelineConfig || {};
  const isDeepSeek = config.aiProvider === 'deepseek' || process.env.AI_PROVIDER === 'deepseek';

  // 1. Check if broad → split
  const isBroad = topic.length > 12 ||
    ['介绍', '注意事项', '说清楚', '全部', '常见问题'].some(k => topic.includes(k));
  const subTopics = isBroad ? splitBroadTopic(topic) : [];

  // 2. Generate strategy
  const strategy = generateScriptStrategy({
    ...input,
    topic: subTopics[0] || topic,
  });

  // 3. Rule engine: no AI in synchronous path
  let angleCandidates: any[] = [];
  let hookCandidates: any[] = [];
  let selectedHook = strategy.hook;
  let aiDraft: any = null;
  let aiUsed = false;

  // 4. Generate variants (use AI draft if available, otherwise rule engine)
  const durations: ('15' | '30' | '60')[] = ['15', '30', '60'];
  const variants: DraftVariant[] = durations.map(d => {
    let script = '';
    let hook = selectedHook;
    let wordCount = 0;
    let subtitles: string[] = [];

    if (aiDraft && aiDraft.body) {
      script = aiDraft.body;
      hook = aiDraft.hook || selectedHook;
      wordCount = aiDraft.wordCount || countChars(script);
      subtitles = aiDraft.subtitlePoints || [];
    } else {
      // Fallback to rule engine
      const chunkType = getChunkType(input);
      const result = buildScriptByDuration(strategy, d, chunkType, input);
      script = result.script;
      hook = result.hook;
      wordCount = result.wordCount;
      subtitles = result.subtitles;
    }

    // ALWAYS apply local rules
    script = removeAiTone(script);
    const { compressed } = compressScriptByDuration(script, d);
    script = compressed;
    wordCount = countChars(script);

    // Score: local scoring ALWAYS
    const score = scoreScript(script, d);

    // If AI judgement enabled, merge scores
    if (isDeepSeek && config.enableAIJudgement) {
      // AI judgement will be applied on top of local score
      // (This preserves local scoring rules while optionally incorporating AI insight)
    }

    return {
      duration: d,
      hook,
      script,
      wordCount,
      estimatedSeconds: parseInt(d),
      score,
      subtitlePoints: subtitles,
    };
  });

  // 5. Type-specific templates for non-AI variants
  if (!aiDraft || !aiDraft.body) {
    const chunkType = getChunkType(input);
    durations.forEach((d, i) => {
      const result = buildScriptByDuration(strategy, d, chunkType, input);
      variants[i] = {
        ...variants[i],
        script: result.script,
        hook: result.hook,
        wordCount: result.wordCount,
        subtitlePoints: result.subtitles,
        score: scoreScript(result.script, d),
      };
    });
  }

  // 6. Pick best variant
  const scored = variants.filter(v => v.score !== null);
  scored.sort((a, b) => (b.score?.totalScore || 0) - (a.score?.totalScore || 0));
  const bestVariant = scored[0] || null;
  const bestScore = bestVariant?.score || null;
  const riskLevel = bestScore?.riskLevel || '低';
  const riskPoints = bestScore?.riskPoints || [];

  // 7. Determine recommended status (LOCAL rules only)
  let recommendedStatus = 'draft';
  if (bestScore) {
    if (bestScore.totalScore >= 85 && bestScore.riskLevel !== '高') recommendedStatus = 'pending_review';
    else if (bestScore.totalScore >= 70) recommendedStatus = 'draft';
    else if (bestScore.totalScore >= 60) recommendedStatus = 'needs_rewrite';
    else recommendedStatus = 'discard';
  }

  // 8. (AI rewrite skipped in synchronous path)

  return {
    strategy,
    isBroad,
    subTopics,
    variants,
    bestVariant,
    risk: { riskLevel, riskPoints, allowSave: riskLevel !== '高' },
    recommendedStatus,
    mock: true,
    // New fields
    angleCandidates,
    hookCandidates,
    selectedHook,
    sourceKnowledgeCards: retrieveKnowledgeForScript({
      knowledgeCards: input.knowledgeCards,
      topic: input.customerPain,
      customerPain: input.customerPain,
    }),
    aiUsed,
  };
}

// ===== Hybrid Scoring (local rules only, AI judgement via API) =====
export function scoreScriptHybrid(script: string, duration: string = '30', useAI: boolean = false): ScriptScoreResult {
  return scoreScript(script, duration);
}

// ===== Helper =====
function countChars(text: string): number {
  const matches = text.match(/[\u4e00-\u9fff]/g);
  return matches ? matches.length : 0;
}


// ===== 缺失的导出函数（被 function replacement 移除）=====



export function compressScriptByDuration(script: string, duration: string): { compressed: string; wordCount: number } {
  const limit = duration === '15' ? 120 : duration === '30' ? 220 : 420;
  const chineseChars = script.match(/[\u4e00-\u9fff]/g);
  let wordCount = chineseChars ? chineseChars.length : script.length;
  if (wordCount <= limit) return { compressed: script, wordCount };
  const lines = script.split('\n').filter(l => l.trim());
  if (lines.length <= 2) return { compressed: script.slice(0, limit * 2), wordCount: limit };
  const hook = lines[0]; const cta = lines[lines.length - 1];
  const middle = lines.slice(1, -1).filter(l => l.length <= 30);
  if (duration === '15') {
    const coreLine = middle.length > 0 ? middle[0] : '';
    const compressed15 = [hook, coreLine, cta].filter(Boolean).join('\n');
    const wc15 = compressed15.match(/[\u4e00-\u9fff]/g)?.length || 0;
    if (wc15 <= limit) return { compressed: compressed15, wordCount: wc15 };
    return { compressed: [hook, coreLine.slice(0, 25), cta.slice(0, 20)].filter(Boolean).join('\n'), wordCount: limit };
  }
  const keepLines = [hook, ...middle.slice(0, 2), cta].filter(Boolean);
  let compressed = keepLines.join('\n');
  let newWc = compressed.match(/[\u4e00-\u9fff]/g)?.length || 0;
  if (newWc > limit) { compressed = keepLines.slice(0, 3).join('\n'); newWc = compressed.match(/[\u4e00-\u9fff]/g)?.length || 0; }
  return { compressed, wordCount: Math.min(newWc, limit) };
}

const RISK_PATTERNS2: { pattern: RegExp; risk: string }[] = [
  { pattern: /一定能做|肯定能做|保证能做/, risk: '乱承诺能做' },
  { pattern: /保证不掉|绝对不会掉|肯定不会掉/, risk: '乱承诺附着力' },
  { pattern: /(\d+\.?\d*)元[钱]?|(\d+\.?\d*)块钱/, risk: '报具体价格' },
  { pattern: /\d+天交货|一定交期/, risk: '承诺交期' },
  { pattern: /颜色一模一样|百分之百还原/, risk: '乱承诺颜色' },
  { pattern: /最能|最好|第一|最专业|最便宜/, risk: '绝对化表达' },
  { pattern: /永不掉|永远不掉/, risk: '乱承诺附着力' },
];

export interface RiskResult { riskLevel: '低' | '中' | '高'; riskPoints: string[]; allowSave: boolean; forbiddenExpressions: string[] }

export function checkScriptRisk(script: string, knowledgeCards?: any[]): RiskResult {
  const riskPoints: string[] = []; const forbiddenExpressions: string[] = [];
  RISK_PATTERNS2.forEach(({ pattern, risk }) => { const match = script.match(pattern); if (match) { riskPoints.push(risk); forbiddenExpressions.push(match[0]); } });
  const FORBIDDEN = ['很多客户问我这个问题','今天统一回答一下','今天给大家讲一下','最近很多朋友问','大家都知道','在热转印行业中','随着市场发展','首先','其次','最后','综上所述','显而易见','有效提升','赋能','助力','专业解决方案','欢迎联系我们','一站式','全方位','闭环','矩阵','在这个视频里','今天在视频里'];
  FORBIDDEN.forEach(phrase => { if (script.includes(phrase)) { riskPoints.push('出现禁止表达'); forbiddenExpressions.push(phrase.slice(0, 15)); } });
  const riskLevel: '低' | '中' | '高' = riskPoints.length === 0 ? '低' : riskPoints.length <= 2 ? '中' : '高';
  return { riskLevel, riskPoints: riskPoints.length > 0 ? [...new Set(riskPoints)] : ['未发现明显风险'], allowSave: riskLevel !== '高', forbiddenExpressions: [...new Set(forbiddenExpressions)] };
}

export function removeAiTone(text: string): string {
  let result = text;
  const FORBIDDEN = ['很多客户问我这个问题','今天统一回答一下','今天给大家讲一下','最近很多朋友问','大家都知道','在热转印行业中','随着市场发展','首先','其次','最后','综上所述','显而易见','有效提升','赋能','助力','专业解决方案','欢迎联系我们','一站式','全方位','闭环','矩阵','在这个视频里','今天在视频里'];
  FORBIDDEN.forEach(phrase => { const regex = new RegExp(phrase.replace(/[.*+?^{\\}$()|[\]\\]/g, '\\$&'), 'g'); result = result.replace(regex, ''); });
  result = result.replace(/\n\s*\n/g, '\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

const BATCH_ANGLES: { angle: string; category: string; pain: string }[] = [
  { angle: '报价前收资', category: 'pre_quote', pain: '客户问多少钱' },
  { angle: '材质判断', category: 'material', pain: '材质能不能做热转印' },
  { angle: '测试要求', category: 'test', pain: '附着力测试要求' },
  { angle: '颜色判断', category: 'color', pain: '颜色按图片做' },
  { angle: '打样判断', category: 'sample', pain: '打样和大货不一致' },
  { angle: '小批量决策', category: 'small_batch', pain: '小批量能不能做' },
  { angle: '客户避坑', category: 'customer_pitfall', pain: '客户只发图片判断不了' },
  { angle: '工艺科普', category: 'process', pain: '热转印花膜结构' },
  { angle: '老板经验', category: 'boss_experience', pain: '行业经验和常见坑' },
  { angle: '评论区答疑', category: 'comment_qna', pain: '客户最常问的问题' },
  { angle: '工厂实拍', category: 'factory_shot', pain: '工厂生产现场' },
  { angle: '成本解释', category: 'cost_explanation', pain: '价格差异的原因' },
];

export function batchGenerateShortScripts(input: any): BatchScriptResult[] {
  const count = input.count || 5; const results: BatchScriptResult[] = [];
  for (let i = 0; i < Math.min(count, BATCH_ANGLES.length); i++) {
    const angle = BATCH_ANGLES[i];
    const scriptInput = { ...input, customerPain: angle.pain, productOrProcess: input.productOrProcess || '' };
    const strategy = generateScriptStrategy(scriptInput);
    const chunkType = getChunkType(scriptInput);
    const script = generateShortVideoScript({ ...scriptInput, strategy, video_length: input.video_length || '30' });
    const scoreResult = scoreScript(script.script, input.video_length || '30');
    results.push({ id: 'b' + Date.now() + '_' + i, title: angle.angle + '：' + strategy.topic, hook: script.hook, duration: input.video_length || '30', wordCount: script.wordCount, score: scoreResult.totalScore, grade: scoreResult.grade, riskLevel: scoreResult.riskLevel, recommendedStatus: scoreResult.recommendedStatus, selected: scoreResult.totalScore >= 70 });
  }
  return results;
}

export function batchSaveScripts(results: BatchScriptResult[], targetStatus: string): { saved: number; skipped: string[] } {
  const skipped: string[] = []; let saved = 0;
  results.forEach(r => {
    if (targetStatus === 'pending_review' && r.riskLevel === '高') { skipped.push(r.title + '：高风险，不能保存为待审核'); return; }
    if (r.score < 60) { skipped.push(r.title + '：评分过低（' + r.score + '分），不建议保存'); return; }
    saved++;
  });
  return { saved, skipped };
}

export type { ScriptScoreResult } from './script-scoring';
export { scoreScript } from './script-scoring';
