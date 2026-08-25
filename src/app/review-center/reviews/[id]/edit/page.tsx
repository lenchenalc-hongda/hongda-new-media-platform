'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';
import { reviewStatusLabel } from '@/lib/review-center/formatters';
import type { ReviewDetail, ReviewType, RiskLevel } from '@/lib/review-center/types';
import {
  buildAssignmentsRequest,
  canManageAssignments,
  classifyAssignmentsMutationError,
  eligibleAssignmentIds,
  isAssignmentsDirty,
  normalizeAssignments,
  planAssignmentsFallbackSync,
  resolveAssignmentDisplay,
  validateAssignmentDraft,
  type AssignmentCandidate,
  type AssignmentsSaveState,
  type AssignmentsState,
} from '@/lib/review-center/assignments-editor';
import {
  analyzeBasicFallbackRebase,
  basicInfoDirty,
  canEditDraft,
  classifyEditorDetailLoadStatus,
  classifyMutationResponse,
  createEditorMutationLock,
  diffBasicInfo,
  extractMutationVersion,
  isReviewTypeLocked,
  normalizeBasicInfo,
  type BasicInfoDraft,
  type EditorMe,
  type EditorMutationKind,
  type EditorMutationLock,
  type EditorMutationState,
} from '@/lib/review-center/editor';
import {
  classifyTypeDetailsMutationResponse,
  diffTypeDetails,
  extractTypeDetailsSaveResult,
  isTypeDetailsDirty,
  normalizeTypeDetails,
  planTypeDetailsFallbackSync,
  TYPE_DETAILS_FALLBACK_SYNC_FAILURE_MESSAGE,
  type AdditionalNoteRow,
  type TypeDetailFieldKey,
  type TypeDetailsDraft,
  TYPE_DETAIL_GROUPS,
  TYPE_DETAIL_LABELS,
  getReviewTypeChangeBlockReason,
  typeDetailsSaveBlockedByBasic,
} from '@/lib/review-center/type-details-editor';

const TYPE_OPTIONS: ReviewType[] = ['A', 'B', 'C'];
const RISK_OPTIONS: RiskLevel[] = ['RED', 'YELLOW', 'GREEN'];
const BASIC_FALLBACK_CONFLICT_MESSAGE =
  '专项内容已保存，但基础信息在你编辑期间也被其他人更新。为避免覆盖他人的修改，请重新加载最新数据后继续。';
const ASSIGNMENTS_FALLBACK_CONFLICT_MESSAGE =
  '专项内容已保存，但负责人设置在你编辑期间也被其他人更新。为避免覆盖他人的修改，请重新加载最新数据后继续。';
const LONG_TYPE_FIELDS = new Set<TypeDetailFieldKey>([
  'pre_production_stage',
  'problem_found_stage',
  'order_loss_reason',
  'customer_trust_impact',
  'abnormal_phenomenon',
  'defect_items',
  'delivery_impact',
  'onsite_records',
  'frontend_stage',
  'production_stage',
  'root_cause_summary',
  'responsibility',
  'improvement_advice',
]);

export default function ReviewEditPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [me, setMe] = useState<EditorMe | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [initialBasicInfo, setInitialBasicInfo] = useState<BasicInfoDraft | null>(null);
  const [draftBasicInfo, setDraftBasicInfo] = useState<BasicInfoDraft | null>(null);
  const [saveState, setSaveState] = useState<EditorMutationState>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [initialTypeDetails, setInitialTypeDetails] = useState<TypeDetailsDraft | null>(null);
  const [draftTypeDetails, setDraftTypeDetails] = useState<TypeDetailsDraft | null>(null);
  const [typeDetailsSaveState, setTypeDetailsSaveState] = useState<EditorMutationState>('idle');
  const [typeDetailsSaveMessage, setTypeDetailsSaveMessage] = useState('');
  const [initialAssignments, setInitialAssignments] = useState<AssignmentsState | null>(null);
  const [draftAssignments, setDraftAssignments] = useState<AssignmentsState | null>(null);
  const [assignmentCandidates, setAssignmentCandidates] = useState<AssignmentCandidate[]>([]);
  const [assignmentDirectoryState, setAssignmentDirectoryState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [assignmentsSaveState, setAssignmentsSaveState] = useState<AssignmentsSaveState>('idle');
  const [assignmentsSaveMessage, setAssignmentsSaveMessage] = useState('');
  const mutationLockRef = useRef<EditorMutationLock | null>(null);
  if (mutationLockRef.current === null) {
    mutationLockRef.current = createEditorMutationLock();
  }
  const assignmentDirectoryRequestRef = useRef(0);
  const [activeMutation, setActiveMutation] = useState<EditorMutationKind | null>(null);

  async function loadAssignmentDirectory() {
    const requestId = ++assignmentDirectoryRequestRef.current;
    setAssignmentDirectoryState('loading');
    setAssignmentsSaveState('idle');
    setAssignmentsSaveMessage('');
    try {
      const response = await fetch('/api/review-center/profile-directory?purpose=ASSIGNMENT');
      const data = await response.json();
      if (requestId !== assignmentDirectoryRequestRef.current) return;
      if (!response.ok || !data?.ok || !Array.isArray(data?.data?.items)) {
        setAssignmentDirectoryState('error');
        return;
      }
      setAssignmentCandidates(data.data.items as AssignmentCandidate[]);
      setAssignmentDirectoryState('ready');
    } catch {
      if (requestId !== assignmentDirectoryRequestRef.current) return;
      setAssignmentDirectoryState('error');
    }
  }

  const loadEditor = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    setSaveState('idle');
    setSaveMessage('');
    setTypeDetailsSaveState('idle');
    setTypeDetailsSaveMessage('');
    try {
      const [meResponse, detailResponse] = await Promise.all([
        fetch('/api/review-center/me'),
        fetch(`/api/review-center/reviews/${encodeURIComponent(id)}`),
      ]);
      const [meData, detailData] = await Promise.all([
        meResponse.json(),
        detailResponse.json(),
      ]);
      if (meResponse.status === 401) {
        setLoadError('未登录或登录已过期');
        return;
      }
      const detailLoadStatus = classifyEditorDetailLoadStatus(detailResponse.status);
      if (detailLoadStatus === 'AUTH_REQUIRED') {
        setLoadError('未登录或登录已过期');
        return;
      }
      if (!meResponse.ok || meData.error || !meData.role) {
        setLoadError('当前账号信息读取失败');
        return;
      }
      if (detailLoadStatus === 'FORBIDDEN') {
        setLoadError('你没有权限访问此复盘');
        return;
      }
      if (detailLoadStatus === 'NOT_FOUND') {
        setLoadError('复盘不存在或无权访问');
        return;
      }
      if (!detailResponse.ok || detailData.error || !detailData.id) {
        setLoadError('复盘详情加载失败，请稍后重试');
        return;
      }
      const nextDetail = detailData as ReviewDetail;
      const nextMe: EditorMe = {
        role: meData.role,
        can_create_review: !!meData.can_create_review,
        profile_id: meData.profile_id ?? null,
      };
      const nextInitial = normalizeBasicInfo(nextDetail);
      setMe(nextMe);
      setDetail(nextDetail);
      setCurrentVersion(nextDetail.version);
      setInitialBasicInfo(nextInitial);
      setDraftBasicInfo(nextInitial);
      const nextTypeDetails = normalizeTypeDetails(nextDetail.type_details);
      setInitialTypeDetails(nextTypeDetails);
      setDraftTypeDetails(nextTypeDetails);
      const nextAssignments = normalizeAssignments(nextDetail);
      setInitialAssignments(nextAssignments);
      setDraftAssignments(nextAssignments);
      setAssignmentsSaveState('idle');
      setAssignmentsSaveMessage('');
      setAssignmentDirectoryState('idle');
      setAssignmentCandidates([]);
      if (nextDetail.status === 'draft' && (nextMe.role === 'admin' || nextMe.role === 'manager')) {
        void loadAssignmentDirectory();
      }
    } catch {
      setLoadError('复盘详情加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadEditor();
  }, [loadEditor]);

  const canEdit = canEditDraft({
    role: me?.role ?? 'viewer',
    status: detail?.status ?? 'draft',
    currentProfileId: me?.profile_id ?? null,
    ownerId: detail?.owner_id ?? '',
    pmoId: detail?.pmo_id ?? null,
  });
  const typeLocked = isReviewTypeLocked(detail?.type_details ?? null);
  const dirty = !!(initialBasicInfo && draftBasicInfo && basicInfoDirty(initialBasicInfo, draftBasicInfo));
  const blocked = saveState === 'conflict'
    || saveState === 'non_editable'
    || saveState === 'reload_required'
    || saveState === 'forbidden';
  const typeDetailsDirty = !!(initialTypeDetails && draftTypeDetails && isTypeDetailsDirty(initialTypeDetails, draftTypeDetails));
  const basicTypeChangePending = !!(
    initialBasicInfo
    && draftBasicInfo
    && typeDetailsSaveBlockedByBasic({
      basicInfoDirty: dirty,
      persistedReviewType: initialBasicInfo.review_type,
      draftReviewType: draftBasicInfo.review_type,
    })
  );
  const reviewTypeChangeBlockReason = !!initialBasicInfo && !!draftBasicInfo
    ? getReviewTypeChangeBlockReason({
        persistedReviewType: initialBasicInfo.review_type,
        draftReviewType: draftBasicInfo.review_type,
        typeDetailsDirty,
      })
    : null;
  const assignmentsEditable = canManageAssignments({
    role: me?.role ?? 'viewer',
    status: detail?.status ?? 'draft',
  });
  const assignmentsDirty = !!(
    initialAssignments
    && draftAssignments
    && isAssignmentsDirty(initialAssignments, draftAssignments)
  );
  const eligibleCandidateIds = useMemo(
    () => eligibleAssignmentIds(assignmentCandidates),
    [assignmentCandidates],
  );
  const assignmentValidation = draftAssignments
    ? validateAssignmentDraft(draftAssignments, eligibleCandidateIds)
    : null;
  const ownerAssignmentDisplay = draftAssignments
    ? resolveAssignmentDisplay(
        draftAssignments.ownerId,
        detail?.participants ?? [],
        assignmentCandidates,
        '负责人资料不可用',
      )
    : null;
  const pmoAssignmentDisplay = draftAssignments
    ? resolveAssignmentDisplay(
        draftAssignments.pmoId,
        detail?.participants ?? [],
        assignmentCandidates,
        'PMO资料不可用',
      )
    : null;

  function updateField(key: keyof BasicInfoDraft, value: string) {
    setDraftBasicInfo(prev => (prev ? { ...prev, [key]: value } : prev));
    if (saveState === 'saved' || saveState === 'validation' || saveState === 'error') {
      setSaveState('idle');
      setSaveMessage('');
    }
  }

  function acquireMutation(kind: EditorMutationKind): boolean {
    const lock = mutationLockRef.current;
    if (!lock || !lock.acquire(kind)) return false;
    setActiveMutation(kind);
    return true;
  }

  function releaseMutation() {
    mutationLockRef.current?.release();
    setActiveMutation(null);
  }

  function updateAssignmentOwner(ownerId: string) {
    setDraftAssignments(prev => (prev ? { ...prev, ownerId } : prev));
    if (assignmentsSaveState === 'saved' || assignmentsSaveState === 'validation' || assignmentsSaveState === 'error') {
      setAssignmentsSaveState('idle');
      setAssignmentsSaveMessage('');
    }
  }

  function updateAssignmentPmo(pmoId: string) {
    setDraftAssignments(prev => (prev ? { ...prev, pmoId: pmoId === '' ? null : pmoId } : prev));
    if (assignmentsSaveState === 'saved' || assignmentsSaveState === 'validation' || assignmentsSaveState === 'error') {
      setAssignmentsSaveState('idle');
      setAssignmentsSaveMessage('');
    }
  }

  async function handleAssignmentsSave() {
    if (!id || !initialAssignments || !draftAssignments || currentVersion === null) return;
    if (!assignmentsEditable || assignmentDirectoryState !== 'ready' || !assignmentValidation?.canSave) return;
    if (assignmentsSaveState === 'invalid_member') return;
    if (!acquireMutation('assignments')) return;

    setAssignmentsSaveState('saving');
    setAssignmentsSaveMessage('');
    try {
      const request = buildAssignmentsRequest(currentVersion, draftAssignments);
      const response = await fetch(`/api/review-center/reviews/${encodeURIComponent(id)}/assignments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const data = await response.json();
      if (!response.ok) {
        const info = classifyAssignmentsMutationError(response.status, data);
        if (info.globalState) {
          setSaveState(info.globalState);
          setSaveMessage(info.globalMessage);
        }
        setAssignmentsSaveState(info.scopedState ?? 'error');
        setAssignmentsSaveMessage(info.scopedMessage);
        return;
      }
      const saved = data?.data;
      if (!saved || typeof saved.version !== 'number' || typeof saved.owner_id !== 'string') {
        setAssignmentsSaveState('error');
        setAssignmentsSaveMessage('负责人设置保存失败，请稍后重试。');
        return;
      }
      const nextAssignments = normalizeAssignments({
        owner_id: saved.owner_id,
        pmo_id: saved.pmo_id ?? null,
      });
      setCurrentVersion(saved.version);
      setDetail(prev => (prev ? {
        ...prev,
        ...saved,
        type_details: prev.type_details,
        members: prev.members,
        participants: prev.participants,
      } : prev));
      setInitialAssignments(nextAssignments);
      setDraftAssignments(nextAssignments);
      setAssignmentsSaveState('saved');
      setAssignmentsSaveMessage('已保存');
    } catch {
      setAssignmentsSaveState('error');
      setAssignmentsSaveMessage('负责人设置保存失败，请稍后重试。');
    } finally {
      releaseMutation();
    }
  }

  async function handleSave() {
    if (!id || !initialBasicInfo || !draftBasicInfo || currentVersion === null) return;
    if (!draftBasicInfo.title.trim()) {
      setSaveState('validation');
      setSaveMessage('请检查填写内容后重试。');
      return;
    }
    if (reviewTypeChangeBlockReason) {
      setSaveState('validation');
      setSaveMessage(reviewTypeChangeBlockReason);
      return;
    }
    const patch = diffBasicInfo(initialBasicInfo, draftBasicInfo);
    if (Object.keys(patch).length === 0) return;
    if (!acquireMutation('basic')) return;

    setSaveState('saving');
    setSaveMessage('');
    try {
      const response = await fetch(`/api/review-center/reviews/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: currentVersion, patch }),
      });
      const data = await response.json();
      if (!response.ok) {
        const info = classifyMutationResponse(response.status, data);
        setSaveState(info.state);
        setSaveMessage(info.message);
        return;
      }
      const nextVersion = extractMutationVersion(data);
      if (nextVersion === null) {
        setSaveState('error');
        setSaveMessage('保存失败，请稍后重试。');
        return;
      }
      const saved = data?.data ?? data;
      setCurrentVersion(nextVersion);
      setDetail(prev => (prev && saved && typeof saved === 'object' ? { ...prev, ...saved } : prev));
      const source = saved && typeof saved === 'object' ? saved : detail;
      if (source) {
        const nextInitial = normalizeBasicInfo(source as any);
        setInitialBasicInfo(nextInitial);
        setDraftBasicInfo(nextInitial);
      }
      if (
        saved
        && typeof saved === 'object'
        && !detail?.type_details
        && typeof (saved as any).review_type === 'string'
        && (saved as any).review_type !== detail?.review_type
      ) {
        const nextType = normalizeTypeDetails(null);
        setInitialTypeDetails(nextType);
        setDraftTypeDetails(nextType);
        setTypeDetailsSaveState('idle');
        setTypeDetailsSaveMessage('');
      }
      setSaveState('saved');
      setSaveMessage('已保存');
    } catch {
      setSaveState('error');
      setSaveMessage('保存失败，请稍后重试。');
    } finally {
      releaseMutation();
    }
  }

  function applyTypeDetailsAuthority(nextVersion: number, typeDetails: Record<string, unknown> | null) {
    setCurrentVersion(nextVersion);
    setDetail(prev => prev ? { ...prev, version: nextVersion, type_details: typeDetails } : prev);
    const next = normalizeTypeDetails(typeDetails);
    setInitialTypeDetails(next);
    setDraftTypeDetails(next);
  }

  async function handleTypeDetailsSave() {
    if (!id || !initialTypeDetails || !draftTypeDetails || currentVersion === null) return;
    const diffResult = diffTypeDetails(initialTypeDetails, draftTypeDetails);
    if (!diffResult.valid) {
      setTypeDetailsSaveState('validation');
      setTypeDetailsSaveMessage(diffResult.error || '请检查专项复盘内容后重试。');
      return;
    }
    if (Object.keys(diffResult.patch).length === 0) return;
    if (basicTypeChangePending) {
      setTypeDetailsSaveState('validation');
      setTypeDetailsSaveMessage('复盘类型尚未保存，请先保存基础信息中的复盘类型，再填写专项复盘内容。');
      return;
    }
    if (!acquireMutation('type-details')) return;

    setTypeDetailsSaveState('saving');
    setTypeDetailsSaveMessage('');
    try {
      const response = await fetch(`/api/review-center/reviews/${encodeURIComponent(id)}/type-details`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: currentVersion, patch: diffResult.patch }),
      });
      const data = await response.json();
      if (!response.ok) {
        const info = classifyTypeDetailsMutationResponse(response.status, data);
        if (info.state === 'conflict' || info.state === 'non_editable' || info.state === 'reload_required' || info.state === 'forbidden') {
          setSaveState(info.state);
          setSaveMessage(info.message);
        }
        setTypeDetailsSaveState(info.state);
        setTypeDetailsSaveMessage(info.message);
        return;
      }

      const saved = extractTypeDetailsSaveResult(data);
      if (saved) {
        applyTypeDetailsAuthority(saved.version, saved.typeDetails);
      } else {
        if (!initialBasicInfo || !draftBasicInfo) {
          setSaveState('reload_required');
          setSaveMessage(TYPE_DETAILS_FALLBACK_SYNC_FAILURE_MESSAGE);
          setTypeDetailsSaveState('reload_required');
          setTypeDetailsSaveMessage(TYPE_DETAILS_FALLBACK_SYNC_FAILURE_MESSAGE);
          return;
        }
        const syncResponse = await fetch(`/api/review-center/reviews/${encodeURIComponent(id)}`);
        const syncData = await syncResponse.json();
        if (!syncResponse.ok || syncData.error || !syncData.id) {
          setSaveState('reload_required');
          setSaveMessage(TYPE_DETAILS_FALLBACK_SYNC_FAILURE_MESSAGE);
          setTypeDetailsSaveState('reload_required');
          setTypeDetailsSaveMessage(TYPE_DETAILS_FALLBACK_SYNC_FAILURE_MESSAGE);
          return;
        }
        const latestDetail = syncData as ReviewDetail;
        const plan = planTypeDetailsFallbackSync(
          latestDetail,
          initialBasicInfo,
          draftBasicInfo,
        );
        const basicRebase = analyzeBasicFallbackRebase(
          initialBasicInfo,
          draftBasicInfo,
          normalizeBasicInfo(latestDetail),
        );
        const latestAssignments = normalizeAssignments(latestDetail);
        const assignmentsFallback = planAssignmentsFallbackSync(
          initialAssignments,
          draftAssignments,
          latestAssignments,
        );
        setDetail(plan.detail);
        setInitialTypeDetails(plan.initialTypeDetails);
        setDraftTypeDetails(plan.draftTypeDetails);
        if (basicRebase.hasConflict || assignmentsFallback.conflict) {
          setSaveState('reload_required');
          setSaveMessage(
            assignmentsFallback.conflict
              ? ASSIGNMENTS_FALLBACK_CONFLICT_MESSAGE
              : BASIC_FALLBACK_CONFLICT_MESSAGE,
          );
          setTypeDetailsSaveState('reload_required');
          setTypeDetailsSaveMessage(
            assignmentsFallback.conflict
              ? ASSIGNMENTS_FALLBACK_CONFLICT_MESSAGE
              : BASIC_FALLBACK_CONFLICT_MESSAGE,
          );
        } else {
          setCurrentVersion(plan.version);
          setInitialBasicInfo(basicRebase.rebasedInitial);
          setDraftBasicInfo(basicRebase.rebasedDraft);
          if (assignmentsFallback.initial && assignmentsFallback.draft) {
            setInitialAssignments(assignmentsFallback.initial);
            setDraftAssignments(assignmentsFallback.draft);
          }
          setTypeDetailsSaveState('saved');
          setTypeDetailsSaveMessage('专项内容已保存');
        }
      }
    } catch {
      setTypeDetailsSaveState('error');
      setTypeDetailsSaveMessage('专项内容保存失败，请稍后重试。');
    } finally {
      releaseMutation();
    }
  }

  function updateTypeDetailField(key: keyof TypeDetailsDraft, value: string) {
    setDraftTypeDetails(prev => (prev ? { ...prev, [key]: value } : prev));
    if (typeDetailsSaveState === 'saved' || typeDetailsSaveState === 'validation' || typeDetailsSaveState === 'error') {
      setTypeDetailsSaveState('idle');
      setTypeDetailsSaveMessage('');
    }
  }

  function updateNoteRow(index: number, patch: Partial<AdditionalNoteRow>) {
    setDraftTypeDetails(prev => prev ? {
      ...prev,
      noteRows: prev.noteRows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    } : prev);
    if (typeDetailsSaveState === 'saved' || typeDetailsSaveState === 'validation' || typeDetailsSaveState === 'error') {
      setTypeDetailsSaveState('idle');
      setTypeDetailsSaveMessage('');
    }
  }

  function addNoteRow() {
    setDraftTypeDetails(prev => prev ? { ...prev, noteRows: [...prev.noteRows, { key: '', value: '' }] } : prev);
    if (typeDetailsSaveState === 'saved' || typeDetailsSaveState === 'validation' || typeDetailsSaveState === 'error') {
      setTypeDetailsSaveState('idle');
      setTypeDetailsSaveMessage('');
    }
  }

  function removeNoteRow(index: number) {
    setDraftTypeDetails(prev => prev ? { ...prev, noteRows: prev.noteRows.filter((_, i) => i !== index) } : prev);
    if (typeDetailsSaveState === 'saved' || typeDetailsSaveState === 'validation' || typeDetailsSaveState === 'error') {
      setTypeDetailsSaveState('idle');
      setTypeDetailsSaveMessage('');
    }
  }

  function renderTypeDetailField(field: TypeDetailFieldKey) {
    const label = TYPE_DETAIL_LABELS[field];
    const long = LONG_TYPE_FIELDS.has(field);
    if (field === 'customer_notified') {
      return (
        <div>
          <label className="block text-xs text-gray-500 mb-1">{label}</label>
          <select
            value={draftTypeDetails?.customer_notified ?? ''}
            onChange={e => updateTypeDetailField('customer_notified', e.target.value)}
            className="select-field"
          >
            <option value="">未填写</option>
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        </div>
      );
    }
    if (field === 'defect_rate') {
      return (
        <div>
          <label className="block text-xs text-gray-500 mb-1">{label}</label>
          <input
            type="number"
            step="any"
            value={draftTypeDetails?.defect_rate ?? ''}
            onChange={e => updateTypeDetailField('defect_rate', e.target.value)}
            className="input-field"
          />
        </div>
      );
    }
    return (
      <div className={long ? 'md:col-span-2' : ''}>
        <label className="block text-xs text-gray-500 mb-1">{label}</label>
        {long ? (
          <textarea
            value={draftTypeDetails?.[field] ?? ''}
            onChange={e => updateTypeDetailField(field, e.target.value)}
            rows={3}
            className="input-field"
          />
        ) : (
          <input
            value={draftTypeDetails?.[field] ?? ''}
            onChange={e => updateTypeDetailField(field, e.target.value)}
            className="input-field"
          />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <PageHeader title="复盘编辑" description="加载中..." />
      </AppLayout>
    );
  }

  if (!detail || !me || loadError) {
    return (
      <AppLayout>
        <PageHeader title="复盘编辑" description="无法读取复盘" />
        <ReviewCenterEmpty
          title={loadError || '复盘不存在或无权访问'}
          action={{ label: '返回列表', href: '/review-center/reviews' }}
        />
      </AppLayout>
    );
  }

  if (!canEdit) {
    const reason = detail.status !== 'draft'
      ? '当前复盘已不是草稿状态，不能继续编辑'
      : '你没有编辑此复盘的权限';
    return (
      <AppLayout>
        <PageHeader title="复盘编辑" description="无法编辑复盘" />
        <ReviewCenterEmpty
          title={reason}
          action={{ label: '返回详情', href: `/review-center/reviews/${id}` }}
        />
        {ownerAssignmentDisplay && pmoAssignmentDisplay && (
          <div className="mt-5 bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-base font-semibold text-gray-800">项目负责人</h2>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">当前项目负责人</label>
                <p className="text-sm text-gray-800">
                  {ownerAssignmentDisplay.displayName}
                  {ownerAssignmentDisplay.meta ? ` · ${ownerAssignmentDisplay.meta}` : ''}
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">PMO</label>
                <p className="text-sm text-gray-800">
                  {pmoAssignmentDisplay.displayName}
                  {pmoAssignmentDisplay.meta ? ` · ${pmoAssignmentDisplay.meta}` : ''}
                </p>
              </div>
            </div>
          </div>
        )}
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title={detail.title}
        description={`${detail.review_no} · ${detail.review_type} 类 · ${reviewStatusLabel(detail.status)} · v${currentVersion}`}
        actions={<Link href={`/review-center/reviews/${id}`} className="btn-secondary">返回详情</Link>}
      />

      {blocked && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <p>{saveMessage}</p>
          {(saveState === 'conflict' || saveState === 'reload_required') && (
            <button type="button" onClick={loadEditor} className="btn-secondary mt-3">重新加载最新数据</button>
          )}
          {(saveState === 'forbidden' || saveState === 'non_editable') && (
            <Link href={`/review-center/reviews/${id}`} className="btn-secondary mt-3 inline-block">返回详情</Link>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-800">基础信息</h2>
          {saveState === 'saved' && <span className="text-sm text-green-600">已保存</span>}
        </div>

        {reviewTypeChangeBlockReason && (
          <div className="mb-4 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
            {reviewTypeChangeBlockReason}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">标题</label>
            <input
              value={draftBasicInfo?.title ?? ''}
              onChange={e => updateField('title', e.target.value)}
              className="input-field"
              placeholder="复盘标题"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">复盘类型</label>
            <select
              value={draftBasicInfo?.review_type ?? 'A'}
              disabled={typeLocked}
              onChange={e => updateField('review_type', e.target.value)}
              className="select-field disabled:bg-gray-100 disabled:text-gray-400"
            >
              {TYPE_OPTIONS.map(t => (
                <option key={t} value={t}>{t} 类 · {t === 'A' ? '大货前异常' : t === 'B' ? '大货生产/品质/交付异常' : '前端问题延伸至大货'}</option>
              ))}
            </select>
            {typeLocked && (
              <p className="text-xs text-gray-400 mt-1">已填写专项复盘内容后，复盘类型不可修改</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">发生时间</label>
            <input
              type="datetime-local"
              value={draftBasicInfo?.occurred_at ?? ''}
              onChange={e => updateField('occurred_at', e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">客户</label>
            <input
              value={draftBasicInfo?.customer_name ?? ''}
              onChange={e => updateField('customer_name', e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">订单号</label>
            <input
              value={draftBasicInfo?.order_no ?? ''}
              onChange={e => updateField('order_no', e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">项目</label>
            <input
              value={draftBasicInfo?.project_name ?? ''}
              onChange={e => updateField('project_name', e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">产品</label>
            <input
              value={draftBasicInfo?.product_name ?? ''}
              onChange={e => updateField('product_name', e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">工艺</label>
            <input
              value={draftBasicInfo?.process_name ?? ''}
              onChange={e => updateField('process_name', e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">风险等级</label>
            <select
              value={draftBasicInfo?.risk_level ?? ''}
              onChange={e => updateField('risk_level', e.target.value)}
              className="select-field"
            >
              <option value="">未评级</option>
              {RISK_OPTIONS.map(r => (
                <option key={r} value={r}>{r === 'RED' ? '高' : r === 'YELLOW' ? '中' : '低'}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">问题描述</label>
            <textarea
              value={draftBasicInfo?.description ?? ''}
              onChange={e => updateField('description', e.target.value)}
              rows={4}
              className="input-field"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">影响摘要</label>
            <textarea
              value={draftBasicInfo?.impact_summary ?? ''}
              onChange={e => updateField('impact_summary', e.target.value)}
              rows={2}
              className="input-field"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">风险原因</label>
            <textarea
              value={draftBasicInfo?.risk_reason ?? ''}
              onChange={e => updateField('risk_reason', e.target.value)}
              rows={2}
              className="input-field"
            />
          </div>
        </div>

        {(saveState === 'validation' || saveState === 'error') && saveMessage && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{saveMessage}</div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <Link href={`/review-center/reviews/${id}`} className="btn-secondary">取消</Link>
          <button
            type="button"
            disabled={!dirty || saveState === 'saving' || blocked || !!reviewTypeChangeBlockReason || activeMutation !== null || !(draftBasicInfo?.title.trim())}
            onClick={handleSave}
            className="btn-primary"
          >
            {saveState === 'saving' ? '保存中…' : '保存基础信息'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mt-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-800">专项复盘内容</h2>
            <p className="text-xs text-gray-500 mt-1">
              {detail.review_type} 类复盘 · {detail.review_type === 'A' ? '量产前 / 订单损失 / 客户信任相关复盘' : detail.review_type === 'B' ? '量产过程 / 品质 / 交付异常复盘' : '前端问题最终在生产爆发的综合复盘'}
            </p>
          </div>
          {typeDetailsSaveState === 'saved' && <span className="text-sm text-green-600">已保存</span>}
        </div>

        {basicTypeChangePending && (
          <div className="mb-4 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
            复盘类型尚未保存，请先保存基础信息中的复盘类型，再填写专项复盘内容。
          </div>
        )}

        {(typeDetailsSaveState === 'validation' || typeDetailsSaveState === 'error') && typeDetailsSaveMessage && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{typeDetailsSaveMessage}</div>
        )}

        {TYPE_DETAIL_GROUPS[detail.review_type].map((group, groupIndex) => (
          <div key={group.title} className={groupIndex > 0 ? 'mt-5 pt-5 border-t border-gray-100' : ''}>
            <h3 className="text-sm font-medium text-gray-700 mb-3">{group.title}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.fields.map(field => renderTypeDetailField(field))}
            </div>
          </div>
        ))}

        <div className="mt-6 pt-5 border-t border-gray-100">
          <h3 className="text-sm font-medium text-gray-700 mb-1">补充说明</h3>
          <p className="text-xs text-gray-400 mb-3">支持简单键值说明；历史结构化值只读保留。</p>
          <div className="space-y-2">
            {draftTypeDetails?.noteRows.map((row, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                <input
                  value={row.key}
                  onChange={e => updateNoteRow(index, { key: e.target.value })}
                  placeholder="说明键"
                  className="input-field"
                />
                <input
                  value={row.value}
                  onChange={e => updateNoteRow(index, { value: e.target.value })}
                  placeholder="说明值"
                  className="input-field"
                />
                <button type="button" onClick={() => removeNoteRow(index)} className="btn-secondary btn-sm">删除</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addNoteRow} className="btn-secondary btn-sm mt-2">新增说明</button>
          {draftTypeDetails && Object.keys(draftTypeDetails.preservedNotes).length > 0 && (
            <div className="mt-3 space-y-1">
              {Object.keys(draftTypeDetails.preservedNotes).map(key => (
                <div key={key} className="text-xs text-gray-500">{key}：结构化值（当前版本只读）</div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={!typeDetailsDirty || typeDetailsSaveState === 'saving' || blocked || basicTypeChangePending || activeMutation !== null}
            onClick={handleTypeDetailsSave}
            className="btn-primary"
          >
            {typeDetailsSaveState === 'saving' ? '保存中…' : '保存专项内容'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mt-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-800">项目负责人</h2>
            <p className="text-xs text-gray-500 mt-1">负责人与 PMO 设置</p>
          </div>
          {assignmentsSaveState === 'saved' && <span className="text-sm text-green-600">已保存</span>}
        </div>

        {assignmentsEditable && assignmentDirectoryState === 'error' && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            <p>负责人候选列表加载失败，请重试。</p>
            <button type="button" onClick={loadAssignmentDirectory} className="btn-secondary btn-sm mt-2">重新加载候选人</button>
          </div>
        )}
        {assignmentsEditable && assignmentDirectoryState === 'loading' && (
          <p className="mb-4 text-sm text-gray-500">负责人候选加载中...</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">当前项目负责人</label>
            {ownerAssignmentDisplay && (
              <p className="text-sm text-gray-800">
                {ownerAssignmentDisplay.displayName}
                {ownerAssignmentDisplay.meta ? ` · ${ownerAssignmentDisplay.meta}` : ''}
              </p>
            )}
            {assignmentsEditable && assignmentDirectoryState === 'ready' && draftAssignments && (
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">更换项目负责人</label>
                <select
                  value={eligibleCandidateIds.has(draftAssignments.ownerId) ? draftAssignments.ownerId : ''}
                  onChange={e => updateAssignmentOwner(e.target.value)}
                  className="select-field"
                >
                  <option value="" disabled>
                    {eligibleCandidateIds.has(draftAssignments.ownerId) ? '请选择' : '请选择新的项目负责人'}
                  </option>
                  {assignmentCandidates
                    .filter(candidate => candidate.assignment_eligible !== false)
                    .map(candidate => (
                      <option key={candidate.profile_id} value={candidate.profile_id}>
                        {candidate.display_name}
                        {candidate.department ? ` · ${candidate.department}` : ''}
                        {' · '}{candidate.role}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">PMO</label>
            {pmoAssignmentDisplay && (
              <p className="text-sm text-gray-800">
                {pmoAssignmentDisplay.displayName}
                {pmoAssignmentDisplay.meta ? ` · ${pmoAssignmentDisplay.meta}` : ''}
              </p>
            )}
            {assignmentsEditable && assignmentDirectoryState === 'ready' && draftAssignments && (
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">更换 PMO</label>
                <select
                  value={
                    draftAssignments.pmoId !== null && eligibleCandidateIds.has(draftAssignments.pmoId)
                      ? draftAssignments.pmoId
                      : draftAssignments.pmoId === null
                        ? ''
                        : '__ineligible__'
                  }
                  onChange={e => updateAssignmentPmo(e.target.value)}
                  className="select-field"
                >
                  <option value="">未设置</option>
                  {draftAssignments.pmoId !== null && !eligibleCandidateIds.has(draftAssignments.pmoId) && (
                    <option value="__ineligible__" disabled>请选择新的处理方式</option>
                  )}
                  {assignmentCandidates
                    .filter(candidate => candidate.assignment_eligible !== false)
                    .map(candidate => (
                      <option key={candidate.profile_id} value={candidate.profile_id}>
                        {candidate.display_name}
                        {candidate.department ? ` · ${candidate.department}` : ''}
                        {' · '}{candidate.role}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {assignmentsEditable && assignmentDirectoryState === 'ready' && assignmentsDirty && assignmentValidation && !assignmentValidation.canSave && assignmentValidation.reason && (
          <div className="mt-4 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
            {assignmentValidation.reason}
          </div>
        )}

        {(assignmentsSaveState === 'validation' || assignmentsSaveState === 'error' || assignmentsSaveState === 'invalid_member') && assignmentsSaveMessage && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            <p>{assignmentsSaveMessage}</p>
            {assignmentsSaveState === 'invalid_member' && (
              <button type="button" onClick={loadAssignmentDirectory} className="btn-secondary btn-sm mt-2">重新加载候选人</button>
            )}
          </div>
        )}

        {assignmentsEditable && (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={
                assignmentDirectoryState !== 'ready'
                || !assignmentsDirty
                || !assignmentValidation?.canSave
                || assignmentsSaveState === 'saving'
                || assignmentsSaveState === 'invalid_member'
                || blocked
                || activeMutation !== null
              }
              onClick={handleAssignmentsSave}
              className="btn-primary"
            >
              {assignmentsSaveState === 'saving' ? '保存中…' : '保存负责人设置'}
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
