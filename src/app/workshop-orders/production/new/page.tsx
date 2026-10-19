import type { Metadata } from 'next';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ProductionOrderForm from '@/components/workshop-orders/ProductionOrderForm';

export const metadata: Metadata = {
  title: '生产下单 | 宏达车间',
  description: '办公室录入大货生产单资料并执行本地完整性检查。',
};

export default function WorkshopProductionOrderNewPage() {
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

      <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-sm font-semibold text-amber-950">本阶段录入说明</h2>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-amber-900">
          当前页面用于办公室录入生产单资料和执行本地完整性检查。点击“检查资料完整性”不会连接
          Supabase、不会写入数据库、不会上传图片，也不会生成或提交正式生产单。
        </p>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-amber-900">
          车间确认、资源齐套、当前生产基准图片和正式提交将在后续受控任务中开放。请按客户确认样和
          最新版本填写，不得用本页面替代正式签样或车间放行。
        </p>
      </section>

      <ProductionOrderForm />
    </AppLayout>
  );
}
