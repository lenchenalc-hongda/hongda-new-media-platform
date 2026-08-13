'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function AnalyticsPeoplePage() {
  return (
    <ReviewSectionPage
      title="人员分析"
      description="按人员维度分析问题与责任"
      emptyTitle="暂无人员分析数据"
      emptyDescription="人员复盘数据积累后将自动生成人员分析。"
      
    />
  );
}
