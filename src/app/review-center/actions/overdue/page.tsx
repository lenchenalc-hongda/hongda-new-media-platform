'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function ActionsOverduePage() {
  return (
    <ReviewSectionPage
      title="逾期任务"
      description="逾期未完成的改善任务"
      emptyTitle="暂无逾期任务"
      emptyDescription="逾期改善任务将在这里集中展示。"
      
    />
  );
}
