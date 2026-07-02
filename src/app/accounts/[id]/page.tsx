'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import AiResultCard from '@/components/ui/AiResultCard';
import EmptyState from '@/components/ui/EmptyState';
import { MOCK_ACCOUNTS, MOCK_POSTS, MOCK_METRICS, MOCK_REVIEWS } from '@/lib/constants/mock-data';
import { getPlatformLabel, getContentTypeLabel, formatNumber, formatPercent, truncate } from '@/lib/utils';

export default function AccountDetailPage() {
  const params = useParams();
  const account = MOCK_ACCOUNTS.find(a => a.id === params.id);
  const [showDiagnosis, setShowDiagnosis] = useState(false);

  if (!account) {
    return (
      <AppLayout>
        <PageHeader title="账号不存在" />
        <EmptyState title="未找到该账号" description="请返回账号矩阵重新选择" action={{ label: '返回账号矩阵', onClick: () => window.location.href = '/accounts' }} />
      </AppLayout>
    );
  }

  const accountPosts = MOCK_POSTS.filter(p => p.account_id === account.id).slice(0, 10);
  const accountReviews = MOCK_REVIEWS.filter(r => accountPosts.some(p => p.id === r.post_id));
  const postsWithMetrics = accountPosts.map(p => ({ ...p, metrics: MOCK_METRICS.find(m => m.post_id === p.id) }));

  const highPerf = postsWithMetrics.filter(p => (p.metrics?.views || 0) > 5000);
  const lowPerf = postsWithMetrics.filter(p => (p.metrics?.views || 0) <= 5000);

  return (
    <AppLayout>
      <PageHeader
        title={account.name}
        description={getPlatformLabel(account.platform)}
        actions={
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => setShowDiagnosis(!showDiagnosis)}>
              {showDiagnosis ? '关闭诊断' : 'AI账号诊断'}
            </button>
            <Link href="/topics" className="btn-secondary no-underline">查看选题</Link>
          </div>
        }
      />

      {showDiagnosis && (
        <AiResultCard
          title="AI诊断结果"
          content={{
            '当前问题': '内容缺乏差异化，与其他账号内容重叠',
            '高表现共性': '案例类和对比类内容完播率高',
            '低表现问题': '纯知识科普类内容缺少视觉冲击力',
            '下周建议': '增加材质对比实测、翻车案例',
            '风险提醒': '注意不要泄露客户信息',
          }}
          onDismiss={() => setShowDiagnosis(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="card lg:col-span-2">
          <h3 className="font-semibold text-gray-800 mb-3">账号定位</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-400">人设：</span><span className="text-gray-700">{account.persona}</span></div>
            <div><span className="text-gray-400">目标用户：</span><span className="text-gray-700">{account.target_audience}</span></div>
            <div className="col-span-2"><span className="text-gray-400">定位：</span><span className="text-gray-700">{account.positioning}</span></div>
            <div className="col-span-2"><span className="text-gray-400">内容风格：</span><span className="text-gray-700">{account.content_style}</span></div>
            <div className="col-span-2"><span className="text-gray-400">转化目标：</span><span className="text-gray-700">{account.conversion_goal}</span></div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">主要内容类型：{account.main_content_types.map((t: string) => getContentTypeLabel(t)).join('、')}</p>
          </div>
        </div>
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">规则与注意事项</h3>
          <div className="text-sm space-y-2">
            <div><span className="text-gray-400">✅ 应做：</span><p className="text-gray-600 text-xs mt-1">{account.dos}</p></div>
            <div><span className="text-red-400">❌ 不应做：</span><p className="text-gray-600 text-xs mt-1">{account.donts}</p></div>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="font-semibold text-gray-800 mb-3">最近10条内容</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header">标题</th>
                <th className="table-header">类型</th>
                <th className="table-header">播放</th>
                <th className="table-header">完播率</th>
                <th className="table-header">线索</th>
                <th className="table-header">有效线索</th>
              </tr>
            </thead>
            <tbody>
              {postsWithMetrics.map(post => (
                <tr key={post.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="table-cell">{truncate(post.title, 30)}</td>
                  <td className="table-cell">{post.content_type ? getContentTypeLabel(post.content_type) : '-'}</td>
                  <td className="table-cell">{formatNumber(post.metrics?.views)}</td>
                  <td className="table-cell">{formatPercent(post.metrics?.completion_rate)}</td>
                  <td className="table-cell">{post.metrics?.leads_count || 0}</td>
                  <td className="table-cell">{post.metrics?.qualified_leads_count || 0}</td>
                </tr>
              ))}
              {postsWithMetrics.length === 0 && (
                <tr><td colSpan={6} className="text-center py-4 text-gray-400">暂无内容数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">高表现内容共性</h3>
          {highPerf.length > 0 ? (
            <div className="space-y-2">
              {highPerf.map(p => (
                <p key={p.id} className="text-sm text-gray-600">• {truncate(p.title, 40)} - {formatNumber(p.metrics?.views)}播放</p>
              ))}
              <p className="text-xs text-green-600 mt-2 bg-green-50 p-2 rounded">
                这些内容的共同点：开头钩子设计好、有具体数据支撑、结尾互动引导有效
              </p>
            </div>
          ) : <p className="text-sm text-gray-400">暂无高表现内容</p>}
        </div>
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">低表现内容问题</h3>
          {lowPerf.length > 0 ? (
            <div className="space-y-2">
              {lowPerf.map(p => (
                <p key={p.id} className="text-sm text-gray-600">• {truncate(p.title, 40)} - {formatNumber(p.metrics?.views)}播放</p>
              ))}
              <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded">
                主要问题：缺少视觉冲击力、开头不够抓人、内容过长
              </p>
            </div>
          ) : <p className="text-sm text-gray-400">暂无低表现内容</p>}
        </div>
      </div>
    </AppLayout>
  );
}
