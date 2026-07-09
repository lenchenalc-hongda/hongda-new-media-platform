'use client';
import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import Link from 'next/link';

const MOCK_STATS = {
  totalArticles: 18,
  drafts: 5,
  pendingReview: 3,
  approved: 2,
  scheduled: 4,
  published: 4,
  monthlyPlan: 6,
  monthlyDone: 3,
};

const MOCK_RECENT = [
  { id: '1', title: '热转印与丝印的区别，一次讲清楚', type: '知识讲解', status: '已发布', date: '2026-07-08', link: '/oa/articles' },
  { id: '2', title: 'PE材质热转印常见问题解答', type: 'FAQ', status: '待审核', date: '2026-07-07', link: '/oa/articles' },
  { id: '3', title: '2026中秋特别推文：印出品质', type: '节日节气', status: '已排期', date: '2026-09-15', link: '/oa/articles' },
  { id: '4', title: '为什么打样和大货不能完全一样？', type: '案例拆解', status: '草稿', date: '2026-07-06', link: '/oa/article-factory' },
  { id: '5', title: '宏达印业2026年中回顾', type: '宣传', status: '草稿', date: '2026-07-05', link: '/oa/article-factory' },
];

const STATUS_COLORS: Record<string, string> = {
  '已发布': 'text-green-600 bg-green-50',
  '待审核': 'text-yellow-600 bg-yellow-50',
  '已排期': 'text-blue-600 bg-blue-50',
  '草稿': 'text-gray-600 bg-gray-100',
};

export default function OADashboard() {
  const [time, setTime] = useState('');
  useEffect(() => setTime(new Date().toLocaleTimeString('zh-CN')), []);

  return (
    <AppLayout>
      <PageHeader title="公众号工厂" description="微信公众号内容生产与管理" />

      {/* Stats Cards */}
      <div className="grid grid-cols-4 md:grid-cols-7 gap-3 mb-6">
        {[
          { label: '全部文章', value: MOCK_STATS.totalArticles, color: 'text-gray-800', bg: 'bg-gray-50' },
          { label: '草稿', value: MOCK_STATS.drafts, color: 'text-gray-600', bg: 'bg-gray-50' },
          { label: '待审核', value: MOCK_STATS.pendingReview, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: '已通过', value: MOCK_STATS.approved, color: 'text-green-600', bg: 'bg-green-50' },
          { label: '已排期', value: MOCK_STATS.scheduled, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: '已发布', value: MOCK_STATS.published, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '本月进度', value: `${MOCK_STATS.monthlyDone}/${MOCK_STATS.monthlyPlan}`, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-lg border border-gray-200 p-3 text-center`}>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-3 gap-5">
        {/* Left: Recent Articles */}
        <div className="col-span-2 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">最近文章</h3>
            <Link href="/oa/articles" className="text-xs text-blue-600 hover:text-blue-800 no-underline">查看全部 →</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {MOCK_RECENT.map(a => (
              <Link key={a.id} href={a.link} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors no-underline">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{a.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-400">{a.type}</span>
                    <span className="text-[10px] text-gray-300">|</span>
                    <span className="text-[10px] text-gray-400">{a.date}</span>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${STATUS_COLORS[a.status] || 'text-gray-500 bg-gray-50'}`}>
                  {a.status}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Right: Quick Actions + Plan */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">快速操作</h3>
            <div className="space-y-2">
              {[
                { label: '新建文章', icon: '✏️', path: '/oa/article-factory', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                { label: '选择模板', icon: '📐', path: '/oa/templates', color: 'bg-purple-50 text-purple-700 border-purple-200' },
                { label: '查看排期', icon: '📅', path: '/oa/calendar', color: 'bg-green-50 text-green-700 border-green-200' },
                { label: '管理知识卡', icon: '📇', path: '/knowledge', color: 'bg-amber-50 text-amber-700 border-amber-200' },
              ].map(btn => (
                <Link key={btn.label} href={btn.path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors no-underline ${btn.color} hover:brightness-95`}>
                  <span>{btn.icon}</span>
                  {btn.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Monthly Plan */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">本月发布计划</h3>
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>进度 {MOCK_STATS.monthlyDone}/{MOCK_STATS.monthlyPlan}</span>
                <span>{Math.round(MOCK_STATS.monthlyDone / MOCK_STATS.monthlyPlan * 100)}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${MOCK_STATS.monthlyDone / MOCK_STATS.monthlyPlan * 100}%` }} />
              </div>
            </div>
            <Link href="/oa/calendar" className="block text-center text-xs text-blue-600 hover:text-blue-800 pt-2 border-t border-gray-100 no-underline">
              查看完整排期 →
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
