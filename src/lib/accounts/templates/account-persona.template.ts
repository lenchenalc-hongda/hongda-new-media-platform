// ===== 账号人设模板 =====
// 可直接复制创建新账号
// 填写说明见下方注释
import type { AccountV2 } from '../types';

/**
 * 账号人设填写模板
 *
 * 使用方式：
 * 1. 复制此文件
 * 2. 修改 id、name、persona_version
 * 3. 依次填写各模块
 * 4. 运行 validateAccountConfig() 校验
 *
 * 字段类别：
 * - 人物身份：persona_config
 * - 内容定位：positioning, content_pillars, audience_segments
 * - 品牌边界：brand_policy
 * - 平台策略：platform_profiles
 * - 客户转化：conversion_strategy
 * - 知识合规：knowledge_scope
 */
export const ACCOUNT_PERSONA_TEMPLATE: Partial<AccountV2> = {
  schema_version: '2.0',
  persona_version: '1.0.0',

  id: 'replace-me',                    // 唯一 ID，如 a6
  name: '人物名称-账号定位',            // 如 小陈-热转印前端顾问
  platform: 'weixin',                   // 默认平台
  status: 'active',                     // active | inactive

  default_platform: 'weixin',
  supported_platforms: ['weixin'],

  // === 旧字段（兼容期保留） ===
  persona: '',                          // 一句话人设
  positioning: '',                      // 内容定位
  target_audience: '',                  // 目标客户概括
  content_style: '',                    // 内容风格
  main_content_types: [],               // 主要内容类型
  conversion_goal: '',                  // 默认转化目标
  dos: '',                              // 应做事项
  donts: '',                            // 禁止事项

  // === 人物身份 ===
  persona_config: {
    speaker_role: 'consultant',         // owner | sales | technician | consultant | host
    on_camera_identity: '',             // 出镜时的人物身份描述

    identity: [],                       // 这个人是谁（3-5条）
    expertise: [],                      // 真正擅长什么（3-5条）
    experience_sources: [],             // 判断来自哪些经历（3-5条）

    core_beliefs: [],                   // 长期坚持的判断原则（3-5条）
    trust_sources: [],                  // 客户为什么相信他（3-5条）

    voice_traits: [],                   // 说话人格特征（如：直接、不绕弯、具体）
    sentence_rules: [],                 // 句子规则（如：每句不超过20字、多用短句）

    jargon_level: 'low',                // low | medium | high
    emotional_intensity: 'low',         // low | medium | high

    preferred_expressions: [],          // 可以自然使用的常用表达
    avoid_expressions: [],              // 不符合人设的表达

    authority_boundaries: [],           // 哪些问题不能擅自做最终判断
  },

  // === 目标客户 ===
  audience_segments: [
    {
      id: 'audience-1',
      name: '客户群体一',
      description: '客户描述和背景',
      priority: 1,                      // 1=最高优先级

      main_pains: [],                   // 主要痛点
      common_objections: [],            // 常见顾虑
      desired_results: [],              // 希望的结果

      suitable_topics: [],              // 适合话题
      unsuitable_topics: [],            // 不适合话题
    },
  ],

  // === 内容支柱 ===
  content_pillars: [
    {
      id: 'pillar-1',
      name: '栏目名称',
      weight: 50,                       // 权重，所有栏目总和建议100
      purpose: '栏目目的',

      examples: [],                     // 选题示例
      suitable_audience_ids: [],        // 适用目标客户

      must_include: [],                 // 必须体现的内容
      avoid_topics: [],                 // 避免的话题
    },
  ],

  // === 平台配置 ===
  platform_profiles: [
    {
      platform: 'weixin',
      ideal_duration_seconds: [30, 60],
      ideal_word_count: [160, 300],

      hook_styles: [],
      pacing: '',
      sentence_length: '',
      caption_style: '',

      preferred_ctas: [],
      prohibited_styles: [],
    },
  ],

  // === 品牌边界 ===
  brand_policy: {
    must_be_truthful: true,

    proactive_brand_emphasis: false,
    proactive_manufacturer_disclosure: false,
    truthful_when_asked: true,

    allowed_claims: [],                 // 可以主动说的
    forbidden_claims: [],               // 绝对不能说的

    preferred_brand_expressions: [],    // 品牌相关优选表达
    sensitive_topics: [],               // 敏感话题

    competitor_policy: {
      can_compare: true,
      can_name_competitors: false,
      can_make_negative_claims: false,
      rules: [],
    },
  },

  // === 转化策略 ===
  conversion_strategy: {
    default_goal: '',
    by_funnel_stage: {
      awareness: {
        goal: '建立认知、关注、收藏',
        preferred_ctas: ['关注', '收藏', '评论区聊聊'],
        forbidden_ctas: ['立即购买', '点击下单'],
      },
      consideration: {
        goal: '引导客户提供产品信息',
        preferred_ctas: ['发产品图', '评论区告诉我材质'],
        forbidden_ctas: ['直接报价', '承诺效果'],
      },
      high_intent: {
        goal: '预约打样、寄样测试',
        preferred_ctas: ['寄样测试', '预约到厂'],
        forbidden_ctas: ['直接下单', '保证能做'],
      },
      customer_service: {
        goal: '售后维护、复购',
        preferred_ctas: ['联系我们', '预约调试'],
        forbidden_ctas: [],
      },
    },
  },

  // === 知识边界 ===
  knowledge_scope: {
    allowed_topics: [],                 // 可以讲的话题
    restricted_topics: [],              // 受限话题

    requires_evidence: [],              // 需要真实证据才能说的
    requires_human_confirmation: [],    // 需要主管确认的

    fallback_language: [],              // 没有资料时使用的表达
  },

  reference_script_ids: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
