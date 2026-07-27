// ===== Account V2 — 账号人设底层类型 =====
// 结构化账号配置，替代旧版 Account 中的字符串字段
// 所有 adapter 必须通过 Persona Compiler 获取人设上下文
import type { Account, Platform, ContentType } from '@/lib/constants/types';

// ===== 基础枚举 =====

export type SpeakerRole = 'owner' | 'sales' | 'technician' | 'consultant' | 'host';

export type FunnelStage = 'awareness' | 'consideration' | 'high_intent' | 'customer_service';

export type PersonaTask =
  | 'suggest-products'
  | 'suggest-pains'
  | 'recommend-knowledge'
  | 'strategy'
  | 'angles'
  | 'hooks'
  | 'draft'
  | 'rewrite'
  | 'review';

// ===== 目标客户分层 =====

export interface AudienceSegment {
  id: string;
  name: string;
  description: string;
  priority: number;
  main_pains: string[];
  common_objections: string[];
  desired_results: string[];
  suitable_topics?: string[];
  unsuitable_topics?: string[];
}

// ===== 内容支柱 =====

export interface ContentPillar {
  id: string;
  name: string;
  weight: number;
  purpose: string;
  examples: string[];
  suitable_audience_ids?: string[];
  must_include?: string[];
  avoid_topics?: string[];
}

// ===== 平台表达配置 =====

export interface PlatformProfile {
  platform: Platform;
  ideal_duration_seconds: [number, number];
  ideal_word_count?: [number, number];
  hook_styles: string[];
  pacing: string;
  sentence_length: string;
  caption_style: string;
  preferred_ctas: string[];
  prohibited_styles: string[];
}

// ===== 人物配置 =====

export interface PersonaConfig {
  speaker_role: SpeakerRole;
  on_camera_identity: string;
  identity: string[];
  expertise: string[];
  experience_sources: string[];
  core_beliefs: string[];
  trust_sources: string[];
  voice_traits: string[];
  sentence_rules: string[];
  jargon_level: 'low' | 'medium' | 'high';
  emotional_intensity: 'low' | 'medium' | 'high';
  preferred_expressions: string[];
  avoid_expressions: string[];
  authority_boundaries: string[];
}

// ===== 品牌和事实边界 =====

export interface CompetitorPolicy {
  can_compare: boolean;
  can_name_competitors: boolean;
  can_make_negative_claims: boolean;
  rules: string[];
}

export interface BrandPolicy {
  must_be_truthful: boolean;
  proactive_brand_emphasis: boolean;
  proactive_manufacturer_disclosure: boolean;
  truthful_when_asked: boolean;
  allowed_claims: string[];
  forbidden_claims: string[];
  preferred_brand_expressions: string[];
  sensitive_topics: string[];
  competitor_policy: CompetitorPolicy;
}

// ===== 转化策略 =====

export interface ConversionStageConfig {
  goal: string;
  preferred_ctas: string[];
  forbidden_ctas: string[];
}

export interface ConversionStrategy {
  default_goal: string;
  by_funnel_stage: Record<FunnelStage, ConversionStageConfig>;
}

// ===== 知识边界 =====

export interface KnowledgeScope {
  allowed_topics: string[];
  restricted_topics: string[];
  requires_evidence: string[];
  requires_human_confirmation: string[];
  fallback_language: string[];
}

// ===== Account V2 =====

export interface AccountV2 extends Account {
  schema_version: '2.0';
  persona_version: string;
  default_platform: Platform;
  supported_platforms: Platform[];
  persona_config: PersonaConfig;
  audience_segments: AudienceSegment[];
  content_pillars: ContentPillar[];
  platform_profiles: PlatformProfile[];
  brand_policy: BrandPolicy;
  conversion_strategy: ConversionStrategy;
  knowledge_scope: KnowledgeScope;
  reference_script_ids: string[];
  updated_at: string;
}

// ===== Persona Compiler 输出 =====

export interface CompiledPersonaContext {
  account_id: string;
  persona_version: string;
  task: PersonaTask;
  identity_contract: string;
  audience_contract: string;
  content_contract: string;
  style_contract: string;
  brand_contract: string;
  conversion_contract: string;
  knowledge_contract: string;
  task_instructions: string;
  prompt_text: string;
}

// ===== Script Review 结果 =====

export interface ScriptReviewResult {
  passed: boolean;
  hard_violations: { code: string; message: string; evidence: string }[];
  scores: {
    persona_fit: number;
    audience_relevance: number;
    naturalness: number;
    hook_strength: number;
    information_value: number;
    trust_building: number;
    conversion_naturalness: number;
    repetition_risk: number;
  };
  repair_instructions: string[];
  reviewed_script?: string;
}

// ===== 运营学习 =====

export interface AccountLearningProfile {
  period: string;
  successful_patterns: string[];
  weak_patterns: string[];
  audience_feedback: string[];
  recommended_adjustments: string[];
  confidence: 'low' | 'medium' | 'high';
}

// ===== 账号版本快照（存到脚本中） =====

export interface ScriptGenerationMeta {
  account_id: string;
  persona_version: string;
  account_snapshot: Partial<AccountV2>;
  platform?: Platform;
  audience_segment_id?: string;
  content_pillar_id?: string;
  funnel_stage?: FunnelStage;
  generated_at: string;
  review_result?: ScriptReviewResult;
}

export type { Platform, Account, ContentType };
