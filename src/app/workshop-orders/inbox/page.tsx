import type { Metadata } from 'next';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import WorkshopInbox from '@/components/workshop-orders/WorkshopInbox';
import { EMPTY_WORKSHOP_QUEUE } from '@/lib/workshop-orders/readiness';

export const metadata: Metadata = {
  title: '车间收件箱与齐套检查 | 宏达车间',
  description: '查看生产单和打样申请的非生产齐套展示模型。',
};

export default function WorkshopInboxPage() {
  return (
    <AppLayout>
      <PageHeader
        title="车间收件箱与齐套检查"
        description="按生产单和打样申请分别查看状态、优先级及有序齐套阻断。"
        actions={
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            返回工作台
          </Link>
        }
      />

      <WorkshopInbox queue={EMPTY_WORKSHOP_QUEUE} />
    </AppLayout>
  );
}
