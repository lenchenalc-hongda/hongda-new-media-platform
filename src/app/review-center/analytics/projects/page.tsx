'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function AnalyticsProjectsPage() {
  return (
    <ReviewSectionPage
      title="项目分析"
      description="按项目维度分析异常与损失"
      emptyTitle="暂无项目分析数据"
      emptyDescription="项目复盘数据积累后将自动生成项目分析。"
      
    />
  );
}
