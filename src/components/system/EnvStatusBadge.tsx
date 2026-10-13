'use client';
import { useEffect, useState } from 'react';

export default function EnvStatusBadge() {
  const [status, setStatus] = useState<'loading' | 'connected' | 'offline'>('loading');

  useEffect(() => {
    fetch('/api/ai/health')
      .then(r => {
        if (!r.ok) throw new Error('health check failed');
        return r.json();
      })
      .then(() => setStatus('connected'))
      .catch(() => setStatus('offline'));
  }, []);

  const isOffline = status === 'offline';

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-gray-500"
      title={isOffline ? 'AI 服务暂不可用' : 'AI 服务已连接'}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          status === 'loading'
            ? 'bg-gray-300'
            : isOffline
              ? 'bg-red-500'
              : 'bg-emerald-500'
        }`}
        aria-hidden="true"
      />
      <span>{status === 'loading' ? 'AI 检查中' : isOffline ? 'AI 未连接' : 'AI 已连接'}</span>
    </span>
  );
}
