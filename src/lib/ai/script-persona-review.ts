// ===== 账号一致性审稿系统 =====
// 审核脚本是否匹配账号人设和品牌边界
import type { AccountV2, ScriptReviewResult } from '@/lib/accounts/types';
import { buildAccountPromptContext } from './persona-compiler';

const HARD_VIOLATION_CODES = [
  'forbidden_claim',       // 出现禁止表达
  'fabricated_capability',  // 虚构能力
  'absolute_promise',       // 绝对化承诺
  'exceed_authority',       // 超出专业权限
  'privacy_leak',           // 泄露隐私
  'competitor_bashing',     // 贬低竞争对手
  'duration_overflow',      // 时长违反平台要求
  'overly_aggressive_cta',  // 转化过于强硬
  'contradicts_input',      // 与用户输入矛盾
];

// ===== 硬性检查 =====

export function checkHardViolations(
  script: string,
  account: AccountV2,
): { code: string; message: string; evidence: string }[] {
  var violations: { code: string; message: string; evidence: string }[] = [];
  var bp = account.brand_policy;
  var ks = account.knowledge_scope;
  var pc = account.persona_config;

  // 1. Check forbidden claims
  bp.forbidden_claims.forEach(function(claim) {
    if (script.includes(claim)) {
      violations.push({
        code: 'forbidden_claim',
        message: '出现禁止表达："' + claim + '"',
        evidence: claim,
      });
    }
  });

  // 2. Check authority boundaries
  pc.authority_boundaries.forEach(function(boundary) {
    // Simple heuristic: if boundary keyword appears in script as a commitment
    boundary.split('、').forEach(function(keyword) {
      if (script.includes(keyword) && (script.includes('保证') || script.includes('承诺') || script.includes('肯定'))) {
        violations.push({
          code: 'exceed_authority',
          message: '超出专业权限：涉及"' + keyword + '"的承诺',
          evidence: keyword,
        });
      }
    });
  });

  // 3. Check absolute promises
  var absolutePatterns = ['百分之百', '绝对', '100%', '零风险', '永不'];
  absolutePatterns.forEach(function(pattern) {
    if (script.includes(pattern)) {
      violations.push({
        code: 'absolute_promise',
        message: '出现绝对化承诺："' + pattern + '"',
        evidence: pattern,
      });
    }
  });

  // 4. Check knowledge scope requires evidence
  ks.requires_evidence.forEach(function(ev) {
    if (script.includes(ev)) {
      var hasEvidence = script.includes('测试') || script.includes('数据') || script.includes('案例');
      if (!hasEvidence) {
        violations.push({
          code: 'fabricated_capability',
          message: '涉及"' + ev + '"但没有提供证据来源',
          evidence: ev,
        });
      }
    }
  });

  return violations;
}

// ===== 软性评分 =====

export function scoreScriptAgainstAccount(
  script: string,
  account: AccountV2,
): ScriptReviewResult['scores'] {
  var scores = {
    persona_fit: 8,
    audience_relevance: 7,
    naturalness: 7,
    hook_strength: 7,
    information_value: 6,
    trust_building: 7,
    conversion_naturalness: 7,
    repetition_risk: 8,
  };

  // Check persona fit — does it use avoid_expressions?
  var pc = account.persona_config;
  pc.avoid_expressions.forEach(function(exp) {
    if (script.includes(exp)) {
      scores.persona_fit = Math.max(0, scores.persona_fit - 2);
    }
  });

  // Check naturalness — does it sound like spoken or written?
  var writtenMarkers = ['首先', '其次', '此外', '综上所述', '因此', '我们需要注意的是'];
  var writtenCount = 0;
  writtenMarkers.forEach(function(m) {
    if (script.includes(m)) writtenCount++;
  });
  scores.naturalness = Math.max(0, scores.naturalness - writtenCount);

  // Check hook strength — does it start with a question or tension?
  var firstLine = script.split('\n')[0] || script;
  if (firstLine.includes('？') || firstLine.includes('吗') || firstLine.includes('什么')) {
    scores.hook_strength = 9;
  }

  // Check conversion naturalness
  var hardCtas = ['立即购买', '马上抢', '限时', '点击链接'];
  hardCtas.forEach(function(cta) {
    if (script.includes(cta)) {
      scores.conversion_naturalness = Math.max(0, scores.conversion_naturalness - 3);
    }
  });

  return scores;
}

// ===== 综合审稿 =====

export function reviewScriptAgainstAccount(
  script: string,
  account: AccountV2,
  options?: { maxRepairs?: number },
): ScriptReviewResult {
  var maxRepairs = options?.maxRepairs || 2;
  var hardViolations = checkHardViolations(script, account);
  var softScores = scoreScriptAgainstAccount(script, account);

  var repairInstructions: string[] = [];

  // Generate repair instructions for hard violations
  hardViolations.forEach(function(v) {
    repairInstructions.push('修复硬性违规【' + v.code + '】：' + v.message);
  });

  // Generate repair instructions for low scores
  if (softScores.persona_fit < 8) {
    repairInstructions.push('提高人设匹配度：当前脚本不够符合"' + account.persona_config.on_camera_identity + '"的人设');
  }
  if (softScores.audience_relevance < 8) {
    repairInstructions.push('增强客户相关性：确保内容直接回应目标客户的问题');
  }
  if (softScores.naturalness < 7) {
    repairInstructions.push('提高自然度：减少书面语，增加口语化和短句');
  }
  if (softScores.information_value < 7) {
    repairInstructions.push('增加信息量：不能只有观点，需要有具体的判断依据');
  }

  var passed = hardViolations.length === 0;

  return {
    passed: passed,
    hard_violations: hardViolations,
    scores: softScores,
    repair_instructions: repairInstructions,
    reviewed_script: undefined, // AI repair not implemented client-side
  };
}

// ===== 自动修复（空实现 — 需要AI adapter） =====

export function autoRepairScript(
  script: string,
  reviewResult: ScriptReviewResult,
  account: AccountV2,
  repairCount?: number,
): { script: string; review: ScriptReviewResult; repaired: boolean } {
  var currentRepairs = repairCount || 0;
  if (currentRepairs >= 2) {
    return { script: script, review: reviewResult, repaired: false };
  }

  // If there are violations that can be fixed by replacement
  var repaired = script;
  account.brand_policy.forbidden_claims.forEach(function(claim) {
    var replacement = '【需根据实际情况描述】';
    repaired = repaired.split(claim).join(replacement);
  });

  // Re-check
  var newReview = reviewScriptAgainstAccount(repaired, account);
  if (newReview.passed) {
    return { script: repaired, review: newReview, repaired: true };
  }

  // Recursive repair (max 2)
  return autoRepairScript(repaired, newReview, account, currentRepairs + 1);
}
