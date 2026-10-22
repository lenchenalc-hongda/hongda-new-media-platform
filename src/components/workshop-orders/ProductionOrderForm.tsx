'use client';

import React, { useState, type ChangeEvent } from 'react';
import {
  PRODUCTION_ORDER_ENTRY_SECTIONS,
  createEmptyProductionOrderDraft,
  validateProductionOrderDraft,
  type OfficeEntryFieldDefinition,
  type ProductionOrderDraft,
  type ProductionOrderEntryFieldKey,
} from '../../lib/workshop-orders/office-entry';

const inputClassName =
  'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

export default function ProductionOrderForm() {
  const [draft, setDraft] = useState<ProductionOrderDraft>(
    createEmptyProductionOrderDraft,
  );
  const [hasValidated, setHasValidated] = useState(false);

  const validation = validateProductionOrderDraft(draft);
  const errorCount = Object.keys(validation.fieldErrors).length;

  function updateFieldValue(
    key: ProductionOrderEntryFieldKey,
    value: string | boolean,
  ): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleValidate(): void {
    setHasValidated(true);
  }

  function renderField(field: OfficeEntryFieldDefinition) {
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
          {field.label}
          {field.required && <span className="ml-1 text-red-600">*</span>}
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
            type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}
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
        handleValidate();
      }}
      className="space-y-5"
    >
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-950">本地资料完整性</p>
            <p className="mt-1 text-xs text-blue-800">
              本页面仅作本地录入与校验，不会保存草稿，也不会向数据库提交生产单。
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
          aria-label="生产单资料完整性"
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
            className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
          >
            本地完整性检查通过：资料已齐。当前页面未保存、未提交，请等待后续受控的正式提交功能。
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

      {PRODUCTION_ORDER_ENTRY_SECTIONS.map((section) => (
        <section
          key={section.id}
          className="rounded-lg border border-gray-200 bg-white p-4"
        >
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-900">{section.title}</h2>
            <p className="mt-1 text-xs text-gray-500">{section.description}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {section.fields.map((field) => renderField(field))}
          </div>
        </section>
      ))}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <p className="text-xs text-gray-500">
          校验结果只保留在当前页面，刷新后不会恢复，也不会写入浏览器存储。
        </p>
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
        >
          检查资料完整性
        </button>
      </div>
    </form>
  );
}
