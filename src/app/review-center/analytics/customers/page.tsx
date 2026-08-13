'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function AnalyticsCustomersPage() {
  return (
    <ReviewSectionPage
      title="客户分析"
      description="按客户维度分析影响与信任"
      emptyTitle="暂无客户分析数据"
      emptyDescription="客户复盘数据积累后将自动生成客户分析。"
      
    />
  );
}
