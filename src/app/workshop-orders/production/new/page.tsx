import type { Metadata } from 'next';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ProductionOrderForm from '@/components/workshop-orders/ProductionOrderForm';
import { isApprovedWosSandboxUrl, isWosNonproductionApiEnabled } from '@/lib/workshop-orders/api-contract';

export const metadata: Metadata = {
  title: '生产下单 | 宏达车间',
  description: '办公室录入大货生产单资料并执行本地完整性检查。',
};

export default function WorkshopProductionOrderNewPage() {
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
        title="生产下单"
        description="办公室按已确认的客户、项目和版本资料录入大货生产单。"
        actions={
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            返回工作台
          </Link>
        }
      />

      <section className={qaLive
        ? "mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4"
        : "mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4"}>
        <h2 className="text-sm font-semibold text-amber-950">本阶段录入说明</h2>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-amber-900">
          {qaLive
            ? '受保护的 QA Preview 已开启：本页将通过真实 Supabase Auth、私有图片存储、办公室齐套确认和同源 HTTP API 提交合成测试订单。不会进入实际生产。'
            : '当前页面仅用于本地录入和完整性检查，不连接 Supabase，不保存或上传资料，也不会提交正式生产单。'}
        </p>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-amber-900">
          {qaLive
            ? '此流程只接受 QA-NONPROD 合成订单。正式签样、技术确认、排期和开工放行仍然禁止。请先选择 QA 图片并使用下方专用按钮。'
            : '车间确认、资源齐套、生产基准图片和正式提交将在后续受控任务中开放，不得用本页面替代正式签样。'}
        </p>
      </section>

      <ProductionOrderForm qaLive={qaLive} />
    </AppLayout>
  );
}
