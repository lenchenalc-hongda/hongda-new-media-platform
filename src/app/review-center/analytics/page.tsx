'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function AnalyticsPage() {
  return (
    <ReviewSectionPage
      title="分析中心"
      description="项目复盘数据统计与趋势分析"
      emptyTitle="分析数据将在复盘数据积累后自动生成"
      emptyDescription="后续将支持：项目异常趋势、严重等级、损失情况、人员分析、问题发生环节、客户影响、重复问题。"
      
    />
  );
}
