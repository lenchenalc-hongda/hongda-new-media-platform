'use client';

import React, { useState, type ChangeEvent } from 'react';
import {
  SAMPLING_REQUEST_ENTRY_SECTIONS,
  SAMPLING_OBJECTIVE_OPTIONS,
  createEmptySamplingRequestDraft,
  validateSamplingRequestDraft,
  type OfficeEntryFieldDefinition,
  type SamplingRequestDraft,
  type SamplingRequestEntryFieldKey,
} from '../../lib/workshop-orders/office-entry';
import type { WosSamplingObjective } from '../../lib/workshop-orders/domain';

const inputClassName =
  'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

export default function SamplingRequestForm() {
  const [draft, setDraft] = useState<SamplingRequestDraft>(
    createEmptySamplingRequestDraft,
  );
  const [hasValidated, setHasValidated] = useState(false);

  const validation = validateSamplingRequestDraft(draft);
  const errorCount = Object.keys(validation.fieldErrors).length;

  function updateFieldValue(
    key: SamplingRequestEntryFieldKey,
    value: string | boolean | WosSamplingObjective[],
  ): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleObjective(objective: WosSamplingObjective): void {
    setDraft((current) => ({
      ...current,
      objectives: current.objectives.includes(objective)
        ? current.objectives.filter((item) => item !== objective)
        : [...current.objectives, objective],
    }));
  }

  function renderObjectiveSelector(
    field: OfficeEntryFieldDefinition<SamplingRequestEntryFieldKey>,
  ) {
    const error = hasValidated ? validation.fieldErrors.objectives : undefined;
    const errorId = 'objectives-error';
    const helpId = 'objectives-help';
    const describedBy = [error ? errorId : null, helpId].filter(Boolean).join(' ');

    return (
      <fieldset
        key={field.key}
        id="objectives"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="sm:col-span-2 xl:col-span-3"
      >
        <legend className="text-xs font-medium text-gray-700">
          <span>
            {field.label}
            {field.required && <span className="ml-1 text-red-600">*</span>}
          </span>
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {SAMPLING_OBJECTIVE_OPTIONS.map((option) => {
            const checked = draft.objectives.includes(option.value);
            return (
              <label
                key={option.value}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  checked
                    ? 'border-blue-300 bg-blue-50 text-blue-950'
                    : 'border-gray-200 bg-gray-50 text-gray-800'
                }`}
              >
                <input
                  type="checkbox"
                  name="objectives"
                  value={option.value}
                  checked={checked}
                  onChange={() => toggleObjective(option.value)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
        <p id={helpId} className="mt-1 text-xs text-gray-500">
          已选择 {draft.objectives.length} 项，正式打烊目标至少需要 1 项。
        </p>
        {error && (
          <p id={errorId} className="mt-1 text-xs text-red-600">
            {error}
          </p>
        )}
      </fieldset>
    );
  }

  function renderField(
    field: OfficeEntryFieldDefinition<SamplingRequestEntryFieldKey>,
  ) {
    if (field.key === 'objectives') return renderObjectiveSelector(field);

    const error = hasValidated ? validation.fieldErrors[field.key] : undefined;
    const errorId = `${field.key}-error`;
    const helpId = `${field.key}-help`;
    const describedBy = [error ? errorId : null, field.help ? helpId : null]
      .filter(Boolean)
      .join(' ');
    const value = draft[field.key];
    const wide =
      field.kind === 'textarea'
        ? 'sm:col-span-2 xl:col-span-3'
        : '';

    if (field.kind === 'checkbox') {
      return (
        <div key={field.key} className={wide}>
          <label
            htmlFor={field.key}
            className="flex min-h-11 items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900"
          >
            <input
              id={field.key}
              name={field.key}
              type="checkbox"
              checked={Boolean(value)}
              aria-describedby={describedBy || undefined}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateFieldValue(field.key, event.target.checked)
              }
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              <span className="font-medium">{field.label}</span>
              {field.help && (
                <span id={helpId} className="mt-0.5 block text-xs text-gray-500">
                  {field.help}
                </span>
              )}
            </span>
          </label>
          {error && (
            <p id={errorId} className="mt-1 text-xs text-red-600">
              {error}
            </p>
          )}
        </div>
      );
    }

    return (
      <div key={field.key} className={wide}>
        <label htmlFor={field.key} className="text-xs font-medium text-gray-700">
          <span>
            {field.label}
            {field.required && <span className="ml-1 text-red-600">*</span>}
          </span>
        </label>
        {field.kind === 'select' ? (
          <select
            id={field.key}
            name={field.key}
            value={String(value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              updateFieldValue(field.key, event.target.value)
            }
            className={inputClassName}
          >
            {field.placeholder && <option value="">{field.placeholder}</option>}
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : field.kind === 'textarea' ? (
          <textarea
            id={field.key}
            name={field.key}
            rows={4}
            value={String(value)}
            placeholder={field.placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              updateFieldValue(field.key, event.target.value)
            }
            className={inputClassName}
          />
        ) : (
          <input
            id={field.key}
            name={field.key}
            type={
              field.kind === 'number'
                ? 'number'
                : field.kind === 'date'
                  ? 'date'
                  : 'text'
            }
            inputMode={field.kind === 'number' ? 'numeric' : undefined}
            min={field.kind === 'number' ? 1 : undefined}
            step={field.kind === 'number' ? 1 : undefined}
            value={String(value)}
            placeholder={field.placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateFieldValue(field.key, event.target.value)
            }
            className={inputClassName}
          />
        )}
        {field.help && (
          <p id={helpId} className="mt-1 text-xs text-gray-500">
            {field.help}
          </p>
        )}
        {error && (
          <p id={errorId} className="mt-1 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setHasValidated(true);
      }}
      className="space-y-5"
    >
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-950">本地资料完整性</p>
            <p className="mt-1 text-xs leading-5 text-blue-800">
              本页面仅作办公室本地录入与检查，不会保存草稿，不会连接数据库，也不会向车间发出正式申请。
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-950">
              {validation.completenessPercent}%
            </p>
            <p className="text-xs text-blue-800">
              必填 {validation.completedRequiredCount}/{validation.requiredFieldCount} 项
            </p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="打烊申请资料完整性"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={validation.completenessPercent}
          className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100"
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${validation.completenessPercent}%` }}
          />
        </div>

        {hasValidated && validation.ok && (
          <div
            role="status"
            className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800"
          >
            本地资料检查通过：必填资料结构已齐。图片尚未上传，申请尚未保存或提交；后续正式提交与资源 Gate 尚未开放。
          </div>
        )}
        {hasValidated && !validation.ok && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          >
            <p className="font-semibold">还有 {errorCount} 项需要修正：</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {Object.entries(validation.fieldErrors).map(([key, message]) => (
                <li key={key}>{message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {SAMPLING_REQUEST_ENTRY_SECTIONS.map((section) => (
        <section
          key={section.id}
          className="rounded-lg border border-gray-200 bg-white p-4"
        >
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-900">{section.title}</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              {section.description}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {section.fields.map((field) => renderField(field))}
          </div>
        </section>
      ))}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <p className="text-xs text-gray-500">
          检查结果只保留在当前页面；刷新后不会恢复，也不会写入浏览器存储。
        </p>
        <button
          type="submit"
          className="min-h-11 w-full rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 sm:w-auto"
        >
          检查打烊申请资料
        </button>
      </div>
    </form>
  );
}
