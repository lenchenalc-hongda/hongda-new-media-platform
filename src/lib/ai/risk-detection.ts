// ===== Risk Topic Detection =====
// Detects high-risk topics that need knowledge card context

const HIGH_RISK_KEYWORDS = [
  '能不能做', '会不会掉', '耐酒精', '颜色一样',
  '价格', '交期', '打样和大货', 'PE', 'PP', 'ABS',
  '附着力', '测试', '保证', '承诺', '绝对',
];

export interface RiskDetectionResult {
  isHighRisk: boolean;
  riskKeywords: string[];
  matchedKeywords: string[];
  advice: string;
}

export function detectRiskTopic(
  customerPain?: string,
  productOrProcess?: string,
  material?: string
): RiskDetectionResult {
  const text = (customerPain || '') + ' ' + (productOrProcess || '') + ' ' + (material || '');
  const matchedKeywords: string[] = [];

  for (const keyword of HIGH_RISK_KEYWORDS) {
    if (text.includes(keyword)) {
      matchedKeywords.push(keyword);
    }
  }

  const isHighRisk = matchedKeywords.length > 0;

  return {
    isHighRisk,
    riskKeywords: HIGH_RISK_KEYWORDS,
    matchedKeywords,
    advice: isHighRisk
      ? '检测到高风险关键词：' + matchedKeywords.join('、') + '。建议补充相关知识卡后再提交审核。'
      : '',
  };
}

export function getStatusRestrictionForRisk(
  risk: RiskDetectionResult,
  hasKnowledgeCards: boolean
): { recommendedStatus: 'draft' | 'needs_rewrite' | 'discard'; reason: string } {
  if (risk.isHighRisk && !hasKnowledgeCards) {
    return {
      recommendedStatus: 'draft',
      reason: '高风险主题且未引用知识卡，不能自动进入待审核',
    };
  }
  return {
    recommendedStatus: 'draft',
    reason: '',
  };
}
