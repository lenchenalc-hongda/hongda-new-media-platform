'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';

export default function NewReviewPage() {
  const router = useRouter();
  const [canCreate, setCanCreate] = useState<boolean | null>(null);
  const [reviewType, setReviewType] = useState('A');
  const [title, setTitle] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [orderNo, setOrderNo] = useState('');
  const [projectName, setProjectName] = useState('');
  const [productName, setProductName] = useState('');
  const [processName, setProcessName] = useState('');
  const [description, setDescription] = useState('');
  const [impactSummary, setImpactSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/review-center/me')
      .then(res => res.json())
      .then(data => {
        if (typeof data.can_create_review === 'boolean') setCanCreate(data.can_create_review);
        else setCanCreate(false);
      })
      .catch(() => setCanCreate(false));
  }, []);

  if (canCreate === null) {
    return (
      <AppLayout>
        <PageHeader title="新建项目复盘" description="加载中..." />
      </AppLayout>
    );
  }

  if (!canCreate) {
    return (
      <AppLayout>
        <PageHeader title="新建项目复盘" description="创建复盘需要对应权限" />
        <ReviewCenterEmpty title="无权限创建复盘" description="当前账号暂无创建复盘权限。" action={{ label: '返回列表', href: '/review-center/reviews' }} />
      </AppLayout>
    );
  }

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/review-center/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_type: reviewType,
          title,
          occurred_at: occurredAt ? new Date(occurredAt).toISOString() : null,
          customer_name: customerName || null,
          order_no: orderNo || null,
          project_name: projectName || null,
          product_name: productName || null,
          process_name: processName || null,
          description: description || null,
          impact_summary: impactSummary || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '复盘创建失败，请稍后重试');
        return;
      }
      router.push(`/review-center/reviews/${data.id}`);
    } catch {
      setError('复盘创建失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="新建项目复盘" description="记录项目异常，保存为草稿后进入后续流程。" />

      <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-3xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">复盘类型</label>
            <select value={reviewType} onChange={e => setReviewType(e.target.value)} className="input-field">
              <option value="A">A 类 · 大货前异常</option>
              <option value="B">B 类 · 大货生产/品质/交付异常</option>
              <option value="C">C 类 · 前端问题延伸至大货</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">发生时间</label>
            <input type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} className="input-field" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">标题</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input-field" placeholder="复盘标题" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">客户</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">订单号</label>
            <input value={orderNo} onChange={e => setOrderNo(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">项目</label>
            <input value={projectName} onChange={e => setProjectName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">产品</label>
            <input value={productName} onChange={e => setProductName(e.target.value)} className="input-field" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">工艺</label>
            <input value={processName} onChange={e => setProcessName(e.target.value)} className="input-field" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">问题描述</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} className="input-field" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">影响摘要</label>
            <textarea value={impactSummary} onChange={e => setImpactSummary(e.target.value)} rows={2} className="input-field" />
          </div>
        </div>

        {error && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        <div className="mt-5 flex justify-end gap-3">
          <button disabled={submitting} onClick={() => router.push('/review-center/reviews')} className="btn-secondary">取消</button>
          <button disabled={submitting || !title.trim()} onClick={submit} className="btn-primary">保存草稿</button>
        </div>
      </div>
    </AppLayout>
  );
}
