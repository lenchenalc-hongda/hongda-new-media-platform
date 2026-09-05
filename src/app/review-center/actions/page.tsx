'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function ActionsPage() {
  return (
    <ReviewSectionPage
      title="改善任务中心"
      description="跟踪所有改善任务的执行情况"
      emptyTitle="暂无改善任务"
      emptyDescription="改善任务需在具体复盘中创建，创建后将在这里统一跟踪。"
      action={{ label: "查看全部复盘", href: "/review-center/reviews" }}
    />
  );
}
