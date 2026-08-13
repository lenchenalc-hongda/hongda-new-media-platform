'use client';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';

const QUICK_LINKS = [
  { label: '新建复盘', href: '/review-center/new', icon: '➕', desc: '记录项目异常' },
  { label: '我的复盘', href: '/review-center/reviews/mine', icon: '📋', desc: '查看我提交的复盘' },
  { label: '待我审核', href: '/review-center/approvals', icon: '✅', desc: '处理待办审核' },
  { label: '改善任务', href: '/review-center/actions', icon: '🛠️', desc: '跟踪改善执行' },
];

export default function ReviewCenterHomePage() {
  return (
    <AppLayout>
      <PageHeader
        title="项目复盘与改善中心"
        description="用于记录项目异常、分析根本原因、跟踪改善任务，并形成可查询、可下载、可验证的项目经验数据库。"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {QUICK_LINKS.map(link => (
          <Link key={link.href} href={link.href} className="card hover:shadow-md transition-shadow no-underline">
            <p className="text-2xl mb-2">{link.icon}</p>
            <p className="font-medium text-gray-800">{link.label}</p>
            <p className="text-xs text-gray-400 mt-1">{link.desc}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">近期复盘</h3>
          <ReviewCenterEmpty title="暂无数据" description="项目异常复盘提交后，将在这里展示。" />
        </div>
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">待处理事项</h3>
          <ReviewCenterEmpty title="暂无数据" description="待审核、待验证事项将在这里集中展示。" />
        </div>
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">改善任务</h3>
          <ReviewCenterEmpty title="暂无数据" description="改善任务创建后，将在这里跟踪执行进度。" />
        </div>
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">管理概览</h3>
          <ReviewCenterEmpty title="暂无数据" description="复盘数据积累后，将在这里展示管理统计。" />
        </div>
      </div>
    </AppLayout>
  );
}
