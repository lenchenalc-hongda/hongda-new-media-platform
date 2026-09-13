'use client';
import { useEffect, useRef, useState } from 'react';
import type { CaseCandidateItem, CaseMutationResult } from '@/lib/review-center/case-schemas';
import {
  CaseApiError,
  createCase,
  runExclusiveOnce,
} from '@/lib/review-center/case-api-client';
import { caseReviewTypeLabel } from '@/lib/review-center/case-presentation';

interface CaseCreateDialogProps {
  candidate: CaseCandidateItem;
  onClose: () => void;
  onCreated: (result: CaseMutationResult) => void;
  onClosedError: (message: string) => void;
}

export default function CaseCreateDialog({
  candidate,
  onClose,
  onCreated,
  onClosedError,
}: CaseCreateDialogProps) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [inFlight, setInFlight] = useState(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (inFlight) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inFlight, onClose]);

  async function handleSubmit() {
    if (inFlightRef.current) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('请输入案例标题。');
      return;
    }
    if (trimmedTitle.length > 200) {
      setError('案例标题不能超过 200 字。');
      return;
    }

    setError('');
    setInFlight(true);
    try {
      const result = await runExclusiveOnce(inFlightRef, () => createCase({
        sourceReviewId: candidate.sourceReviewId,
        expectedReviewVersion: candidate.sourceVersion,
        title: trimmedTitle,
      }));
      if (!result) return;
      onCreated(result);
    } catch (err) {
      if (err instanceof CaseApiError) {
        if (err.code === 'ALREADY_EXISTS') {
          onClosedError('该复盘已经建立案例，请刷新待整理列表。');
          return;
        }
        if (err.code === 'SOURCE_VERSION_CONFLICT') {
          onClosedError('来源复盘已更新，请刷新待整理列表后重新确认。');
          return;
        }
        if (err.code === 'SOURCE_NOT_CLOSED') {
          onClosedError('来源复盘状态已变化，当前不能整理为案例，请刷新列表。');
          return;
        }
        if (err.code === 'NOT_FOUND') {
          onClosedError('来源复盘不存在或当前不可访问，请刷新列表。');
          return;
        }
        if (err.status === 403) {
          setError('无权限执行该操作');
          return;
        }
        if (err.code === 'CASE_NUMBER_EXHAUSTED') {
          setError('案例编号暂时无法生成，请联系管理员。');
          return;
        }
      }
      setError('创建案例失败，请稍后重试。');
    } finally {
      setInFlight(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6" role="dialog" aria-modal="true" aria-label="整理为案例">
        <h3 className="mb-2 text-lg font-semibold text-gray-800">整理为案例</h3>
        <dl className="mb-4 space-y-2 text-sm">
          <div>
            <dt className="text-xs text-gray-400">来源复盘</dt>
            <dd className="mt-0.5 text-gray-800">
              {candidate.reviewNo} · {caseReviewTypeLabel(candidate.reviewType)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">分类摘要</dt>
            <dd className="mt-1">
              {candidate.metadataSummary.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {candidate.metadataSummary.map(item => (
                    <span
                      key={`${item.metadataType}:${item.code}`}
                      className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-700"
                    >
                      {item.label || item.code}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-gray-500">暂无分类信息</span>
              )}
            </dd>
          </div>
        </dl>

        <label htmlFor="case-create-title" className="mb-1 block text-xs text-gray-500">
          案例标题
        </label>
        <input
          id="case-create-title"
          value={title}
          onChange={event => setTitle(event.target.value)}
          disabled={inFlight}
          maxLength={200}
          placeholder="输入简洁、可检索的案例标题"
          className="input-field"
        />

        {error && (
          <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-secondary" disabled={inFlight} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={inFlight}
            onClick={() => void handleSubmit()}
          >
            {inFlight ? '创建中…' : '创建案例'}
          </button>
        </div>
      </div>
    </div>
  );
}
