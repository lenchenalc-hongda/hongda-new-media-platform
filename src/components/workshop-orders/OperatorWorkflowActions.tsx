'use client';

import { useRef, useState } from 'react';
import {
  isWosP2RpcResult,
  parseWosP2Action,
} from '@/lib/workshop-orders/p2-action-contract';
import type {
  WosInboxItem,
  WosInboxReadDetail,
} from '@/lib/workshop-orders/api-contract';
import {
  getWosOperatorWorkflowActions,
  wosOperatorActionNote,
  type WosOperatorWorkflowAction,
} from '@/lib/workshop-orders/operator-order-actions';
import { classifyWosWriteFailure } from '@/lib/workshop-orders/order-lifecycle-state';

interface Props {
  readonly item: WosInboxItem;
  readonly detail: WosInboxReadDetail;
  readonly canOperate: boolean;
  readonly writeEnabled: boolean;
  readonly onSuccess: () => void;
}

export default function OperatorWorkflowActions({
  item,
  detail,
  canOperate,
  writeEnabled,
  onSuccess,
}: Props) {
  const actions = getWosOperatorWorkflowActions(item, detail);
  const [action, setAction] = useState<WosOperatorWorkflowAction>(
    actions[0]?.action ?? 'RETURN_FOR_INFORMATION',
  );
  const [note, setNote] = useState(wosOperatorActionNote(actions[0]?.action ?? 'RETURN_FOR_INFORMATION'));
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const pendingRef = useRef<{ key: string; requestId: string } | null>(null);

  if (!canOperate || actions.length === 0) return null;

  const selected = actions.find(option => option.action === action) ?? actions[0];

  function chooseAction(next: WosOperatorWorkflowAction) {
    setAction(next);
    setNote(wosOperatorActionNote(next));
    setFeedback('');
    pendingRef.current = null;
  }

  async function submit() {
    if (sending) return;
    const intent = {
      orderId: item.id,
      expectedVersion: item.version,
      action: selected.action,
      note: note.trim(),
    };
    const key = JSON.stringify(intent);
    const requestId = pendingRef.current?.key === key
      ? pendingRef.current.requestId
      : crypto.randomUUID();
    const request = parseWosP2Action({ ...intent, requestId });
    if (!request) {
      setFeedback('请填写至少 10 个字的操作说明；退回时必须写明需要补充或更正的内容。');
      return;
    }

    pendingRef.current = { key, requestId };
    setSending(true);
    setFeedback('正在提交数据库事务，未取得版本回执前不会假定成功。');
    try {
      const response = await fetch('/api/workshop-orders/p2/actions', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-wos-p2-action': '1',
        },
        body: JSON.stringify(request),
      });
      const result = await response.json() as {
        ok?: boolean;
        code?: string;
        data?: unknown;
      };
      const disposition = classifyWosWriteFailure(response.status, result.code);
      if (disposition === 'REFRESH_REQUIRED') {
        pendingRef.current = null;
        setFeedback('订单版本已被其他操作更新。本次请求未确认成功，正在重新读取最新版本。');
        onSuccess();
        return;
      }
      if (!response.ok
        || !result.ok
        || !['QA_P2_ACTION_APPLIED', 'QA_P2_REPLAY_VERIFIED'].includes(result.code ?? '')
        || !isWosP2RpcResult(result.data, request)) {
        setFeedback(disposition === 'RETRY_SAME_REQUEST'
          ? '数据库事务暂不可用：' + (result.code ?? 'UNKNOWN')
            + '。保持内容不变重试会复用请求编号。'
          : '操作未通过：' + (result.code ?? 'UNKNOWN') + '。请核对身份、权限和订单状态。');
        return;
      }
      pendingRef.current = null;
      setFeedback('数据库已确认操作，正在重新读取最新订单版本。');
      onSuccess();
    } catch {
      setFeedback('网络中断，结果尚未核实。请保持内容不变重试，系统会复用请求编号。');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-4 space-y-3 rounded-md border border-slate-300 bg-white p-3"
      aria-label="Operator 订单处理">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-gray-950">车间订单处理</h4>
          <p className="mt-1 text-xs text-gray-600">
            所有操作绑定当前 {item.versionLabel} / v{item.version}，以数据库事务回执为准。
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700">
          {item.workflowStatus}
        </span>
      </div>

      {!writeEnabled && (
        <p role="status" className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          当前写入 Gate 关闭，可查看流程位置但不能提交接单、退回或修订复核。
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map(option => (
          <button
            key={option.action}
            type="button"
            aria-pressed={selected.action === option.action}
            onClick={() => chooseAction(option.action)}
            disabled={sending}
            className={selected.action === option.action
              ? 'rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-left text-xs text-white'
              : 'rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-xs text-slate-800 disabled:opacity-50'}
          >
            <span className="block font-semibold">{option.label}</span>
            <span className={selected.action === option.action
              ? 'mt-1 block text-slate-200'
              : 'mt-1 block text-slate-600'}>
              {option.description}
            </span>
          </button>
        ))}
      </div>

      <label className="block text-xs font-medium text-gray-800">
        {selected.action === 'RETURN_FOR_INFORMATION'
          ? '退回原因（必填，10 至 500 字）'
          : '操作核对说明（10 至 500 字）'}
        <textarea
          value={note}
          rows={3}
          maxLength={500}
          disabled={sending}
          onChange={event => {
            setNote(event.target.value);
            setFeedback('');
          }}
          className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm disabled:bg-gray-100"
          placeholder={selected.action === 'RETURN_FOR_INFORMATION'
            ? '请写清具体缺失或不一致的资料，办公室将据此修订。'
            : '说明本次核对依据。'}
        />
      </label>

      <button
        type="button"
        onClick={() => { void submit(); }}
        disabled={!writeEnabled || sending || note.trim().length < 10}
        className="min-h-11 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {sending ? '数据库事务处理中...' : selected.label}
      </button>

      {feedback && <p role="status" className="text-xs text-gray-700">{feedback}</p>}
      <p className="text-xs text-red-800">
        canStart=false。接单、资料补充或复核均不会直接放行开工。
      </p>
    </section>
  );
}
