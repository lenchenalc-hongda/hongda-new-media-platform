import type { Metadata } from 'next';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import PersistedWorkshopInbox from '@/components/workshop-orders/PersistedWorkshopInbox';
import WorkshopInbox from '@/components/workshop-orders/WorkshopInbox';
import { isWosQaInboxReadonlyEnabled } from '@/lib/workshop-orders/api-contract';
import { EMPTY_WORKSHOP_QUEUE } from '@/lib/workshop-orders/readiness';

export const metadata: Metadata = {
  title: '车间收件箱与齐套检查 | 宏达车间',
  description: '读取当前组织已持久化并完成提交回执校验的车间订单。',
};

export default function WorkshopInboxPage() {
  const realReadEnabled = isWosQaInboxReadonlyEnabled({
    vercelEnv: process.env.VERCEL_ENV,
    authMode: process.env.AUTH_MODE,
    enabled: process.env.WOS_QA_INBOX_READONLY_ENABLED,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  return (
    <AppLayout>
      <PageHeader
        title="车间收件箱与齐套检查"
        description="查看当前组织已提交的持久化订单、当前版本与只读齐套证据。"
        actions={
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            返回工作台
          </Link>
        }
      />

      {realReadEnabled
        ? <PersistedWorkshopInbox />
        : <WorkshopInbox queue={EMPTY_WORKSHOP_QUEUE} />}
    </AppLayout>
  );
}
