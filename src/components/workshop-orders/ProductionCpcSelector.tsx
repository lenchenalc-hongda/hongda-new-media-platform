'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  cpcProjectOptionsForCustomer,
  loadWosV1CpcOptions,
  type WosV1CpcCustomerOption,
  type WosV1CpcProjectOption,
  type WosV1CpcSelection,
} from '@/lib/workshop-orders/production-cpc-options';

export default function ProductionCpcSelector({
  disabled,
  onChange,
}: {
  readonly disabled: boolean;
  readonly onChange: (selection: WosV1CpcSelection | null) => void;
}) {
  const [customers, setCustomers] = useState<readonly WosV1CpcCustomerOption[]>([]);
  const [projects, setProjects] = useState<readonly WosV1CpcProjectOption[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [message, setMessage] = useState('正在读取有效 CPC 客户与项目。');

  useEffect(() => {
    let active = true;
    void (async () => {
      const client = createClient();
      if (!client) {
        if (active) setMessage('CPC 数据不可用。');
        return;
      }
      const result = await loadWosV1CpcOptions(client);
      if (!active) return;
      if (!result.ok) {
        setCustomers([]);
        setProjects([]);
        setMessage('CPC 读取失败：' + result.code);
        return;
      }
      setCustomers(result.customers);
      setProjects(result.projects);
      setMessage(result.customers.length === 0
        ? '当前组织没有可用的 CPC 客户。'
        : '请选择 CPC 客户及其有效项目。');
    })();
    return () => { active = false; };
  }, []);

  const eligibleProjects = useMemo(
    () => cpcProjectOptionsForCustomer(projects, customerId),
    [customerId, projects],
  );

  function selectCustomer(nextCustomerId: string): void {
    setCustomerId(nextCustomerId);
    setProjectId('');
    onChange(null);
    setMessage('已选择客户，请继续选择该客户的有效项目。');
  }

  function selectProject(nextProjectId: string): void {
    setProjectId(nextProjectId);
    const customer = customers.find(row => row.id === customerId);
    const project = eligibleProjects.find(row => row.id === nextProjectId);
    if (!customer || !project) {
      onChange(null);
      setMessage('客户与项目关联无效。');
      return;
    }
    onChange({
      customerId: customer.id,
      customerName: customer.name,
      projectId: project.id,
      projectName: project.name,
      projectOwnerProfileId: project.ownerProfileId,
    });
    setMessage('CPC 客户、项目和项目负责人已绑定。');
  }

  return (
    <section className="rounded-lg border border-sky-200 bg-sky-50 p-4">
      <h2 className="text-sm font-semibold text-sky-950">CPC 客户与项目</h2>
      <p className="mt-1 text-xs text-sky-900">
        订单必须绑定当前组织内有效的 CPC 客户和项目；数据库会再次校验关联与负责人。
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-gray-800">
          CPC 客户
          <select
            value={customerId}
            disabled={disabled}
            onChange={event => selectCustomer(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
          >
            <option value="">请选择 CPC 客户</option>
            {customers.map(customer => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.status === 'pending_review' ? '（待复核）' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-800">
          CPC 项目
          <select
            value={projectId}
            disabled={disabled || !customerId}
            onChange={event => selectProject(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
          >
            <option value="">请选择该项目客户下的 active 项目</option>
            {eligibleProjects.map(project => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
      </div>
      <p role="status" className="mt-2 text-xs text-sky-950">{message}</p>
    </section>
  );
}
