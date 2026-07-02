'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import AiResultCard from '@/components/ui/AiResultCard';
import EmptyState from '@/components/ui/EmptyState';
import { MOCK_TEARDOWNS, MOCK_ACCOUNTS } from '@/lib/constants/mock-data';
import { getPlatformLabel, truncate, formatDate } from '@/lib/utils';

export default function TeardownsPage() {
  const [teardowns, setTeardowns] = useState(MOCK_TEARDOWNS);
  const [selected, setSelected] = useState<typeof MOCK_TEARDOWNS[0] | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);

  const handleTeardown = async () => {
    if (!selected) return;
    const res = await fetch('/api/ai/viral-teardown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: selected.platform, source_url: selected.source_url, title: selected.title, transcript_or_description: selected.structure, screenshot_notes: '' }) });
    const data = await res.json();
    setAiResult(data);
  };

  return (
    <AppLayout>
      <PageHeader
        title="爆款拆解"
        description={`共 ${teardowns.length} 条拆解`}
        actions={<button className="btn-primary" onClick={() => alert('新增爆款拆解功能将在对接数据库后开放')}>新增拆解</button>}
      />

      {aiResult && <AiResultCard title="AI爆款拆解分析" content={aiResult} onDismiss={() => setAiResult(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 card p-0 overflow-hidden">
          <div className="p-3 border-b border-gray-200 bg-gray-50 font-medium text-sm text-gray-700">拆解列表</div>
          <div className="divide-y divide-gray-100">
            {teardowns.map(t => (
              <button key={t.id} onClick={() => setSelected(t)} className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${selected?.id === t.id ? 'bg-blue-50' : ''}`}>
                <p className="text-sm font-medium text-gray-700">{truncate(t.title, 30)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{getPlatformLabel(t.platform)} · {t.source_account || '未知来源'}</p>
                <StatusBadge status={t.status} />
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">{selected.title}</h3>
                <button className="btn-primary btn-sm" onClick={handleTeardown}>AI拆解</button>
              </div>
              <div className="space-y-3 text-sm">
                <div><span className="text-gray-400">平台：</span><span>{getPlatformLabel(selected.platform)}</span></div>
                <div><span className="text-gray-400">来源账号：</span><span>{selected.source_account || '-'}</span></div>
                <div><span className="text-gray-400">视频主题：</span><span>{selected.video_theme}</span></div>
                <div><span className="text-gray-400">前3秒钩子：</span><span>{selected.hook}</span></div>
                <div><span className="text-gray-400">用户痛点：</span><span>{selected.pain_point}</span></div>
                <div><span className="text-gray-400">内容结构：</span><span className="whitespace-pre-wrap">{selected.structure}</span></div>
                <div><span className="text-gray-400">信任元素：</span><span>{selected.trust_elements}</span></div>
                <div><span className="text-gray-400">转化动作：</span><span>{selected.conversion_action}</span></div>
                <div className="bg-green-50 p-3 rounded"><span className="text-green-700 font-medium">可借鉴：</span><p className="text-green-600 text-xs mt-1">{selected.learnable_points}</p></div>
                <div className="bg-red-50 p-3 rounded"><span className="text-red-600 font-medium">不适合照搬：</span><p className="text-red-700 text-xs mt-1">{selected.not_suitable_points}</p></div>
                <div><span className="text-gray-400 font-medium">宏达改编选题：</span></div>
                <div className="space-y-1">
                  {selected.adapted_topics.map((topic: any, i: any) => (
                    <p key={i} className="text-sm text-blue-600">• {topic}</p>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="请选择一个爆款拆解" description="从左侧列表选择查看详情" />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
