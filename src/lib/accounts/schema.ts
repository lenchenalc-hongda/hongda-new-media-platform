// ===== Account V2 Zod 校验 =====
import { z } from 'zod';

export const SpeakerRoleSchema = z.enum(['owner', 'sales', 'technician', 'consultant', 'host']);
export const FunnelStageSchema = z.enum(['awareness', 'consideration', 'high_intent', 'customer_service']);
export const PlatformSchema = z.enum(['weixin', 'douyin']);
export const JargonLevelSchema = z.enum(['low', 'medium', 'high']);
export const EmotionalIntensitySchema = z.enum(['low', 'medium', 'high']);

export const AudienceSegmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  priority: z.number().int().min(0),
  main_pains: z.array(z.string()),
  common_objections: z.array(z.string()),
  desired_results: z.array(z.string()),
  suitable_topics: z.array(z.string()).optional(),
  unsuitable_topics: z.array(z.string()).optional(),
});

export const ContentPillarSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  weight: z.number().int().min(0).max(100),
  purpose: z.string(),
  examples: z.array(z.string()),
  suitable_audience_ids: z.array(z.string()).optional(),
  must_include: z.array(z.string()).optional(),
  avoid_topics: z.array(z.string()).optional(),
});

export const PlatformProfileSchema = z.object({
  platform: PlatformSchema,
  ideal_duration_seconds: z.tuple([z.number(), z.number()]),
  ideal_word_count: z.tuple([z.number(), z.number()]).optional(),
  hook_styles: z.array(z.string()),
  pacing: z.string(),
  sentence_length: z.string(),
  caption_style: z.string(),
  preferred_ctas: z.array(z.string()),
  prohibited_styles: z.array(z.string()),
});

export const PersonaConfigSchema = z.object({
  speaker_role: SpeakerRoleSchema,
  on_camera_identity: z.string(),
  identity: z.array(z.string()),
  expertise: z.array(z.string()),
  experience_sources: z.array(z.string()),
  core_beliefs: z.array(z.string()),
  trust_sources: z.array(z.string()),
  voice_traits: z.array(z.string()),
  sentence_rules: z.array(z.string()),
  jargon_level: JargonLevelSchema,
  emotional_intensity: EmotionalIntensitySchema,
  preferred_expressions: z.array(z.string()),
  avoid_expressions: z.array(z.string()),
  authority_boundaries: z.array(z.string()),
});

export const CompetitorPolicySchema = z.object({
  can_compare: z.boolean(),
  can_name_competitors: z.boolean(),
  can_make_negative_claims: z.boolean(),
  rules: z.array(z.string()),
});

export const BrandPolicySchema = z.object({
  must_be_truthful: z.boolean(),
  proactive_brand_emphasis: z.boolean(),
  proactive_manufacturer_disclosure: z.boolean(),
  truthful_when_asked: z.boolean(),
  allowed_claims: z.array(z.string()),
  forbidden_claims: z.array(z.string()),
  preferred_brand_expressions: z.array(z.string()),
  sensitive_topics: z.array(z.string()),
  competitor_policy: CompetitorPolicySchema,
});

export const ConversionStageConfigSchema = z.object({
  goal: z.string(),
  preferred_ctas: z.array(z.string()),
  forbidden_ctas: z.array(z.string()),
});

export const ConversionStrategySchema = z.object({
  default_goal: z.string(),
  by_funnel_stage: z.object({
    awareness: ConversionStageConfigSchema,
    consideration: ConversionStageConfigSchema,
    high_intent: ConversionStageConfigSchema,
    customer_service: ConversionStageConfigSchema,
  }),
});

export const KnowledgeScopeSchema = z.object({
  allowed_topics: z.array(z.string()),
  restricted_topics: z.array(z.string()),
  requires_evidence: z.array(z.string()),
  requires_human_confirmation: z.array(z.string()),
  fallback_language: z.array(z.string()),
});

export const AccountV2Schema = z.object({
  id: z.string().min(1),
  org_id: z.string(),
  name: z.string().min(1),
  platform: PlatformSchema,
  owner_id: z.string().nullable().optional(),
  persona: z.string().optional(),
  positioning: z.string().optional(),
  target_audience: z.string().nullable().optional(),
  content_style: z.string().nullable().optional(),
  main_content_types: z.array(z.string()).optional(),
  conversion_goal: z.string().nullable().optional(),
  dos: z.string().nullable().optional(),
  donts: z.string().nullable().optional(),
  status: z.string(),
  created_at: z.string(),
  schema_version: z.literal('2.0'),
  persona_version: z.string().min(1),
  default_platform: PlatformSchema,
  supported_platforms: z.array(PlatformSchema).min(1),
  persona_config: PersonaConfigSchema,
  audience_segments: z.array(AudienceSegmentSchema).min(1),
  content_pillars: z.array(ContentPillarSchema).min(1),
  platform_profiles: z.array(PlatformProfileSchema).min(1),
  brand_policy: BrandPolicySchema,
  conversion_strategy: ConversionStrategySchema,
  knowledge_scope: KnowledgeScopeSchema,
  reference_script_ids: z.array(z.string()),
  updated_at: z.string(),
});

// ===== 校验函数 =====

export function validateAccountConfig(account: unknown): { valid: boolean; errors: string[] } {
  const result = AccountV2Schema.safeParse(account);
  if (result.success) {
    var errors: string[] = [];
    // Check content pillars weight sum
    var weightSum = result.data.content_pillars.reduce(function(s, p) { return s + p.weight; }, 0);
    if (weightSum !== 100 && weightSum > 0) {
      errors.push('content_pillars 权重之和为 ' + weightSum + '，建议为 100');
    }
    // Check default_platform is in supported_platforms
    if (!result.data.supported_platforms.includes(result.data.default_platform as any)) {
      errors.push('default_platform ' + result.data.default_platform + ' 不在 supported_platforms 中');
    }
    // Check conversion_strategy covers all funnel stages
    var stages = ['awareness', 'consideration', 'high_intent', 'customer_service'];
    for (var i = 0; i < stages.length; i++) {
      if (!(stages[i] in result.data.conversion_strategy.by_funnel_stage)) {
        errors.push('conversion_strategy 缺少 ' + stages[i] + ' 阶段');
      }
    }
    // Check persona_config.speaker_role exists
    if (!result.data.persona_config.speaker_role) {
      errors.push('persona_config.speaker_role 不能为空');
    }
    // Check forbidden_claims not empty
    if (result.data.brand_policy.forbidden_claims.length === 0) {
      errors.push('brand_policy.forbidden_claims 不能为空');
    }
    if (errors.length > 0) {
      return { valid: false, errors: errors };
    }
    return { valid: true, errors: [] };
  }
  return { valid: false, errors: result.error.issues.map(function(i) { return i.path.join('.') + ': ' + i.message; }) };
}

export function isAccountV2(account: any): account is { schema_version: '2.0' } {
  return account && (account as any).schema_version === '2.0';
}
