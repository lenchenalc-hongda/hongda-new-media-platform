'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  PROJECT_LIFECYCLE_TRANSITIONS,
  type ProjectLifecycleStatus,
  type WaitingOn,
} from '@/lib/customer-projects/domain';
import {
  PROJECT_STATUS_LABELS,
  WAITING_ON_LABELS,
  toIsoFromShanghaiDateTime,
} from '@/lib/customer-projects/presentation';

type ReopenMode = 'action' | 'waiting';

const WAITING_OPTIONS = ([
  'customer',
  'internal',
  'supplier',
  'quality',
  'finance',
  'logistics',
  'other',
] as const);

export default function ProjectLifecycleSection({
  projectId,
  status,
  version,
  customerReferenceKind,
  onChanged,
}: {
  projectId: string;
  status: ProjectLifecycleStatus;
  version: number;
  customerReferenceKind: 'canonical' | 'provisional' | null;
  onChanged: () => Promise<void> | void;
}) {
  const allowedTargets = useMemo(
    () => PROJECT_LIFECYCLE_TRANSITIONS[status],
    [status],
  );

  const [target, setTarget] = useState<ProjectLifecycleStatus | ''>('');
  const [reason, setReason] = useState('');
  const [pauseNextCheckAt, setPauseNextCheckAt] = useState('');

  const [reopenMode, setReopenMode] = useState<ReopenMode>('action');
  const [reopenActionTitle, setReopenActionTitle] = useState('');
  const [reopenActionDueAt, setReopenActionDueAt] = useState('');
  const [reopenWaitingOn, setReopenWaitingOn] = useState<Exclude<WaitingOn, 'none'>>('customer');
  const [reopenNextCheckAt, setReopenNextCheckAt] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setTarget(allowedTargets[0] ?? '');
    setReason('');
    setPauseNextCheckAt('');
    setReopenMode('action');
    setReopenActionTitle('');
    setReopenActionDueAt('');
    setReopenNextCheckAt('');
    setError('');
    setSuccess('');
  }, [status, allowedTargets]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || submitting) return;

    const body: Record<string, unknown> = {
      expectedVersion: version,
      toStatus: target,
      reason: reason.trim() || null,
    };

    if (['paused', 'lost', 'cancelled', 'active'].includes(target) && !reason.trim()) {
      setError('这个状态变化必须填写原因。');
      return;
    }

    if (target === 'paused') {
      const pauseIso = toIsoFromShanghaiDateTime(pauseNextCheckAt);
      if (!pauseIso) {
        setError('暂停项目必须设置下一次检查时间。');
        return;
      }
      body.pauseNextCheckAt = pauseIso;
    }

    if (target === 'active') {
      if (reopenMode === 'action') {
        if (!reopenActionTitle.trim()) {
          setError('重启项目必须建立新的下一步动作或等待/检查状态。');
          return;
        }
        body.reopenNextActionTitle = reopenActionTitle.trim();
        body.reopenNextActionDueAt = reopenActionDueAt
          ? toIsoFromShanghaiDateTime(reopenActionDueAt)
          : null;
        if (reopenActionDueAt && !body.reopenNextActionDueAt) {
          setError('下一步时间格式无效。');
          return;
        }
        body.reopenWaitingOn = null;
        body.reopenNextCheckAt = null;
      } else {
        const checkIso = toIsoFromShanghaiDateTime(reopenNextCheckAt);
        if (!checkIso) {
          setError('重启到等待状态时必须设置检查时间。');
          return;
        }
        body.reopenNextActionTitle = null;
        body.reopenNextActionDueAt = null;
        body.reopenWaitingOn = reopenWaitingOn;
        body.reopenNextCheckAt = checkIso;
      }
    }

    if (target === 'won' && customerReferenceKind !== 'canonical') {
      setError('临时客户项目不能直接标记成交，请先完成正式客户映射。');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        '/api/customer-projects/projects/' + encodeURIComponent(projectId) + '/transition',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json().catch(() => null);

      if (response.ok && result?.ok === true) {
        setSuccess('项目状态已更新。');
        await onChanged();
        return;
      }

      if (response.status === 409) {
        setError(typeof result?.message === 'string'
          ? result.message
          : '项目状态已经变化，请刷新后重试。');
        await onChanged();
      } else if (response.status === 422 || response.status === 400) {
        setError(typeof result?.message === 'string'
          ? result.message
          : '当前状态不允许这样操作。');
      } else if (response.status === 403) {
        setError('你没有权限变更这个项目的生命周期。');
      } else {
        setError('项目状态更新失败，请稍后重试。');
      }
    } catch {
      setError('项目状态更新失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  if (allowedTargets.length === 0) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-800">项目状态</h2>
        <p className="mt-2 text-sm text-gray-500">
          当前状态“{PROJECT_STATUS_LABELS[status]}”没有后续生命周期操作。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
      <h2 className="text-base font-semibold text-gray-800">项目生命周期</h2>
      <p className="mt-1 text-sm text-gray-500">
        这是次级管理动作。日常推进仍应使用“记录有意义的进展”，不要把状态切换当成普通跟进记录。
      </p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">变更为</label>
          <select
            value={target}
            onChange={event => setTarget(event.target.value as ProjectLifecycleStatus)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm md:w-80"
          >
            {allowedTargets.map(value => (
              <option key={value} value={value}>{PROJECT_STATUS_LABELS[value]}</option>
            ))}
          </select>
        </div>

        {target === 'won' && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            标记成交前，系统会再次确认：客户必须是正式客户，并且项目历史里已经有人工确认的订单证据。
          </div>
        )}

        {['paused', 'lost', 'cancelled', 'active'].includes(String(target)) && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              原因 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={event => setReason(event.target.value)}
              rows={3}
              placeholder={
                target === 'paused'
                  ? '例如：客户项目延期到下月，暂时不继续打样'
                  : target === 'active'
                    ? '例如：客户重新启动项目并要求本周继续推进'
                    : target === 'lost'
                      ? '例如：客户最终选择其他供应商'
                      : '例如：客户明确取消该项目'
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        )}

        {target === 'paused' && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              下一次检查时间（东莞时间） <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={pauseNextCheckAt}
              onChange={event => setPauseNextCheckAt(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm md:w-80"
            />
          </div>
        )}

        {target === 'active' && (
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4">
            <p className="text-sm font-medium text-cyan-800">重启后马上做什么？</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className={"cursor-pointer rounded-lg border p-3 " + (reopenMode === 'action' ? 'border-cyan-400 bg-white' : 'border-cyan-100')}>
                <input
                  type="radio"
                  checked={reopenMode === 'action'}
                  onChange={() => setReopenMode('action')}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-800">建立新的下一步</span>
              </label>
              <label className={"cursor-pointer rounded-lg border p-3 " + (reopenMode === 'waiting' ? 'border-cyan-400 bg-white' : 'border-cyan-100')}>
                <input
                  type="radio"
                  checked={reopenMode === 'waiting'}
                  onChange={() => setReopenMode('waiting')}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-800">重启后先等待</span>
              </label>
            </div>

            {reopenMode === 'action' ? (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">下一步动作</label>
                  <input
                    value={reopenActionTitle}
                    onChange={event => setReopenActionTitle(event.target.value)}
                    placeholder="例如：重新确认新版图稿"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">到期时间（东莞时间）</label>
                  <input
                    type="datetime-local"
                    value={reopenActionDueAt}
                    onChange={event => setReopenActionDueAt(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">等待谁 / 哪个环节</label>
                  <select
                    value={reopenWaitingOn}
                    onChange={event => setReopenWaitingOn(event.target.value as Exclude<WaitingOn, 'none'>)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    {WAITING_OPTIONS.map(value => (
                      <option key={value} value={value}>{WAITING_ON_LABELS[value]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">检查时间（东莞时间）</label>
                  <input
                    type="datetime-local"
                    value={reopenNextCheckAt}
                    onChange={event => setReopenNextCheckAt(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg border border-gray-800 bg-gray-800 px-4 py-2 text-sm font-medium text-white"
            disabled={!target || submitting}
          >
            {submitting ? '正在更新...' : '确认状态变更'}
          </button>
        </div>
      </form>
    </section>
  );
}
