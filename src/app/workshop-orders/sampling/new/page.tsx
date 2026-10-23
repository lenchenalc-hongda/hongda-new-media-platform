import type { Metadata } from 'next';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import SamplingRequestForm from '@/components/workshop-orders/SamplingRequestForm';

export const metadata: Metadata = {
  title: '打烊申请 | 宏达车间',
  description: '办公室录入打烊申请资料并执行本地完整性检查。',
};

export default function WorkshopSamplingRequestNewPage() {
  return (
    <AppLayout>
      <PageHeader
        title="打烊申请"
        description="办公室为独立打烊任务录入客户、产品、花膜、印刷位置与验收资料。"
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
          打烊申请与大货生产单是两个独立入口。当前页面只做本地资料录入和完整性检查，
          点击“检查打烊申请资料”不会连接 Supabase、不会写入数据库、不会上传图片，
          也不会创建或提交正式打烊申请。
        </p>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-amber-900">
          参考图片区域仅登记文件名、类别与版本。资料检查通过不代表图片已上传、资源已到齐、
          技术员已接单或打烊已放行；正式提交、图片上传和资源 Gate 将在后续受控任务中开放。
        </p>
      </section>

      <SamplingRequestForm />
    </AppLayout>
  );
}
