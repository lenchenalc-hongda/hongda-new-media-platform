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

// ===== 工具函数 =====

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

export function updateData<T extends { id: string }>(key: string, data: T[], id: string, changes: Partial<T>): T[] {
  const updated = data.map(item => item.id === id ? { ...item, ...changes } : item);
  saveData(key, updated);
  return updated;
}

export function deleteData<T extends { id: string }>(key: string, data: T[], id: string): T[] {
  const updated = data.filter(item => item.id !== id);
  saveData(key, updated);
  return updated;
}

export function deleteManyData<T extends { id: string }>(key: string, data: T[], ids: Set<string>): T[] {
  const updated = data.filter(item => !ids.has(item.id));
  saveData(key, updated);
  return updated;
}

// ===== 云端同步 API 调用 =====

async function loadFromServer<T>(key: string): Promise<T[] | null> {
  try {
    const res = await fetch('/api/data?key=' + key);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {}
  return null;
}

async function saveToServer<T>(key: string, data: T[]): Promise<void> {
  try {
    await fetch('/api/data?key=' + key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {}
}

// ===== React Hook =====

export function usePersistentState<T>(storageKey: string, fallback: T[]) {
  const [data, setData] = useState<T[]>(fallback);
  const [ready, setReady] = useState(false);
  const initDone = useRef(false);

  // 挂载后先尝试从云端加载，再回退到 localStorage
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    loadFromServer<T>(storageKey).then(serverData => {
      if (serverData) {
        setData(serverData);
        saveData(storageKey, serverData); // 更新本地缓存
      } else {
        // 云端无数据，从 localStorage 恢复
        const local = loadData(storageKey, fallback);
        if (local && local.length > 0) {
          setData(local);
          saveToServer(storageKey, local); // 推送到云端
        }
      }
      setReady(true);
    });
  }, [storageKey, fallback]);

  const setPersisted = useCallback((update: T[] | ((prev: T[]) => T[])) => {
    setData(prev => {
      const next = typeof update === 'function' ? update(prev) : update;
      // 保存到本地
      saveData(storageKey, next);
      // 同步到云端（异步，不阻塞 UI）
      saveToServer(storageKey, next);
      return next;
    });
  }, [storageKey]);

  return [data, setPersisted, ready] as const;
}
