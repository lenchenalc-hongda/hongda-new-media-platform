import type { Metadata } from 'next';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import WorkshopInbox from '@/components/workshop-orders/WorkshopInbox';
import LiveQaWorkshopInbox from '@/components/workshop-orders/LiveQaWorkshopInbox';
import { isApprovedWosSandboxUrl, isWosNonproductionApiEnabled } from '@/lib/workshop-orders/api-contract';
import { EMPTY_WORKSHOP_QUEUE } from '@/lib/workshop-orders/readiness';

export const metadata: Metadata = {
  title: '车间收件箱与齐套检查 | 宏达车间',
  description: '查看生产单和打样申请的非生产齐套展示模型。',
};

export default function WorkshopInboxPage() {
  const qaLive = process.env.VERCEL_ENV === 'preview'
    && isWosNonproductionApiEnabled({
      vercelEnv: process.env.VERCEL_ENV,
      nodeEnv: process.env.NODE_ENV,
      enabled: process.env.WOS_P5C_NONPROD_API_ENABLED,
    })
    && process.env.WOS_P7_NONPROD_SUBMIT_ENABLED === 'true'
    && isApprovedWosSandboxUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
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

      {qaLive
        ? <LiveQaWorkshopInbox />
        : <WorkshopInbox queue={EMPTY_WORKSHOP_QUEUE} />}
    </AppLayout>
  );
}
