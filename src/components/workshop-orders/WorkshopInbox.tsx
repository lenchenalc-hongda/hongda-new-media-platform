import React from 'react';
import Link from 'next/link';
import {
  EMPTY_WORKSHOP_QUEUE,
  type WorkshopQueueItem,
  type WorkshopQueueSnapshot,
} from '@/lib/workshop-orders/readiness';

interface WorkshopInboxProps {
  queue?: WorkshopQueueSnapshot;
}

const availableLabel = '尚未接入';

function QueueItem({ item }: { item: WorkshopQueueItem }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
              {item.typeLabel}
            </span>
            <span className="text-[11px] text-gray-500">{item.identifier}</span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-gray-900">
            {item.productName}
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            {item.customerName} · {item.projectName} · {item.versionLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-gray-200 px-2 py-1 text-gray-700">
            状态：{item.statusLabel}
          </span>
          <span className="rounded-full border border-gray-200 px-2 py-1 text-gray-700">
            优先级：{item.priorityLabel}
          </span>
        </div>
      </div>

      <div
        className={`mt-3 rounded-lg border px-3 py-2 ${
          item.isReady
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-amber-200 bg-amber-50 text-amber-950'
        }`}
      >
        <p className="text-xs font-semibold">{item.readinessLabel}</p>
        <p className="mt-1 text-xs">下一步：{item.nextActionLabel}</p>
      </div>

      {item.blockers.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold text-gray-800">
            按顺序处理齐套阻断
          </h4>
          <ol className="mt-2 space-y-2">
            {item.blockers.map((blocker, index) => (
              <li
                key={blocker.code}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs"
              >
                <p className="font-medium text-gray-900">
                  {index + 1}. {blocker.label}
                </p>
                <p className="mt-0.5 text-gray-600">{blocker.actionLabel}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  );
}

export default function WorkshopInbox({
  queue = EMPTY_WORKSHOP_QUEUE,
}: WorkshopInboxProps) {
  const productionCount = queue.productionOrders.length;
  const samplingCount = queue.samplingRequests.length;
  const totalCount = productionCount + samplingCount;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-amber-950">
              Phase 3 非生产预览
            </h2>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-amber-900">
              当前页面不会读取或展示虚构的车间任务，也不会把任何项目标记为已放行。
              只有齐套条件全部通过时，纯展示模型才会给出“可进入下一受控环节”。
            </p>
          </div>
          <p className="text-xs font-medium text-amber-950">
            生产单 {productionCount} · 打样申请 {samplingCount}
          </p>
        </div>

        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg bg-white/70 px-3 py-2">
            <dt className="font-medium text-amber-950">真实 Supabase 持久化</dt>
            <dd className="mt-0.5 text-amber-800">{availableLabel}</dd>
          </div>
          <div className="rounded-lg bg-white/70 px-3 py-2">
            <dt className="font-medium text-amber-950">角色限制的数据加载</dt>
            <dd className="mt-0.5 text-amber-800">{availableLabel}</dd>
          </div>
          <div className="rounded-lg bg-white/70 px-3 py-2">
            <dt className="font-medium text-amber-950">图片上传</dt>
            <dd className="mt-0.5 text-amber-800">{availableLabel}</dd>
          </div>
          <div className="rounded-lg bg-white/70 px-3 py-2">
            <dt className="font-medium text-amber-950">最终工作流状态变更</dt>
            <dd className="mt-0.5 text-amber-800">{availableLabel}</dd>
          </div>
        </dl>
      </section>

      {totalCount === 0 ? (
        <section
          aria-labelledby="workshop-inbox-empty-title"
          className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center"
        >
          <h2
            id="workshop-inbox-empty-title"
            className="text-sm font-semibold text-gray-900"
          >
            当前没有可展示的车间任务
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-xs leading-5 text-gray-600">
            这是诚实的非生产空态：真实任务尚未接入，页面不会伪造订单、打样申请、
            到货状态、齐套结果或放行记录。本阶段只提供纯展示模型和资料录入入口。
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs">
            <Link
              href="/workshop-orders/production/new"
              className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              前往生产单本地录入
            </Link>
            <Link
              href="/workshop-orders/sampling/new"
              className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              前往打样申请本地录入
            </Link>
          </div>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <section aria-labelledby="production-queue-title">
            <div className="mb-2 flex items-center justify-between">
              <h2
                id="production-queue-title"
                className="text-sm font-semibold text-gray-900"
              >
                生产单齐套队列
              </h2>
              <span className="text-xs text-gray-500">{productionCount} 项</span>
            </div>
            <div className="space-y-3">
              {queue.productionOrders.length === 0 ? (
                <p className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-500">
                  暂无生产单。
                </p>
              ) : (
                queue.productionOrders.map((item) => (
                  <QueueItem key={`production:${item.id}`} item={item} />
                ))
              )}
            </div>
          </section>

          <section aria-labelledby="sampling-queue-title">
            <div className="mb-2 flex items-center justify-between">
              <h2
                id="sampling-queue-title"
                className="text-sm font-semibold text-gray-900"
              >
                打样申请齐套队列
              </h2>
              <span className="text-xs text-gray-500">{samplingCount} 项</span>
            </div>
            <div className="space-y-3">
              {queue.samplingRequests.length === 0 ? (
                <p className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-500">
                  暂无打样申请。
                </p>
              ) : (
                queue.samplingRequests.map((item) => (
                  <QueueItem key={`sampling:${item.id}`} item={item} />
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
