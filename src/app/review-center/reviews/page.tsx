'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function ReviewsPage() {
  return (
    <ReviewSectionPage
      title="全部复盘"
      description="集中管理所有项目复盘记录"
      emptyTitle="暂无复盘记录"
      emptyDescription="项目异常复盘提交后，将在这里集中管理。"
      action={{ label: "新建复盘", href: "/review-center/new" }}
    />
  );
}
