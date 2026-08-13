'use client';
import ReviewSectionPage from '@/components/review-center/ReviewSectionPage';

export default function DownloadsPage() {
  return (
    <ReviewSectionPage
      title="下载中心"
      description="下载正式PDF、附件ZIP和完整资料包"
      emptyTitle="暂无可下载资料"
      emptyDescription="复盘关闭并生成正式报告后，可在此下载正式资料。"
      
    />
  );
}
