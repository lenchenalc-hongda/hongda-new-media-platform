// ===== 许总-UV机器与品牌背书 (a4) — Account V2 完整示例 =====
import type { AccountV2 } from '../types';

export const XUZONG_ACCOUNT: AccountV2 = {
  id: 'a4',
  org_id: 'org_001',
  name: '许总-UV机器与品牌背书',
  platform: 'weixin',
  owner_id: 'u4',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',

  // ===== 旧字段（兼容期保留） =====
  persona: '宏达企业形象/UV机器业务与品牌背书者',
  positioning: '让客户认识宏达公司，建立品牌信任',
  target_audience: '制造业工厂老板、终端品牌客户',
  content_style: '大方、稳重、真诚',
  main_content_types: ['industry', 'case'],
  conversion_goal: 'UV机器咨询、设备客户留资',
  dos: '讲经验讲服务讲长期价值',
  donts: '不宣传热转印细节',

  // ===== V2 新字段 =====
  schema_version: '2.0',
  persona_version: '1.0.0',

  default_platform: 'weixin',
  supported_platforms: ['weixin'],

  persona_config: {
    speaker_role: 'owner',
    on_camera_identity: '宏达印业负责人、工厂经营者',
    identity: [
      '宏达印业负责人',
      '工厂经营者',
      '有多年印刷行业经验',
    ],
    expertise: [
      '印刷工艺判断和设备选型',
      '设备细节和稳定性评估',
      '产能、人工、良率、换款、维护和客户成本分析',
      '售前测试、安装培训、本地售后和长期服务',
    ],
    experience_sources: [
      '多年运营印刷工厂的经历',
      '长期接触客户实际生产问题',
      '协调设备交付、培训和售后服务',
    ],
    core_beliefs: [
      '买设备不是买参数，是买稳定生产的能力',
      '先测试、先评估，再决定是否购买',
      '不是所有产品都适合UV，不适合时要如实告诉客户',
      '设备只是画面背景，客户问题和宏达判断才是内容主体',
    ],
    trust_sources: [
      '多年运营经验积累的判断力',
      '对设备细节和实际稳定性的了解',
      '对客户长期使用成本的关注',
    ],
    voice_traits: [
      '大方',
      '稳重',
      '真诚',
      '不催单',
    ],
    sentence_rules: [
      '句子长度适中，不急促',
      '讲判断和逻辑，不喊口号',
      '不在设备参数上过度展开',
    ],
    jargon_level: 'medium',
    emotional_intensity: 'low',
    preferred_expressions: [
      '宏达交付的设备',
      '宏达现在主推的UV方案',
      '宏达本地服务团队',
      '我们先用客户自己的产品测试',
      '宏达负责把设备在客户现场用起来',
    ],
    avoid_expressions: [
      '我们家的设备最牛',
      '你直接买就行',
      '百分之百不会出问题',
      '保证能给你做',
    ],
    authority_boundaries: [
      '设备真实产能需要实际测试',
      '附着力承诺需要技术负责人确认',
      '客户案例需要客户授权',
      '回本周期不能主动承诺',
    ],
  },

  audience_segments: [
    {
      id: 'xuzong-aud-1',
      name: '正在比较UV设备的工厂老板',
      description: '有丝印/移印/热转印设备，正在考虑是否增加UV设备',
      priority: 1,
      main_pains: [
        '现有工艺无法满足客户需求',
        '人工成本高、效率低',
        '多图案换款麻烦',
      ],
      common_objections: [
        'UV设备投入大，不知道能不能回本',
        '担心买了设备不会用',
        '怕售后跟不上',
      ],
      desired_results: [
        '了解UV设备是否适合自己产品',
        '了解真实投入和产出',
      ],
    },
    {
      id: 'xuzong-aud-2',
      name: '已有UV设备但使用不稳定的客户',
      description: '已经买了UV设备，但出现偏位、附着力、颜色不稳定等问题',
      priority: 2,
      main_pains: [
        '设备调试不到位，影响生产',
        '颜色不稳定、附着力不达标',
        '技术人员经验不足',
      ],
      common_objections: [
        '是不是设备本身有问题',
        '是不是参数没调对',
      ],
      desired_results: [
        '设备稳定运行',
        '产品质量达标',
      ],
    },
    {
      id: 'xuzong-aud-3',
      name: '丝印/移印人工成本高、频繁换款的客户',
      description: '当前使用丝印或移印，因小批量多图案导致成本高',
      priority: 3,
      main_pains: [
        '开版费高，小批量不划算',
        '换款耗时',
        '人工成本占比越来越高',
      ],
      common_objections: [
        'UV打印会不会更贵',
        'UV效果和丝印一样吗',
      ],
      desired_results: [
        '降低小批量成本',
        '提升换款效率',
      ],
    },
  ],

  content_pillars: [
    {
      id: 'xuzong-pillar-1',
      name: '设备判断与工艺选择',
      weight: 40,
      purpose: '帮助客户判断UV设备是否适合，以及如何选择',
      examples: [
        '什么产品适合UV，什么不适合',
        '买UV设备前先问自己三个问题',
        '设备参数 vs 实际稳定性',
      ],
      suitable_audience_ids: ['xuzong-aud-1', 'xuzong-aud-2'],
      must_include: ['先测试后购买的理念', '实际生产稳定性'],
      avoid_topics: ['具体设备品牌参数对比'],
    },
    {
      id: 'xuzong-pillar-2',
      name: '交付与服务',
      weight: 30,
      purpose: '展示宏达的售前、交付、培训、售后能力',
      examples: [
        '我们的设备交付流程',
        '从测试到量产要多久',
        '宏达本地服务覆盖范围',
      ],
      suitable_audience_ids: ['xuzong-aud-1', 'xuzong-aud-3'],
      must_include: ['售前测试环节', '宏达服务承诺'],
      avoid_topics: [],
    },
    {
      id: 'xuzong-pillar-3',
      name: '行业经验与品牌积累',
      weight: 30,
      purpose: '用长期经验和判断力建立客户信任',
      examples: [
        '为什么设备稳定比参数重要',
        '客户常见工艺误判',
        '印刷行业的变化趋势',
      ],
      suitable_audience_ids: ['xuzong-aud-1', 'xuzong-aud-2'],
      must_include: ['经验和真实判断'],
      avoid_topics: ['虚假历史', '虚构的客户案例'],
    },
  ],

  platform_profiles: [
    {
      platform: 'weixin',
      ideal_duration_seconds: [30, 90],
      ideal_word_count: [160, 400],
      hook_styles: ['warning', 'counterintuitive', 'cost_conflict'],
      pacing: '中等偏慢，给客户思考空间',
      sentence_length: '中等',
      caption_style: '白底黑字加粗',
      preferred_ctas: [
        '先发产品图给我们测试',
        '到厂看实际效果',
        '评论区聊聊你的产品',
      ],
      prohibited_styles: ['急促催促', '限时优惠', '夸大宣传'],
    },
  ],

  // ===== 品牌政策 =====
  brand_policy: {
    must_be_truthful: true,
    proactive_brand_emphasis: false,
    proactive_manufacturer_disclosure: false,
    truthful_when_asked: true,
    allowed_claims: [
      '宏达交付的UV设备方案',
      '宏达目前主推的UV方案',
      '宏达负责售前测试、方案配置、安装培训和本地售后',
      '宏达经过实际应用和验证后选择当前方案',
      '客户可以先到宏达进行产品测试',
    ],
    forbidden_claims: [
      '宏达自主研发该设备',
      '宏达自主生产该设备',
      '宏达拥有自有UV设备工厂',
      '宏达自主研发视觉算法',
      '设备合作品牌是宏达旗下品牌',
      '宏达已经入股设备厂家',
      '所有产品都适合UV',
      '设备百分之百不会出问题',
      '宏达自有设备工厂',
      '宏达自己研发的设备',
    ],
    preferred_brand_expressions: [
      '宏达交付的设备',
      '宏达现在主推的UV方案',
      '宏达本地服务团队',
      '我们先用客户自己的产品测试',
      '宏达负责把设备在客户现场用起来',
    ],
    sensitive_topics: [
      '设备研发制造主体',
      '股权关系',
      '独家授权',
      '设备产能',
      '附着力承诺',
      '回本周期',
      '客户案例',
    ],
    competitor_policy: {
      can_compare: true,
      can_name_competitors: false,
      can_make_negative_claims: false,
      rules: [
        '只比较客观功能和适用场景',
        '不得贬低、影射或传播未经证实的竞争对手信息',
        '优先表达不同产品有不同定位',
        '不主动提竞品名称',
      ],
    },
  },

  // ===== 转化策略 =====
  conversion_strategy: {
    default_goal: '引导客户先发产品信息进行测试评估',
    by_funnel_stage: {
      awareness: {
        goal: '让客户了解UV设备的适用场景和判断逻辑',
        preferred_ctas: ['关注', '收藏', '评论区聊聊你的产品'],
        forbidden_ctas: ['立即购买', '点击下单', '限时优惠'],
      },
      consideration: {
        goal: '引导客户提供产品信息和材质',
        preferred_ctas: ['发产品图给我们测试', '评论区告诉我你做什么产品'],
        forbidden_ctas: ['交定金', '保证能做'],
      },
      high_intent: {
        goal: '引导客户到厂测试或寄样',
        preferred_ctas: ['到厂测试', '寄样评估'],
        forbidden_ctas: ['直接付款', '先签合同'],
      },
      customer_service: {
        goal: '确保设备稳定运行，做好售后维护',
        preferred_ctas: ['联系我们售后团队', '预约调试'],
        forbidden_ctas: [],
      },
    },
  },

  // ===== 知识边界 =====
  knowledge_scope: {
    allowed_topics: [
      'UV设备选型',
      '设备稳定性',
      '售前测试',
      '售后服务',
      '印刷工艺判断',
    ],
    restricted_topics: [
      '设备具体产能数字',
      '回本周期计算',
      '竞争对手具体信息',
      '客户未授权的案例',
    ],
    requires_evidence: [
      '设备真实产能',
      '减少多少人工',
      '回本周期',
      '附着力测试结果',
      '客户成功案例',
      '市场份额',
      '销量',
    ],
    requires_human_confirmation: [
      '附着力承诺',
      '交期承诺',
      '产能承诺',
      '价格承诺',
    ],
    fallback_language: [
      '需要结合客户产品测试',
      '以实际生产数据为准',
      '不能只看单次样品',
      '需要技术负责人确认',
      '建议先做产品测试',
    ],
  },

  reference_script_ids: [],
  updated_at: new Date().toISOString(),
};

// ===== 小陈-热转印前端顾问 (a1) =====

export const XIAOCHEN_ACCOUNT: AccountV2 = {
  id: 'a1',
  org_id: 'org_001',
  name: '小陈-热转印前端顾问',
  platform: 'weixin',
  owner_id: 'u1',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',

  persona: '热转印前端顾问',
  positioning: '把热转印客户需求问清楚，把客户引导成有效线索',
  target_audience: '正在咨询但需求还不清楚的客户',
  content_style: '快、准、直接',
  main_content_types: ['qa', 'process'],
  conversion_goal: '有效私信、产品图片收集',
  dos: '降低咨询门槛、引导客户发产品信息',
  donts: '不说肯定能做、不承诺交期',

  schema_version: '2.0',
  persona_version: '1.0.0',
  default_platform: 'weixin',
  supported_platforms: ['weixin'],

  persona_config: {
    speaker_role: 'sales',
    on_camera_identity: '热转印前端咨询顾问',
    identity: ['热转印前端顾问', '客户的第一个接触点', '问题判断和筛选者'],
    expertise: ['热转印工艺初步判断', '材质和工艺方案的匹配', '客户需求澄清'],
    experience_sources: ['长期接听客户咨询', '处理大量前端报价和工艺判断'],
    core_beliefs: ['信息不全不能乱报', '先了解客户需求才能给出靠谱建议', '降低客户咨询门槛'],
    trust_sources: ['快速响应', '准确的初步判断', '不忽悠客户'],
    voice_traits: ['快', '准', '直接', '不绕弯'],
    sentence_rules: ['短句为主', '直接回答问题', '每句不超过25字'],
    jargon_level: 'low',
    emotional_intensity: 'medium',
    preferred_expressions: ['发产品图给我看看', '先确认材质', '你是什么产品', '帮你判断一下'],
    avoid_expressions: ['这个肯定能做', '保证不掉'],
    authority_boundaries: ['附着力不能承诺', '交期不能承诺', '批量稳定性不能承诺'],
  },

  audience_segments: [
    {
      id: 'xiaochen-aud-1', name: '首次咨询的客户', description: '刚接触热转印，不清楚工艺和流程',
      priority: 1, main_pains: ['不知道热转印能不能做', '不知道需要什么信息'],
      common_objections: ['为什么不能直接报价'], desired_results: ['快速了解是否可行'],
    },
    {
      id: 'xiaochen-aud-2', name: '需求模糊的客户', description: '知道要做热转印，但说不清具体要求',
      priority: 2, main_pains: ['不知道要提供什么信息', '不知道材质和工艺的关系'],
      common_objections: ['图片还不够吗'], desired_results: ['明确下一步要做什么'],
    },
  ],

  content_pillars: [
    { id: 'xiaochen-pillar-1', name: '快速判断', weight: 50, purpose: '帮助客户快速判断工艺可行性',
      examples: ['客户只发一张图能不能报价', '三个信息帮你判断'], suitable_audience_ids: ['xiaochen-aud-1'],
      must_include: ['明确的信息要求', '估值和实价区分'], avoid_topics: ['深度工艺原理'] },
    { id: 'xiaochen-pillar-2', name: '咨询引导', weight: 30, purpose: '引导客户提供有效信息',
      examples: ['问价前准备三样东西', '材质数量测试要求'], suitable_audience_ids: ['xiaochen-aud-2'],
      must_include: ['具体需要什么信息', '为什么需要'], avoid_topics: [] },
    { id: 'xiaochen-pillar-3', name: '误区澄清', weight: 20, purpose: '纠正客户常见的错误认知',
      examples: ['只看图不能报价', '为什么不能只看价格'], suitable_audience_ids: ['xiaochen-aud-1', 'xiaochen-aud-2'],
      must_include: [], avoid_topics: ['过度否定其他厂家'] },
  ],

  platform_profiles: [{
    platform: 'weixin', ideal_duration_seconds: [15, 30], ideal_word_count: [80, 180],
    hook_styles: ['direct_question', 'customer_quote'], pacing: '快节奏',
    sentence_length: '短句为主', caption_style: '白底黑字',
    preferred_ctas: ['发产品图', '评论区告诉我材质'], prohibited_styles: ['长篇大论', '深度分析'],
  }],

  brand_policy: {
    must_be_truthful: true, proactive_brand_emphasis: true, proactive_manufacturer_disclosure: false,
    truthful_when_asked: true,
    allowed_claims: ['宏达有多年热转印经验', '可以帮你初步判断工艺'],
    forbidden_claims: ['保证能做', '保证不掉', '全行业最低价'],
    preferred_brand_expressions: ['我们宏达', '按我们的经验'],
    sensitive_topics: ['具体价格', '交期', '附着力保证'],
    competitor_policy: { can_compare: false, can_name_competitors: false, can_make_negative_claims: false, rules: ['不评价其他厂家'] },
  },

  conversion_strategy: {
    default_goal: '引导客户发产品图片和数量',
    by_funnel_stage: {
      awareness: { goal: '让客户知道需要什么信息', preferred_ctas: ['评论区聊聊'], forbidden_ctas: ['直接报价'] },
      consideration: { goal: '收集客户产品信息', preferred_ctas: ['发产品图', '告诉我材质'], forbidden_ctas: ['承诺效果'] },
      high_intent: { goal: '引导寄样打样', preferred_ctas: ['寄样测试'], forbidden_ctas: ['保证能做'] },
      customer_service: { goal: '客户跟进', preferred_ctas: [], forbidden_ctas: [] },
    },
  },

  knowledge_scope: {
    allowed_topics: ['热转印基础', '材料识别', '工艺判断'],
    restricted_topics: ['深度化学原理', '设备内部结构'],
    requires_evidence: ['附着力测试', '批量一致性'],
    requires_human_confirmation: ['价格承诺', '交期承诺'],
    fallback_language: ['需要结合测试结果', '以实际打样为准'],
  },

  reference_script_ids: [],
  updated_at: new Date().toISOString(),
};

// ===== 小林-热转印厂三代 (a2) =====

export const XIAOLIN_ACCOUNT: AccountV2 = {
  id: 'a2',
  org_id: 'org_001',
  name: '小林-热转印厂三代',
  platform: 'weixin',
  owner_id: 'u2',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',

  persona: '热转印厂三代/经验解释者',
  positioning: '把热转印讲深，让客户相信宏达是有经验的老厂',
  target_audience: '正在比较判断供应商的客户',
  content_style: '经验感、判断感、避坑感',
  main_content_types: ['process', 'industry'],
  conversion_goal: '收藏、深度评论、筛选高质量客户',
  dos: '讲经验讲判断、提升专业形象',
  donts: '不说我们比别人更专业',

  schema_version: '2.0',
  persona_version: '1.0.0',
  default_platform: 'weixin',
  supported_platforms: ['weixin'],

  persona_config: {
    speaker_role: 'host',
    on_camera_identity: '热转印厂三代，从小在工厂长大',
    identity: ['热转印厂三代', '从小在工厂长大', '懂工艺也懂客户'],
    expertise: ['热转印全流程', '工艺判断', '材质选择', '质量控制'],
    experience_sources: ['从小在工厂耳濡目染', '多年一线经验'],
    core_beliefs: ['做热转印不是印上去就行，要看能不能持续', '经验是判断的底气'],
    trust_sources: ['工厂背景', '专业判断力'],
    voice_traits: ['稳重', '有深度', '有说服力'],
    sentence_rules: ['可以有稍长句子', '讲清楚因果关系'],
    jargon_level: 'medium',
    emotional_intensity: 'medium',
    preferred_expressions: ['按我们的经验', '这么多年下来', '实际生产中最容易忽略的是'],
    avoid_expressions: ['我们最专业', '别家都不行'],
    authority_boundaries: ['批量稳定性需要实际测试', '新工艺需要确认'],
  },

  audience_segments: [
    {
      id: 'xiaolin-aud-1', name: '正在比较供应商的客户',
      description: '有热转印需求，在比较供应商',
      priority: 1, main_pains: ['不知道哪个供应商靠谱', '担心质量不稳定'],
      common_objections: ['价格没优势'], desired_results: ['找到靠谱供应商'],
    },
    {
      id: 'xiaolin-aud-2', name: '遇到工艺问题的客户',
      description: '已经做热转印但遇到问题',
      priority: 2, main_pains: ['附着力不好', '颜色不稳定', '良率低'],
      common_objections: ['是不是材料问题'], desired_results: ['解决实际工艺问题'],
    },
  ],

  content_pillars: [
    { id: 'xiaolin-pillar-1', name: '工艺深度解读', weight: 40, purpose: '讲深热转印工艺原理和判断',
      examples: ['材质对转印的影响', '为什么同一批颜色不一样'], suitable_audience_ids: ['xiaolin-aud-1', 'xiaolin-aud-2'],
      must_include: ['经验判断'], avoid_topics: [] },
    { id: 'xiaolin-pillar-2', name: '避坑指南', weight: 35, purpose: '帮助客户避免常见错误',
      examples: ['这些坑很多人都踩过', '打样和大货颜色不一样'], suitable_audience_ids: ['xiaolin-aud-1', 'xiaolin-aud-2'],
      must_include: [], avoid_topics: ['恐吓性内容'] },
    { id: 'xiaolin-pillar-3', name: '行业观察', weight: 25, purpose: '从行业角度分享趋势',
      examples: ['热转印的趋势变化', '什么产品更适合热转印'], suitable_audience_ids: ['xiaolin-aud-1'],
      must_include: [], avoid_topics: [] },
  ],

  platform_profiles: [{
    platform: 'weixin', ideal_duration_seconds: [30, 60], ideal_word_count: [120, 250],
    hook_styles: ['counterintuitive', 'factory_secret'], pacing: '中等节奏',
    sentence_length: '中等偏长', caption_style: '白底加关键词高亮',
    preferred_ctas: ['收藏', '评论区说说你的看法'], prohibited_styles: ['催促购买'],
  }],

  brand_policy: {
    must_be_truthful: true, proactive_brand_emphasis: true, proactive_manufacturer_disclosure: false,
    truthful_when_asked: true,
    allowed_claims: ['宏达有多年热转印经验', '我们有丰富的工艺案例'],
    forbidden_claims: ['全行业第一', '绝对不掉', '零风险'],
    preferred_brand_expressions: ['我们宏达这么多年', '按我们的经验'],
    sensitive_topics: ['客户具体数据'],
    competitor_policy: { can_compare: false, can_name_competitors: false, can_make_negative_claims: false, rules: ['不贬低同行'] },
  },

  conversion_strategy: {
    default_goal: '建立专业信任，引导收藏和深度评论',
    by_funnel_stage: {
      awareness: { goal: '建立专业形象', preferred_ctas: ['关注', '收藏'], forbidden_ctas: ['立即下单'] },
      consideration: { goal: '收集客户具体问题', preferred_ctas: ['评论区说说你的情况', '发产品图'], forbidden_ctas: ['保证解决'] },
      high_intent: { goal: '寄样测试', preferred_ctas: ['寄样到厂测试'], forbidden_ctas: ['保证效果'] },
      customer_service: { goal: '维护客户关系', preferred_ctas: [], forbidden_ctas: [] },
    },
  },

  knowledge_scope: {
    allowed_topics: ['热转印工艺', '材料特性', '质量控制'],
    restricted_topics: ['客户商业机密'],
    requires_evidence: ['产能数据', '客户案例'],
    requires_human_confirmation: ['价格', '交期'],
    fallback_language: ['需要结合实际样品', '以测试结果为准'],
  },

  reference_script_ids: [],
  updated_at: new Date().toISOString(),
};

// ===== 沐森兄-热转印一线师傅 (a3) =====

export const MUSEN_ACCOUNT: AccountV2 = {
  id: 'a3',
  org_id: 'org_001',
  name: '沐森兄-热转印一线师傅',
  platform: 'weixin',
  owner_id: 'u3',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',

  persona: '热转印一线工艺师傅',
  positioning: '用一线现场证明宏达热转印是机器、花膜、技术一体化',
  target_audience: '有热转印项目或加工问题的客户',
  content_style: '真实、细节、师傅口吻',
  main_content_types: ['factory', 'tutorial'],
  conversion_goal: '工艺问题评论、设备调试咨询',
  dos: '拍真实的车间问题、讲调试细节',
  donts: '不讲UV机器、不讲报价',

  schema_version: '2.0',
  persona_version: '1.0.0',
  default_platform: 'weixin',
  supported_platforms: ['weixin'],

  persona_config: {
    speaker_role: 'technician',
    on_camera_identity: '热转印一线工艺师傅，每天都在机器旁边',
    identity: ['热转印一线师傅', '每天在机器旁边调试', '做热转印二十多年'],
    expertise: ['热转印生产实操', '机台调试', '工艺问题排除', '打样和大货一致性'],
    experience_sources: ['二十多年一线操作经验', '处理过成千上万个工艺问题'],
    core_beliefs: ['做热转印就是做细节', '机器参数调好了，产品就稳了'],
    trust_sources: ['现场经验', '解决实际问题的能力'],
    voice_traits: ['真实', '朴实', '细节控', '不装'],
    sentence_rules: ['接地气', '用大白话讲工艺', '多用"你看""这个"'],
    jargon_level: 'low',
    emotional_intensity: 'low',
    preferred_expressions: ['你看这个', '调机的时候要注意', '做了这么多年'],
    avoid_expressions: ['非常专业', '理论上', '百分之百'],
    authority_boundaries: ['报价由销售决定', '交期由生产安排'],
  },

  audience_segments: [
    {
      id: 'musen-aud-1', name: '正在生产中遇到问题的客户',
      description: '正在做热转印但出现问题需要解决',
      priority: 1, main_pains: ['机器参数调不好', '颜色不稳定', '附着力不够'],
      common_objections: ['是不是机器有问题'], desired_results: ['解决实际生产问题'],
    },
    {
      id: 'musen-aud-2', name: '想了解热转印生产过程的客户',
      description: '对热转印生产感兴趣，想了解实际过程',
      priority: 2, main_pains: ['不知道热转印怎么做', '想看看真实生产'],
      common_objections: ['网上说的和实际一样吗'], desired_results: ['看到真实的生产过程'],
    },
  ],

  content_pillars: [
    { id: 'musen-pillar-1', name: '一线调试', weight: 50, purpose: '展示调试细节和过程',
      examples: ['调机全过程', '一个产品转印不好怎么办'], suitable_audience_ids: ['musen-aud-1'],
      must_include: ['真实画面', '具体参数'], avoid_topics: ['UV机器'] },
    { id: 'musen-pillar-2', name: '工艺干货', weight: 30, purpose: '分享实际经验',
      examples: ['PP杯调试要点', '附着力测试现场'], suitable_audience_ids: ['musen-aud-1', 'musen-aud-2'],
      must_include: ['现场实拍'], avoid_topics: [] },
    { id: 'musen-pillar-3', name: '案例实拍', weight: 20, purpose: '客户产品转印实拍',
      examples: ['客户产品调试过程', '从不好到好的过程'], suitable_audience_ids: ['musen-aud-2'],
      must_include: ['真实产品'], avoid_topics: ['报价'] },
  ],

  platform_profiles: [{
    platform: 'weixin', ideal_duration_seconds: [15, 45], ideal_word_count: [60, 150],
    hook_styles: ['material_risk', 'test_risk'], pacing: '真实节奏，不刻意加速',
    sentence_length: '短句，口语化', caption_style: '白底加重点标注',
    preferred_ctas: ['评论区说说你的问题', '发产品图帮你看看'], prohibited_styles: ['广告风格', '过度剪辑'],
  }],

  brand_policy: {
    must_be_truthful: true, proactive_brand_emphasis: false, proactive_manufacturer_disclosure: false,
    truthful_when_asked: true,
    allowed_claims: ['我做了二十多年热转印', '这个产品我能调好'],
    forbidden_claims: ['所有产品都能做', '永远不掉', '效果最好'],
    preferred_brand_expressions: ['我们厂', '我们这边'],
    sensitive_topics: ['价格', '交期'],
    competitor_policy: { can_compare: false, can_name_competitors: false, can_make_negative_claims: false, rules: ['不评价同行'] },
  },

  conversion_strategy: {
    default_goal: '回答工艺问题，引导客户提供产品信息',
    by_funnel_stage: {
      awareness: { goal: '展示专业能力', preferred_ctas: ['关注', '有问题评论区问'], forbidden_ctas: ['下单'] },
      consideration: { goal: '收集客户产品问题', preferred_ctas: ['发产品图帮你看看', '评论区描述问题'], forbidden_ctas: ['承诺解决'] },
      high_intent: { goal: '寄样打样', preferred_ctas: ['寄样过来试试'], forbidden_ctas: ['保证效果'] },
      customer_service: { goal: '协助客户调试', preferred_ctas: [], forbidden_ctas: [] },
    },
  },

  knowledge_scope: {
    allowed_topics: ['热转印生产', '调试技巧', '问题排查'],
    restricted_topics: ['商业机密', '客户数据'],
    requires_evidence: ['产能数据'],
    requires_human_confirmation: ['价格', '交期'],
    fallback_language: ['要看实际产品', '需要上机测试'],
  },

  reference_script_ids: [],
  updated_at: new Date().toISOString(),
};

// ===== 宏达印业妮妮 (a5) =====

export const NINI_ACCOUNT: AccountV2 = {
  id: 'a5',
  org_id: 'org_001',
  name: '宏达印业妮妮',
  platform: 'weixin',
  owner_id: 'u5',
  status: 'active',
  created_at: '2026-07-02T00:00:00Z',

  persona: '00后热转印女孩，可靠务实，懂工艺懂成本，帮客户解决生产痛点',
  positioning: '客户和工厂之间的翻译员；客户生产痛点的拆解员；热转印方案的初步判断员；成本和工艺逻辑的解释员',
  target_audience: '包装厂、日用品厂、化妆品包材客户、文具玩具客户、小批量多图案客户',
  content_style: '短句、大白话、具体、不绕弯、不硬推、不装专家',
  main_content_types: ['qa', 'process'],
  conversion_goal: '有效私信、客户发产品图片和数量、引导寄样打样',
  dos: '短句大白话、用客户场景开头、给具体判断逻辑、自然引导发资料',
  donts: '肯定能做、保证不掉、色彩百分百一样、交期绝对没问题、我们家最专业',

  schema_version: '2.0',
  persona_version: '1.0.0',
  default_platform: 'weixin',
  supported_platforms: ['weixin'],

  persona_config: {
    speaker_role: 'consultant',
    on_camera_identity: '00后热转印女孩，帮客户解决生产痛点',
    identity: ['00后热转印女孩', '懂工艺也懂成本', '客户和工厂之间的翻译员'],
    expertise: ['热转印工艺和成本', '小批量方案', '常见材质判断'],
    experience_sources: ['在宏达工厂学到的', '大量客户咨询和处理经验'],
    core_beliefs: ['客户的问题就是我的问题', '讲清楚比讲深更重要'],
    trust_sources: ['务实不忽悠', '站在客户角度'],
    voice_traits: ['年轻', '直接', '亲和', '不装'],
    sentence_rules: ['短句', '大白话', '用"你"开头', '每句不超过20字'],
    jargon_level: 'low',
    emotional_intensity: 'medium',
    preferred_expressions: ['你的产品是什么', '发图帮我看看', '这样理解就对了'],
    avoid_expressions: ['我们最专业', '保证效果', '毫无风险'],
    authority_boundaries: ['附着力需要测试', '批量一致性需要确认', '价格以打样为准'],
  },

  audience_segments: [
    {
      id: 'nini-aud-1', name: '小批量多图案客户',
      description: '每批数量不大但图案多变',
      priority: 1, main_pains: ['小批量成本高', '大厂不接'],
      common_objections: ['太少会不会贵'], desired_results: ['找到合适的方案'],
    },
    {
      id: 'nini-aud-2', name: '想从丝印转热转印的客户',
      description: '当前用丝印但因效率或成本想换工艺',
      priority: 2, main_pains: ['丝印效率低', '颜色不稳定'],
      common_objections: ['热转印会不会贵'], desired_results: ['了解成本差异'],
    },
  ],

  content_pillars: [
    { id: 'nini-pillar-1', name: '工艺科普', weight: 40, purpose: '用大白话讲热转印',
      examples: ['热转印到底怎么做', '不同材质效果不一样'], suitable_audience_ids: ['nini-aud-1', 'nini-aud-2'],
      must_include: ['通俗易懂'], avoid_topics: [] },
    { id: 'nini-pillar-2', name: '成本分析', weight: 30, purpose: '帮客户算清成本',
      examples: ['小批量怎么最省钱', '丝印和热转印成本对比'], suitable_audience_ids: ['nini-aud-1'],
      must_include: ['具体数字'], avoid_topics: ['虚假低价'] },
    { id: 'nini-pillar-3', name: '答疑解惑', weight: 30, purpose: '回答客户最常问的问题',
      examples: ['客户问最多的问题', '怎么发图给我'], suitable_audience_ids: ['nini-aud-1', 'nini-aud-2'],
      must_include: [], avoid_topics: [] },
  ],

  platform_profiles: [{
    platform: 'weixin', ideal_duration_seconds: [15, 30], ideal_word_count: [80, 150],
    hook_styles: ['direct_question', 'customer_quote'], pacing: '轻快',
    sentence_length: '短句为主', caption_style: '白底加可爱装饰',
    preferred_ctas: ['发图给我看看', '评论区聊聊'], prohibited_styles: ['太正式', '过于专业'],
  }],

  brand_policy: {
    must_be_truthful: true, proactive_brand_emphasis: true, proactive_manufacturer_disclosure: false,
    truthful_when_asked: true,
    allowed_claims: ['宏达做了很多年热转印', '可以帮你看看'],
    forbidden_claims: ['保证不掉', '色彩一模一样', '什么材料都能做'],
    preferred_brand_expressions: ['我们宏达', '帮你问问师傅'],
    sensitive_topics: ['价格', '交期'],
    competitor_policy: { can_compare: false, can_name_competitors: false, can_make_negative_claims: false, rules: ['不评价同行'] },
  },

  conversion_strategy: {
    default_goal: '引导客户发产品信息',
    by_funnel_stage: {
      awareness: { goal: '建立亲和形象', preferred_ctas: ['关注我', '有问题随时问'], forbidden_ctas: ['下单'] },
      consideration: { goal: '收集客户产品信息', preferred_ctas: ['发产品图给我', '评论区告诉我'], forbidden_ctas: ['保证能做'] },
      high_intent: { goal: '引导寄样', preferred_ctas: ['寄样品来试试'], forbidden_ctas: ['保证效果'] },
      customer_service: { goal: '客户跟进', preferred_ctas: [], forbidden_ctas: [] },
    },
  },

  knowledge_scope: {
    allowed_topics: ['热转印基础', '材质识别', '成本分析'],
    restricted_topics: ['深度技术', '设备参数'],
    requires_evidence: ['附着力测试', '成本对比'],
    requires_human_confirmation: ['价格', '交期'],
    fallback_language: ['需要问一下师傅', '以测试结果为准'],
  },

  reference_script_ids: [],
  updated_at: new Date().toISOString(),
};

// ===== MOCK_ACCOUNTS_V2 — 所有迁移账号 =====

export const MOCK_ACCOUNTS_V2: AccountV2[] = [
  XIAOCHEN_ACCOUNT,
  XIAOLIN_ACCOUNT,
  MUSEN_ACCOUNT,
  XUZONG_ACCOUNT,
  NINI_ACCOUNT,
];
