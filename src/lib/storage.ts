'use client';
import { useState, useCallback } from 'react';

// ===== 存储键名 =====
export const STORAGE_KEYS = {
  ACCOUNTS: 'hongda_accounts',
  TOPICS: 'hongda_topics',
  SCRIPTS: 'hongda_scripts',
  LEADS: 'hongda_leads',
  KNOWLEDGE: 'hongda_knowledge',
};

// ===== 工具函数 =====

// 读取存储的数据，如果没有则使用初始数据
export function loadData<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return fallback;
}

// 保存数据到 localStorage
export function saveData<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save data to localStorage:', e);
  }
}

// 获取存储的数据数组（用于同步读取）
export function getStoredData<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return fallback;
}

/** 向数组追加一项并保存 */
export function pushData<T>(key: string, data: T[], item: T): T[] {
  const updated = [...data, item];
  saveData(key, updated);
  return updated;
}

/** 根据 id 更新一项并保存 */
export function updateData<T extends { id: string }>(key: string, data: T[], id: string, changes: Partial<T>): T[] {
  const updated = data.map(item => item.id === id ? { ...item, ...changes } : item);
  saveData(key, updated);
  return updated;
}

/** 根据 id 删除一项并保存 */
export function deleteData<T extends { id: string }>(key: string, data: T[], id: string): T[] {
  const updated = data.filter(item => item.id !== id);
  saveData(key, updated);
  return updated;
}

/** 批量删除并保存 */
export function deleteManyData<T extends { id: string }>(key: string, data: T[], ids: Set<string>): T[] {
  const updated = data.filter(item => !ids.has(item.id));
  saveData(key, updated);
  return updated;
}

// ===== React Hook =====

export function usePersistentState<T>(storageKey: string, fallback: T[]) {
  const [data, setData] = useState<T[]>(() => loadData(storageKey, fallback));

  const setPersisted = useCallback((update: T[] | ((prev: T[]) => T[])) => {
    setData(prev => {
      const next = typeof update === 'function' ? update(prev) : update;
      saveData(storageKey, next);
      return next;
    });
  }, [storageKey]);

  return [data, setPersisted] as const;
}
