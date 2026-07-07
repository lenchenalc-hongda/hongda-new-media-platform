'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EnvStatusBadge from '@/components/system/EnvStatusBadge';
import StatCard from '@/components/ui/StatCard';
import AiResultCard from '@/components/ui/AiResultCard';
import { MOCK_ACCOUNTS, MOCK_POSTS, MOCK_METRICS, MOCK_LEADS } from '@/lib/constants/mock-data';
import { formatNumber, getPlatformLabel, truncate } from '@/lib/utils';

export default function DashboardPage() {
  const [showAiSuggest, setShowAiSuggest] = useState(true);
  
  const totalPostsThisWeek = MOCK_POSTS.filter(p => {
    const d = new Date(p.publish_date || '');
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= weekAgo;
  }).length;

  const newLeads = MOCK_LEADS.filter(l => {
    const d = new Date(l.created_at);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= weekAgo;
  }).length;

  const qualifiedLeads = MOCK_LEADS.filter(l => l.lead_grade === 'A' || l.lead_grade === 'B').length;
  const pendingReview = MOCK_POSTS.filter(p => p.status === 'published').length;
  const pendingHandover = MOCK_LEADS.filter(l => l.status === 'new' && !l.assigned_to).length;

  const topPosts = MOCK_POSTS
    .map(p => ({ ...p, metrics: MOCK_METRICS.find(m => m.post_id === p.id) }))
    .sort((a, b) => (b.metrics?.views || 0) - (a.metrics?.views || 0))
    .slice(0, 3);

  const topLeadsPosts = MOCK_POSTS
    .map(p => ({ ...p, metrics: MOCK_METRICS.find(m => m.post_id === p.id) }))
    .sort((a, b) => (b.metrics?.leads_count || 0) - (a.metrics?.leads_count || 0))
    .slice(0, 3);

  return (
    <AppLayout>
      <PageHeader
        title="新媒体战情盘"
        description="团队本周运营概览"
        actions={<EnvStatusBadge />}
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="本周发布" value={totalPostsThisWeek} description="条已发布" />
        <StatCard label="新增线索" value={newLeads} description="条" trend="up" trendValue="较上周+25%" />
        <StatCard label="有效线索" value={qualifiedLeads} description="条A/B级" trend="up" trendValue="转化率28.6%" />
        <StatCard label="待复盘" value={pendingReview} description="条视频" />
        <StatCard label="待交接" value={pendingHandover} description="条线索" />
        <StatCard label="AI建议" value={showAiSuggest ? '有' : '已关闭'} description="点击查看" />
      </div>

      {/* AI Suggestions */}
      {showAiSuggest && (
        <AiResultCard
          title="AI本周建议"
          content={{
            '重点方向': '增加案例类内容发布频次，线索转化率最高',
            '优化提醒': '问答号线索量大但质量偏低，需优化引导话术',
            '风险预警': '工厂实拍号完播率偏低，重新设计开头钩子',
            '选题建议': '材质对比、翻车案例、产能展示三类选题效果最好',
          }}
          onDismiss={() => setShowAiSuggest(false)}
        />
      )}

      {/* Account Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">各账号本月表现</h3>
          <div className="space-y-3">
            {MOCK_ACCOUNTS.map(acc => (
              <div key={acc.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <span className="font-medium text-sm text-gray-800">{acc.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{getPlatformLabel(acc.platform)}</span>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>发布 {acc.monthly_posts}条</span>
                  <span>线索 {acc.monthly_leads}条</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">最佳表现内容 Top 3</h3>
          <div className="space-y-3">
            {topPosts.map((post, i) => (
              <div key={post.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-700">{i+1}.</span>
                  <span className="text-sm text-gray-700 ml-1">{truncate(post.title, 25)}</span>
                  <span className="text-xs text-gray-400 ml-2">{getPlatformLabel(post.platform)}</span>
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                  {formatNumber(post.metrics?.views || 0)}播放
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lead-rich Content & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">线索最多内容 Top 3</h3>
          <div className="space-y-3">
            {topLeadsPosts.map((post, i) => (
              <div key={post.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-700">{i+1}.</span>
                  <span className="text-sm text-gray-700 ml-1">{truncate(post.title, 30)}</span>
                </div>
                <span className="text-xs text-blue-600 font-medium">
                  {post.metrics?.leads_count}线索 / {post.metrics?.qualified_leads_count}有效
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">待处理事项</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <p>• 待复盘视频：{pendingReview}条</p>
            <p>• 待交接线索：{pendingHandover}条</p>
            {MOCK_LEADS.filter(l => l.is_urgent && !l.assigned_to).map(l => (
              <p key={l.id} className="text-red-600">
                • 紧急：{l.customer_name} - {l.product}
              </p>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
