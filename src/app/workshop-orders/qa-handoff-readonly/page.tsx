import type { Metadata } from 'next';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import LiveQaHandoffReadOnly from '@/components/workshop-orders/LiveQaHandoffReadOnly';
import { canExposeP2QaReadonlyPreview } from '@/lib/workshop-orders/p2-qa-readonly-preview';

export const metadata: Metadata = {
  title: 'WOS QA 只读交接验收 | 宏达车间',
  description: '仅在隔离 QA Preview 读取当前账号所属组织的合成订单交接证据。',
};

// Separate fail-closed read-only gate. Not coupled to
// WOS_P7_NONPROD_SUBMIT_ENABLED, and not capable of granting write access.
export default function WosQaHandoffReadonlyPage() {
  const enabled = canExposeP2QaReadonlyPreview({
    vercelEnv: process.env.VERCEL_ENV,
    authMode: process.env.AUTH_MODE,
    enableReadonly: process.env.WOS_P2_QA_HANDOFF_READONLY_ENABLED,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  return (
    <AppLayout>
      <PageHeader
        title="WOS QA · 订单交接只读验收"
        description="按当前登录身份及 Supabase RLS 验证交接历史和物料缺口；无提交、接单、修改或开工功能。"
      />
      {enabled
        ? <LiveQaHandoffReadOnly />
        : <section role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            QA 只读入口未授权。需要隔离 Preview、Supabase 正式登录模式、准确 QA 项目及专用只读功能开关。
            不会读取任何订单数据，不会继承 P7 提交权限。
          </section>}
    </AppLayout>
  );
}
