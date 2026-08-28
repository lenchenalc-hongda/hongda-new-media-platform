'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';
import CaseCurationEditor from '@/components/review-center/case/CaseCurationEditor';
import CaseMetadataComparison from '@/components/review-center/case/CaseMetadataComparison';
import CaseStaleWarning from '@/components/review-center/case/CaseStaleWarning';
import type { CaseAdminDetail } from '@/lib/review-center/case-schemas';
import {
  CaseApiError,
  fetchCaseAdminDetail,
  runExclusiveOnce,
  updateCase,
} from '@/lib/review-center/case-api-client';
import {
  canManageCaseRole,
  caseReviewTypeLabel,
  caseRiskBadgeClass,
  caseRiskLabel,
  caseStatusLabel,
  sourceReviewStatusLabel,
} from '@/lib/review-center/case-presentation';
import {
  applyMutationResultToAdminState,
  buildCasePatch,
  canSaveCaseStatus,
  caseEditorDirty,
  confirmDiscardIfNeeded,
  editorBaselineFromAdmin,
  editorDraftFromBaseline,
  normalizeCaseEditorDraft,
  type CaseEditorBaseline,
  type CaseEditorDraft,
  type CaseEditorField,
} from '@/lib/review-center/case-manage';

export default function CaseManageWorkspacePage() {
  const params = useParams();
  const caseNo = Array.isArray(params.caseNo) ? params.caseNo[0] : params.caseNo;
  const [admin, setAdmin] = useState<CaseAdminDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [meRole, setMeRole] = useState<string | null>(null);
  const [meReady, setMeReady] = useState(false);
  const [baseline, setBaseline] = useState<CaseEditorBaseline | null>(null);
  const [draft, setDraft] = useState<CaseEditorDraft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CaseEditorField, string>>>({});
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success'>('idle');
  const [conflictMessage, setConflictMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mutationLockRef = useRef(false);

  const loadAdmin = useCallback(async (options?: { silent?: boolean }) => {
    if (!caseNo) {
      setErrorMessage('案例不存在或当前不可管理');
      setStatus('error');
      return;
    }
    const requestId = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (options?.silent) {
      setRefreshing(true);
    } else {
      setStatus('loading');
    }
    setErrorMessage('');

    try {
      const data = await fetchCaseAdminDetail(caseNo, { signal: controller.signal });
      if (requestId !== generationRef.current) return;
      const nextBaseline = editorBaselineFromAdmin(data);
      setAdmin(data);
      setBaseline(nextBaseline);
      setDraft(editorDraftFromBaseline(nextBaseline));
      setFieldErrors({});
      setTitleError(null);
      setSaveError('');
      setSaveMessage('');
      setSaveState('idle');
      setConflictMessage('');
      setStatus('ready');
    } catch (error) {
      if (requestId !== generationRef.current) return;
      setAdmin(null);
      setBaseline(null);
      setDraft(null);
      setFieldErrors({});
      setTitleError(null);
      setSaveError('');
      setSaveMessage('');
      setSaveState('idle');
      setConflictMessage('');
      if (error instanceof CaseApiError && error.status === 401) {
        setErrorMessage('登录状态已失效，请重新登录。');
      } else if (error instanceof CaseApiError && error.status === 403) {
        setErrorMessage('无权限访问管理功能');
      } else if (error instanceof CaseApiError && error.status === 404) {
        setErrorMessage('案例不存在或当前不可管理');
      } else {
        setErrorMessage('案例管理信息加载失败，请稍后重试。');
      }
      setStatus('error');
    } finally {
      if (requestId === generationRef.current) {
        setRefreshing(false);
        abortRef.current = null;
      }
    }
  }, [caseNo]);

  useEffect(() => {
    let active = true;
    fetch('/api/review-center/me')
      .then(response => response.json().catch(() => null))
      .then(data => {
        if (!active) return;
        setMeRole(typeof data?.role === 'string' ? data.role : null);
        setMeReady(true);
      })
      .catch(() => {
        if (active) {
          setMeRole(null);
          setMeReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadAdmin();
    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
    };
  }, [loadAdmin]);

  const dirty = useMemo(
    () => !!(baseline && draft && caseEditorDirty(baseline, draft)),
    [baseline, draft],
  );

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  function handleDraftChange(field: CaseEditorField, value: string) {
    setDraft(prev => (prev ? { ...prev, [field]: value } : prev));
    setSaveError('');
    setSaveMessage('');
    setConflictMessage('');
    setSaveState('idle');
    if (field === 'title') setTitleError(null);
    setFieldErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function handleDiscard() {
    if (!baseline) return;
    setDraft(editorDraftFromBaseline(baseline));
    setFieldErrors({});
    setTitleError(null);
    setSaveError('');
    setSaveMessage('');
    setConflictMessage('');
    setSaveState('idle');
  }

  async function handleSave() {
    if (mutationLockRef.current) return;
    if (!admin || !canSaveCaseStatus(admin.status)) return;
    if (!baseline || !draft || !caseNo) return;
    const patchResult = buildCasePatch(baseline, draft);
    setTitleError(patchResult.errors.titleError);
    setFieldErrors(patchResult.errors.fieldErrors);
    if (patchResult.errors.titleError) {
      setSaveError(patchResult.errors.titleError);
      return;
    }
    if (!patchResult.dirty) return;

    setSaveError('');
    setSaveMessage('');
    const executed = await runExclusiveOnce(mutationLockRef, async () => {
      setSaveState('saving');
      try {
        const result = await updateCase(caseNo, {
          expectedVersion: admin.version,
          patch: patchResult.patch,
        });
        const nextBaseline = normalizeCaseEditorDraft(draft);
        setAdmin(prev => (prev ? { ...prev, ...applyMutationResultToAdminState(result, prev) } : prev));
        setBaseline(nextBaseline);
        setDraft(editorDraftFromBaseline(nextBaseline));
        setFieldErrors({});
        setTitleError(null);
        setConflictMessage('');
        setSaveMessage('保存成功');
        setSaveState('success');
      } catch (error) {
        if (error instanceof CaseApiError && error.code === 'VERSION_CONFLICT') {
          setConflictMessage('该案例已被其他操作更新，请刷新后再继续。');
        } else if (error instanceof CaseApiError && error.code === 'INVALID_TRANSITION') {
          setConflictMessage('案例状态已发生变化，当前修改尚未保存，请刷新最新状态后再继续。');
        } else if (error instanceof CaseApiError && error.status === 403) {
          setSaveError('无权限执行该操作');
        } else if (error instanceof CaseApiError && error.status === 404) {
          setSaveError('案例不存在或当前不可管理');
        } else {
          setSaveError('保存失败，请稍后重试');
        }
        setSaveState('idle');
      } finally {
        setSaveState(prev => (prev === 'success' ? 'success' : 'idle'));
      }
    });
    if (executed === null) return;
  }

  function handleManualRefresh() {
    if (!confirmDiscardIfNeeded(dirty, message => window.confirm(message))) return;
    setConflictMessage('');
    void loadAdmin({ silent: true });
  }

  function guardNavigation(event: React.MouseEvent) {
    if (dirty && !window.confirm('当前有未保存修改，确定离开吗？')) {
      event.preventDefault();
    }
  }

  const noPermission = (meReady && !canManageCaseRole(meRole))
    || (status === 'error' && errorMessage === '无权限访问管理功能');

  if (noPermission) {
    return (
      <AppLayout>
        <PageHeader title="案例管理概览" description="查看案例当前状态与基础信息。" />
        <ReviewCenterEmpty
          title="无权限访问管理功能"
          description="只有管理员或经理可以查看案例管理信息。"
          action={{ label: '返回案例中心', href: '/review-center/cases' }}
        />
      </AppLayout>
    );
  }

  if (status === 'loading' && !admin) {
    return (
      <AppLayout>
        <PageHeader title="案例管理概览" description="加载中..." />
        <div className="space-y-3" aria-busy="true" aria-label="案例管理信息加载中">
          <div className="h-32 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
          <div className="h-40 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
          <div className="h-40 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
        </div>
      </AppLayout>
    );
  }

  if (status === 'error' || !admin || !baseline || !draft) {
    return (
      <AppLayout>
        <PageHeader title="案例管理概览" description="无法读取案例管理信息" />
        <ReviewCenterEmpty
          title={errorMessage || '案例管理信息加载失败，请稍后重试。'}
          action={{ label: '返回案例中心', href: '/review-center/cases' }}
        />
        {status === 'error' && errorMessage !== '无权限访问管理功能' && (
          <div className="mt-4 text-center">
            <button type="button" className="btn-secondary" onClick={() => void loadAdmin()}>
              重新加载
            </button>
          </div>
        )}
      </AppLayout>
    );
  }

  const editable = admin.status === 'DRAFT';

  return (
    <AppLayout>
      <PageHeader
        title="案例管理概览"
        description="查看案例当前状态与基础信息。"
        actions={(
          <button
            type="button"
            className="btn-secondary"
            disabled={refreshing}
            onClick={handleManualRefresh}
          >
            {refreshing ? '刷新中...' : '刷新最新版本'}
          </button>
        )}
      />

      <div className="mb-5 flex flex-wrap gap-3 text-sm">
        <Link
          href="/review-center/cases/candidates"
          className="text-blue-600 no-underline"
          onClick={guardNavigation}
        >
          返回待整理案例
        </Link>
        <span className="text-gray-300">|</span>
        <Link
          href="/review-center/cases"
          className="text-blue-600 no-underline"
          onClick={guardNavigation}
        >
          返回案例中心
        </Link>
      </div>

      <div className="mb-5 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">{admin.title}</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs text-gray-400">案例编号</dt>
            <dd className="mt-1 text-gray-800">{admin.caseNo}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">状态</dt>
            <dd className="mt-1">
              <span className="badge-gray">{caseStatusLabel(admin.status)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">复盘类型</dt>
            <dd className="mt-1 text-gray-800">{caseReviewTypeLabel(admin.reviewTypeSnapshot)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">风险等级</dt>
            <dd className="mt-1">
              <span className={caseRiskBadgeClass(admin.riskSnapshot)}>
                {caseRiskLabel(admin.riskSnapshot)}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="mb-5 rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-3 font-medium text-gray-800">来源信息</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs text-gray-400">来源复盘编号</dt>
            <dd className="mt-1 text-gray-800">{admin.sourceReviewNo || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">来源复盘状态</dt>
            <dd className="mt-1 text-gray-800">{sourceReviewStatusLabel(admin.sourceCurrentStatus)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">来源复盘版本</dt>
            <dd className="mt-1 text-gray-800">{admin.sourceCurrentVersion ?? '-'}</dd>
          </div>
        </dl>
        <div className="mt-4">
          <Link
            href={`/review-center/reviews/${encodeURIComponent(admin.sourceReviewId)}`}
            className="text-sm text-blue-600 no-underline"
            onClick={guardNavigation}
          >
            {admin.sourceReviewNo || '查看来源复盘'}
          </Link>
        </div>
      </div>

      <CaseStaleWarning admin={admin} />

      <div className="mb-5 rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-gray-800">案例内容</h3>
          {editable && (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={saveState === 'saving'}
                onClick={handleDiscard}
              >
                取消修改
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={saveState === 'saving' || !dirty}
                onClick={() => void handleSave()}
              >
                {saveState === 'saving' ? '保存中...' : '保存'}
              </button>
            </div>
          )}
        </div>

        {saveMessage && (
          <div className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
            {saveMessage}
          </div>
        )}
        {saveError && (
          <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}
        {conflictMessage && (
          <div className="mb-4 rounded-md bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            <p>{conflictMessage}</p>
            <button
              type="button"
              className="btn-secondary mt-3"
              disabled={refreshing}
              onClick={handleManualRefresh}
            >
              刷新最新版本
            </button>
          </div>
        )}

        <CaseCurationEditor
          draft={draft}
          editable={editable}
          titleError={titleError}
          fieldErrors={fieldErrors}
          onDraftChange={handleDraftChange}
        />
      </div>

      <div className="mb-5">
        <h3 className="mb-3 font-medium text-gray-800">案例分类</h3>
        <CaseMetadataComparison admin={admin} />
      </div>
    </AppLayout>
  );
}
