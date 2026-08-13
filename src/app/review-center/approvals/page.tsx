'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function ApprovalsPage() {
  return (
    <ReviewSectionPage
      title="待我审核"
      description="处理需要你初审、复核或评级的复盘"
      emptyTitle="暂无待审核事项"
      emptyDescription="待审核的复盘提交后将在这里展示。"
      
    />
  );
}
