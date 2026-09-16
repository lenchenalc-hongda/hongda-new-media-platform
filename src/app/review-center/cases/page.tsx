'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';
import type { CaseLibraryItem, CaseLibraryQuery } from '@/lib/review-center/case-schemas';
import type { MetadataOptionsDto } from '@/lib/review-center/types';
import { getMaterialDisplayLabel } from '@/lib/review-center/material-labels';
import {
  CaseApiError,
  fetchCaseLibrary,
  fetchCaseMetadataOptions,
} from '@/lib/review-center/case-api-client';
import {
  buildCaseMetadataDisplay,
  canManageCaseRole,
  caseDateToIsoDate,
  caseRiskBadgeClass,
  caseRiskLabel,
  caseReviewTypeLabel,
  formatCaseDateTime,
} from '@/lib/review-center/case-presentation';

const PAGE_LIMIT = 30;

interface CaseFilterState {
  q: string;
  materialCodes: string[];
  processCodes: string[];
  problemDomainCodes: string[];
  problemSymptomCodes: string[];
  reviewType: string;
  risk: string;
  publishedFrom: string;
  publishedTo: string;
}

const EMPTY_FILTERS: CaseFilterState = {
  q: '',
  materialCodes: [],
  processCodes: [],
  problemDomainCodes: [],
  problemSymptomCodes: [],
  reviewType: '',
  risk: '',
  publishedFrom: '',
  publishedTo: '',
};

function hasActiveFilters(filters: CaseFilterState): boolean {
  return (
    filters.q.trim() !== ''
    || filters.materialCodes.length > 0
    || filters.processCodes.length > 0
    || filters.problemDomainCodes.length > 0
    || filters.problemSymptomCodes.length > 0
    || filters.reviewType !== ''
    || filters.risk !== ''
    || filters.publishedFrom !== ''
    || filters.publishedTo !== ''
  );
}

function toLibraryQuery(filters: CaseFilterState, offset: number): CaseLibraryQuery {
  return {
    q: filters.q.trim() || null,
    materialCodes: filters.materialCodes,
    processCodes: filters.processCodes,
    problemDomainCodes: filters.problemDomainCodes,
    problemSymptomCodes: filters.problemSymptomCodes,
    reviewTypes: filters.reviewType ? [filters.reviewType] : [],
    riskLevels: filters.risk ? [filters.risk] : [],
    publishedFrom: filters.publishedFrom ? caseDateToIsoDate(filters.publishedFrom, false) : null,
    publishedTo: filters.publishedTo ? caseDateToIsoDate(filters.publishedTo, true) : null,
    limit: PAGE_LIMIT,
    offset,
  };
}

function dateRangeInvalid(filters: CaseFilterState): boolean {
  if (filters.publishedFrom && filters.publishedTo) {
    return filters.publishedFrom > filters.publishedTo;
  }
  return false;
}

function TaxonomyFieldset({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Array<{ code: string; label: string }>;
  selected: string[];
  onToggle: (code: string) => void;
}) {
  return (
    <fieldset className="min-w-[170px]">
      <legend className="mb-1 block text-xs text-gray-500">{title}</legend>
      <div className="max-h-44 overflow-y-auto rounded-md border border-gray-200 bg-white p-2">
        {options.length === 0 ? (
          <p className="text-xs text-gray-400">暂无可选项</p>
        ) : (
          <div className="space-y-1">
            {options.map(option => (
              <label key={option.code} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selected.includes(option.code)}
                  onChange={() => onToggle(option.code)}
                  className="accent-blue-600"
                />
                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </fieldset>
  );
}

function MetadataTags({ item }: { item: CaseLibraryItem }) {
  const display = buildCaseMetadataDisplay(item.metadata);
  const tags = [
    ...display.materials.map(tag => ({ key: `m:${tag.code}`, label: tag.label, primary: tag.primary ?? false })),
    ...display.processes.map(tag => ({ key: `p:${tag.code}`, label: tag.label, primary: false })),
    ...display.problemDomains.map(tag => ({ key: `d:${tag.code}`, label: tag.label, primary: false })),
    ...display.problemSymptoms.map(tag => ({ key: `s:${tag.code}`, label: tag.label, primary: false })),
  ];
  const visible = tags.slice(0, 4);
  const restCount = tags.length - visible.length;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map(tag => (
        <span
          key={tag.key}
          className={
            'inline-flex items-center rounded border px-1.5 py-0.5 text-xs '
            + (tag.primary
              ? 'border-blue-200 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-gray-50 text-gray-700')
          }
        >
          {tag.label}
          {tag.primary && <span className="ml-1 text-[10px] text-blue-500">主要</span>}
        </span>
      ))}
      {restCount > 0 && (
        <span className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-500">
          +{restCount}
        </span>
      )}
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="案例加载中">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
      ))}
    </div>
  );
}

export default function CaseLibraryPage() {
  const [items, setItems] = useState<CaseLibraryItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<CaseFilterState>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<CaseFilterState>(EMPTY_FILTERS);
  const [dateError, setDateError] = useState('');
  const [options, setOptions] = useState<MetadataOptionsDto | null>(null);
  const [optionsState, setOptionsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [canManage, setCanManage] = useState(false);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (nextOffset: number, filters: CaseFilterState) => {
    const requestId = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setErrorMessage('');

    try {
      const data = await fetchCaseLibrary(toLibraryQuery(filters, nextOffset), {
        signal: controller.signal,
      });
      if (requestId !== generationRef.current) return;
      setItems(data.items);
      setHasMore(data.hasMore);
      setOffset(data.offset);
      setStatus('ready');
    } catch (error) {
      if (requestId !== generationRef.current) return;
      if (error instanceof CaseApiError && error.status === 401) {
        setErrorMessage('登录状态已失效，请重新登录。');
      } else if (error instanceof CaseApiError && error.status === 403) {
        setErrorMessage('没有权限查看案例知识库。');
      } else {
        setErrorMessage('案例知识库加载失败，请稍后重试。');
      }
      setItems([]);
      setHasMore(false);
      setStatus('error');
    } finally {
      if (requestId === generationRef.current) abortRef.current = null;
    }
  }, []);

  const loadOptions = useCallback(async () => {
    setOptionsState('loading');
    try {
      const data = await fetchCaseMetadataOptions();
      setOptions(data);
      setOptionsState('ready');
    } catch {
      setOptions(null);
      setOptionsState('error');
    }
  }, []);

  useEffect(() => {
    void loadOptions();
    void load(0, EMPTY_FILTERS);
    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
    };
  }, [load, loadOptions]);

  useEffect(() => {
    let active = true;
    fetch('/api/review-center/me')
      .then(response => response.json().catch(() => null))
      .then(data => {
        if (active && data && typeof data.role === 'string') {
          setCanManage(canManageCaseRole(data.role));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function applyFilters() {
    if (dateRangeInvalid(draftFilters)) {
      setDateError('开始日期不能晚于结束日期。');
      return;
    }
    setDateError('');
    setAppliedFilters(draftFilters);
    void load(0, draftFilters);
  }

  function resetFilters() {
    setDateError('');
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    void load(0, EMPTY_FILTERS);
  }

  function toggleCode(key: 'materialCodes' | 'processCodes' | 'problemDomainCodes' | 'problemSymptomCodes', code: string) {
    setDraftFilters(prev => {
      const selected = prev[key];
      const next = selected.includes(code)
        ? selected.filter(item => item !== code)
        : [...selected, code];
      return { ...prev, [key]: next };
    });
  }

  function goPrevious() {
    if (offset > 0) void load(offset - PAGE_LIMIT, appliedFilters);
  }

  function goNext() {
    if (hasMore) void load(offset + PAGE_LIMIT, appliedFilters);
  }

  const loading = status === 'loading';
  const activeFiltering = hasActiveFilters(appliedFilters);

  return (
    <AppLayout>
      <PageHeader
        title="案例中心"
        description="已发布并整理完成的项目复盘知识，可按工艺、材料和问题类型检索。"
        actions={canManage ? (
          <Link href="/review-center/cases/candidates" className="btn-primary whitespace-nowrap">
            待整理案例
          </Link>
        ) : undefined}
      />

      <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="case-search" className="mb-1 block text-xs text-gray-500">搜索</label>
            <div className="flex gap-2">
              <input
                id="case-search"
                aria-label="搜索案例"
                value={draftFilters.q}
                onChange={event => setDraftFilters(prev => ({ ...prev, q: event.target.value }))}
                onKeyDown={event => {
                  if (event.key === 'Enter') applyFilters();
                }}
                placeholder="案例编号 / 标题 / 内容关键词"
                className="input-field flex-1"
              />
              <button type="button" className="btn-secondary whitespace-nowrap" onClick={applyFilters}>
                搜索
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="case-review-type" className="mb-1 block text-xs text-gray-500">复盘类型</label>
            <select
              id="case-review-type"
              value={draftFilters.reviewType}
              onChange={event => setDraftFilters(prev => ({ ...prev, reviewType: event.target.value }))}
              className="input-field"
            >
              <option value="">全部类型</option>
              <option value="A">A 类</option>
              <option value="B">B 类</option>
              <option value="C">C 类</option>
            </select>
          </div>
          <div>
            <label htmlFor="case-risk" className="mb-1 block text-xs text-gray-500">风险等级</label>
            <select
              id="case-risk"
              value={draftFilters.risk}
              onChange={event => setDraftFilters(prev => ({ ...prev, risk: event.target.value }))}
              className="input-field"
            >
              <option value="">全部风险</option>
              <option value="RED">高</option>
              <option value="YELLOW">中</option>
              <option value="GREEN">低</option>
            </select>
          </div>
          <div>
            <label htmlFor="case-from" className="mb-1 block text-xs text-gray-500">发布开始</label>
            <input
              id="case-from"
              type="date"
              value={draftFilters.publishedFrom}
              onChange={event => setDraftFilters(prev => ({ ...prev, publishedFrom: event.target.value }))}
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="case-to" className="mb-1 block text-xs text-gray-500">发布结束</label>
            <input
              id="case-to"
              type="date"
              value={draftFilters.publishedTo}
              onChange={event => setDraftFilters(prev => ({ ...prev, publishedTo: event.target.value }))}
              className="input-field"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={applyFilters}>筛选</button>
            <button type="button" className="btn-secondary" onClick={resetFilters}>清空</button>
          </div>
        </div>

        {dateError && (
          <p className="mt-3 text-sm text-red-600">{dateError}</p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {optionsState === 'error' ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              <p>分类筛选暂时不可用</p>
              <button type="button" className="btn-secondary mt-2" onClick={() => void loadOptions()}>
                重试
              </button>
            </div>
          ) : (
            <>
              <TaxonomyFieldset
                title="材质"
                options={(options?.materials ?? []).map(option => ({
                  ...option,
                  label: getMaterialDisplayLabel(option.code, option.label),
                }))}
                selected={draftFilters.materialCodes}
                onToggle={code => toggleCode('materialCodes', code)}
              />
              <TaxonomyFieldset
                title="工艺"
                options={options?.processes ?? []}
                selected={draftFilters.processCodes}
                onToggle={code => toggleCode('processCodes', code)}
              />
              <TaxonomyFieldset
                title="问题环节"
                options={options?.problemDomains ?? []}
                selected={draftFilters.problemDomainCodes}
                onToggle={code => toggleCode('problemDomainCodes', code)}
              />
              <TaxonomyFieldset
                title="问题表现"
                options={options?.problemSymptoms ?? []}
                selected={draftFilters.problemSymptomCodes}
                onToggle={code => toggleCode('problemSymptomCodes', code)}
              />
            </>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
          <p>{errorMessage}</p>
          <button
            type="button"
            className="btn-secondary mt-3"
            disabled={loading}
            onClick={() => void load(offset, appliedFilters)}
          >
            重新加载
          </button>
        </div>
      )}

      {loading && items.length === 0 && !errorMessage ? (
        <LibrarySkeleton />
      ) : items.length === 0 && status === 'ready' ? (
        <ReviewCenterEmpty
          title={activeFiltering ? '没有符合条件的案例' : '还没有已发布的案例'}
          description={activeFiltering
            ? '请调整筛选条件后重试。'
            : '复盘完成策展并发布后，将在这里沉淀为可复用案例知识。'}
        />
      ) : items.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm" aria-busy={loading}>
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="w-[150px] px-4 py-3">案例编号</th>
                  <th className="w-[220px] px-4 py-3">标题</th>
                  <th className="w-[220px] px-4 py-3">摘要</th>
                  <th className="w-[70px] px-4 py-3">类型</th>
                  <th className="w-[80px] px-4 py-3">风险</th>
                  <th className="px-4 py-3">分类标签</th>
                  <th className="w-[150px] px-4 py-3">发布时间</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.caseNo} className="border-t border-gray-100 align-top hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/review-center/cases/${encodeURIComponent(item.caseNo)}`}
                        className="text-blue-600 no-underline"
                      >
                        {item.caseNo}
                      </Link>
                    </td>
                    <td className="max-w-[220px] px-4 py-3 font-medium break-words text-gray-800">
                      <Link
                        href={`/review-center/cases/${encodeURIComponent(item.caseNo)}`}
                        className="text-blue-600 no-underline"
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td className="max-w-[220px] px-4 py-3 break-words text-gray-600">
                      {item.summary || '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {caseReviewTypeLabel(item.reviewType)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={caseRiskBadgeClass(item.risk)}>{caseRiskLabel(item.risk)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <MetadataTags item={item} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {formatCaseDateTime(item.publishedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <span className="text-xs text-gray-500">
              {loading ? '加载中...' : `第 ${offset / PAGE_LIMIT + 1} 页`}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={offset === 0 || loading}
                onClick={goPrevious}
              >
                上一页
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!hasMore || loading}
                onClick={goNext}
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
