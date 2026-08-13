'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function ActionsPage() {
  return (
    <ReviewSectionPage
      title="改善任务中心"
      description="跟踪所有改善任务的执行情况"
      emptyTitle="暂无改善任务"
      emptyDescription="改善任务创建后将在这里集中跟踪。"
      action={{ label: "新建复盘", href: "/review-center/new" }}
    />
  );
}
