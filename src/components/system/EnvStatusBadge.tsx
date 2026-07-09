'use client';
import { useState, useEffect } from 'react';

export default function EnvStatusBadge() {
  const [aiProvider, setAiProvider] = useState('...');
  const [isMock, setIsMock] = useState(true);

  useEffect(() => {
    fetch('/api/ai/health')
      .then(r => r.json())
      .then(d => {
        setAiProvider(d.aiProvider || d.configured_provider || 'mock');
        setIsMock(d.mockMode !== false);
      })
      .catch(() => { setAiProvider('offline'); setIsMock(true); });
  }, []);

  const colors: Record<string, string> = {
    mock: 'bg-amber-100 text-amber-700 border-amber-200',
    openai: 'bg-green-100 text-green-700 border-green-200',
    deepseek: 'bg-blue-100 text-blue-700 border-blue-200',
    offline: 'bg-red-100 text-red-700 border-red-200',
  };

  const label = aiProvider === 'mock' ? 'Mock' :
    aiProvider === 'openai' ? 'GPT-4o' :
    aiProvider === 'deepseek' ? 'DeepSeek' : aiProvider;

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${colors[aiProvider] || colors.mock}`}>
      {label}
      {isMock && ' (Mock)'}
    </span>
  );
}
