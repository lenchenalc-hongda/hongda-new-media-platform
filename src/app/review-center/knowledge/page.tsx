'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function KnowledgePage() {
  return (
    <ReviewSectionPage
      title="经验库"
      description="可复用的问题处理经验"
      emptyTitle="暂无经验条目"
      emptyDescription="已关闭复盘的改善经验将沉淀到经验库。"
      
    />
  );
}
