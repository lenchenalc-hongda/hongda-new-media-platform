'use client';

import { useEffect, useState } from 'react';
import type {
  CpcIntegrationAvailability,
  CpcIntegrationReuseKind,
  CpcIntegrationStatus,
  CpcIntegrationStatusSnapshot,
} from '@/lib/customer-projects/integration-registry';

const STATUS_LABELS: Record<CpcIntegrationStatus, string> = {
  connected: '已连接',
  available_internal: '内部可用',
  external_contract_pending: '外部待接入',
  current_artifact_only: '仅现有文件',
  backlog: '后续排期',
  unknown: '未知',
};

const STATUS_TONES: Record<CpcIntegrationStatus, string> = {
  connected: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  available_internal: 'border-blue-200 bg-blue-50 text-blue-700',
  external_contract_pending: 'border-amber-200 bg-amber-50 text-amber-800',
  current_artifact_only: 'border-slate-200 bg-slate-50 text-slate-700',
  backlog: 'border-gray-200 bg-gray-50 text-gray-600',
  unknown: 'border-rose-200 bg-rose-50 text-rose-700',
};

const REUSE_LABELS: Record<CpcIntegrationReuseKind, string> = {
  profiles_org_identity: '人员与组织身份',
  review_center: '项目复盘',
  knowledge: '知识库',
};

const AVAILABILITY_LABELS: Record<CpcIntegrationAvailability, string> = {
  available: '可读',
  unavailable: '不可读',
  unknown: '未验证',
};

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '未知时间'
    : date.toLocaleString('zh-CN', { hour12: false });
}

export default function IntegrationStatusPanel() {
  const [snapshot, setSnapshot] = useState<CpcIntegrationStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch('/api/customer-projects/integration-status', {
          cache: 'no-store',
        });
        const body = await response.json().catch(() => null);

        if (!active) return;

        if (response.ok && body?.ok === true && body.data) {
          setSnapshot(body.data as CpcIntegrationStatusSnapshot);
          setError('');
        } else if (response.status === 401 || response.status === 403) {
          setSnapshot(null);
          setError('无权查看集成状态。');
        } else {
          setSnapshot(null);
          setError('集成状态加载失败，请稍后重试。');
        }
      } catch {
        if (active) {
          setSnapshot(null);
          setError('集成状态加载失败，请稍后重试。');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-100" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map(index => (
            <div key={index} className="h-16 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-600">{error || '集成状态不可用。'}</p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-800">权威边界与可用性</h2>
            <p className="mt-1 text-sm text-gray-500">
              CPC 只复用或引用现有权威来源，不在设置页创建客户、归属、订单、报价或财务事实。
            </p>
          </div>
          <span className="text-xs text-gray-400">
            检查时间：{formatCheckedAt(snapshot.generatedAt)}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(snapshot.summary).map(([status, count]) => (
            <span
              key={status}
              className={`rounded-full border px-2.5 py-1 text-xs ${STATUS_TONES[status as CpcIntegrationStatus]}`}
            >
              {STATUS_LABELS[status as CpcIntegrationStatus]} {count}
            </span>
          ))}
        </div>

        <div className="mt-4 rounded border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
          <p>
            内部 UI / QA：{snapshot.phase12InternalUiQaReady ? '可继续' : '不可继续'}
          </p>
          <p className="mt-1">
            完整实时集成：{snapshot.fullLiveIntegrationReady ? '已就绪' : '未就绪'}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-800">集成注册表</h2>
          <p className="mt-1 text-sm text-gray-500">
            未接入的来源保持未知；不会把缺失值当作 0。
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">领域</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">权威来源</th>
                <th className="px-4 py-3 font-medium">写权限</th>
                <th className="px-4 py-3 font-medium">员工处理方式</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {snapshot.registry.map(entry => (
                <tr key={entry.domain} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-800">{entry.label}</p>
                    <p className="mt-1 max-w-xs text-xs text-gray-500">
                      {entry.stableIdKind}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${STATUS_TONES[entry.status]}`}>
                      {STATUS_LABELS[entry.status]}
                    </span>
                  </td>
                  <td className="max-w-sm px-4 py-4 text-xs leading-5 text-gray-600">
                    <p>{entry.sourceOfTruthStatement}</p>
                    <p className="mt-1 text-gray-400">{entry.freshness.note}</p>
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-600">
                    {entry.writeCapability}
                  </td>
                  <td className="max-w-sm px-4 py-4 text-xs leading-5 text-gray-600">
                    <p>{entry.employeeAction}</p>
                    <p className="mt-1 text-gray-400">{entry.fallback}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-base font-semibold text-gray-800">仓库内只读复用</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {snapshot.internalReuse.map(item => (
            <div key={item.kind} className="rounded border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-700">{REUSE_LABELS[item.kind]}</p>
                <span className="text-xs text-gray-500">
                  {AVAILABILITY_LABELS[item.state]}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
