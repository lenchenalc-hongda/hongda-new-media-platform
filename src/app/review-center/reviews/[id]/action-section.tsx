'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionReadDto } from '@/lib/review-center/actions';
import {
  cancelAction,
  createAction,
  fetchActionOwnerDirectory,
  fetchActions,
  returnAction,
  startAction,
  submitActionForVerification,
  updateAction,
  verifyAction,
  type ActionOwnerCandidate,
} from '@/lib/review-center/action-client';
import {
  ACTION_READ_ERROR_MESSAGE,
  ACTION_REFRESH_FAILURE_MESSAGE,
  canCreateActionForReview,
  getActionCommandErrorPresentation,
  getActionPresentationCapabilities,
  getActionSectionEmptyCopy,
  getActionSectionNonFinalWarning,
} from '@/lib/review-center/action-presentation';
import ActionCard from './action-card';
import {
  ActionFormDialog,
  CancelDialog,
  ReturnDialog,
  SubmitDialog,
  VerifyDialog,
  type ActionFormValues,
} from './action-dialogs';

interface ActionSectionProps {
  reviewId: string;
  reviewStatus: string;
  reviewOwnerProfileId: string;
  reviewPmoProfileId: string | null;
  currentProfileId: string | null;
  currentRole: string | null;
}

type LoadMode = 'initial' | 'retry' | 'refresh';

interface PendingCommand {
  actionId: string | null;
  command: string;
}

export default function ActionSection({
  reviewId,
  reviewStatus,
  reviewOwnerProfileId,
  reviewPmoProfileId,
  currentProfileId,
  currentRole,
}: ActionSectionProps) {
  const [actions, setActions] = useState<ActionReadDto[] | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadMessage, setLoadMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editAction, setEditAction] = useState<ActionReadDto | null>(null);
  const [submitDialogAction, setSubmitDialogAction] = useState<ActionReadDto | null>(null);
  const [verifyDialogAction, setVerifyDialogAction] = useState<ActionReadDto | null>(null);
  const [returnDialogAction, setReturnDialogAction] = useState<ActionReadDto | null>(null);
  const [cancelDialogAction, setCancelDialogAction] = useState<ActionReadDto | null>(null);
  const [sectionMessage, setSectionMessage] = useState<{
    kind: 'success' | 'error' | 'warning';
    text: string;
  } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);
  const [ownerCandidates, setOwnerCandidates] = useState<ActionOwnerCandidate[] | null>(null);
  const [ownerState, setOwnerState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const fetchRequestRef = useRef(0);
  const ownerRequestRef = useRef(0);
  const ownerLoadingRef = useRef(false);
  const ownerCacheRef = useRef<ActionOwnerCandidate[] | null>(null);
  const mutationLockRef = useRef(false);

  const fetchActionList = useCallback(async (mode: LoadMode): Promise<boolean> => {
    const requestId = ++fetchRequestRef.current;
    if (mode === 'initial' || mode === 'retry') {
      setLoadState('loading');
      setLoadMessage('');
    } else {
      setRefreshing(true);
      setRefreshError(null);
    }
    try {
      const items = await fetchActions(reviewId);
      if (requestId !== fetchRequestRef.current) return false;
      setActions(items);
      setLoadState('ready');
      return true;
    } catch (error) {
      if (requestId !== fetchRequestRef.current) return false;
      if (mode === 'refresh') {
        setRefreshError(ACTION_READ_ERROR_MESSAGE);
      } else {
        setLoadState('error');
        setLoadMessage(ACTION_READ_ERROR_MESSAGE);
      }
      return false;
    } finally {
      if (requestId === fetchRequestRef.current) {
        setRefreshing(false);
      }
    }
  }, [reviewId]);

  const closeAllDialogs = useCallback(() => {
    setCreateOpen(false);
    setEditAction(null);
    setSubmitDialogAction(null);
    setVerifyDialogAction(null);
    setReturnDialogAction(null);
    setCancelDialogAction(null);
    setDialogError(null);
  }, []);

  const loadOwnerDirectory = useCallback(async () => {
    if (ownerLoadingRef.current || ownerCacheRef.current) {
      if (ownerCacheRef.current) {
        setOwnerCandidates(ownerCacheRef.current);
        setOwnerState('ready');
      }
      return;
    }
    const requestId = ++ownerRequestRef.current;
    ownerLoadingRef.current = true;
    setOwnerState('loading');
    try {
      const items = await fetchActionOwnerDirectory();
      if (requestId !== ownerRequestRef.current) return;
      ownerCacheRef.current = items;
      setOwnerCandidates(items);
      setOwnerState('ready');
    } catch {
      if (requestId !== ownerRequestRef.current) return;
      ownerCacheRef.current = null;
      setOwnerCandidates(null);
      setOwnerState('error');
    } finally {
      if (requestId === ownerRequestRef.current) {
        ownerLoadingRef.current = false;
      }
    }
  }, []);

  const invalidateOwnerDirectory = useCallback(() => {
    ownerRequestRef.current += 1;
    ownerLoadingRef.current = false;
    ownerCacheRef.current = null;
    setOwnerCandidates(null);
    setOwnerState('idle');
  }, []);

  useEffect(() => {
    ownerCacheRef.current = null;
    setOwnerCandidates(null);
    setOwnerState('idle');
    setActions(null);
    setLoadState('loading');
    setLoadMessage('');
    setRefreshError(null);
    setExpandedActionId(null);
    setSectionMessage(null);
    setDialogError(null);
    setPendingCommand(null);
    closeAllDialogs();
    void fetchActionList('initial');
  }, [reviewId, fetchActionList, closeAllDialogs]);

  const runActionCommand = useCallback(async (
    command: string,
    actionId: string | null,
    request: () => Promise<unknown>,
    successText: string,
  ) => {
    if (mutationLockRef.current) return;
    mutationLockRef.current = true;
    setPendingCommand({ actionId, command });
    setSectionMessage(null);
    setDialogError(null);
    try {
      await request();
      closeAllDialogs();
      const refreshed = await fetchActionList('refresh');
      if (refreshed) {
        setSectionMessage({ kind: 'success', text: successText });
      } else {
        setSectionMessage({
          kind: 'warning',
          text: ACTION_REFRESH_FAILURE_MESSAGE,
        });
      }
    } catch (error) {
      const presentation = getActionCommandErrorPresentation(error);
      setSectionMessage({ kind: 'error', text: presentation.message });
      if (presentation.shouldCloseDialog) {
        closeAllDialogs();
      } else {
        setDialogError(presentation.message);
      }
      if (presentation.shouldReloadOwnerDirectory) {
        invalidateOwnerDirectory();
        void loadOwnerDirectory();
      }
      if (presentation.shouldRefetchActions) {
        void fetchActionList('refresh');
      }
    } finally {
      mutationLockRef.current = false;
      setPendingCommand(null);
    }
  }, [fetchActionList, closeAllDialogs, invalidateOwnerDirectory, loadOwnerDirectory]);

  const openCreateDialog = useCallback(() => {
    setSectionMessage(null);
    setDialogError(null);
    setCreateOpen(true);
    void loadOwnerDirectory();
  }, [loadOwnerDirectory]);

  const openEditDialog = useCallback((action: ActionReadDto) => {
    setSectionMessage(null);
    setDialogError(null);
    setEditAction(action);
    void loadOwnerDirectory();
  }, [loadOwnerDirectory]);

  const handleCreateSubmit = useCallback((values: ActionFormValues) => {
    void runActionCommand(
      'create',
      null,
      () => createAction(reviewId, {
        title: values.title.trim(),
        description: values.description.trim() === '' ? null : values.description,
        actionType: values.actionType,
        ownerProfileId: values.ownerProfileId,
        dueDate: values.dueDate,
      }),
      '改善行动已创建。',
    );
  }, [reviewId, runActionCommand]);

  const handleEditSubmit = useCallback((values: ActionFormValues) => {
    if (!editAction) return;
    const action = editAction;
    void runActionCommand(
      'edit',
      action.id,
      () => updateAction(reviewId, action.id, {
        expectedVersion: action.version,
        title: values.title.trim(),
        description: values.description.trim() === '' ? null : values.description,
        actionType: values.actionType,
        ownerProfileId: values.ownerProfileId,
        dueDate: values.dueDate,
      }),
      '改善行动已更新。',
    );
  }, [editAction, reviewId, runActionCommand]);

  const handleStart = useCallback((action: ActionReadDto) => {
    void runActionCommand(
      'start',
      action.id,
      () => startAction(reviewId, action.id, action.version),
      '改善行动已开始执行。',
    );
  }, [reviewId, runActionCommand]);

  const handleSubmit = useCallback((action: ActionReadDto, note: string) => {
    void runActionCommand(
      'submit',
      action.id,
      () => submitActionForVerification(reviewId, action.id, action.version, note),
      '改善行动已提交验证。',
    );
  }, [reviewId, runActionCommand]);

  const handleVerify = useCallback((action: ActionReadDto, note: string | null) => {
    void runActionCommand(
      'verify',
      action.id,
      () => verifyAction(reviewId, action.id, action.version, note),
      '改善行动已验证通过。',
    );
  }, [reviewId, runActionCommand]);

  const handleReturn = useCallback((action: ActionReadDto, reason: string) => {
    void runActionCommand(
      'return',
      action.id,
      () => returnAction(reviewId, action.id, action.version, reason),
      '改善行动已退回修改。',
    );
  }, [reviewId, runActionCommand]);

  const handleCancel = useCallback((action: ActionReadDto, reason: string) => {
    void runActionCommand(
      'cancel',
      action.id,
      () => cancelAction(reviewId, action.id, action.version, reason),
      '改善行动已取消。',
    );
  }, [reviewId, runActionCommand]);

  const canCreate = canCreateActionForReview({
    reviewStatus,
    currentRole,
    currentProfileId,
    reviewOwnerProfileId,
    reviewPmoProfileId,
  });
  const actionCount = actions?.length ?? 0;
  const nonFinalWarning = actions
    ? getActionSectionNonFinalWarning(actions)
    : null;
  const emptyCopy = getActionSectionEmptyCopy(canCreate);
  const anyCommandPending = pendingCommand !== null;

  return (
    <section id="review-actions-section" className="bg-white border border-gray-200 rounded-lg p-6 mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-gray-800">改善行动</h2>
          <p className="mt-1 text-sm text-gray-400">
            跟踪问题整改、责任人、完成和验证闭环
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">共 {actionCount} 项</span>
          {refreshing && <span className="text-xs text-gray-400">刷新中…</span>}
          {canCreate && (
            <button
              type="button"
              disabled={anyCommandPending}
              onClick={openCreateDialog}
              className="btn-primary btn-sm"
            >
              + 新建改善行动
            </button>
          )}
        </div>
      </div>

      {nonFinalWarning && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {nonFinalWarning}
        </div>
      )}

      {refreshError && (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          {refreshError}
          <button
            type="button"
            onClick={() => void fetchActionList('refresh')}
            className="ml-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          >
            重试
          </button>
        </div>
      )}

      {sectionMessage && (
        <div className={`mt-3 rounded-md border p-3 text-sm ${
          sectionMessage.kind === 'success'
            ? 'border-green-200 bg-green-50 text-green-800'
            : sectionMessage.kind === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {sectionMessage.text}
        </div>
      )}

      {loadState === 'loading' && (
        <p className="py-8 text-center text-sm text-gray-500">正在加载改善行动…</p>
      )}

      {loadState === 'error' && (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-600">{loadMessage || '改善行动加载失败'}</p>
          <button
            type="button"
            onClick={() => void fetchActionList('retry')}
            className="mt-3 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            重试
          </button>
        </div>
      )}

      {loadState === 'ready' && actions && actions.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-600">{emptyCopy.title}</p>
          {emptyCopy.description && (
            <p className="mt-1 text-xs text-gray-400">{emptyCopy.description}</p>
          )}
          {canCreate && (
            <button
              type="button"
              disabled={anyCommandPending}
              onClick={openCreateDialog}
              className="btn-primary mt-4"
            >
              新建改善行动
            </button>
          )}
        </div>
      )}

      {loadState === 'ready' && actions && actions.length > 0 && (
        <div className="mt-4 space-y-3">
          {actions.map(action => {
            const capabilities = getActionPresentationCapabilities({
              reviewStatus,
              currentRole,
              currentProfileId,
              reviewOwnerProfileId,
              reviewPmoProfileId,
              actionStatus: action.status,
              actionOwnerProfileId: action.owner.profileId,
            });
            const isPending = pendingCommand?.actionId === action.id;
            return (
              <ActionCard
                key={action.id}
                action={action}
                capabilities={capabilities}
                expanded={expandedActionId === action.id}
                pending={isPending}
                disabled={anyCommandPending}
                onToggle={() => setExpandedActionId(prev => prev === action.id ? null : action.id)}
                onEdit={() => openEditDialog(action)}
                onStart={() => handleStart(action)}
                onSubmit={() => setSubmitDialogAction(action)}
                onVerify={() => setVerifyDialogAction(action)}
                onReturn={() => setReturnDialogAction(action)}
                onCancel={() => setCancelDialogAction(action)}
              />
            );
          })}
        </div>
      )}

      <ActionFormDialog
        open={createOpen || !!editAction}
        mode={editAction ? 'edit' : 'create'}
        action={editAction}
        candidates={ownerCandidates ?? []}
        ownerState={ownerState}
        pending={anyCommandPending}
        error={dialogError}
        onRetryOwnerDirectory={() => {
          invalidateOwnerDirectory();
          void loadOwnerDirectory();
        }}
        onCancel={closeAllDialogs}
        onSubmit={editAction ? handleEditSubmit : handleCreateSubmit}
      />
      <SubmitDialog
        action={submitDialogAction}
        pending={anyCommandPending}
        error={dialogError}
        onCancel={() => setSubmitDialogAction(null)}
        onSubmit={note => { if (submitDialogAction) handleSubmit(submitDialogAction, note); }}
      />
      <VerifyDialog
        action={verifyDialogAction}
        pending={anyCommandPending}
        error={dialogError}
        onCancel={() => setVerifyDialogAction(null)}
        onSubmit={note => { if (verifyDialogAction) handleVerify(verifyDialogAction, note); }}
      />
      <ReturnDialog
        action={returnDialogAction}
        pending={anyCommandPending}
        error={dialogError}
        onCancel={() => setReturnDialogAction(null)}
        onSubmit={reason => { if (returnDialogAction) handleReturn(returnDialogAction, reason); }}
      />
      <CancelDialog
        action={cancelDialogAction}
        pending={anyCommandPending}
        error={dialogError}
        onCancel={() => setCancelDialogAction(null)}
        onSubmit={reason => { if (cancelDialogAction) handleCancel(cancelDialogAction, reason); }}
      />
    </section>
  );
}
