// ===== Account Memory =====
// Tracks recent scripts, effective hooks, and weak phrases per account.
// Helps avoid repeating the same content automatically.

export interface AccountMemory {
  accountId: string;
  recentScripts: { script: string; hook: string; score: number; timestamp: number }[];
  recentHooks: string[];
  weakPhrases: string[];
  effectivePhrases: string[];
  lastTopics: string[];
  generatedCount: number;
}

// ===== In-Memory Store =====

class InMemoryAccountMemory {
  private store = new Map<string, AccountMemory>();

  getOrCreate(accountId: string): AccountMemory {
    if (!this.store.has(accountId)) {
      this.store.set(accountId, {
        accountId, recentScripts: [], recentHooks: [],
        weakPhrases: ['很多客户问我这个问题', '今天统一回答一下', '今天给大家讲一下',
          '最近很多朋友问', '大家都知道', '在热转印行业中', '随着市场发展',
          '首先', '其次', '最后', '综上所述', '显而易见', '有效提升',
          '赋能', '助力', '专业解决方案', '欢迎联系我们', '一站式', '全方位',
          '闭环', '矩阵', '第一', '第二', '第三'],
        effectivePhrases: ['你把材质、数量发我', '发产品图片和数量', '寄样免费测'],
        lastTopics: [], generatedCount: 0,
      });
    }
    return this.store.get(accountId)!;
  }

  recordGeneration(accountId: string, script: string, hook: string, score: number, topic?: string): void {
    const mem = this.getOrCreate(accountId);
    mem.recentScripts.unshift({ script, hook, score, timestamp: Date.now() });
    if (mem.recentScripts.length > 50) mem.recentScripts.pop();
    mem.recentHooks.unshift(hook);
    if (mem.recentHooks.length > 30) mem.recentHooks.pop();
    if (topic) {
      mem.lastTopics.unshift(topic);
      if (mem.lastTopics.length > 20) mem.lastTopics.pop();
    }
    mem.generatedCount++;
  }

  getRecentScripts(accountId: string, count = 20): any[] {
    return this.getOrCreate(accountId).recentScripts.slice(0, count);
  }

  getRecentHooks(accountId: string, count = 10): string[] {
    return this.getOrCreate(accountId).recentHooks.slice(0, count);
  }

  getWeakPhrases(accountId: string): string[] {
    return this.getOrCreate(accountId).weakPhrases;
  }

  addWeakPhrase(accountId: string, phrase: string): void {
    const mem = this.getOrCreate(accountId);
    if (!mem.weakPhrases.includes(phrase)) mem.weakPhrases.push(phrase);
  }
}

export const accountMemory = new InMemoryAccountMemory();

// ===== Convenience =====

export function getSimilarityAdvisory(accountId: string, script: string, hook: string): {
  isRepeatTopic: boolean;
  recentHookMatch: number;
  advisoryScore: number;
} {
  const mem = accountMemory.getOrCreate(accountId);
  const recentHooks = mem.recentHooks;
  const hookBigrams = new Set(hook.replace(/[^\u4e00-\u9fff]/g, ''));
  let maxMatch = 0;
  for (const rh of recentHooks.slice(0, 5)) {
    const rhBigrams = new Set(rh.replace(/[^\u4e00-\u9fff]/g, ''));
    const intersection = [...hookBigrams].filter(x => rhBigrams.has(x));
    const similarity = hookBigrams.size > 0 ? intersection.length / hookBigrams.size : 0;
    if (similarity > maxMatch) maxMatch = similarity;
  }
  return {
    isRepeatTopic: maxMatch > 0.8,
    recentHookMatch: maxMatch,
    advisoryScore: maxMatch > 0.8 ? 0.85 : maxMatch > 0.6 ? 0.70 : 0,
  };
}
