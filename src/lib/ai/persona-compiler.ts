// ===== Persona Compiler V1 =====
// 统一的账号人设编译模块
// 所有 adapter 必须通过此模块获取人设上下文，不得自行拼接
import type {
  AccountV2, PersonaTask, Platform, FunnelStage,
  CompiledPersonaContext
} from '@/lib/accounts/types';

export interface CompilerOptions {
  platform?: Platform;
  audienceSegmentId?: string;
  contentPillarId?: string;
  funnelStage?: FunnelStage;
}

// ===== 编译人设上下文 =====

export function buildAccountPromptContext(
  account: AccountV2,
  task: PersonaTask,
  options: CompilerOptions = {}
): CompiledPersonaContext {
  var platform = account.platform_profiles.find(function(p) { return p.platform === (options.platform || account.default_platform); }) || account.platform_profiles[0];
  var segment = options.audienceSegmentId
    ? account.audience_segments.find(function(s) { return s.id === options.audienceSegmentId; })
    : null;
  var pillar = options.contentPillarId
    ? account.content_pillars.find(function(p) { return p.id === options.contentPillarId; })
    : null;
  var stage = options.funnelStage || 'awareness';
  var convConfig = account.conversion_strategy.by_funnel_stage[stage];

  // 1. Identity contract
  var identityContract = buildIdentityContract(account);

  // 2. Audience contract
  var audienceContract = segment
    ? '【本期的目标客户】\n' + segment.name + '：' + segment.description + '\n他们的痛点：' + segment.main_pains.join('、') + '\n他们的顾虑：' + segment.common_objections.join('、')
    : '【目标客户】\n' + (account.target_audience || account.audience_segments[0]?.name || '有热转印需求的客户');

  // 3. Content contract
  var contentContract = buildContentContract(account, pillar);

  // 4. Style contract
  var styleContract = buildStyleContract(account, platform);

  // 5. Brand contract
  var brandContract = buildBrandContract(account);

  // 6. Conversion contract
  var conversionContract = '【本次转化目标】\n';
  if (convConfig) {
    conversionContract += '目的：' + convConfig.goal + '\n优先CTA：' + convConfig.preferred_ctas.join('、');
    if (convConfig.forbidden_ctas.length > 0) {
      conversionContract += '\n禁止CTA：' + convConfig.forbidden_ctas.join('、');
    }
  } else {
    conversionContract += account.conversion_strategy.default_goal || '引导客户发产品信息';
  }

  // 7. Knowledge contract
  var knowledgeContract = buildKnowledgeContract(account);

  // 8. Task-specific instructions
  var taskInstructions = buildTaskInstructions(account, task, options);

  // 9. Full prompt text
  var promptText = [
    identityContract,
    audienceContract,
    contentContract,
    styleContract,
    brandContract,
    conversionContract,
    knowledgeContract,
    taskInstructions,
  ].join('\n\n');

  return {
    account_id: account.id,
    persona_version: account.persona_version,
    task,
    identity_contract: identityContract,
    audience_contract: audienceContract,
    content_contract: contentContract,
    style_contract: styleContract,
    brand_contract: brandContract,
    conversion_contract: conversionContract,
    knowledge_contract: knowledgeContract,
    task_instructions: taskInstructions,
    prompt_text: promptText,
  };
}

// ===== 子模块 =====

function buildIdentityContract(account: AccountV2): string {
  var p = account.persona_config;
  var lines: string[] = [];
  lines.push('【账号身份】');
  lines.push('账号名称：' + account.name);
  lines.push('出镜角色：' + p.on_camera_identity);
  lines.push('角色类型：' + p.speaker_role);
  lines.push('');
  lines.push('人物身份：');
  p.identity.forEach(function(i) { lines.push('- ' + i); });
  lines.push('');
  lines.push('专业能力：');
  p.expertise.forEach(function(e) { lines.push('- ' + e); });
  lines.push('');
  lines.push('判断来源：');
  p.experience_sources.forEach(function(s) { lines.push('- ' + s); });
  lines.push('');
  lines.push('核心信念：');
  p.core_beliefs.forEach(function(b) { lines.push('- ' + b); });
  if (p.trust_sources.length > 0) {
    lines.push('');
    lines.push('客户为什么相信他：');
    p.trust_sources.forEach(function(t) { lines.push('- ' + t); });
  }
  return lines.join('\n');
}

function buildContentContract(account: AccountV2, pillar?: any): string {
  var lines: string[] = ['【内容定位】'];
  lines.push('账号定位：' + (account.positioning || '未配置'));
  if (pillar) {
    lines.push('');
    lines.push('本期栏目：' + pillar.name + '（权重：' + pillar.weight + '%）');
    lines.push('栏目目的：' + pillar.purpose);
    if (pillar.must_include && pillar.must_include.length > 0) {
      lines.push('必须体现：');
      pillar.must_include.forEach(function(m: string) { lines.push('- ' + m); });
    }
    if (pillar.avoid_topics && pillar.avoid_topics.length > 0) {
      lines.push('避免话题：');
      pillar.avoid_topics.forEach(function(a: string) { lines.push('- ' + a); });
    }
  } else {
    lines.push('');
    lines.push('内容支柱：');
    account.content_pillars.forEach(function(p) {
      lines.push('- ' + p.name + '（' + p.weight + '%）: ' + p.purpose);
    });
  }
  return lines.join('\n');
}

function buildStyleContract(account: AccountV2, platform: any): string {
  var p = account.persona_config;
  var lines: string[] = ['【说话方式】'];
  
  var styleLabel: Record<string, string> = { weixin: '视频号', douyin: '抖音' };
  if (platform) {
    lines.push('平台：' + (styleLabel[platform.platform] || platform.platform));
    lines.push('建议时长：' + platform.ideal_duration_seconds[0] + '-' + platform.ideal_duration_seconds[1] + '秒');
    if (platform.ideal_word_count) {
      lines.push('建议字数：' + platform.ideal_word_count[0] + '-' + platform.ideal_word_count[1] + '字');
    }
    lines.push('');
    lines.push('开头钩子风格：' + platform.hook_styles.join('、'));
    lines.push('内容节奏：' + platform.pacing);
    lines.push('');
  }
  
  lines.push('内容风格：' + (account.content_style || '未配置'));
  lines.push('语气特征：' + p.voice_traits.join('、'));
  lines.push('句子长度：' + (platform?.sentence_length || '灵活'));
  lines.push('专业术语程度：' + p.jargon_level);
  lines.push('情绪强度：' + p.emotional_intensity);
  
  if (p.sentence_rules.length > 0) {
    lines.push('');
    lines.push('句子规则：');
    p.sentence_rules.forEach(function(r) { lines.push('- ' + r); });
  }
  if (p.preferred_expressions.length > 0) {
    lines.push('');
    lines.push('可以使用的表达：');
    p.preferred_expressions.forEach(function(e) { lines.push('- ' + e); });
  }
  if (p.avoid_expressions.length > 0) {
    lines.push('');
    lines.push('不要使用的表达：');
    p.avoid_expressions.forEach(function(e) { lines.push('- ' + e); });
  }
  return lines.join('\n');
}

function buildBrandContract(account: AccountV2): string {
  var bp = account.brand_policy;
  var lines: string[] = ['【品牌边界】'];
  
  if (bp.allowed_claims.length > 0) {
    lines.push('可以说的品牌表达：');
    bp.allowed_claims.forEach(function(c) { lines.push('- ' + c); });
  }
  lines.push('');
  lines.push('绝对不能说的：');
  bp.forbidden_claims.forEach(function(c) { lines.push('- ' + c); });
  
  if (bp.preferred_brand_expressions.length > 0) {
    lines.push('');
    lines.push('推荐品牌表达：');
    bp.preferred_brand_expressions.forEach(function(e) { lines.push('- ' + e); });
  }
  
  if (bp.competitor_policy.rules.length > 0) {
    lines.push('');
    lines.push('竞争品牌政策：');
    bp.competitor_policy.rules.forEach(function(r) { lines.push('- ' + r); });
  }
  return lines.join('\n');
}

function buildKnowledgeContract(account: AccountV2): string {
  var ks = account.knowledge_scope;
  var lines: string[] = ['【知识与合规边界】'];
  
  lines.push('可以讲的话题：' + ks.allowed_topics.join('、'));
  if (ks.restricted_topics.length > 0) {
    lines.push('受限话题（谨慎处理）：' + ks.restricted_topics.join('、'));
  }
  if (ks.requires_evidence.length > 0) {
    lines.push('');
    lines.push('以下内容必须有真实证据才能说：');
    ks.requires_evidence.forEach(function(e) { lines.push('- ' + e); });
  }
  if (ks.requires_human_confirmation.length > 0) {
    lines.push('');
    lines.push('以下内容需要主管确认才能承诺：');
    ks.requires_human_confirmation.forEach(function(c) { lines.push('- ' + c); });
  }
  if (ks.fallback_language.length > 0) {
    lines.push('');
    lines.push('没有资料时使用的安全表达：');
    ks.fallback_language.forEach(function(f) { lines.push('- ' + f); });
  }
  return lines.join('\n');
}

// ===== 按任务的指令 =====

function buildTaskInstructions(account: AccountV2, task: PersonaTask, options: CompilerOptions): string {
  var p = account.persona_config;
  switch (task) {
    case 'angles':
      return '【任务：生成内容角度】\n请根据以上账号人设和目标客户，生成8-12个差异化的内容角度。\n每个角度必须有一个明确的冲突或客户痛点。\n每个角度必须说明为什么目标用户愿意看。\n不要使用固定的模版句式。\n确保每个角度都符合账号的人设身份和品牌边界。';
    
    case 'hooks':
      return '【任务：生成开头钩子】\n请根据以上账号人设和内容角度，生成12-20个开头钩子。\n每个钩子不超过28个中文字。\n钩子第一眼必须能看出具体问题。\n禁止使用"这个问题""今天讲一下""很多客户问我"等开头。\n每个钩子必须有明确的冲突点或好奇心触发点。\n钩子风格应符合账号平台的配置要求';
    
    case 'draft':
      return '【任务：生成脚本正文】\n请根据以上的账号人设、目标客户和内容角度，生成一条短视频口播脚本。\n脚本结构建议：具体问题 → 核心原因 → 客户场景 → 下一步动作。\n必须使用口语化表达，符合人物的说话方式。\n不得出现文章式表达。\n不得使用固定的模版句式。\n不得违反品牌边界。\n内容要有具体信息量，不能只是空泛表达。';
    
    case 'rewrite':
      return '【任务：重写脚本】\n请根据以上账号人设，重写以下脚本。\n保持原意，但改成人设要求的说话方式和风格。\n确保符合人物的语气特征和句子规则。\n不得违反品牌边界。';
    
    case 'review':
      return '【任务：审核脚本】\n请根据以上账号人设和品牌边界，审核以下脚本。\n检查是否出现 forbidden_claims 中的内容。\n检查是否符合人物身份和说话风格。\n检查是否超出账号的知识边界。\n返回审核结果。';
    
    case 'strategy':
      return '【任务：内容策略】\n请根据以上账号人设，生成内容策略。\n分析目标客户的问题和需求。\n确定核心观点和信息结构。\n确保策略符合账号定位。';
    
    case 'suggest-products':
      return '【任务：推荐产品/工艺方向】\n请根据以上账号人设和目标客户，推荐相关产品/工艺方向。\n每个方向要说明为什么适合这个账号。';
    
    case 'suggest-pains':
      return '【任务：推荐客户痛点】\n请根据以上账号人设和目标客户，推荐相关的客户痛点。\n每个痛点要说明为什么这个账号适合讲。';
    
    case 'recommend-knowledge':
      return '【任务：推荐知识卡】\n请根据以上账号人设和内容定位，推荐相关的知识卡。';
    
    default:
      return '【任务：' + task + '】\n请根据以上账号人设完成对应的任务。';
  }
}
