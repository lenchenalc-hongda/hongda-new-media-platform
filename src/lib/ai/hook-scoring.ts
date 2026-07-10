// ===== Hook Scorer =====
// Scores hooks from "short-video hook quality" perspective, not copywriting.
// Penalty-first: starts at 100, deducts for real problems.

import { HookCandidate, HookType, TensionType } from './hook-generator';

export interface HookScoreResult {
  hook: HookCandidate;
  totalScore: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: {
    name: string;
    label: string;
    maxScore: number;
    score: number;
    reason: string[];
  }[];
  penalties: { reason: string; deduction: number }[];
  strengths: string[];
  weaknesses: string[];
  rank: number;
}

const FORBIDDEN_PHRASES = [
  '很多客户问我这个问题',
  '今天统一回答一下',
  '今天给大家讲一下',
  '最近很多朋友问',
  '这个问题',
  '在热转印行业中',
  '随着市场发展',
  '众所周知',
  '首先',
  '其次',
  '最后',
  '综上所述',
  '第一',
  '第二',
  '第三',
  '欢迎联系我们',
];

const HOOK_TYPE_STRENGTH: Record<HookType, number> = {
  direct_question: 8,
  customer_quote: 9,
  warning: 7,
  counterintuitive: 9,
  cost_conflict: 8,
  material_risk: 7,
  test_risk: 8,
  comparison: 6,
  factory_secret: 8,
  comment_reply: 7,
  boss_experience: 7,
  nini_perspective: 5,
};

const TENSION_TYPE_STRENGTH: Record<TensionType, number> = {
  price: 8,
  can_or_cannot: 9,
  fear_of_failure: 9,
  cost_waste: 7,
  quality_risk: 8,
  time_delay: 6,
  wrong_assumption: 7,
  before_after: 5,
};

function countChars(text: string): number {
  const matches = text.match(/[\u4e00-\u9fff]/g);
  return matches ? matches.length : 0;
}

function findForbidden(text: string): string[] {
  return FORBIDDEN_PHRASES.filter(p => text.includes(p));
}

function hasConcreteProblem(hookText: string): boolean {
  const concreteMarkers = [
    /\d+[个只张件套条]/, // 数量词
    /PE|PP|ABS|PET|玻璃|陶瓷|不锈钢|塑料/, // 材质词
    /多少钱|报价|价格|成本/, // 价格词
    /能不能|会不会|可不可以/, // 能力词
    /热转印|丝印|花膜|印刷|打样/, // 工艺词
    /不掉|附着力|测试|耐酒精|洗碗机/, // 测试词
    /颜色|色差|图片/, // 颜色词
    /客户|老板|厂家|工厂/, // 角色词
  ];
  return concreteMarkers.some(m => m.test(hookText));
}

function hasConflictPoint(hookText: string): boolean {
  const conflictMarkers = [
    /但|却|不过|只是|然而/,
    /不能|不敢|不想|不要|不是/,
    /风险|坑|问题|误区|区别/,
    /为什么|怎么|怎么办/,
    /最怕|最担心|最大的/,
  ];
  return conflictMarkers.some(m => m.test(hookText));
}

function hasGenericQuestion(hookText: string): boolean {
  const genericQuestions = [
    '你知道', '你知道吗', '你了解', '你了解吗',
    '大家知道', '大家知道吗', '有没有人知道',
    '有没有', '是不是', '要不要', '行不行',
  ];
  return genericQuestions.some(q => hookText.includes(q));
}

function isCustomerQuoteOrDialogue(hookText: string): boolean {
  return hookText.includes('"') || hookText.includes('"') || hookText.includes('「') || hookText.includes('」') || hookText.includes('：');
}

function hasSpecificScene(hookText: string): boolean {
  const sceneMarkers = [
    /500|100|10个|20个|50个/, // 数量
    /只发一张图|只看图片|只说/, // 场景
    /刚入行|第一次|做了20年/, // 经历
    /之前|上次|去年/, // 时间
  ];
  return sceneMarkers.some(m => m.test(hookText));
}

function hasRiskWord(hookText: string): boolean {
  const riskWords = ['风险', '坑', '翻车', '问题', '注意', '小心', '不能', '不敢', '别'];
  return riskWords.some(w => hookText.includes(w));
}

function getHookTypeText(hookType: HookType): string {
  return {
    direct_question: 'direct_question', customer_quote: 'customer_quote',
    warning: 'warning', counterintuitive: 'counterintuitive',
    cost_conflict: 'cost_conflict', material_risk: 'material_risk',
    test_risk: 'test_risk', comparison: 'comparison',
    factory_secret: 'factory_secret', comment_reply: 'comment_reply',
    boss_experience: 'boss_experience', nini_perspective: 'nini_perspective',
  }[hookType];
}

/** Score a single hook candidate. Returns 0-100 score with breakdown. */
export function scoreHook(hook: HookCandidate, context?: { pain?: string; product?: string }): HookScoreResult {
  const text = hook.hookText.trim();
  const chineseChars = countChars(text);
  const dimensions: HookScoreResult['dimensions'] = [];
  const penalties: { reason: string; deduction: number }[] = [];

  // ===== Dimension 1: Specificity (max 30) =====
  let specificityScore = 30;
  const specificityReasons: string[] = [];
  if (chineseChars > 28) {
    specificityScore -= 10;
    specificityReasons.push('钩子超过28字');
  }
  if (chineseChars < 8) {
    specificityScore -= 5;
    specificityReasons.push('钩子太短，不够具体');
  }
  if (hasConcreteProblem(text)) {
    specificityReasons.push('包含具体客户问题');
  } else if (hasGenericQuestion(text)) {
    specificityScore -= 15;
    specificityReasons.push('钩子太泛，没有具体问题');
    penalties.push({ reason: '泛泛提问如"你知道…"', deduction: -15 });
  } else {
    specificityScore -= 8;
    specificityReasons.push('缺少具体客户问题');
  }
  if (hasSpecificScene(text)) {
    specificityReasons.push('有具体场景数字');
    specificityScore = Math.min(specificityScore + 3, 30);
  }
  dimensions.push({ name: 'specificity', label: '具体性', maxScore: 30, score: Math.max(0, specificityScore), reason: specificityReasons });

  // ===== Dimension 2: Conflict Strength (max 25) =====
  let conflictScore = 25;
  const conflictReasons: string[] = [];
  if (hasConflictPoint(text)) {
    conflictReasons.push('有明确的冲突点');
    const typeBoost = (HOOK_TYPE_STRENGTH[hook.hookType] || 5) / 10;
    const tensionBoost = (TENSION_TYPE_STRENGTH[hook.tensionType] || 5) / 10;
    conflictScore = Math.min(25, Math.round(15 + typeBoost * 5 + tensionBoost * 5));
  } else {
    conflictScore = 8;
    conflictReasons.push('缺少冲突或反转');
    penalties.push({ reason: '没有冲突点', deduction: -17 });
  }
  if (isCustomerQuoteOrDialogue(text)) {
    conflictReasons.push('客户原话增强冲突感');
    conflictScore = Math.min(conflictScore + 2, 25);
  }
  dimensions.push({ name: 'conflict', label: '冲突强度', maxScore: 25, score: conflictScore, reason: conflictReasons });

  // ===== Dimension 3: Spoken Naturalness (max 20) =====
  let spokenScore = 20;
  const spokenReasons: string[] = [];
  const forbiddenFound = findForbidden(text);
  if (forbiddenFound.length > 0) {
    spokenScore -= 15;
    spokenReasons.push('出现禁止表达："' + forbiddenFound.join('、') + '"');
    penalties.push({ reason: '出现禁止表达', deduction: -15 });
  }
  if (text.length < 50 && !text.includes('，') && !text.includes('。')) {
    spokenReasons.push('短促有力，像日常说话');
  } else if (text.length > 80) {
    spokenScore -= 5;
    spokenReasons.push('钩子偏长');
  }
  if (text.endsWith('？') || text.endsWith('?') || text.endsWith('。') || text.endsWith('！') || text.endsWith('!')) {
    spokenReasons.push('语气自然');
  } else {
    spokenScore -= 3;
    spokenReasons.push('缺少自然语气结尾');
  }
  const hasQuoteMarks = text.startsWith('「') || text.startsWith('"') || text.startsWith('"');
  if (hasQuoteMarks && text.endsWith('」') || text.endsWith('"') || text.endsWith('"')) {
    spokenReasons.push('引用客户原话，口语自然');
  }
  if (/说白了|我跟你说|我告诉你|你记住/.test(text)) {
    spokenScore = Math.min(spokenScore + 2, 20);
  }
  dimensions.push({ name: 'spoken', label: '口语化', maxScore: 20, score: Math.max(0, spokenScore), reason: spokenReasons });

  // ===== Dimension 4: CTA Potential (max 15) =====
  let ctaScore = 15;
  const ctaReasons: string[] = [];
  if (/怎么办|怎么回|怎么处理|怎么选|怎么判断/.test(text)) {
    ctaReasons.push('问题导向，自然引出后续内容');
  } else if (text.includes('？') || text.includes('吗')) {
    ctaScore = 10;
    ctaReasons.push('以提问结束，可自然承接');
  } else {
    ctaScore = 5;
    ctaReasons.push('不是提问式结尾，需注意承接');
    penalties.push({ reason: '不是问题结尾', deduction: -5 });
  }
  dimensions.push({ name: 'cta', label: '转化引导', maxScore: 15, score: ctaScore, reason: ctaReasons });

  // ===== Dimension 5: Risk Safety (max 10) =====
  let riskScore = 10;
  const riskReasons: string[] = [];
  if (hasRiskWord(text)) {
    riskReasons.push('有风险/警告意识');
  } else {
    riskScore = 6;
    riskReasons.push('缺少风险视角');
  }
  if (hook.riskNotes) {
    riskScore = Math.min(riskScore + 2, 10);
  }
  const riskPatterns = [/保证.*能|一定.*可以|绝对.*没问题/, /\d+[元].*价格/];
  for (const pattern of riskPatterns) {
    if (pattern.test(text)) {
      riskScore = Math.max(0, riskScore - 8);
      riskReasons.push('含承诺性表达');
      penalties.push({ reason: '含承诺表达', deduction: -8 });
    }
  }
  dimensions.push({ name: 'safety', label: '表达安全', maxScore: 10, score: riskScore, reason: riskReasons });

  // ===== Calculate Total =====
  const dimensionSum = dimensions.reduce((sum, d) => sum + d.score, 0);
  const penaltySum = penalties.reduce((sum, p) => sum + p.deduction, 0);
  const totalScore = Math.max(0, Math.min(100, dimensionSum + penaltySum));

  // ===== Grade =====
  let grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  if (totalScore >= 90) grade = 'S';
  else if (totalScore >= 80) grade = 'A';
  else if (totalScore >= 70) grade = 'B';
  else if (totalScore >= 60) grade = 'C';
  else if (totalScore >= 40) grade = 'D';
  else grade = 'F';

  // ===== Strengths & Weaknesses =====
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  dimensions.forEach(d => {
    if (d.score >= d.maxScore * 0.75) strengths.push(d.label + '：' + d.reason.join('、'));
    else if (d.score < d.maxScore * 0.4) weaknesses.push(d.label + '不足：' + d.reason.join('、'));
  });
  penalties.forEach(p => {
    if (p.deduction <= -10) weaknesses.push(p.reason);
  });
  const similarity = hook.similarityToRecentScripts || 0;
  if (similarity > 0.65) weaknesses.push('与已有脚本钩子相似度高（' + Math.round(similarity * 100) + '%）');

  return {
    hook,
    totalScore,
    grade,
    dimensions,
    penalties,
    strengths: [...new Set(strengths)].slice(0, 3),
    weaknesses: [...new Set(weaknesses)].slice(0, 3),
    rank: 0,
  };
}

/** Score all hooks and return ranked results. */
export function scoreAndRankHooks(
  hooks: HookCandidate[],
  context?: { pain?: string; product?: string }
): { results: HookScoreResult[]; top3: HookScoreResult[]; top5: HookScoreResult[] } {
  const results = hooks
    .map(h => scoreHook(h, context))
    .sort((a, b) => b.totalScore - a.totalScore);

  results.forEach((r, i) => { r.rank = i + 1; });

  // Deduplicate by hook text similarity
  const seen = new Set<string>();
  const deduped = results.filter(r => {
    const key = r.hook.hookText.slice(0, 12);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    results: deduped,
    top3: deduped.slice(0, 3),
    top5: deduped.slice(0, 5),
  };
}

/** Get suggestions for low-score hooks */
export function getHookImprovementSuggestions(hook: HookScoreResult): string[] {
  const suggestions: string[] = [];
  const text = hook.hook.hookText;
  if (text.length > 28) suggestions.push('缩短到28字以内');
  if (!text.includes('？') && !text.includes('?')) suggestions.push('用问题结尾更吸引');
  if (!hasConcreteProblem(text)) suggestions.push('加入具体材质、数量或价格信息');
  if (!hasConflictPoint(text)) suggestions.push('加入冲突或反转，如"不能直接回答"');
  if (findForbidden(text).length > 0) suggestions.push('去掉"' + findForbidden(text).join('、') + '"等空话');
  if (!/\d+[个只张件套条]/.test(text)) suggestions.push('加入具体数字增强说服力');
  if (hook.hook.hookType === 'nini_perspective') suggestions.push('新手视角类钩子推荐小林/小陈账号');
  return suggestions.slice(0, 3);
}

export function formatHookForDisplay(hook: HookScoreResult): string {
  const prefix = hook.rank <= 3 ? '🏆' : hook.rank <= 5 ? '⭐' : '—';
  return `${prefix} [${hook.grade}] ${hook.hook.hookText} (${hook.totalScore}分)`;
}
