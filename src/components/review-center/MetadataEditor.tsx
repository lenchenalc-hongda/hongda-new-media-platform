import { useEffect, useState } from 'react';
import type { MetadataOptionsDto, ReviewMetadataDto } from '@/lib/review-center/types';
import {
  buildMetadataMutationPayload,
  canEditMetadata,
  createMetadataEditorState,
  hasOtherCode,
  hasProcessRequirement,
  setMetadataOtherText,
  setPrimaryMaterial,
  toggleProblemDomain,
  toggleProblemSymptom,
  toggleProcess,
  toggleSecondaryMaterial,
  type MetadataEditorState,
} from '@/lib/review-center/metadata-editor';

interface MetadataEditorProps {
  reviewId: string;
  initialMetadata: ReviewMetadataDto | null;
  status: string;
  reviewType: string;
  expectedVersion: number;
  currentRole: string | null;
  currentProfileId: string | null;
  ownerId: string;
  pmoId: string | null;
  onSaved: (version: number, metadata: ReviewMetadataDto) => void;
  onCancel?: () => void;
  missingDimensions?: string[];
}

type OptionsStatus = 'loading' | 'ready' | 'error';

export default function MetadataEditor({
  reviewId,
  initialMetadata,
  status,
  reviewType,
  expectedVersion,
  currentRole,
  currentProfileId,
  ownerId,
  pmoId,
  onSaved,
  onCancel,
  missingDimensions = [],
}: MetadataEditorProps) {
  const [options, setOptions] = useState<MetadataOptionsDto | null>(null);
  const [optionsStatus, setOptionsStatus] = useState<OptionsStatus>('loading');
  const [state, setState] = useState<MetadataEditorState>(() => createMetadataEditorState(initialMetadata));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = canEditMetadata({
    status,
    role: currentRole,
    currentProfileId,
    ownerId,
    pmoId,
  });
  const correctionMode = (
    status === 'submitted' || status === 'closed'
  ) && (currentRole === 'admin' || currentRole === 'manager');

  async function loadOptions() {
    setOptionsStatus('loading');
    setError(null);
    try {
      const response = await fetch('/api/review-center/metadata/options');
      const body = await response.json();
      if (!response.ok || !body?.data) throw new Error('options');
      setOptions(body.data);
      setOptionsStatus('ready');
    } catch {
      setOptionsStatus('error');
    }
  }

  useEffect(() => {
    setState(createMetadataEditorState(initialMetadata));
    setReason('');
    setError(null);
  }, [initialMetadata]);

  useEffect(() => {
    void loadOptions();
  }, []);

  async function handleSave() {
    if (!editable || optionsStatus !== 'ready') return;
    if (correctionMode && reason.trim() === '') {
      setError('请填写修改原因。');
      return;
    }

    const payload = buildMetadataMutationPayload(state);
    const body: Record<string, unknown> = {
      ...payload,
      expectedVersion,
    };
    if (correctionMode) body.reason = reason.trim();

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/review-center/reviews/${encodeURIComponent(reviewId)}/metadata`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = await response.json();
      if (!response.ok || data?.code !== 'OK') {
        const code = typeof data?.code === 'string' ? data.code : 'UNKNOWN';
        if (code === 'VERSION_CONFLICT') {
          setError('项目已被其他人更新，请刷新后再修改。');
        } else if (code === 'INVALID_TRANSITION') {
          setError('项目状态已变化，请刷新后再操作。');
        } else if (code === 'INVALID_METADATA') {
          setError('分类信息不符合要求，请检查后重新保存。');
        } else if (code === 'FORBIDDEN') {
          setError('你当前无权执行此操作。');
        } else {
          setError('保存失败，请稍后重试。');
        }
        return;
      }
      const result = data.data;
      if (
        !result
        || typeof result.version !== 'number'
        || !Number.isInteger(result.version)
        || result.version < 1
        || !result.metadata
      ) {
        setError('保存失败，请稍后重试。');
        return;
      }
      onSaved(result.version, result.metadata);
    } catch {
      setError('保存失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  }

  if (!editable) {
    return null;
  }

  const materialOtherSelected = state.primaryMaterialCode === 'OTHER'
    || state.secondaryMaterialCodes.includes('OTHER');
  const processOtherSelected = hasOtherCode(state.processCodes);
  const domainOtherSelected = hasOtherCode(state.problemDomainCodes);
  const symptomOtherSelected = hasOtherCode(state.problemSymptomCodes);

  const missingProblemDomain = missingDimensions.includes('PROBLEM_DOMAIN')
    && state.problemDomainCodes.length === 0;
  const missingPrimaryMaterial = missingDimensions.includes('PRIMARY_MATERIAL')
    && !state.primaryMaterialCode;
  const missingProcess = missingDimensions.includes('PROCESS')
    && hasProcessRequirement(reviewType, state.problemDomainCodes)
    && state.processCodes.length === 0;

  if (optionsStatus === 'loading') {
    return <p className="text-sm text-gray-500">正在加载分类选项…</p>;
  }
  if (optionsStatus === 'error' || !options) {
    return (
      <div className="text-sm text-gray-700">
        <p className="mb-2">分类选项加载失败，请重试。</p>
        <button type="button" className="btn-secondary btn-sm" onClick={loadOptions}>
          重新加载
        </button>
      </div>
    );
  }

  const highlightClass = 'rounded border border-red-300 bg-red-50/40 p-3';
  const normalClass = 'rounded border border-gray-200 p-3';

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">
        {reviewType === 'A'
          ? '问题环节提交前必填；主要材质可选。'
          : '问题环节与主要材质提交前必填。'}
        {hasProcessRequirement(reviewType, state.problemDomainCodes)
          ? ' 提交前需至少选择一种工艺。'
          : ''}
      </p>

      <section className={missingPrimaryMaterial ? highlightClass : normalClass}>
        <h3 className="mb-2 text-sm font-medium text-gray-700">材质</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs text-gray-500">主要材质</p>
            <div className="flex flex-wrap gap-1.5">
              {options.materials.map(option => (
                <label key={option.code} className="inline-flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name={`${reviewId}-primary-material`}
                    checked={state.primaryMaterialCode === option.code}
                    onChange={() => setState(prev => setPrimaryMaterial(prev, option.code))}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs text-gray-500">其他材质</p>
            <div className="flex flex-wrap gap-1.5">
              {options.materials
                .filter(option => option.code !== state.primaryMaterialCode)
                .map(option => (
                  <label key={option.code} className="inline-flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={state.secondaryMaterialCodes.includes(option.code)}
                      onChange={() => setState(prev => toggleSecondaryMaterial(prev, option.code))}
                    />
                    {option.label}
                  </label>
                ))}
            </div>
          </div>
        </div>
        {materialOtherSelected && (
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-xs text-gray-500">其他材质说明</span>
            <input
              className="input-field"
              value={state.materialOtherText ?? ''}
              onChange={event => setState(prev => setMetadataOtherText(prev, 'materialOtherText', event.target.value))}
              maxLength={200}
            />
          </label>
        )}
      </section>

      <section className={missingProcess ? highlightClass : normalClass}>
        <h3 className="mb-2 text-sm font-medium text-gray-700">工艺</h3>
        <div className="flex flex-wrap gap-1.5">
          {options.processes.map(option => (
            <label key={option.code} className="inline-flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={state.processCodes.includes(option.code)}
                onChange={() => setState(prev => toggleProcess(prev, option.code))}
              />
              {option.label}
            </label>
          ))}
        </div>
        {processOtherSelected && (
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-xs text-gray-500">其他工艺说明</span>
            <input
              className="input-field"
              value={state.processOtherText ?? ''}
              onChange={event => setState(prev => setMetadataOtherText(prev, 'processOtherText', event.target.value))}
              maxLength={200}
            />
          </label>
        )}
      </section>

      <section className={missingProblemDomain ? highlightClass : normalClass}>
        <h3 className="mb-2 text-sm font-medium text-gray-700">问题环节</h3>
        <div className="flex flex-wrap gap-1.5">
          {options.problemDomains.map(option => (
            <label key={option.code} className="inline-flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={state.problemDomainCodes.includes(option.code)}
                onChange={() => setState(prev => toggleProblemDomain(prev, option.code))}
              />
              {option.label}
            </label>
          ))}
        </div>
        {domainOtherSelected && (
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-xs text-gray-500">其他问题环节说明</span>
            <input
              className="input-field"
              value={state.problemDomainOtherText ?? ''}
              onChange={event => setState(prev => setMetadataOtherText(prev, 'problemDomainOtherText', event.target.value))}
              maxLength={200}
            />
          </label>
        )}
      </section>

      <section className={normalClass}>
        <h3 className="mb-2 text-sm font-medium text-gray-700">问题表现</h3>
        <div className="flex flex-wrap gap-1.5">
          {options.problemSymptoms.map(option => (
            <label key={option.code} className="inline-flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={state.problemSymptomCodes.includes(option.code)}
                onChange={() => setState(prev => toggleProblemSymptom(prev, option.code))}
              />
              {option.label}
            </label>
          ))}
        </div>
        {symptomOtherSelected && (
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-xs text-gray-500">其他问题表现说明</span>
            <input
              className="input-field"
              value={state.problemSymptomOtherText ?? ''}
              onChange={event => setState(prev => setMetadataOtherText(prev, 'problemSymptomOtherText', event.target.value))}
              maxLength={200}
            />
          </label>
        )}
      </section>

      {correctionMode && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500">修改原因 *</span>
          <textarea
            className="input-field"
            value={reason}
            onChange={event => setReason(event.target.value)}
            maxLength={1000}
            rows={2}
          />
          <span className="mt-1 block text-xs text-gray-400">
            已提交/已关闭项目修改分类将留下审计记录。
          </span>
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-3">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
            取消
          </button>
        )}
        <button
          type="button"
          className="btn-primary"
          onClick={handleSave}
          disabled={saving || optionsStatus !== 'ready'}
        >
          {saving ? '保存中…' : '保存分类'}
        </button>
      </div>
    </div>
  );
}
