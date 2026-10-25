/**
 * CPC potential value assessment is subjective and explicitly review-gated.
 * Keep it separate from actual cash receipts and A/B/C relationship cadence.
 */
export const POTENTIAL_RATING_FIELDS = [
  'purchase_scope',
  'process_fit',
  'project_evidence',
  'decision_access',
  'repeat_value',
] as const;

export type PotentialRatingField = typeof POTENTIAL_RATING_FIELDS[number];

export const POTENTIAL_RATING_WEIGHTS: Record<PotentialRatingField, number> = {
  purchase_scope: 30,
  process_fit: 25,
  project_evidence: 20,
  decision_access: 15,
  repeat_value: 10,
};

export type PotentialRatingScores = Record<PotentialRatingField, number>;
export type PotentialRatingGrade = 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'N';
export type PotentialRatingStatus = 'draft' | 'pending_review' | 'approved' | 'changes_requested';

export function calculatePotentialRating(scores: PotentialRatingScores): {
  score: number;
  grade: Exclude<PotentialRatingGrade, 'N'>;
} {
  let total = 0;
  for (const field of POTENTIAL_RATING_FIELDS) {
    const value = scores[field];
    if (!Number.isInteger(value) || value < 0 || value > 5) {
      throw new RangeError('潜力评分必须为 0–5 的整数');
    }
    total += value * POTENTIAL_RATING_WEIGHTS[field] / 5;
  }
  const grade = total >= 90 ? 'SS'
    : total >= 80 ? 'S'
      : total >= 70 ? 'A'
        : total >= 55 ? 'B'
          : total >= 35 ? 'C' : 'D';
  return { score: total, grade };
}

export const POTENTIAL_RATING_DIMENSIONS: {
  key: PotentialRatingField;
  name: string;
  description: string;
}[] = [
  { key: 'purchase_scope', name: '可开发采购规模', description: '未来12个月有证据可争取的年采购额，而非客户整体营业额' },
  { key: 'process_fit', name: '工艺与产品匹配', description: '宏达实际可交付的花膜、热转印加工、设备和其他适用工艺' },
  { key: 'project_evidence', name: '实际项目机会', description: '客户需求、产品、预计数量、打样或采购时间表' },
  { key: 'decision_access', name: '关系与决策触达', description: '是否能联系采购、技术及实际决策人' },
  { key: 'repeat_value', name: '长期合作复购', description: '稳定消耗、毛利、持续合作与扩品可能' },
];

/**
 * Use the last APPROVED grade for company reporting. Pending/draft scores
 * must never appear as a verified P grade.
 */
export function publishedPotentialGrade(input: {
  publishedGrade: PotentialRatingGrade | null | undefined;
} | null | undefined): PotentialRatingGrade {
  return input?.publishedGrade ?? 'N';
}

export function customerSalesStrategy(
  actual: 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'N',
  potential: PotentialRatingGrade,
): { label: string; action: string } {
  if (actual === 'N' || potential === 'N') {
    return { label: '待补充评级证据', action: '补齐财务回款或客户潜力资料，暂不推断客户价值。' };
  }
  const highActual = actual === 'SS' || actual === 'S' || actual === 'A';
  const highPotential = potential === 'SS' || potential === 'S' || potential === 'A';
  if (highActual && highPotential) return { label: '核心战略客户', action: '维护现有收入和交付品质，识别更多可转化的产品线。' };
  if (!highActual && highPotential) return { label: '重点突破客户', action: '明确打样/技术评估、采购切入计划、下一步负责人及日期。' };
  if (highActual) return { label: '稳定维护客户', action: '关注复购、售后、品质与流失风险，不虚构新需求。' };
  return { label: '常规经营客户', action: '标准化维护，有明确机会时再投入更多资源。' };
}
