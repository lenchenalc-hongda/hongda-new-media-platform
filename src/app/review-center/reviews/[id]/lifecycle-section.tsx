'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { formatReviewDateTime } from '@/lib/review-center/formatters';
import {
  buildLifecycleRequest,
  classifyLifecycleError,
  createMutationLock,
  getLifecyclePresentation,
  normalizeLifecycleSuccess,
  INCOMPLETE_FIELD_LABELS,
  type LifecycleActionKind,
  type LifecycleSuccessData,
  type MutationLock,
} from '@/lib/review-center/lifecycle-presentation';

interface LifecycleSectionProps {
  reviewId: string;
  status: string;
  version: number;
  ownerId: string;
  pmoId: string | null;
  currentProfileId: string | null;
  currentRole: string | null;
  editHref: string;
  submittedAt: string | null;
  closedAt: string | null;
  onLifecycleSuccess: (data: LifecycleSuccessData) => void;
  onAuthorityRefresh: () => void;
}

type DialogKind = 'SUBMIT' | 'CLOSE' | 'RETURN' | 'REOPEN' | null;

export default function LifecycleSection({
  reviewId,
  status,
  version,
  ownerId,
  pmoId,
  currentProfileId,
  currentRole,
  editHref,
  submittedAt,
  closedAt,
  onLifecycleSuccess,
  onAuthorityRefresh,
}: LifecycleSectionProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [incompleteFields, setIncompleteFields] = useState<string[]>([]);
  const [isMutating, setIsMutating] = useState(false);
  const lockRef = useRef<MutationLock>(createMutationLock());
  const generationRef = useRef(0);

  const presentation = useMemo(
    () => getLifecyclePresentation({
      status,
      currentProfileId,
      currentRole,
      ownerId,
      pmoId,
    }),
    [status, currentProfileId, currentRole, ownerId, pmoId],
  );

  useEffect(() => {
    generationRef.current += 1;
    lockRef.current = createMutationLock();
    setDialog(null);
    setReopenReason('');
    setReopenError(null);
    setMutationError(null);
    setIncompleteFields([]);
    setIsMutating(false);
  }, [reviewId]);

  const closeReopenDialog = useCallback(() => {
    setDialog(null);
    setReopenReason('');
    setReopenError(null);
  }, []);

  useEffect(() => {
    if (dialog !== 'REOPEN' || isMutating) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeReopenDialog();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialog, isMutating, closeReopenDialog]);

  async function runMutation(action: LifecycleActionKind, reason?: string) {
    const lock = lockRef.current;
    if (!lock.acquire()) return;
    const requestId = ++generationRef.current;
    setIsMutating(true);
    setMutationError(null);
    setIncompleteFields([]);
    setReopenError(null);

    try {
      const request = buildLifecycleRequest(action, reviewId, version, reason);
      let response: Response;
      try {
        response = await fetch(request.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request.body),
        });
      } catch {
        if (requestId !== generationRef.current) return;
        setMutationError('操作失败，请稍后重试。');
        return;
      }

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (requestId !== generationRef.current) return;

      if (response.ok) {
        const success = normalizeLifecycleSuccess(payload);
        if (!success) {
          setMutationError('操作失败，请稍后重试。');
          return;
        }
        setDialog(null);
        setReopenReason('');
        setReopenError(null);
        onLifecycleSuccess(success);
        onAuthorityRefresh();
        return;
      }

      const error = classifyLifecycleError(response.status, payload);
      if (requestId !== generationRef.current) return;

      if (error.keepDialogOpen) {
        setReopenError(error.message);
        setMutationError(null);
        return;
      }

      setDialog(null);
      setMutationError(error.message);
      setIncompleteFields(error.incompleteFields);
      if (error.shouldRefreshAuthority) {
        onAuthorityRefresh();
      }
    } finally {
      lock.release();
      if (requestId === generationRef.current) setIsMutating(false);
    }
  }

  function handleReopenConfirm() {
    if (reopenReason.trim() === '') {
      setReopenError('请填写重新打开原因。');
      return;
    }
    setReopenError(null);
    void runMutation('REOPEN', reopenReason);
  }

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6 mb-5">
      <h2 className="font-medium text-gray-800">复盘状态</h2>
      <div className="mt-2 text-sm text-gray-700">
        <span className="font-medium">{presentation.statusLabel}</span>
      </div>
      <p className="mt-1 text-sm text-gray-500">{presentation.statusDescription}</p>
      {submittedAt && (
        <p className="mt-1 text-xs text-gray-400">提交时间：{formatReviewDateTime(submittedAt)}</p>
      )}
      {closedAt && (
        <p className="mt-1 text-xs text-gray-400">关闭时间：{formatReviewDateTime(closedAt)}</p>
      )}

      {(mutationError || incompleteFields.length > 0) && (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
          {mutationError && <p className="text-gray-700">{mutationError}</p>}
          {incompleteFields.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-gray-600">
              {incompleteFields.map(field => (
                <li key={field}>{INCOMPLETE_FIELD_LABELS[field]}</li>
              ))}
            </ul>
          )}
          {incompleteFields.length > 0 && presentation.canEdit && (
            <Link href={editHref} className="btn-secondary mt-2 inline-block">去编辑</Link>
          )}
          {incompleteFields.length > 0 && !presentation.canEdit && (
            <p className="mt-2 text-gray-600">请联系项目负责人或管理员补充复盘内容。</p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {presentation.canEdit && (
          <Link href={editHref} className="btn-secondary">编辑复盘</Link>
        )}
        {presentation.canSubmit && (
          <button
            type="button"
            disabled={isMutating}
            onClick={() => setDialog('SUBMIT')}
            className="btn-primary"
          >
            提交复盘
          </button>
        )}
        {presentation.canReturnToDraft && (
          <button
            type="button"
            disabled={isMutating}
            onClick={() => setDialog('RETURN')}
            className="btn-secondary"
          >
            退回修改
          </button>
        )}
        {presentation.canClose && (
          <button
            type="button"
            disabled={isMutating}
            onClick={() => setDialog('CLOSE')}
            className="btn-primary"
          >
            关闭复盘
          </button>
        )}
        {presentation.canReopenClosed && (
          <button
            type="button"
            disabled={isMutating}
            onClick={() => {
              setReopenError(null);
              setDialog('REOPEN');
            }}
            className="btn-secondary"
          >
            重新打开
          </button>
        )}
      </div>

      <ConfirmDialog
        open={dialog === 'SUBMIT'}
        title="提交复盘？"
        message="提交后将进入“待确认”状态，复盘内容将暂时无法编辑。确认提交当前复盘吗？"
        confirmLabel={isMutating ? '提交中…' : '确认提交'}
        confirmDisabled={isMutating}
        onConfirm={() => void runMutation('SUBMIT')}
        onCancel={() => { if (!isMutating) setDialog(null); }}
      />
      <ConfirmDialog
        open={dialog === 'CLOSE'}
        title="关闭复盘？"
        message="关闭后本次复盘将进入“已关闭”状态。关闭复盘仅代表本次复盘流程完成，不代表生产、品质或出货放行。"
        confirmLabel={isMutating ? '关闭中…' : '确认关闭'}
        confirmDisabled={isMutating}
        variant="danger"
        onConfirm={() => void runMutation('CLOSE')}
        onCancel={() => { if (!isMutating) setDialog(null); }}
      />
      <ConfirmDialog
        open={dialog === 'RETURN'}
        title="退回修改？"
        message="复盘将恢复为“草稿”状态，负责人可继续编辑并重新提交。"
        confirmLabel={isMutating ? '退回中…' : '确认退回'}
        confirmDisabled={isMutating}
        onConfirm={() => void runMutation('RETURN')}
        onCancel={() => { if (!isMutating) setDialog(null); }}
      />

      {dialog === 'REOPEN' && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reopen-dialog-title"
          onClick={() => { if (!isMutating) closeReopenDialog(); }}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={event => event.stopPropagation()}
          >
            <h3 id="reopen-dialog-title" className="text-lg font-semibold text-gray-800 mb-2">重新打开复盘</h3>
            <p className="text-sm text-gray-600 mb-4">
              重新打开后，复盘将恢复为“草稿”状态，可以继续修改并重新提交。
            </p>
            <label className="block text-xs text-gray-500 mb-1" htmlFor="reopen-reason">
              重新打开原因 *
            </label>
            <textarea
              id="reopen-reason"
              value={reopenReason}
              onChange={event => setReopenReason(event.target.value)}
              maxLength={1000}
              disabled={isMutating}
              className="w-full rounded border border-gray-300 p-2 text-sm"
              rows={4}
            />
            <p className="mt-1 text-right text-xs text-gray-400">{reopenReason.length} / 1000</p>
            {reopenError && (
              <p className="mt-2 text-sm text-red-600">{reopenError}</p>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!isMutating) closeReopenDialog();
                }}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isMutating}
                onClick={handleReopenConfirm}
                className="btn-primary"
              >
                {isMutating ? '重新打开中…' : '确认重新打开'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
