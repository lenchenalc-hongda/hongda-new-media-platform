'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import type { ProjectPriority, ProjectType, WaitingOn } from '@/lib/customer-projects/domain';
import {
  PROJECT_PRIORITY_LABELS,
  PROJECT_STAGE_OPTIONS,
  PROJECT_TYPE_LABELS,
  WAITING_ON_LABELS,
  toIsoFromShanghaiDateTime,
} from '@/lib/customer-projects/presentation';

interface CustomerOption {
  id: string;
  referenceKind: 'canonical' | 'provisional';
  displayName: string;
  status: string;
  sourceLabel: string | null;
}

type StartMode = 'action' | 'waiting';

const PROJECT_TYPES = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[];
const PRIORITIES: ProjectPriority[] = ['critical', 'high', 'medium', 'low'];
const WAITING_OPTIONS = ([
  'customer',
  'internal',
  'supplier',
  'quality',
  'finance',
  'logistics',
  'other',
] as const);

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="mb-1 block text-xs font-medium text-gray-600">
      {children}{required ? <span className="ml-1 text-red-500">*</span> : null}
    </label>
  );
}

export default function NewCustomerProjectPage() {
  const [preselectedCustomerReferenceId, setPreselectedCustomerReferenceId] = useState('');
  const [contextEventId, setContextEventId] = useState('');

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState('');

  const [showProvisional, setShowProvisional] = useState(false);
  const [provisionalName, setProvisionalName] = useState('');
  const [provisionalSource, setProvisionalSource] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const [title, setTitle] = useState('');
  const [objectiveSummary, setObjectiveSummary] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>('transfer_film');
  const [stage, setStage] = useState(PROJECT_STAGE_OPTIONS.transfer_film[0].value);
  const [priority, setPriority] = useState<ProjectPriority>('medium');

  const [startMode, setStartMode] = useState<StartMode>('action');
  const [nextActionTitle, setNextActionTitle] = useState('');
  const [nextActionDueAt, setNextActionDueAt] = useState('');
  const [waitingOn, setWaitingOn] = useState<Exclude<WaitingOn, 'none'>>('customer');
  const [nextCheckAt, setNextCheckAt] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [carriedContext, setCarriedContext] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find(customer => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  async function loadCustomers(query = '') {
    setCustomerLoading(true);
    setCustomerError('');
    try {
      const response = await fetch(
        '/api/customer-projects/customer-references?q=' + encodeURIComponent(query.trim()),
        { cache: 'no-store' },
      );
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true && Array.isArray(body?.data?.customers)) {
        setCustomers(body.data.customers as CustomerOption[]);
      } else if (response.status === 401) {
        setCustomerError('登录状态已失效，请重新登录。');
      } else if (response.status === 403) {
        setCustomerError('你没有权限读取客户引用。');
      } else {
        setCustomerError('客户选择列表加载失败。');
      }
    } catch {
      setCustomerError('客户选择列表加载失败。');
    } finally {
      setCustomerLoading(false);
    }
  }

  useEffect(() => {
    void loadCustomers();

    const params = new URLSearchParams(window.location.search);
    setPreselectedCustomerReferenceId(params.get('customerReferenceId') ?? '');
    setContextEventId(params.get('contextEventId') ?? '');
  }, []);

  useEffect(() => {
    if (!preselectedCustomerReferenceId) return;

    let active = true;

    async function loadCustomerContext() {
      try {
        const response = await fetch(
          '/api/customer-projects/customers/' + encodeURIComponent(preselectedCustomerReferenceId),
          { cache: 'no-store' },
        );
        const body = await response.json().catch(() => null);
        if (!active || !response.ok || body?.ok !== true || !body?.data?.customer) return;

        const customer = body.data.customer;
        const option: CustomerOption = {
          id: customer.id,
          referenceKind: customer.referenceKind,
          displayName: customer.displayName,
          status: customer.status,
          sourceLabel: customer.sourceLabel ?? null,
        };

        setCustomers(current => [
          option,
          ...current.filter(item => item.id !== option.id),
        ]);
        setSelectedCustomerId(option.id);

        if (
          contextEventId
          && body.data.promotionContext?.eventId === contextEventId
          && typeof body.data.promotionContext?.summary === 'string'
        ) {
          const summary = body.data.promotionContext.summary.trim();
          if (summary) {
            setObjectiveSummary(current => current.trim() ? current : summary);
            setCarriedContext(true);
          }
        }
      } catch {
        // The normal selector remains usable even if contextual preload fails.
      }
    }

    void loadCustomerContext();
    return () => {
      active = false;
    };
  }, [contextEventId, preselectedCustomerReferenceId]);

  function handleProjectTypeChange(value: ProjectType) {
    setProjectType(value);
    setStage(PROJECT_STAGE_OPTIONS[value][0].value);
  }

  async function createProvisionalCustomer() {
    const name = provisionalName.trim();
    const source = provisionalSource.trim();

    if (!name || !source) {
      setCustomerError('临时客户必须填写客户名称和来源说明。');
      return;
    }

    setCreatingCustomer(true);
    setCustomerError('');

    try {
      const response = await fetch('/api/customer-projects/customers/provisional', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayNameSnapshot: name,
          provisionalSourceReference: source,
        }),
      });
      const body = await response.json().catch(() => null);

      if (response.ok && body?.ok === true && body?.data?.customerReferenceId) {
        const id = String(body.data.customerReferenceId);
        const created: CustomerOption = {
          id,
          referenceKind: 'provisional',
          displayName: name,
          status: 'pending_review',
          sourceLabel: source,
        };
        setCustomers(current => [created, ...current.filter(item => item.id !== id)]);
        setSelectedCustomerId(id);
        setProvisionalName('');
        setProvisionalSource('');
        setShowProvisional(false);
      } else {
        setCustomerError(typeof body?.message === 'string'
          ? body.message
          : '临时客户创建失败，请检查后重试。');
      }
    } catch {
      setCustomerError('临时客户创建失败，请稍后重试。');
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (!selectedCustomerId) {
      setSubmitError('请先选择客户。');
      return;
    }
    if (!title.trim() || !objectiveSummary.trim()) {
      setSubmitError('项目标题和具体商业机会/目标不能为空。');
      return;
    }

    const body: Record<string, unknown> = {
      customerReferenceId: selectedCustomerId,
      title: title.trim(),
      objectiveSummary: objectiveSummary.trim(),
      projectType,
      stage,
      priority,
      waitingOn: 'none',
    };

    if (startMode === 'action') {
      if (!nextActionTitle.trim()) {
        setSubmitError('活跃项目创建时必须填写第一步要做什么。');
        return;
      }
      body.initialNextActionTitle = nextActionTitle.trim();
      body.initialNextActionDueAt = nextActionDueAt
        ? toIsoFromShanghaiDateTime(nextActionDueAt)
        : null;
      if (nextActionDueAt && !body.initialNextActionDueAt) {
        setSubmitError('下一步时间格式无效。');
        return;
      }
    } else {
      if (!nextCheckAt) {
        setSubmitError('等待状态必须设置下一次检查时间。');
        return;
      }
      const nextCheckIso = toIsoFromShanghaiDateTime(nextCheckAt);
      if (!nextCheckIso) {
        setSubmitError('检查时间格式无效。');
        return;
      }
      body.waitingOn = waitingOn;
      body.nextCheckAt = nextCheckIso;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const response = await fetch('/api/customer-projects/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);

      if (response.ok && result?.ok === true && result?.data?.projectId) {
        window.location.href = '/customer-projects/projects/' + encodeURIComponent(String(result.data.projectId));
        return;
      }

      if (response.status === 409 || response.status === 422 || response.status === 400) {
        setSubmitError(typeof result?.message === 'string'
          ? result.message
          : '项目资料不完整或状态不允许，请检查后再提交。');
      } else if (response.status === 403) {
        setSubmitError('你没有权限用这个客户创建项目，或当前负责人规则不允许。');
      } else {
        setSubmitError('项目创建失败，请稍后重试。');
      }
    } catch {
      setSubmitError('项目创建失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        title="新建项目"
        description="只在出现具体商业机会时建项目；普通老客户回访不需要创建假项目。"
        actions={
          <Link href="/customer-projects/projects" className="text-sm text-cyan-700 no-underline hover:underline">
            ← 返回项目
          </Link>
        }
      />

      <form onSubmit={submitProject} className="space-y-5">
        <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <h2 className="text-base font-semibold text-gray-800">1. 客户</h2>
          <p className="mt-1 text-sm text-gray-500">优先复用已有正式客户引用；找不到时才创建临时引用。</p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={customerSearch}
              onChange={event => setCustomerSearch(event.target.value)}
              placeholder="按客户名称搜索"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void loadCustomers(customerSearch)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
              disabled={customerLoading}
            >
              {customerLoading ? '搜索中...' : '搜索客户'}
            </button>
            <button
              type="button"
              onClick={() => setShowProvisional(value => !value)}
              className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-medium text-cyan-700"
            >
              找不到客户
            </button>
          </div>

          {customerError && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {customerError}
            </p>
          )}

          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {customers.map(customer => (
              <label
                key={customer.id}
                className={
                  'cursor-pointer rounded-lg border p-3 '
                  + (selectedCustomerId === customer.id
                    ? 'border-cyan-400 bg-cyan-50'
                    : 'border-gray-200 bg-white hover:border-gray-300')
                }
              >
                <div className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="customer"
                    value={customer.id}
                    checked={selectedCustomerId === customer.id}
                    onChange={() => setSelectedCustomerId(customer.id)}
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{customer.displayName}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {customer.referenceKind === 'canonical' ? '正式客户' : '临时客户'}
                      {customer.sourceLabel ? ' · ' + customer.sourceLabel : ''}
                    </p>
                  </div>
                </div>
              </label>
            ))}
          </div>

          {customers.length === 0 && !customerLoading && (
            <p className="mt-4 text-sm text-gray-400">当前没有可选客户，或当前权限下没有匹配结果。</p>
          )}

          {showProvisional && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">创建临时客户引用</p>
              <p className="mt-1 text-xs text-amber-700">
                临时引用只用于先推进真实机会；项目成交前仍必须映射到正式客户。
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel required>客户名称</FieldLabel>
                  <input
                    value={provisionalName}
                    onChange={event => setProvisionalName(event.target.value)}
                    className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                    placeholder="例如：越南某塑胶厂"
                  />
                </div>
                <div>
                  <FieldLabel required>来源说明</FieldLabel>
                  <input
                    value={provisionalSource}
                    onChange={event => setProvisionalSource(event.target.value)}
                    className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                    placeholder="例如：展会名片 / WhatsApp / 老客户转介绍"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => void createProvisionalCustomer()}
                className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white"
                disabled={creatingCustomer}
              >
                {creatingCustomer ? '创建中...' : '创建并选中'}
              </button>
            </div>
          )}

          {selectedCustomer && (
            <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
              当前客户：<span className="font-medium text-gray-800">{selectedCustomer.displayName}</span>
              {' · '}
              {selectedCustomer.referenceKind === 'canonical' ? '正式客户' : '临时客户'}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <h2 className="text-base font-semibold text-gray-800">2. 具体商业机会</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <FieldLabel required>项目标题</FieldLabel>
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="例如：新款儿童水杯镭射花膜"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <FieldLabel required>具体需求 / 目标</FieldLabel>
              <textarea
                value={objectiveSummary}
                onChange={event => {
                  setObjectiveSummary(event.target.value);
                  setCarriedContext(false);
                }}
                rows={4}
                placeholder="写清楚客户真正要解决什么、做什么产品，不要只写“跟进客户”。"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {carriedContext && (
                <p className="mt-1 text-[11px] text-cyan-700">
                  已带入最近一次已确认的客户回访摘要，仅用于填写当前机会；系统不会据此声明项目转化归因。
                </p>
              )}
            </div>
            <div>
              <FieldLabel required>业务类型</FieldLabel>
              <select
                value={projectType}
                onChange={event => handleProjectTypeChange(event.target.value as ProjectType)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {PROJECT_TYPES.map(type => (
                  <option key={type} value={type}>{PROJECT_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel required>起始阶段</FieldLabel>
              <select
                value={stage}
                onChange={event => setStage(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {PROJECT_STAGE_OPTIONS[projectType].map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-400">复购/重复订单可直接进入真实有效的后续阶段，不强迫走完整向导。</p>
            </div>
            <div>
              <FieldLabel required>优先级</FieldLabel>
              <select
                value={priority}
                onChange={event => setPriority(event.target.value as ProjectPriority)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {PRIORITIES.map(value => (
                  <option key={value} value={value}>{PROJECT_PRIORITY_LABELS[value]}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>负责人</FieldLabel>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                当前创建人
              </div>
              <p className="mt-1 text-[11px] text-gray-400">本批默认创建人负责；销售不能替别人建立项目。</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <h2 className="text-base font-semibold text-gray-800">3. 创建后马上做什么</h2>
          <p className="mt-1 text-sm text-gray-500">活跃项目不能只有标题，必须有第一步动作，或者明确等待对象和检查时间。</p>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className={"cursor-pointer rounded-lg border p-3 " + (startMode === 'action' ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200')}>
              <input type="radio" checked={startMode === 'action'} onChange={() => setStartMode('action')} className="mr-2" />
              <span className="text-sm font-medium text-gray-800">建立第一步动作</span>
            </label>
            <label className={"cursor-pointer rounded-lg border p-3 " + (startMode === 'waiting' ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200')}>
              <input type="radio" checked={startMode === 'waiting'} onChange={() => setStartMode('waiting')} className="mr-2" />
              <span className="text-sm font-medium text-gray-800">当前正在等待</span>
            </label>
          </div>

          {startMode === 'action' ? (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel required>第一步动作</FieldLabel>
                <input
                  value={nextActionTitle}
                  onChange={event => setNextActionTitle(event.target.value)}
                  placeholder="例如：确认 PP 材质并收客户图稿"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <FieldLabel>到期时间（东莞时间）</FieldLabel>
                <input
                  type="datetime-local"
                  value={nextActionDueAt}
                  onChange={event => setNextActionDueAt(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel required>等待谁 / 哪个环节</FieldLabel>
                <select
                  value={waitingOn}
                  onChange={event => setWaitingOn(event.target.value as Exclude<WaitingOn, 'none'>)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {WAITING_OPTIONS.map(value => (
                    <option key={value} value={value}>{WAITING_ON_LABELS[value]}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel required>下一次检查时间（东莞时间）</FieldLabel>
                <input
                  type="datetime-local"
                  value={nextCheckAt}
                  onChange={event => setNextCheckAt(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
        </section>

        {submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? '正在创建...' : '创建项目并开始推进'}
          </button>
        </div>
      </form>
    </AppLayout>
  );
}
