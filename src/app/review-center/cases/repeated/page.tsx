'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function CasesRepeatedPage() {
  return (
    <ReviewSectionPage
      title="重复问题"
      description="识别反复出现的问题"
      emptyTitle="暂无重复问题数据"
      emptyDescription="重复问题将在复盘数据积累后自动识别。"
      
    />
  );
}
