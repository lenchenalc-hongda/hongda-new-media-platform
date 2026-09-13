'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function AnalyticsLossesPage() {
  return (
    <ReviewSectionPage
      title="损失分析"
      description="按损失金额与类型分析"
      emptyTitle="暂无损失分析数据"
      emptyDescription="损失数据积累后将自动生成损失分析。"
      
    />
  );
}
