'use client';
import { useEffect, useState } from 'react';
import type { CaseHideContext } from './CaseManageActionBar';
import { normalizeHideReason } from '@/lib/review-center/case-manage';

interface CaseHideDialogProps {
  context: CaseHideContext;
  inFlight: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export default function CaseHideDialog({
  context,
  inFlight,
  onClose,
  onConfirm,
}: CaseHideDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (inFlight) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inFlight, onClose]);

  function handleConfirm() {
    const result = normalizeHideReason(reason);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
    onConfirm(result.reason);
  }

  const title = context === 'RECURATE' ? '隐藏并重新整理案例' : '隐藏案例';
  const description = context === 'RECURATE'
    ? '需要先隐藏案例，之后才能重新打开整理。隐藏原因将用于记录本次操作。'
    : '隐藏后案例将不再出现在公开案例库。隐藏原因将用于记录本次操作。';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6" role="dialog" aria-modal="true" aria-label={title}>
        <h3 className="mb-2 text-lg font-semibold text-gray-800">{title}</h3>
        <p className="mb-4 text-sm text-gray-600">{description}</p>

        <label htmlFor="case-hide-reason" className="mb-1 block text-xs text-gray-500">
          隐藏原因
        </label>
        <textarea
          id="case-hide-reason"
          value={reason}
          disabled={inFlight}
          maxLength={1000}
          rows={4}
          onChange={event => {
            setReason(event.target.value);
            setError('');
          }}
          className="input-field w-full"
          aria-invalid={!!error}
        />
        {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-secondary" disabled={inFlight} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn-primary" disabled={inFlight} onClick={handleConfirm}>
            {inFlight ? '处理中...' : '确认隐藏'}
          </button>
        </div>
      </div>
    </div>
  );
}
