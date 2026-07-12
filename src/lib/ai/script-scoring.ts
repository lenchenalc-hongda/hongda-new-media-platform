// ===== Script Scoring: Penalty-First Short-Video Scorecard =====
// Starts at 100, deducts for real problems a 短视频口播 should avoid.
// The goal: a real factory person talking to one customer about one problem.

export interface ScoreDimension {
  name: string;
  label: string;
  maxScore: number;
  score: number;
  deduction: number;
  reason: string[];
}

export interface ScriptScoreResult {
  totalScore: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: ScoreDimension[];
  penalties: { reason: string; deduction: number }[];
  strengths: string[];
  weaknesses: string[];
  rewriteSuggestions: string[];
  recommendedStatus: 'pending_review' | 'draft' | 'needs_rewrite' | 'discard';
  riskLevel: '低' | '中' | '高';
  riskPoints: string[];
  saferExpressions: string[];
  similarityScore: number;
  similarityRisk: 'low' | 'medium' | 'high';
  wordCount: number;
  duration: string;
}

const WORD_LIMITS: Record<string, number> = {
  '15': 120,
  '30': 220,
  '60': 420,
};

const FORBIDDEN_OPENERS = [
  '很多客户问我这个问题',
  '今天统一回答一下',
  '今天给大家讲一下',
  '最近很多朋友问',
  '在视频里统一回答',
];

const FORBIDDEN_ARTICLE_WORDS = [
  '首先', '其次', '最后',
  '综上所述', '显而易见',
  '有效提升', '赋能', '助力',
  '专业解决方案', '欢迎联系我们',
  '一站式', '全方位', '闭环', '矩阵',
];

const POINT_ENUMERATORS = ['第一', '第二', '第三', '第四', '第五'];

const SAFER_EXPRESSIONS: Record<string, string> = {
  '一定能做': '需要先打样测试',
  '保证不掉': '以实际测试结果为准',
  '价格是': '具体价格需要根据材质和数量核算',
  '绝对没问题': '初步判断可行，以打样为准',
  '百分之百还原': '尽力还原，以实物确认为准',
  '颜色一模一样': '颜色会有差异，建议打样确认',
  '7天交货': '交期以实际订单确认为准',
  '最低价格': '价格根据具体方案来定',
};

const RISK_PATTERNS: { pattern: RegExp; risk: string }[] = [
  { pattern: /一定能做|肯定能做|保证能做/, risk: '乱承诺能做' },
  { pattern: /保证不掉|绝对不会掉|肯定不会掉/, risk: '乱承诺附着力' },
  { pattern: /(\d+\.?\d*)元[钱]?|(\d+\.?\d*)块钱/, risk: '报具体价格' },
  { pattern: /\d+天交货|一定交期/, risk: '承诺交期' },
  { pattern: /颜色一模一样|百分之百还原/, risk: '乱承诺颜色' },
  { pattern: /最能|最好|第一|最专业|最便宜/, risk: '绝对化表达' },
  { pattern: /永不掉|永远不掉/, risk: '乱承诺附着力' },
];

function countChars(text: string): number {
  const matches = text.match(/[\u4e00-\u9fff]/g);
  return matches ? matches.length : 0;
}

function firstNonEmptyLine(text: string): string {
  return text.split('\n').map(l => l.trim()).find(l => l.length > 0) || '';
}

function findForbidden(text: string, list: string[]): string[] {
  return list.filter(p => text.includes(p));
}

function scanRisk(script: string): { risks: string[]; level: '低' | '中' | '高'; matches: string[] } {
  const risks: string[] = [];
  const matches: string[] = [];
  for (const { pattern, risk } of RISK_PATTERNS) {
    const m = script.match(pattern);
    if (m) { risks.push(risk); matches.push(m[0]); }
  }
  const level = risks.length === 0 ? '低' : risks.length <= 2 ? '中' : '高';
  return { risks: [...new Set(risks)], level, matches: [...new Set(matches)] };
}

function isArticleStyle(script: string): boolean {
  const lines = script.split('\n').filter(l => l.trim().length > 0);
  let pointCount = 0;
  for (const pt of POINT_ENUMERATORS) {
    const re = new RegExp(pt, 'g');
    const m = script.match(re);
    if (m) pointCount += m.length;
  }
  if (pointCount >= 3) return true;
  const longLines = lines.filter(l => l.length > 50);
  if (longLines.length >= 3) return true;
  const firstLine = firstNonEmptyLine(script);
  if (FORBIDDEN_OPENERS.some(p => firstLine.includes(p)) || /在热转印行业中|随着市场发展/.test(firstLine)) return true;
  return false;
}

function countCorePoints(script: string): number {
  let explicitPoints = 0;
  for (const pt of POINT_ENUMERATORS) {
    const re = new RegExp(pt, 'g');
    const m = script.match(re);
    if (m) explicitPoints += m.length;
  }
  return explicitPoints >= 1 ? explicitPoints : 1;
}

function analyzeHook(firstLine: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  if (firstLine.includes('？') || firstLine.includes('?')) {
    if (/\d+[个只张件套条]|[热转印丝印|PP|PE|ABS|PET|材质|价格|工艺|打样|颜色|测试]/.test(firstLine)) {
      reasons.push('开头是具体客户问题'); return { score: 20, reasons };
    }
    reasons.push('开头有问题方向但可以更具体'); return { score: 14, reasons };
  }
  if (/只能|不能|为什么|怎么|但|却|其实/.test(firstLine)) {
    reasons.push('开头有场景冲突'); return { score: 16, reasons };
  }
  if (countChars(firstLine) <= 15) { reasons.push('开头短小有力'); return { score: 12, reasons }; }
  if (FORBIDDEN_OPENERS.some(p => firstLine.includes(p))) { reasons.push('开头是泛泛铺垫'); return { score: 0, reasons }; }
  reasons.push('开头不够具体'); return { score: 6, reasons };
}

function analyzeCTA(script: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const lastLines = script.split('\n').filter(l => l.trim().length > 0).slice(-3).join('');
  if (/评论区|发产品|发图片|私信我|告诉我|发给我|免费/.test(lastLines)) { reasons.push('结尾有自然转化动作'); return { score: 5, reasons }; }
  if (/评论|关注|点赞/.test(lastLines)) { reasons.push('结尾有互动引导'); return { score: 3, reasons }; }
  if (/联系|咨询|电话|微信/.test(script)) { reasons.push('结尾有联系方式引导'); return { score: 2, reasons }; }
  reasons.push('没有下一步动作引导'); return { score: 0, reasons };
}

function analyzeOralQuality(script: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let deduction = 0;
  const lines = script.split('\n').filter(l => l.trim().length > 0);
  const longCount = lines.filter(l => countChars(l) > 40).length;
  const ratio = lines.length > 0 ? longCount / lines.length : 1;
  if (ratio > 0.5) { deduction += 8; reasons.push('句子偏长，需要更短的分句'); }
  else if (ratio > 0.3) { deduction += 4; reasons.push('部分句子偏长'); }
  const oralMarkers = ['我跟你说', '说白了', '很简单', '我告诉你', '你记住', '因为', '所以', '其实', '就是', '对不对'];
  const oralCount = oralMarkers.filter(m => script.includes(m)).length;
  if (oralCount < 2) { deduction += 6; reasons.push('缺少口语化连接词'); }
  else if (oralCount >= 3) { reasons.push('语气自然口语化'); }
  if (isArticleStyle(script)) { deduction += 6; reasons.push('像文章而不像口播'); }
  return { score: Math.max(0, 20 - deduction), reasons: reasons.length > 0 ? reasons : ['口语表达自然'] };
}

export function scoreScript(script: string, duration: string = '30'): ScriptScoreResult {
  const cleanScript = script.trim();
  const wordCount = countChars(cleanScript);
  const firstLine = firstNonEmptyLine(cleanScript);
  const dimensions: ScoreDimension[] = [];
  const penalties: { reason: string; deduction: number }[] = [];

  // 1. Hook specificity (max 20)
  const hookResult = analyzeHook(firstLine);
  dimensions.push({ name: 'hook', label: '开头钩子', maxScore: 20, score: hookResult.score, deduction: 20 - hookResult.score, reason: hookResult.reasons });

  // 2. Single-point discipline (max 15)
  const corePointCount = countCorePoints(cleanScript);
  let singlePointScore = 15;
  const singlePointReasons: string[] = [];
  if (corePointCount >= 3) { singlePointScore = 0; singlePointReasons.push('讲了' + corePointCount + '个核心点，应只讲1个'); }
  else if (corePointCount >= 2) { singlePointScore = 8; singlePointReasons.push('建议聚焦1个核心点'); }
  else { singlePointReasons.push('只讲一个核心点，聚焦'); }
  for (const pt of POINT_ENUMERATORS) {
    const re = new RegExp(pt, 'g');
    const m = cleanScript.match(re);
    if (m) penalties.push({ reason: '出现"' + pt + '"枚举', deduction: -5 * m.length });
  }
  dimensions.push({ name: 'single_point', label: '单点聚焦', maxScore: 15, score: singlePointScore, deduction: 15 - singlePointScore, reason: singlePointReasons });

  // 3. Spoken naturalness (max 20)
  const oralResult = analyzeOralQuality(cleanScript);
  dimensions.push({ name: 'spoken', label: '口语化程度', maxScore: 20, score: oralResult.score, deduction: 20 - oralResult.score, reason: oralResult.reasons });

  // 4. Pain-point clarity (max 15)
  let painScore = 15;
  const painReasons: string[] = [];
  const hasWhyQuestion = /为什么|怎么|能不能|会不会|是否|如何|哪些/.test(cleanScript);
  const hasPainReference = /客户|问题|担心|怕|不懂|不会分|不知道怎么选/.test(cleanScript);
  const hasCustomerRefer = /你|您的|客户/.test(cleanScript);
  if (hasWhyQuestion && hasPainReference && hasCustomerRefer) { painReasons.push('客户痛点明确，问题导向清晰'); }
  else if (hasWhyQuestion || hasPainReference) { painScore = 10; painReasons.push('有痛点线索但不够具体'); }
  else { painScore = 3; painReasons.push('客户痛点不清晰'); }
  dimensions.push({ name: 'pain_point', label: '客户痛点清晰度', maxScore: 15, score: painScore, deduction: 15 - painScore, reason: painReasons });

  // 5. Factory reasoning logic (max 10)
  let factoryScore = 10;
  const factoryReasons: string[] = [];
  const hasReasoning = /因为|所以|由于是|取决于|判断|取决于|核心是/.test(cleanScript);
  const hasMaterialRef = /材质|材料|PP|PE|ABS|PET|表面|底材/.test(cleanScript);
  const hasProcessRef = /热转印|丝印|水转印|数码|凹印|花膜|印刷/.test(cleanScript);
  if (hasReasoning && (hasMaterialRef || hasProcessRef)) { factoryReasons.push('有工厂判断逻辑支撑'); }
  else if (hasReasoning) { factoryScore = 5; factoryReasons.push('有逻辑但缺少材质/工艺依据'); }
  else { factoryScore = 2; factoryReasons.push('缺少工厂逻辑判断'); }
  dimensions.push({ name: 'factory_logic', label: '工厂判断逻辑', maxScore: 10, score: factoryScore, deduction: 10 - factoryScore, reason: factoryReasons });

  // 6. Duration fit (max 10)
  const limit = WORD_LIMITS[duration] || 220;
  let durationScore = 10;
  const durationReasons: string[] = [];
  if (wordCount > limit) { penalties.push({ reason: duration + '秒脚本超出' + (wordCount - limit) + '字（限' + limit + '字）', deduction: -15 }); durationScore = 0; durationReasons.push('超出时长限制' + (wordCount - limit) + '字'); }
  else if (wordCount > limit * 0.8) { durationScore = 6; durationReasons.push('接近字数上限'); }
  else { durationReasons.push('字数适合' + duration + '秒'); }
  dimensions.push({ name: 'duration', label: '时长控制', maxScore: 10, score: durationScore, deduction: 10 - durationScore, reason: durationReasons });

  // 7. CTA quality (max 5)
  const ctaResult = analyzeCTA(cleanScript);
  if (ctaResult.score === 0) penalties.push({ reason: '没有下一步动作', deduction: -10 });
  dimensions.push({ name: 'cta', label: '转化动作', maxScore: 5, score: ctaResult.score, deduction: 5 - ctaResult.score, reason: ctaResult.reasons });

  // 8. Safety / Risk phrasing (max 5)
  const riskScan = scanRisk(cleanScript);
  let safetyScore = 5;
  const safetyReasons: string[] = [];
  if (riskScan.level === '高') { safetyScore = 0; safetyReasons.push('存在高风险承诺'); penalties.push({ reason: '高风险承诺表达', deduction: -15 }); }
  else if (riskScan.level === '中') { safetyScore = 2; safetyReasons.push('存在低风险表达'); penalties.push({ reason: '存在风险表达', deduction: -8 }); }
  else { safetyReasons.push('风险表达安全'); }
  dimensions.push({ name: 'safety', label: '风险表达安全', maxScore: 5, score: safetyScore, deduction: 5 - safetyScore, reason: safetyReasons });

  // ===== Additional Penalties =====
  const foundOpeners = findForbidden(cleanScript, FORBIDDEN_OPENERS);
  foundOpeners.forEach(p => penalties.push({ reason: '出现禁止开头："' + p + '"', deduction: -10 }));
  const foundArticleWords = findForbidden(cleanScript, FORBIDDEN_ARTICLE_WORDS);
  foundArticleWords.forEach(w => penalties.push({ reason: '出现书面语/空话："' + w + '"', deduction: -5 }));
  if (isArticleStyle(cleanScript)) penalties.push({ reason: '像文章不是口播', deduction: -20 });
  if (hookResult.score < 6) penalties.push({ reason: '没有具体客户问题开头', deduction: -20 });
  if (riskScan.level !== '低') penalties.push({ reason: '没有风险提醒', deduction: -5 });

  // ===== Calculate =====
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

  // ===== Status =====
  let recommendedStatus: 'pending_review' | 'draft' | 'needs_rewrite' | 'discard';
  if (totalScore >= 85 && riskScan.level !== '高') recommendedStatus = 'pending_review';
  else if (totalScore >= 70) recommendedStatus = 'draft';
  else if (totalScore >= 60) recommendedStatus = 'needs_rewrite';
  else recommendedStatus = 'discard';

  // ===== Strengths & Weaknesses =====
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const rewriteSuggestions: string[] = [];
  dimensions.forEach(d => {
    if (d.score >= d.maxScore * 0.8) strengths.push(d.label + '：' + d.reason.join('、'));
    else if (d.score < d.maxScore * 0.4) { weaknesses.push(d.label + '不足：' + d.reason.join('、')); rewriteSuggestions.push(suggestImprovement(d.name)); }
  });
  penalties.forEach(p => { if (p.deduction <= -10) weaknesses.push(p.reason); });
  if (totalScore < 70) rewriteSuggestions.push('考虑缩短到单点切入，去掉多余内容');
  if (riskScan.level !== '低') rewriteSuggestions.push('修正风险表达，确保不承诺具体价格/交期');

  const saferExpressions: string[] = [];
  for (const [original, safer] of Object.entries(SAFER_EXPRESSIONS)) {
    if (cleanScript.includes(original)) saferExpressions.push('"' + original + '" → "' + safer + '"');
  }

  return {
    totalScore, grade, dimensions, penalties,
    strengths: [...new Set(strengths)].slice(0, 5),
    weaknesses: [...new Set(weaknesses)].slice(0, 5),
    rewriteSuggestions: [...new Set(rewriteSuggestions)].slice(0, 5),
    recommendedStatus, riskLevel: riskScan.level,
    riskPoints: riskScan.risks, saferExpressions,
    similarityScore: 0, similarityRisk: 'low' as const,
    wordCount, duration,
  };
}

function suggestImprovement(name: string): string {
  switch (name) {
    case 'hook': return '用具体客户问题或冲突场景开头，比如"500个杯子，真的不能做热转印吗？"';
    case 'single_point': return '一条视频只讲一个核心判断，不要堆三点以上';
    case 'spoken': return '用更短的句子，加入"我跟你说"、"说白了"等人话连接词';
    case 'pain_point': return '明确点出客户的具体问题，比如"客户只发一张瓶子图..."';
    case 'factory_logic': return '加入工厂判断逻辑，比如"因为PE材质表面能低..."';
    case 'duration': return '压缩字数到适合时长的范围';
    case 'cta': return '结尾加上自然引导，如"把材质、数量发我，我帮你判断"';
    case 'safety': return '去掉"保证"、"绝对"等承诺词，加上"以实际打样为准"';
    default: return '根据评分优化';
  }
}

export function batchScoreScripts(scripts: { script: string; duration: string; title: string }[]): ScriptScoreResult[] {
  return scripts.map(s => scoreScript(s.script, s.duration));
}

// Verification: bad script should score below 70
const BAD_SCRIPT = `客户常见问题?今天给你说清楚。很多客户问我这个问题，今天就在视频里统一回答一下。第一，你要先看产品材质。第二，数量也很重要。第三，先打样。`;
export function verifyBadScript(): ScriptScoreResult { return scoreScript(BAD_SCRIPT, '15'); }
console.log('[scoring] Bad script =', verifyBadScript().totalScore, 'pts,', verifyBadScript().grade, 'grade');
console.log('[scoring] Weaknesses:', verifyBadScript().weaknesses);
