'use client';
import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';

export default function PublishQueuePage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'jobs' | 'logs'>('jobs');

  useEffect(() => {
    Promise.all([
      fetch('/api/oa/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list_jobs' }) }).then(r => r.json()),
      fetch('/api/oa/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logs' }) }).then(r => r.json()),
    ]).then(([j, l]) => { setJobs(j.jobs || []); setLogs(l.logs || []); setLoading(false); });
  }, []);

  const handleMockPublish = async () => {
    const res = await fetch('/api/oa/publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'publish', articleId: 'art_' + Date.now(), title: '测试文章 ' + new Date().toLocaleDateString(),
        score: 75, riskLevel: '低', bodyHtml: '<p>测试内容</p>', summary: '测试发布',
      }),
    });
    const data = await res.json();
    if (data.success) {
      setJobs(prev => [data.job, ...prev]);
      alert('✅ Mock 发布成功（模拟）');
    } else {
      alert('❌ ' + (data.error || '发布失败'));
    }
  };

  const statusColors: Record<string, string> = {
    published: 'bg-green-100 text-green-700',
    publishing: 'bg-blue-100 text-blue-700',
    pending: 'bg-gray-100 text-gray-600',
    failed: 'bg-red-100 text-red-700',
    retrying: 'bg-yellow-100 text-yellow-700',
    draft_saved: 'bg-purple-100 text-purple-700',
  };

  return (
    <AppLayout>
      <PageHeader title="发布队列" description="文章发布管理与日志" />

      {/* Actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          <button className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${tab === 'jobs' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200'}`}
            onClick={() => setTab('jobs')}>发布任务 ({jobs.length})</button>
          <button className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${tab === 'logs' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200'}`}
            onClick={() => setTab('logs')}>发布日志 ({logs.length})</button>
        </div>
        <button className="btn-primary btn-sm text-xs" onClick={handleMockPublish}>+ Mock 发布测试</button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">加载中...</div>
      ) : tab === 'jobs' ? (
        /* Jobs Table */
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">文章</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">渠道</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">状态</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">尝试/重试</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-xs text-gray-400">暂无发布任务</td></tr>
              )}
              {jobs.map(j => (
                <tr key={j.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <p className="text-gray-700 font-medium text-xs">{j.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{new Date(j.createdAt).toLocaleString('zh-CN')}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{j.channel}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${statusColors[j.status] || 'bg-gray-100'}`}>{j.status === 'published' ? '已发布' : j.status === 'publishing' ? '发布中' : j.status === 'pending' ? '等待中' : j.status === 'failed' ? '失败' : j.status === 'retrying' ? '重试中' : j.status === 'draft_saved' ? '已存草稿' : j.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                    {j.attempts}/{j.maxAttempts}
                    {j.lastError && <p className="text-[9px] text-red-400 mt-0.5 truncate max-w-[120px]">{j.lastError}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Logs Table */
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">时间</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">文章</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">动作</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">结果</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-xs text-gray-400">暂无发布日志</td></tr>
              )}
              {logs.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-[10px] text-gray-400">{new Date(l.timestamp).toLocaleString('zh-CN')}</td>
                  <td className="px-4 py-2 text-xs text-gray-700">{l.title}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${l.action === 'publish' ? 'bg-blue-100 text-blue-700' : l.action === 'save_draft' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100'}`}>
                      {l.action === 'publish' ? '发布' : l.action === 'save_draft' ? '存草稿' : l.action === 'retry' ? '重试' : l.action}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${l.result.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {l.result.success ? '成功' : '失败'}
                    </span>
                    {l.result.error && <p className="text-[9px] text-red-400 mt-0.5">{l.result.error}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
