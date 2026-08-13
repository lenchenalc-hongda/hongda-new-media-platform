'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function ActionsVerificationPage() {
  return (
    <ReviewSectionPage
      title="待验证任务"
      description="等待验证改善效果的任务"
      emptyTitle="暂无待验证任务"
      emptyDescription="待验证的改善任务将在这里集中展示。"
      
    />
  );
}
