import type { Metadata } from 'next';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import LiveQaHandoffReadOnly from '@/components/workshop-orders/LiveQaHandoffReadOnly';
import { canExposeP2QaReadonlyPreview } from '@/lib/workshop-orders/p2-qa-readonly-preview';

export const metadata: Metadata = {
  title: 'WOS 开工前检查 | 宏达车间',
  description: '只读核对订单版本、四类物料、图片签样与独立双确认证据。',
};

export default function WorkshopReadinessPage() {
  const enabled = canExposeP2QaReadonlyPreview({
    vercelEnv: process.env.VERCEL_ENV,
    authMode: process.env.AUTH_MODE,
    enableReadonly: process.env.WOS_P2_QA_HANDOFF_READONLY_ENABLED,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  return (
    <AppLayout>
      <PageHeader
        title="开工前检查"
        description="逐项核对生产资料版本、四类物料、当前图片基准与办公室/车间独立确认。"
      />

      <section className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-950">V1 禁止自动开工</p>
        <p className="mt-1 text-xs leading-5 text-red-900">
          所有检查通过也只表示可以提交负责人人工复核。系统不会自动排期、开工或跳过签样门禁。
        </p>
      </section>

      {enabled ? (
        <LiveQaHandoffReadOnly />
      ) : (
        <section role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          当前环境未授权读取真实 QA 交接证据。需要隔离 Preview、Supabase 登录模式、固定 QA
          项目和专用只读开关；本页不会使用模拟数据伪装检查通过。
        </section>
      )}
    </AppLayout>
  );
}
