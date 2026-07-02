'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatCard from '@/components/ui/StatCard';
import AiResultCard from '@/components/ui/AiResultCard';
import { MOCK_ACCOUNTS, MOCK_POSTS, MOCK_METRICS, MOCK_LEADS } from '@/lib/constants/mock-data';
import { formatNumber, getPlatformLabel, getContentTypeLabel } from '@/lib/utils';

export default function ReportsPage() {
  const [showAiReport, setShowAiReport] = useState(false);

  const weixinPosts = MOCK_POSTS.filter(p => p.platform === 'weixin').length;
  const douyinPosts = MOCK_POSTS.filter(p => p.platform === 'douyin').length;
  const totalViews = MOCK_METRICS.reduce((s, m) => s + m.views, 0);
  const totalLeads = MOCK_METRICS.reduce((s, m) => s + m.leads_count, 0);
  const totalQualified = MOCK_METRICS.reduce((s, m) => s + m.qualified_leads_count, 0);
  const qualifiedRate = totalLeads > 0 ? ((totalQualified / totalLeads) * 100).toFixed(1) : '0';

  const contentTypeStats = () => {
    const stats: Record<string, { posts: number; views: number; leads: number }> = {};
    MOCK_POSTS.forEach(p => {
      const ct = p.content_type || 'other';
      if (!stats[ct]) stats[ct] = { posts: 0, views: 0, leads: 0 };
      stats[ct].posts += 1;
      const metrics = MOCK_METRICS.find(m => m.post_id === p.id);
      if (metrics) {
        stats[ct].views += metrics.views;
        stats[ct].leads += metrics.leads_count;
      }
    });
    return stats;
  };

  const leadSourceStats = () => {
    const stats: Record<string, { total: number; qualified: number }> = {};
    MOCK_LEADS.forEach(l => {
      const platform = l.source_platform || 'other';
      if (!stats[platform]) stats[platform] = { total: 0, qualified: 0 };
      stats[platform].total += 1;
      if (l.lead_grade === 'A' || l.lead_grade === 'B') stats[platform].qualified += 1;
    });
    return stats;
  };

  const handleWeeklyReport = async () => {
    const res = await fetch('/api/ai/weekly-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      date_range: { start: '2026-06-22', end: '2026-06-28' },
      accounts: MOCK_ACCOUNTS, posts: MOCK_POSTS, metrics: MOCK_METRICS, leads: MOCK_LEADS,
    })});
    const data = await res.json();
    setShowAiReport(true);
  };

  const ctStats = contentTypeStats();
  const lsStats = leadSourceStats();

  return (
    <AppLayout>
      <PageHeader
        title="报表"
        description="数据统计与分析"
        actions={
          <button className="btn-primary" onClick={handleWeeklyReport}>
            AI生成周报
          </button>
        }
      />

      {showAiReport && (
        <AiResultCard title="AI本周周报" content={{
          '本周总结': '本周共发布5条视频，总播放量3.2万，新增线索42条。',
          '线索表现': '案例号线索转化率最高，问答号线索量大但质量偏低。',
          '下周建议': '增加案例类内容，优化问答号引导话术。',
        }} onDismiss={() => setShowAiReport(false)} />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="总播放量" value={formatNumber(totalViews)} />
        <StatCard label="总线索数" value={formatNumber(totalLeads)} />
        <StatCard label="有效线索数" value={formatNumber(totalQualified)} />
        <StatCard label="有效线索率" value={`${qualifiedRate}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">内容类型表现</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="table-header">类型</th>
                  <th className="table-header">数量</th>
                  <th className="table-header">播放量</th>
                  <th className="table-header">线索</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(ctStats).map(([ct, stats]) => (
                  <tr key={ct} className="border-b border-gray-100">
                    <td className="table-cell">{getContentTypeLabel(ct)}</td>
                    <td className="table-cell">{stats.posts}</td>
                    <td className="table-cell">{formatNumber(stats.views)}</td>
                    <td className="table-cell">{stats.leads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">视频号 vs 抖音表现</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-green-50 rounded">
              <p className="text-sm text-gray-500">视频号</p>
              <p className="text-2xl font-bold text-gray-800">{weixinPosts}条</p>
              <p className="text-xs text-gray-400">已发布</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded">
              <p className="text-sm text-gray-500">抖音</p>
              <p className="text-2xl font-bold text-gray-800">{douyinPosts}条</p>
              <p className="text-xs text-gray-400">已发布</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100">
            <h4 className="text-sm font-medium text-gray-700 mb-2">各账号表现</h4>
            {MOCK_ACCOUNTS.map(acc => (
              <div key={acc.id} className="flex justify-between items-center py-1.5 text-sm">
                <span>{acc.name}</span>
                <span className="text-gray-500">{getPlatformLabel(acc.platform)} · {acc.monthly_posts}条 · {acc.monthly_leads}线索</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">线索来源表现</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="table-header">来源</th>
                  <th className="table-header">线索总数</th>
                  <th className="table-header">有效线索</th>
                  <th className="table-header">有效率</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(lsStats).map(([platform, stats]) => (
                  <tr key={platform} className="border-b border-gray-100">
                    <td className="table-cell">{getPlatformLabel(platform)}</td>
                    <td className="table-cell">{stats.total}</td>
                    <td className="table-cell">{stats.qualified}</td>
                    <td className="table-cell">{stats.total > 0 ? `${((stats.qualified / stats.total) * 100).toFixed(0)}%` : '0%'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">AI复盘建议</h3>
          <div className="space-y-3 text-sm">
            <div className="p-3 bg-blue-50 rounded">
              <p className="font-medium text-blue-700">内容方向</p>
              <p className="text-blue-600 text-xs mt-1">案例类内容线索转化率最高，建议增加到每周2-3条</p>
            </div>
            <div className="p-3 bg-yellow-50 rounded">
              <p className="font-medium text-yellow-700">优化提醒</p>
              <p className="text-yellow-600 text-xs mt-1">工厂实拍号完播率偏低，需要重新设计开头3秒钩子</p>
            </div>
            <div className="p-3 bg-green-50 rounded">
              <p className="font-medium text-green-700">线索表现</p>
              <p className="text-green-600 text-xs mt-1">视频号线索质量高于抖音，建议视频号保持精度，抖音扩大数量</p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
