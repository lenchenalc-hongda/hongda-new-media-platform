import type { Metadata } from 'next';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';

export const metadata: Metadata = {
  title: '车间订单中心 | 宏达车间',
  description: '宏达 Workshop Order System 的办公室、车间、物料、签样与开工前检查入口。',
};

const entries = [
  {
    href: '/workshop-orders/production/new',
    title: '生产下单',
    description: '办公室录入大货生产单资料，检查完整性并进入受控提交流程。',
    label: '办公室',
  },
  {
    href: '/workshop-orders/inbox',
    title: '车间收件箱',
    description: '车间接单、查看生产要求、退回资料并核对物料与签样状态。',
    label: '车间',
  },
  {
    href: '/workshop-orders/readiness',
    title: '开工前检查',
    description: '核对当前版本、四类物料、图片签样和独立双确认证据。',
    label: '人工门禁',
  },
  {
    href: '/workshop-orders/sampling/new',
    title: '打样申请',
    description: '独立录入打样需求，不混入大货生产单。',
    label: '办公室',
  },
  {
    href: '/workshop-orders/schedule',
    title: '排期预览',
    description: '查看非生产排期模型和齐套阻断，不执行正式排产。',
    label: '车间',
  },
] as const;

export default function WorkshopOrdersHomePage() {
  return (
    <AppLayout>
      <PageHeader
        title="车间订单中心"
        description="办公室提交、车间接单、物料齐套、图片签样与人工开工前检查。"
      />

      <section className="mb-5 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 text-xs sm:grid-cols-3">
        <div>
          <p className="font-semibold text-gray-900">业务代码</p>
          <p className="mt-1 text-emerald-700">WOS V1 本地集成</p>
        </div>
        <div>
          <p className="font-semibold text-gray-900">数据库写入</p>
          <p className="mt-1 text-amber-800">受独立 QA Gate 限制</p>
        </div>
        <div>
          <p className="font-semibold text-gray-900">自动开工</p>
          <p className="mt-1 text-red-800">禁止；必须人工放行</p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {entries.map(entry => (
          <Link
            key={entry.href}
            href={entry.href}
            className="group flex min-h-40 flex-col rounded-lg border border-gray-200 bg-white p-4 no-underline transition-colors hover:border-blue-300 hover:bg-blue-50/40"
          >
            <span className="w-fit rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600">
              {entry.label}
            </span>
            <h2 className="mt-3 text-base font-semibold text-gray-900 group-hover:text-blue-900">
              {entry.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">{entry.description}</p>
            <span className="mt-auto pt-4 text-sm font-medium text-blue-800">
              打开
            </span>
          </Link>
        ))}
      </div>
    </AppLayout>
  );
}
