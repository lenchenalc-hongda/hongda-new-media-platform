'use client';
import { useState, useEffect } from 'react';

interface EnvStatus {
  ai_enabled: boolean;
  mock_mode: boolean;
  model: string;
  message: string;
}

export default function EnvStatusBadge() {
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ai/health')
      .then(res => res.json())
      .then(data => {
        setEnvStatus(data);
        setLoading(false);
      })
      .catch(() => {
        setEnvStatus({
          ai_enabled: false,
          mock_mode: true,
          model: 'unknown',
          message: '无法获取 AI 状态',
        });
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
        检测中...
      </span>
    );
  }

  if (!envStatus) return null;

  const isMock = envStatus.mock_mode;

  return (
    <span
      className={'inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border ' + (
        isMock
          ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
          : 'bg-green-50 text-green-700 border-green-200'
      )}
      title={envStatus.message}
    >
      <span className={'w-1.5 h-1.5 rounded-full ' + (isMock ? 'bg-yellow-500' : 'bg-green-500')} />
      {isMock ? '🧪 Mock 模式' : '🤖 AI 在线'}
    </span>
  );
}
