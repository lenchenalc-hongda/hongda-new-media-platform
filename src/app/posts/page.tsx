'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import AiResultCard from '@/components/ui/AiResultCard';
import EmptyState from '@/components/ui/EmptyState';
import { MOCK_POSTS, MOCK_METRICS, MOCK_REVIEWS, MOCK_ACCOUNTS, MOCK_SCRIPTS } from '@/lib/constants/mock-data';
import { formatNumber, formatPercent, formatDate, getPlatformLabel, getContentTypeLabel, truncate } from '@/lib/utils';

export default function PostsPage() {
  const [posts] = useState(MOCK_POSTS);
  const [selectedPost, setSelectedPost] = useState<typeof MOCK_POSTS[0] | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);

  const getMetrics = (postId: string) => MOCK_METRICS.find(m => m.post_id === postId);
  const getReview = (postId: string) => MOCK_REVIEWS.find(r => r.post_id === postId);
  const getAccountName = (id: string) => MOCK_ACCOUNTS.find(a => a.id === id)?.name || '';
  const getScript = (id: string | null) => MOCK_SCRIPTS.find(s => s.id === id);

  const handleReview = async () => {
    if (!selectedPost) return;
    const metrics = getMetrics(selectedPost.id);
    const account = MOCK_ACCOUNTS.find(a => a.id === selectedPost.account_id);
    const script = getScript(selectedPost.script_id);
    const res = await fetch('/api/ai/post-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post: selectedPost, metrics, account, script }) });
    const data = await res.json();
    setAiResult(data);
  };

  return (
    <AppLayout>
      <PageHeader
        title="数据复盘"
        description="视频发布数据与复盘分析"
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => alert('CSV导入功能将在后续版本实现')}>CSV导入</button>
            <button className="btn-primary" onClick={() => alert('新增已发布视频功能将在对接数据库后开放')}>新增视频</button>
          </div>
        }
      />

      {aiResult && <AiResultCard title="AI复盘分析" content={aiResult} onDismiss={() => setAiResult(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 card p-0 overflow-hidden">
          <div className="p-3 border-b border-gray-200 bg-gray-50 font-medium text-sm text-gray-700">已发布视频</div>
          <div className="divide-y divide-gray-100">
            {posts.map(p => (
              <button key={p.id} onClick={() => { setSelectedPost(p); setAiResult(null); }} className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${selectedPost?.id === p.id ? 'bg-blue-50' : ''}`}>
                <p className="text-sm font-medium text-gray-700">{truncate(p.title, 25)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{getAccountName(p.account_id)} · {formatDate(p.publish_date)}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedPost ? (
            <div className="space-y-4">
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-800">{selectedPost.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {getAccountName(selectedPost.account_id)} · {getPlatformLabel(selectedPost.platform)}
                      {selectedPost.publish_date && ` · ${formatDate(selectedPost.publish_date)}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary btn-sm" onClick={handleReview}>AI复盘</button>
                  </div>
                </div>

                {(() => {
                  const metrics = getMetrics(selectedPost.id);
                  if (!metrics) return <p className="text-sm text-gray-400">暂无数据</p>;
                  return (
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                      {[
                        { label: '播放量', value: formatNumber(metrics.views) },
                        { label: '完播率', value: formatPercent(metrics.completion_rate) },
                        { label: '点赞', value: formatNumber(metrics.likes) },
                        { label: '评论', value: formatNumber(metrics.comments) },
                        { label: '转发', value: formatNumber(metrics.shares) },
                        { label: '收藏', value: formatNumber(metrics.favorites) },
                        { label: '新增关注', value: formatNumber(metrics.followers_gained) },
                        { label: '私信', value: formatNumber(metrics.private_messages) },
                        { label: '线索', value: formatNumber(metrics.leads_count) },
                        { label: '有效线索', value: formatNumber(metrics.qualified_leads_count) },
                      ].map(item => (
                        <div key={item.label} className="bg-gray-50 p-2 rounded text-center">
                          <p className="text-xs text-gray-500">{item.label}</p>
                          <p className="text-sm font-bold text-gray-800 mt-0.5">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {(() => {
                const review = getReview(selectedPost.id);
                if (!review) return null;
                return (
                  <div className="card">
                    <h4 className="font-medium text-gray-700 mb-2">复盘结论</h4>
                    <p className="text-sm text-gray-600">{review.summary}</p>
                    {review.what_worked && (
                      <div className="mt-2 bg-green-50 p-2 rounded">
                        <span className="text-xs text-green-700 font-medium">做得好的：</span>
                        <p className="text-xs text-green-600">{review.what_worked}</p>
                      </div>
                    )}
                    {review.what_failed && (
                      <div className="mt-2 bg-red-50 p-2 rounded">
                        <span className="text-xs text-red-700 font-medium">问题：</span>
                        <p className="text-xs text-red-600">{review.what_failed}</p>
                      </div>
                    )}
                    {review.next_optimization && (
                      <div className="mt-2 bg-blue-50 p-2 rounded">
                        <span className="text-xs text-blue-700 font-medium">优化建议：</span>
                        <p className="text-xs text-blue-600">{review.next_optimization}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <EmptyState title="请选择一个视频" description="从左侧列表选择查看数据详情" />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
