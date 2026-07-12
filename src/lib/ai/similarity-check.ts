// ===== Similarity Check =====
// Compares a script against recent scripts to avoid generating the same content.
// Uses trigram/Jaccard similarity for now (embeddings later).

export interface SimilarityResult {
  score: number;         // 0-1, higher = more similar
  risk: 'low' | 'medium' | 'high';
  matches: {             // Top 3 most similar scripts
    index: number;
    similarity: number;
    hook?: string;
    snippet?: string;
  }[];
  advice: string;
}

function extractBigrams(text: string): Set<string> {
  const chars = text.replace(/[^\u4e00-\u9fff]/g, '');
  const bigrams = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) {
    bigrams.add(chars[i] + chars[i + 1]);
  }
  if (chars.length > 0) bigrams.add(chars);
  return bigrams;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

export function computeSimilarity(
  script: string,
  recentScripts: { script?: string; hook?: string; title?: string }[]
): SimilarityResult {
  const currentBigrams = extractBigrams(script);
  if (currentBigrams.size === 0) {
    return { score: 0, risk: 'low', matches: [], advice: '无法计算相似度' };
  }

  const scored = recentScripts.slice(0, 20).map((s, i) => {
    const text = (s.script || '') + (s.hook || '') + (s.title || '');
    const bigrams = extractBigrams(text);
    return {
      index: i, similarity: jaccardSimilarity(currentBigrams, bigrams),
      hook: s.hook, snippet: text.slice(0, 30),
    };
  }).sort((a, b) => b.similarity - a.similarity);

  const topScore = scored[0]?.similarity || 0;
  const top3 = scored.slice(0, 3);

  let risk: 'low' | 'medium' | 'high';
  let advice: string;
  if (topScore > 0.85) {
    risk = 'high';
    advice = '与已有脚本高度相似，建议更换切入角度';
  } else if (topScore > 0.70) {
    risk = 'medium';
    advice = '与已有脚本部分相似，建议调整开头';
  } else {
    risk = 'low';
    advice = '无显著相似问题';
  }

  return { score: topScore, risk, matches: top3, advice };
}

export function computeSimilarityPenalty(script: string, recentScripts: any[]): { deduction: number; reason: string } {
  const result = computeSimilarity(script, recentScripts);
  if (result.risk === 'high') {
    return { deduction: -15, reason: '与已有脚本高度相似（' + (result.score * 100).toFixed(0) + '%）' };
  }
  if (result.risk === 'medium') {
    return { deduction: -8, reason: '与已有脚本部分相似' };
  }
  return { deduction: 0, reason: '' };
}
