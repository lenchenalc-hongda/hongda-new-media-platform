'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ActionReadDto } from '@/lib/review-center/actions';
import type { ActionOwnerCandidate } from '@/lib/review-center/action-client';
import {
  createActionCommandSchema,
  updateActionCommandSchema,
} from '@/lib/review-center/action-command-schemas';
import { ACTION_TYPE_LABELS } from '@/lib/review-center/action-presentation';

export interface ActionFormValues {
  title: string;
  description: string;
  actionType: 'IMMEDIATE' | 'CORRECTIVE' | 'PREVENTIVE';
  ownerProfileId: string;
  dueDate: string;
}

interface ActionModalProps {
  title: string;
  disabled: boolean;
  children: React.ReactNode;
  onCancel: () => void;
}

function ActionModal({ title, disabled, children, onCancel }: ActionModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      onClick={() => { if (!disabled) onCancel(); }}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={event => event.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function initialFormValues(action: ActionReadDto | null): ActionFormValues {
  return {
    title: action?.title ?? '',
    description: action?.description ?? '',
    actionType:
      action && action.actionType !== 'UNKNOWN'
        ? action.actionType
        : 'CORRECTIVE',
    ownerProfileId:
      action && action.owner.isActive
        ? action.owner.profileId
        : '',
    dueDate: action?.dueDate ?? '',
  };
}

export function ActionFormDialog({
  open,
  mode,
  action,
  candidates,
  ownerState,
  pending,
  error,
  onRetryOwnerDirectory,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  action: ActionReadDto | null;
  candidates: ActionOwnerCandidate[];
  ownerState: 'idle' | 'loading' | 'ready' | 'error';
  pending: boolean;
  error: string | null;
  onRetryOwnerDirectory: () => void;
  onCancel: () => void;
  onSubmit: (values: ActionFormValues) => void;
}) {
  const [values, setValues] = useState<ActionFormValues>(() => initialFormValues(null));

  useEffect(() => {
    if (open) setValues(initialFormValues(action));
  }, [open, action?.id, action?.owner.profileId, action?.owner.isActive]);

  const validation = useMemo(() => {
    const base = {
      title: values.title,
      description: values.description.trim() === '' ? null : values.description,
      actionType: values.actionType,
      ownerProfileId: values.ownerProfileId,
      dueDate: values.dueDate,
    };
    if (mode === 'create') {
      return createActionCommandSchema.safeParse(base);
    }
    return updateActionCommandSchema.safeParse({
      expectedVersion: action?.version ?? 0,
      ...base,
    });
  }, [values, mode, action?.version]);

  const candidateIds = useMemo(
    () => new Set(candidates.map(candidate => candidate.profileId)),
    [candidates],
  );
  const ownerReady =
    ownerState === 'ready'
    && values.ownerProfileId !== ''
    && candidateIds.has(values.ownerProfileId);
  const canSubmit = validation.success && ownerReady && !pending;

  if (!open) return null;

  return (
    <ActionModal
      title={mode === 'create' ? '新建改善行动' : '编辑改善行动'}
      disabled={pending}
      onCancel={onCancel}
    >
      {mode === 'edit' && action && !action.owner.isActive && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p>当前负责人：{action.owner.displayName}（已停用）</p>
          <p className="mt-1">当前负责人已停用，请重新选择负责人</p>
        </div>
      )}

      <label className="block text-xs text-gray-500 mb-1" htmlFor="action-title">
        标题 *
      </label>
      <input
        id="action-title"
        value={values.title}
        onChange={event => setValues(prev => ({ ...prev, title: event.target.value }))}
        maxLength={200}
        disabled={pending}
        className="w-full rounded border border-gray-300 p-2 text-sm"
      />

      <label className="block text-xs text-gray-500 mb-1 mt-4" htmlFor="action-description">
        描述
      </label>
      <textarea
        id="action-description"
        value={values.description}
        onChange={event => setValues(prev => ({ ...prev, description: event.target.value }))}
        maxLength={5000}
        rows={3}
        disabled={pending}
        className="w-full rounded border border-gray-300 p-2 text-sm"
      />

      <label className="block text-xs text-gray-500 mb-1 mt-4" htmlFor="action-type">
        行动类型 *
      </label>
      <select
        id="action-type"
        value={values.actionType}
        onChange={event => setValues(prev => ({
          ...prev,
          actionType: event.target.value as ActionFormValues['actionType'],
        }))}
        disabled={pending}
        className="w-full rounded border border-gray-300 p-2 text-sm"
      >
        {(['IMMEDIATE', 'CORRECTIVE', 'PREVENTIVE'] as const).map(type => (
          <option key={type} value={type}>{ACTION_TYPE_LABELS[type]}</option>
        ))}
      </select>

      <label className="block text-xs text-gray-500 mb-1 mt-4" htmlFor="action-owner">
        负责人 *
      </label>
      <select
        id="action-owner"
        value={values.ownerProfileId}
        onChange={event => setValues(prev => ({ ...prev, ownerProfileId: event.target.value }))}
        disabled={pending || ownerState !== 'ready'}
        className="w-full rounded border border-gray-300 p-2 text-sm"
      >
        {ownerState === 'loading' && <option value="">加载中…</option>}
        {ownerState === 'error' && <option value="">加载失败</option>}
        {ownerState === 'ready' && <option value="">请选择负责人</option>}
        {ownerState === 'ready' && candidates.map(candidate => (
          <option key={candidate.profileId} value={candidate.profileId}>
            {candidate.displayName}
            {candidate.department ? ` · ${candidate.department}` : ''}
          </option>
        ))}
      </select>
      {ownerState === 'error' && (
        <div className="mt-2 text-sm text-red-600">
          负责人列表加载失败，请重试
          <button
            type="button"
            onClick={onRetryOwnerDirectory}
            className="ml-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          >
            重试
          </button>
        </div>
      )}

      <label className="block text-xs text-gray-500 mb-1 mt-4" htmlFor="action-due-date">
        截止日期 *
      </label>
      <input
        id="action-due-date"
        type="date"
        value={values.dueDate}
        onChange={event => setValues(prev => ({ ...prev, dueDate: event.target.value }))}
        disabled={pending}
        className="w-full rounded border border-gray-300 p-2 text-sm"
      />

      {error && (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <button type="button" disabled={pending} onClick={onCancel} className="btn-secondary">
          取消
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit(values)}
          className="btn-primary"
        >
          {pending
            ? (mode === 'create' ? '创建中…' : '保存中…')
            : (mode === 'create' ? '创建行动' : '保存修改')}
        </button>
      </div>
    </ActionModal>
  );
}

function ActionTextDialog({
  open,
  title,
  description,
  label,
  required,
  maxLength,
  pending,
  error,
  confirmLabel,
  variant,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  required: boolean;
  maxLength: number;
  pending: boolean;
  error: string | null;
  confirmLabel: string;
  variant?: 'danger' | 'default';
  onCancel: () => void;
  onConfirm: (value: string | null) => void;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue('');
  }, [open]);

  if (!open) return null;
  const trimmed = value.trim();
  const invalid = required
    ? trimmed.length === 0 || trimmed.length > maxLength
    : trimmed.length > maxLength;

  return (
    <ActionModal title={title} disabled={pending} onCancel={onCancel}>
      {description && (
        <p className="text-sm text-gray-600 mb-4">{description}</p>
      )}
      <label className="block text-xs text-gray-500 mb-1" htmlFor={`${title}-input`}>
        {label}
      </label>
      <textarea
        id={`${title}-input`}
        value={value}
        onChange={event => setValue(event.target.value)}
        maxLength={maxLength}
        rows={4}
        disabled={pending}
        className="w-full rounded border border-gray-300 p-2 text-sm"
      />
      <p className="mt-1 text-right text-xs text-gray-400">{value.length} / {maxLength}</p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-3">
        <button type="button" disabled={pending} onClick={onCancel} className="btn-secondary">
          取消
        </button>
        <button
          type="button"
          disabled={pending || invalid}
          onClick={() => onConfirm(required ? trimmed : (trimmed === '' ? null : trimmed))}
          className={variant === 'danger' ? 'btn-danger' : 'btn-primary'}
        >
          {pending ? '提交中…' : confirmLabel}
        </button>
      </div>
    </ActionModal>
  );
}

export function SubmitDialog({
  action,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  action: ActionReadDto | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (note: string) => void;
}) {
  return (
    <ActionTextDialog
      open={!!action}
      title="提交验证"
      description="提交后行动将进入“待验证”状态。"
      label="完成说明 *"
      required
      maxLength={5000}
      pending={pending}
      error={error}
      confirmLabel="提交验证"
      onCancel={onCancel}
      onConfirm={value => { if (value !== null) onSubmit(value); }}
    />
  );
}

export function VerifyDialog({
  action,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  action: ActionReadDto | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (note: string | null) => void;
}) {
  return (
    <ActionTextDialog
      open={!!action}
      title="验证通过"
      description="验证意见可选，可直接确认通过。"
      label="验证意见"
      required={false}
      maxLength={5000}
      pending={pending}
      error={error}
      confirmLabel="验证通过"
      onCancel={onCancel}
      onConfirm={onSubmit}
    />
  );
}

export function ReturnDialog({
  action,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  action: ActionReadDto | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  return (
    <ActionTextDialog
      open={!!action}
      title="退回修改"
      description="退回后行动将回到“进行中”状态。"
      label="退回原因 *"
      required
      maxLength={5000}
      pending={pending}
      error={error}
      confirmLabel="退回修改"
      onCancel={onCancel}
      onConfirm={value => { if (value !== null) onSubmit(value); }}
    />
  );
}

export function CancelDialog({
  action,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  action: ActionReadDto | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  return (
    <ActionTextDialog
      open={!!action}
      title="取消改善行动"
      description="取消后该行动将不再继续执行，此操作不可恢复。"
      label="取消原因 *"
      required
      maxLength={1000}
      pending={pending}
      error={error}
      confirmLabel="确认取消"
      variant="danger"
      onCancel={onCancel}
      onConfirm={value => { if (value !== null) onSubmit(value); }}
    />
  );
}
