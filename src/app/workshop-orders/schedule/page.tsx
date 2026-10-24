import type { Metadata } from 'next';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import WorkshopSchedulePreview from '@/components/workshop-orders/WorkshopSchedulePreview';
import { SCHEDULING_PREVIEW_FIXTURE } from '@/lib/workshop-orders/scheduling';

export const metadata: Metadata = {
  title: '车间排期预览 | 宏达车间',
  description: '查看生产与打样的非生产排期模型、冲突阻断和交期预警。',
};

export default function WorkshopSchedulePage() {
  return (
    <AppLayout>
      <PageHeader
        title="车间排期预览"
        description="分别查看生产与打样的机台时段、技术员覆盖、产能估算和交期风险。"
        actions={
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            返回工作台
          </Link>
        }
      />

      <WorkshopSchedulePreview preview={SCHEDULING_PREVIEW_FIXTURE} />
    </AppLayout>
  );
}
