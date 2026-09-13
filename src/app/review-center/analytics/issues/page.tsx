'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function AnalyticsIssuesPage() {
  return (
    <ReviewSectionPage
      title="问题分析"
      description="按问题类型与发生环节分析"
      emptyTitle="暂无问题分析数据"
      emptyDescription="问题复盘数据积累后将自动生成问题分析。"
      
    />
  );
}
