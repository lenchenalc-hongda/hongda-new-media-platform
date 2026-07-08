'use client';
import { useState, useCallback, useEffect, useRef } from 'react';

// ===== 存储键名 =====
export const STORAGE_KEYS = {
  ACCOUNTS: 'hongda_accounts',
  TOPICS: 'hongda_topics',
  SCRIPTS: 'hongda_scripts',
  LEADS: 'hongda_leads',
  KNOWLEDGE: 'hongda_knowledge',
};

// ===== 本地存储工具（纯函数） =====

export function loadData<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return fallback;
}

export function saveData<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save data to localStorage:', e);
  }
}

export function getStoredData<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return fallback;
}

export function pushData<T>(key: string, data: T[], item: T): T[] {
  const updated = [...data, item];
  saveData(key, updated);
  return updated;
}

export function updateData<T extends { id: string }>(
  key: string, data: T[], id: string, changes: Partial<T>,
): T[] {
  const updated = data.map(item =>
    item.id === id ? { ...item, ...changes } : item,
  );
  saveData(key, updated);
  return updated;
}

export function deleteData<T extends { id: string }>(
  key: string, data: T[], id: string,
): T[] {
  const updated = data.filter(item => item.id !== id);
  saveData(key, updated);
  return updated;
}

export function deleteManyData<T extends { id: string }>(
  key: string, data: T[], ids: Set<string>,
): T[] {
  const updated = data.filter(item => !ids.has(item.id));
  saveData(key, updated);
  return updated;
}

// ===== 云端 API 调用 =====

/**
 * 从服务器加载数据。
 * 返回 { data: T[], updatedAt: string, source: string }
 * 如果服务器没有数据或出错，data 为 null。
 */
async function loadFromServer<T>(key: string): Promise<{
  data: T[] | null;
  updatedAt: string;
  source: string;
}> {
  try {
    const res = await fetch('/api/data?key=' + encodeURIComponent(key));
    if (res.ok) {
      const body = await res.json();
      // 新格式: { data: [...], updatedAt: "..." }
      if (body && typeof body === 'object' && 'data' in body && 'updatedAt' in body) {
        return {
          data: Array.isArray(body.data) ? body.data : null,
          updatedAt: body.updatedAt,
          source: body.source || 'server',
        };
      }
      // 旧格式：直接返回数组
      if (Array.isArray(body) && body.length > 0) {
        return {
          data: body,
          updatedAt: new Date().toISOString(),
          source: 'server_legacy',
        };
      }
    }
  } catch (e) {
    console.warn('[storage] loadFromServer error:', e);
  }
  return { data: null, updatedAt: new Date(0).toISOString(), source: 'none' };
}

async function saveToServer<T>(key: string, data: T[]): Promise<void> {
  try {
    await fetch('/api/data?key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (e) {
    console.warn('[storage] saveToServer error:', e);
  }
}

const POLL_INTERVAL_MS = 3000; // 3 秒轮询一次

// ===== React Hook：跨设备同步的持久状态 =====

export function usePersistentState<T>(storageKey: string, fallback: T[]) {
  const [data, setData] = useState<T[]>(fallback);
  const [ready, setReady] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date(0).toISOString());
  const initDone = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastUpdatedAtRef = useRef<string>(new Date(0).toISOString());

  // ===== 同步函数：从服务器拉取最新数据 =====
  const syncFromServer = useCallback(async (key: string) => {
    const result = await loadFromServer<T>(key);
    if (result.data && result.data.length > 0) {
      // 只在新数据更新时更新本地状态
      if (result.updatedAt > lastUpdatedAtRef.current) {
        lastUpdatedAtRef.current = result.updatedAt;
        saveData(key, result.data);
        setData(result.data);
        setLastSyncTime(result.updatedAt);
      }
    }
  }, []);

  // ===== 初始化：挂载时加载数据 =====
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const init = async () => {
      const result = await loadFromServer<T>(storageKey);

      if (result.data) {
        // 服务器有最新数据 → 使用服务器数据
        lastUpdatedAtRef.current = result.updatedAt;
        setData(result.data);
        saveData(storageKey, result.data);
        setLastSyncTime(result.updatedAt);
      } else {
        // 服务器无数据 → 从 localStorage 恢复
        const local = loadData(storageKey, fallback);
        if (local && local.length > 0) {
          setData(local);
          saveToServer(storageKey, local);
        } else {
          // 用 fallback 初始化服务器
          saveToServer(storageKey, fallback);
        }
      }
      setReady(true);
    };

    init();
  }, [storageKey, fallback]);

  // ===== 轮询：定期检查服务器更新 =====
  useEffect(() => {
    if (!ready) return;

    pollingRef.current = setInterval(() => {
      syncFromServer(storageKey);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [storageKey, ready, syncFromServer]);

  // ===== 写入函数 =====
  const setPersisted = useCallback(
    (update: T[] | ((prev: T[]) => T[])) => {
      setData(prev => {
        const next = typeof update === 'function' ? update(prev) : update;
        // 保存到 localStorage
        saveData(storageKey, next);
        // 同步到服务器（异步，不阻塞 UI）
        saveToServer(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return [data, setPersisted, ready, lastSyncTime] as const;
}
