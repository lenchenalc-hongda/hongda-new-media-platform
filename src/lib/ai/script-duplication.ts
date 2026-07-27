// ===== 历史重复度检查 =====
// 检查新脚本与同账号历史脚本的重复度

export interface DuplicationCheckRequest {
  accountId: string;
  hook: string;
  topic?: string;
  corePoint?: string;
  scriptText: string;
  ctaText?: string;
}

export interface DuplicationCheckResult {
  passed: boolean;
  duplicateRate: number;
  warnings: string[];
  similarScripts: { id?: string; score: number; reason: string }[];
}

// ===== 本地重复度算法 =====

function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  var aLen = a.length;
  var bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  // Simple character bigram overlap
  var aBigrams = new Set<string>();
  for (var i = 0; i < aLen - 1; i++) {
    aBigrams.add(a.slice(i, i + 2));
  }
  var matchCount = 0;
  for (var j = 0; j < bLen - 1; j++) {
    if (aBigrams.has(b.slice(j, j + 2))) matchCount++;
  }
  var total = aLen + bLen - 2;
  return total > 0 ? matchCount / total : 0;
}

// ===== 重复度检查 =====

export function checkScriptDuplication(
  req: DuplicationCheckRequest,
  recentScripts: { hook?: string; topic?: string; main_script?: string; cta?: string }[],
): DuplicationCheckResult {
  var warnings: string[] = [];
  var similarScripts: { id?: string; score: number; reason: string }[] = [];
  var maxDuplicateRate = 0;

  for (var i = 0; i < recentScripts.length; i++) {
    var rs = recentScripts[i];
    var score = 0;
    var reasons: string[] = [];

    // Hook similarity
    if (req.hook && rs.hook) {
      var hookSim = textSimilarity(req.hook, rs.hook);
      if (hookSim > 0.5) {
        score += hookSim * 40;
        reasons.push('钩子相似度' + Math.round(hookSim * 100) + '%');
      }
    }

    // Topic similarity
    if (req.topic && rs.topic) {
      var topicSim = textSimilarity(req.topic, rs.topic);
      if (topicSim > 0.4) {
        score += topicSim * 30;
        reasons.push('选题相似度' + Math.round(topicSim * 100) + '%');
      }
    }

    // Script text similarity
    if (req.scriptText && rs.main_script) {
      var scriptSim = textSimilarity(req.scriptText, rs.main_script);
      if (scriptSim > 0.3) {
        score += scriptSim * 30;
        if (scriptSim > 0.6) {
          reasons.push('正文高度相似' + Math.round(scriptSim * 100) + '%');
        }
      }
    }

    if (score > 0) {
      similarScripts.push({ id: (rs as any).id, score: Math.round(score), reason: reasons.join('、') });
      if (score > maxDuplicateRate) maxDuplicateRate = score;
    }
  }

  // Sort by score descending
  similarScripts.sort(function(a, b) { return b.score - a.score; });

  // Check content pillar balance
  var passed = maxDuplicateRate < 50;
  if (!passed) {
    warnings.push('与历史脚本重复度过高（' + maxDuplicateRate + '%）');
  }

  return {
    passed: passed,
    duplicateRate: maxDuplicateRate,
    warnings: warnings,
    similarScripts: similarScripts.slice(0, 5),
  };
}

// ===== Mock 历史脚本存储（空实现 — 后续接数据库） =====

var recentScriptsStore: Record<string, { hook?: string; topic?: string; main_script?: string; cta?: string }[]> = {};

export function recordScriptForDuplicationCheck(
  accountId: string,
  script: { hook?: string; topic?: string; main_script?: string; cta?: string },
): void {
  if (!recentScriptsStore[accountId]) {
    recentScriptsStore[accountId] = [];
  }
  recentScriptsStore[accountId].unshift(script);
  // Keep only last 50
  if (recentScriptsStore[accountId].length > 50) {
    recentScriptsStore[accountId] = recentScriptsStore[accountId].slice(0, 50);
  }
}

export function getRecentScripts(accountId: string, count?: number): { hook?: string; topic?: string; main_script?: string; cta?: string }[] {
  var scripts = recentScriptsStore[accountId] || [];
  return scripts.slice(0, count || 30);
}
