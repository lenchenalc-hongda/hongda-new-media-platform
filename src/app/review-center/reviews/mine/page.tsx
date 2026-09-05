'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function ReviewsMinePage() {
  return (
    <ReviewSectionPage
      title="我的复盘"
      description="查看我创建和参与的复盘"
      emptyTitle="暂无复盘记录"
      emptyDescription="你创建或参与的项目复盘将在这里集中管理。"
      action={{ label: "新建复盘", href: "/review-center/new" }}
    />
  );
}
