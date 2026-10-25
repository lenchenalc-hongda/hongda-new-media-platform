import React from 'react';
import {
  EMPTY_SCHEDULING_PREVIEW,
  type SchedulingPreviewItem,
  type SchedulingPreviewSnapshot,
} from '@/lib/workshop-orders/scheduling';

interface WorkshopSchedulePreviewProps {
  preview?: SchedulingPreviewSnapshot;
}

function PreviewItem({ item }: { item: SchedulingPreviewItem }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
              {item.taskLabel}
            </span>
            <span className="text-[11px] text-gray-500">
              {item.identifier} · {item.versionLabel}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-gray-900">
            {item.scheduledWindowLabel}
          </h3>
          <p className="mt-1 text-xs text-gray-600">
            {item.machineLabel} · {item.durationLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-gray-200 px-2 py-1 text-gray-700">
            优先级：{item.priorityLabel}
          </span>
          <span
            className={`rounded-full border px-2 py-1 ${
              item.isSchedulable
                ? item.isLate
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            {item.scheduleStatusLabel}
          </span>
        </div>
      </div>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <dt className="font-medium text-gray-700">齐套与产能</dt>
          <dd className="mt-0.5 text-gray-600">{item.readinessLabel}</dd>
          <dd className="mt-0.5 text-gray-600">{item.capacityLabel}</dd>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <dt className="font-medium text-gray-700">交期</dt>
          <dd className="mt-0.5 text-gray-600">{item.dueDateLabel}</dd>
          <dd className="mt-0.5 text-gray-600">
            {item.isLate ? '存在延期预警' : '预计不晚于交期'}
          </dd>
        </div>
      </dl>

      <div
        className={`mt-3 rounded-lg border px-3 py-2 ${
          item.isSchedulable
            ? 'border-blue-200 bg-blue-50 text-blue-950'
            : 'border-amber-200 bg-amber-50 text-amber-950'
        }`}
      >
        <p className="text-xs font-semibold">下一步：{item.nextActionLabel}</p>
        <p className="mt-1 text-[11px] leading-5">{item.ownershipLabel}</p>
      </div>

      {item.warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {item.warnings.map((warning) => (
            <li
              key={warning.code}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
            >
              <span className="font-medium">延期预警：{warning.label}</span>
              <span className="mt-0.5 block text-amber-800">
                {warning.actionLabel}
              </span>
            </li>
          ))}
        </ul>
      )}

      {item.blockers.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold text-gray-800">
            按顺序处理排期阻断
          </h4>
          <ol className="mt-2 space-y-2">
            {item.blockers.map((blocker) => (
              <li
                key={`${blocker.code}:${blocker.relatedBookingId ?? 'none'}`}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs"
              >
                <p className="font-medium text-gray-900">{blocker.label}</p>
                <p className="mt-0.5 text-gray-600">{blocker.actionLabel}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  );
}

export default function WorkshopSchedulePreview({
  preview = EMPTY_SCHEDULING_PREVIEW,
}: WorkshopSchedulePreviewProps) {
  const totalCount = preview.production.length + preview.sampling.length;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-amber-950">
              Phase 4 排期非生产预览
            </h2>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-amber-900">
              以下只使用固定测试资料展示生产与打样的独立排期提案，不代表真实订单已排期。
              页面不读取或写入预排期记录，不使用数据库、接口、浏览器存储或正式放行操作。
            </p>
          </div>
          <p className="text-xs font-medium text-amber-950">
            生产 {preview.production.length} · 打样 {preview.sampling.length}
          </p>
        </div>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg bg-white/70 px-3 py-2">
            <dt className="font-medium text-amber-950">任务归属</dt>
            <dd className="mt-0.5 text-amber-800">项目负责人确认需求</dd>
          </div>
          <div className="rounded-lg bg-white/70 px-3 py-2">
            <dt className="font-medium text-amber-950">排期责任</dt>
            <dd className="mt-0.5 text-amber-800">车间主管确认机台与技术员</dd>
          </div>
          <div className="rounded-lg bg-white/70 px-3 py-2">
            <dt className="font-medium text-amber-950">技术估算</dt>
            <dd className="mt-0.5 text-amber-800">技术员提供产能与时长</dd>
          </div>
        </dl>
      </section>

      {totalCount === 0 ? (
        <section
          aria-labelledby="workshop-schedule-empty-title"
          className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center"
        >
          <h2
            id="workshop-schedule-empty-title"
            className="text-sm font-semibold text-gray-900"
          >
            当前没有排期预览项
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-xs leading-5 text-gray-600">
            这是诚实的非生产空态。真实排期读取、版本提案保存和主管确认尚未接入，
            页面不会伪造机台占用、技术员可用性或交期。
          </p>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <section aria-labelledby="production-schedule-preview-title">
            <div className="mb-2 flex items-center justify-between">
              <h2
                id="production-schedule-preview-title"
                className="text-sm font-semibold text-gray-900"
              >
                生产排期提案
              </h2>
              <span className="text-xs text-gray-500">
                {preview.production.length} 项
              </span>
            </div>
            <div className="space-y-3">
              {preview.production.length === 0 ? (
                <p className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-500">
                  暂无生产排期提案。
                </p>
              ) : (
                preview.production.map((item) => (
                  <PreviewItem key={`production:${item.id}`} item={item} />
                ))
              )}
            </div>
          </section>

          <section aria-labelledby="sampling-schedule-preview-title">
            <div className="mb-2 flex items-center justify-between">
              <h2
                id="sampling-schedule-preview-title"
                className="text-sm font-semibold text-gray-900"
              >
                打样排期提案
              </h2>
              <span className="text-xs text-gray-500">
                {preview.sampling.length} 项
              </span>
            </div>
            <div className="space-y-3">
              {preview.sampling.length === 0 ? (
                <p className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-500">
                  暂无打样排期提案。
                </p>
              ) : (
                preview.sampling.map((item) => (
                  <PreviewItem key={`sampling:${item.id}`} item={item} />
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
