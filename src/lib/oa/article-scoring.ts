// ===== 文章评分引擎 =====
export interface ArticleScoreResult {
  totalScore: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  dimensions: { name: string; label: string; score: number; maxScore: number; reason: string[] }[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  riskLevel: '低' | '中' | '高';
}

export function scoreArticle(text: string, articleType: string): ArticleScoreResult {
  const dims = [
    { name: 'structure', label: '结构清晰度', score: 0, maxScore: 20, reason: ['评估中...'] },
    { name: 'brand_voice', label: '品牌风格一致性', score: 0, maxScore: 20, reason: ['评估中...'] },
    { name: 'knowledge_basis', label: '知识依据充分性', score: 0, maxScore: 20, reason: ['评估中...'] },
    { name: 'safety', label: '风险表达安全性', score: 0, maxScore: 15, reason: ['评估中...'] },
    { name: 'readability', label: '可读性', score: 0, maxScore: 15, reason: ['评估中...'] },
    { name: 'layout', label: '排版完成度', score: 0, maxScore: 10, reason: ['评估中...'] },
  ];

  // Rule-based scoring
  const lines = text.split('\n').filter(l => l.trim());
  const paraCount = lines.length;
  
  // Structure: has headings, proper paragraphs
  const hasH2 = text.includes('## ') || text.includes('**');
  const hasIntro = text.includes('导语') || paraCount >= 3;
  const hasCTA = /免费|打样|咨询|寄样|评估/.test(text);
  const hasSig = /宏达|印业/.test(text);
  
  dims[0].score = (hasH2 ? 10 : 3) + (hasIntro ? 5 : 2) + (paraCount > 3 ? 5 : 1);
  dims[0].score = Math.min(dims[0].score, 20);
  dims[0].reason = [hasH2 ? '有小标题结构' : '缺少小标题', paraCount > 3 ? '段落数量合理' : '段落偏少'];

  // Brand voice
  const violated = ['全国最好', '绝对不掉', '完全一致', '闭眼选', '行业第一', '最便宜', '保证不掉', '100%'];
  const violations = violated.filter(w => text.includes(w));
  dims[1].score = violations.length === 0 ? 18 : 5;
  dims[1].reason = violations.length === 0 ? ['品牌风格一致'] : [`发现${violations.length}处违规表达`];

  // Knowledge basis
  const hasSpecific = /材质|PE|PP|ABS|温度|附着力|测试|花膜|胶水|数码|凹印/.test(text);
  dims[2].score = hasSpecific ? 16 : 5;
  dims[2].reason = [hasSpecific ? '有工艺/材质依据' : '缺少具体工艺依据'];

  // Safety
  dims[3].score = violations.length === 0 ? 13 : 3;
  dims[3].reason = [violations.length === 0 ? '风险表达安全' : '存在风险承诺'];

  // Readability
  const longLines = lines.filter(l => l.length > 80).length;
  const longRatio = paraCount > 0 ? longLines / paraCount : 0;
  dims[4].score = longRatio > 0.5 ? 5 : longRatio > 0.2 ? 10 : 14;
  dims[4].reason = [longRatio > 0.5 ? '句子偏长' : '可读性良好'];

  // Layout
  dims[5].score = (hasSig ? 4 : 0) + (hasCTA ? 3 : 0) + (hasH2 ? 3 : 0);
  dims[5].reason = [hasSig ? '有品牌署名' : '缺少品牌署名', hasCTA ? '有引导CTA' : '缺少CTA'];

  const totalScore = dims.reduce((s, d) => s + d.score, 0);
  const grade = totalScore >= 90 ? 'S' : totalScore >= 80 ? 'A' : totalScore >= 70 ? 'B' : totalScore >= 60 ? 'C' : 'D';
  const riskLevel = violations.length > 2 ? '高' : violations.length > 0 ? '中' : '低';

  const strengths = dims.filter(d => d.score >= d.maxScore * 0.7).map(d => `${d.label}：${d.reason[0]}`);
  const weaknesses = dims.filter(d => d.score < d.maxScore * 0.5).map(d => `${d.label}不足`);
  const suggestions = weaknesses.map(w => `改进${w}`);

  return { totalScore, grade, dimensions: dims, strengths, weaknesses, suggestions, riskLevel };
}
