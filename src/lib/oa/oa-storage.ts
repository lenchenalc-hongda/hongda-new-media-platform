// ===== OA 公众号数据同步工具 =====
// 基于 site_data/Supabase 同步机制，类似脚本工厂的数据持久化方式

import { usePersistentState, STORAGE_KEYS } from '@/lib/storage';

// ===== OA 专用存储键名（注册到全局 STORAGE_KEYS 风格） =====
export const OA_STORAGE_KEYS = {
  SOURCE_CARDS: 'hongda_oa_source_cards',
  ARTICLE_DRAFTS: 'hongda_oa_article_drafts',
  ARTICLE_STRATEGIES: 'hongda_oa_article_strategies',
  TEMPLATES: 'hongda_oa_templates',
  ARTICLE_METRICS: 'hongda_oa_article_metrics',
  ARTICLE_REVIEWS: 'hongda_oa_article_reviews',
};

// ===== 冲突合并工具：按 updatedAt 新者覆盖 =====

export function mergeOADataByUpdatedAt<T extends { id: string; updatedAt?: string }>(
  local: T[],
  remote: T[],
): T[] {
  const map = new Map<string, T>();

  for (const item of local) {
    map.set(item.id, item);
  }

  for (const item of remote) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else if (item.updatedAt && existing.updatedAt) {
      // 较新的覆盖
      if (item.updatedAt > existing.updatedAt) {
        map.set(item.id, item);
      }
    } else {
      // 没有时间戳，远程优先
      map.set(item.id, item);
    }
  }

  return Array.from(map.values());
}

// ===== React Hook：OA 数据持久化 =====
// 基于 usePersistentState，但返回额外状态信息

export interface OASyncStatus {
  ready: boolean;
  lastSyncTime: string;
  source: 'local' | 'remote' | 'synced';
}

export function useOAStorage<T extends { id: string; updatedAt?: string }>(
  storageKey: string,
  fallback: T[],
): [T[], (update: T[] | ((prev: T[]) => T[])) => void, OASyncStatus] {
  const [data, setPersisted, ready, lastSyncTime] = usePersistentState<T>(storageKey, fallback);

  const source: OASyncStatus['source'] = lastSyncTime && lastSyncTime > new Date(0).toISOString()
    ? (ready ? 'synced' : 'remote')
    : 'local';

  return [
    data,
    setPersisted,
    { ready, lastSyncTime, source },
  ];
}

// ===== 便捷的原始读写函数 =====
import { loadData, saveData } from '@/lib/storage';

export function loadOAData<T>(key: string, fallback: T[]): T[] {
  return loadData(key, fallback);
}

export function saveOAData<T>(key: string, value: T[]): void {
  saveData(key, value);
}
