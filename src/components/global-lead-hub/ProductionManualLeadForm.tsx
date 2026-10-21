'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GLH_MANUAL_PRODUCTION_SOURCES,
} from '@/lib/global-lead-hub/validation';

const SOURCE_LABELS: Record<(typeof GLH_MANUAL_PRODUCTION_SOURCES)[number], string> = {
  EXHIBITION: '展会',
  WEBSITE: '网站询盘',
  REFERRAL: '客户转介绍',
  OUTREACH: '主动开发',
  SOCIAL: '社交媒体',
  OTHER: '其他',
};
const REQUIREMENTS = [
  { value: '', label: '暂不确定' },
  { value: 'FILM', label: '热转印花膜' },
  { value: 'PROCESSING', label: '热转印加工' },
  { value: 'MACHINE', label: '机器设备' },
  { value: 'PROCESS_CONSULT', label: '工艺咨询' },
  { value: 'UNCLEAR', label: '待进一步确认' },
];

function optional(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export default function ProductionManualLeadForm({
  assignableProfiles,
}: {
  assignableProfiles: Array<{ id: string; name: string; role: string }>;
}) {
  const router = useRouter();
  const requestKey = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const form = new FormData(event.currentTarget);
    const whatsapp = optional(form, 'whatsapp');
    const email = optional(form, 'email');
    if (!whatsapp && !email) {
      setError('请至少填写一个 WhatsApp 电话或邮箱，用于联系和重复客户检查。');
      return;
    }
    if (!requestKey.current) requestKey.current = crypto.randomUUID();

    const payload = {
      requestKey: requestKey.current,
      displayName: String(form.get('displayName') || '').trim(),
      companyName: optional(form, 'companyName'),
      countryCode: optional(form, 'countryCode'),
      whatsapp,
      email,
      requirementType: optional(form, 'requirementType'),
      ownerProfileId: optional(form, 'ownerProfileId'),
      product: optional(form, 'product'),
      material: optional(form, 'material'),
      quantity: optional(form, 'quantity'),
      notes: optional(form, 'notes'),
      sourceDetail: String(form.get('sourceDetail') || 'OTHER'),
    };

    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/global-lead-hub/leads/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok === true && typeof body?.data?.leadId === 'string') {
        router.push('/global-lead-hub/leads/' + encodeURIComponent(body.data.leadId));
        router.refresh();
        return;
      }
      if (response.status === 409) {
        setError(body?.code === 'IDEMPOTENCY_CONFLICT'
          ? '当前信息已变化，请确认后重新提交。'
          : '该联系方式可能已在客户池中。请联系管理员核查，避免重复建档或改变原负责人。');
      } else if (response.status === 401) {
        setError('登录已过期，请重新登录后再提交。');
      } else if (response.status === 403) {
        setError('没有权限指定该负责人或建立线索，请联系管理员。');
      } else if (response.status === 400) {
        setError('请检查必填项、邮箱、WhatsApp 国际号码和输入长度。');
      } else if (response.status === 503) {
        setError('正式录入服务尚未就绪，线索没有保存，请稍后重试。');
      } else {
        setError('保存失败，未确认成功前请勿反复建立相同客户。可原样重试。');
      }
    } catch {
      setError('网络中断，保存结果尚不确定。请原样重试；系统会识别重复提交。');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}
      onChange={() => { if (!submittingRef.current) requestKey.current = null; }}>
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        手工录入的线索只供内部员工跟进，不会触发 WhatsApp 或 AI 对客户发消息。
        业务员新建后默认归自己；管理员或经理可指定本组织其他负责人。
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">客户信息</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="客户称呼" name="displayName" required maxLength={200} />
          <Field label="公司名称" name="companyName" maxLength={300} />
          <Field label="国家／地区代码" name="countryCode" placeholder="如 US、VN" maxLength={16} />
          <Field label="WhatsApp（国际号码）" name="whatsapp" type="tel" placeholder="如 +84901234567" maxLength={64} />
          <Field label="邮箱" name="email" type="email" maxLength={320} />
          <label className="text-xs font-medium text-gray-600">
            线索来源
            <select name="sourceDetail" defaultValue="OTHER" className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
              {GLH_MANUAL_PRODUCTION_SOURCES.map(key => <option key={key} value={key}>{SOURCE_LABELS[key]}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-gray-500">WhatsApp 或邮箱至少填写一个。系统检查本组织已有联系方式，不会覆盖旧客户。</p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">业务需求与归属</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-medium text-gray-600">
            业务类型
            <select name="requirementType" defaultValue="" className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
              {REQUIREMENTS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <Field label="需求产品" name="product" placeholder="如塑料瓶热转印花膜" maxLength={300} />
          <Field label="材质" name="material" placeholder="如 PP、ABS" maxLength={300} />
          <Field label="预计数量" name="quantity" placeholder="如每月 5 万件" maxLength={200} />
          {assignableProfiles.length > 0 && (
            <label className="text-xs font-medium text-gray-600">
              指定负责人
              <select name="ownerProfileId" defaultValue="" className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
                <option value="">默认：我自己</option>
                {assignableProfiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}（{p.role}）</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label htmlFor="production-lead-notes" className="mt-4 block text-xs font-medium text-gray-600">业务备注</label>
        <textarea id="production-lead-notes" name="notes" rows={4} maxLength={2000}
          placeholder="客户关注点、需求、沟通背景与下一步行动"
          className="mt-1 w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-900" />
      </section>

      <div className="flex justify-end gap-3">
        <button type="submit" disabled={submitting}
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? '正在保存…' : '保存线索'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label, name, type = 'text', required = false, maxLength, placeholder,
}: {
  label: string; name: string; type?: string; required?: boolean;
  maxLength: number; placeholder?: string;
}) {
  return (
    <label className="text-xs font-medium text-gray-600">
      {label}{required ? ' *' : ''}
      <input name={name} type={type} required={required} maxLength={maxLength}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" />
    </label>
  );
}
