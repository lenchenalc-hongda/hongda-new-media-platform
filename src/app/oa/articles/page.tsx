'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { MOCK_OA_ARTICLES, MOCK_OA_TEMPLATES, MOCK_PUBLISH_JOBS } from '@/lib/constants/oa-mock-data';
import { MOCK_MONTHLY_PLAN } from '@/lib/constants/oa-phase3';
import { formatDateTime } from '@/lib/utils';

export default function ArticlesPage() {
  const [articles, setArticles] = useState(MOCK_OA_ARTICLES);
  const [selected, setSelected] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionMsg, setActionMsg] = useState<{ type: string; text: string } | null>(null);
  const [showExp, setShowExp] = useState(false);
  const [expForm, setExpForm] = useState({ type: 'title', a: '', b: '' });
  const [showMonthly, setShowMonthly] = useState(false);
  const [monthlyPlan, setMonthlyPlan] = useState<any>(null);

  const filtered = statusFilter ? articles.filter(a => a.publish_status === statusFilter) : articles;
  const publishJob = selected ? MOCK_PUBLISH_JOBS.find(j => j.entity_id === selected.id) : null;

  const handleSaveDraft = async (a: any) => {
    setActionMsg({ type: 'loading', text: '正在保存草稿...' });
    const html = (a.body_blocks || []).map((b: any) => `<p>${b.content}</p>`).join('');
    const res = await fetch('/api/oa/save-draft', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId: a.id, title: a.title, content: html, digest: a.summary }),
    });
    const data = await res.json();
    if (data.draftId) {
      setArticles(prev => prev.map(art => art.id === a.id ? { ...art, external_draft_id: data.draftId, publish_status: 'pending_review' as any } : art));
      setSelected((prev: any) => ({ ...prev, external_draft_id: data.draftId, publish_status: 'pending_review' }));
      setActionMsg({ type: 'success', text: `草稿已保存到微信（ID: ${data.draftId}）` });
    } else {
      setActionMsg({ type: 'error', text: data.error || '保存失败' });
    }
    setTimeout(() => setActionMsg(null), 5000);
  };

  const handlePublish = async (a: any) => {
    setActionMsg({ type: 'loading', text: '正在发布...' });
    const res = await fetch('/api/oa/publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: a.external_draft_id }),
    });
    const data = await res.json();
    if (data.publishId) {
      setArticles(prev => prev.map(art => art.id === a.id ? { ...art, external_publish_id: data.publishId, publish_status: 'published_mock' as any } : art));
      setSelected((prev: any) => ({ ...prev, external_publish_id: data.publishId, publish_status: 'published_mock' }));
      setActionMsg({ type: 'success', text: `发布成功（ID: ${data.publishId}）` });
    } else {
      setActionMsg({ type: 'error', text: data.error || '发布失败' });
    }
    setTimeout(() => setActionMsg(null), 5000);
  };

  const handleCreateExp = async () => {
    if (!selected || !expForm.a || !expForm.b) return;
    const res = await fetch('/api/oa/create-experiment', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId: selected.id, experimentType: expForm.type, variantA: expForm.a, variantB: expForm.b }),
    });
    const data = await res.json();
    setActionMsg({ type: 'success', text: data.message });
    setShowExp(false);
    setExpForm({ type: 'title', a: '', b: '' });
    setTimeout(() => setActionMsg(null), 5000);
  };

  const handleGenerateMonthly = async () => {
    const res = await fetch('/api/oa/generate-monthly-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: '2026-07' }),
    });
    const data = await res.json();
    setMonthlyPlan(data);
  };

  return (
    <AppLayout>
      <PageHeader title="公众号文章库" description="管理与发布"
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm text-xs" onClick={() => { setShowMonthly(true); handleGenerateMonthly(); }}>
              📅 本月计划
            </button>
          </div>
        } />
      {actionMsg && (
        <div className={'mb-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ' +
          (actionMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
           actionMsg.type === 'error' ? 'bg-red-50 text-red-600 border border-red-200' :
           'bg-blue-50 text-blue-700 border border-blue-200')}>
          {actionMsg.type === 'loading' ? '⏳' : actionMsg.type === 'success' ? '✅' : '❌'}
          {actionMsg.text}
        </div>
      )}

      <div className="flex gap-2 mb-3">
        {['', 'draft', 'pending_review', 'approved', 'scheduled', 'published_mock'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={'text-xs px-3 py-1.5 rounded-lg ' + (statusFilter === s ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {s === '' ? '全部' : s === 'draft' ? '草稿' : s === 'pending_review' ? '待审核' : s === 'approved' ? '已审核' : s === 'scheduled' ? '已排期' : '已发布'}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        <div className="flex-1 space-y-2">
          {filtered.map(a => (
            <div key={a.id} onClick={() => setSelected(a)}
              className={'card cursor-pointer p-3 transition-colors ' + (selected?.id === a.id ? 'ring-2 ring-emerald-400 border-emerald-300' : 'hover:border-gray-300')}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-800 flex-1">{a.title}</p>
                <StatusBadge status={a.publish_status === 'published_mock' ? '已发布' : a.publish_status === 'scheduled' ? '已排期' : a.publish_status} />
              </div>
              <div className="flex flex-wrap gap-1 mt-1 text-[10px] text-gray-400">
                <span>{a.article_type}</span><span>·</span><span>{a.word_count}字</span>
                {a.external_draft_id && <span className="text-blue-500">· 草稿已同步</span>}
                {a.external_publish_id && <span className="text-green-500">· 已发布到平台</span>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center py-8 text-xs text-gray-400">暂无文章</p>}
        </div>

        {selected && (
          <div className="w-96 border border-gray-200 rounded-lg p-4 bg-white max-h-[70vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-800 mb-1">{selected.title}</h3>
            <p className="text-[10px] text-gray-400 mb-2">{selected.article_type} · {selected.column_name}</p>

            <div className="bg-gray-50 rounded-lg p-2 mb-2 text-[10px] space-y-0.5">
              {selected.external_draft_id ? <p className="text-blue-600">草稿已同步: {selected.external_draft_id}</p> : null}
              {selected.external_publish_id ? <p className="text-green-600">已发布: {selected.external_publish_id}</p> : null}
              {!selected.external_draft_id && <p className="text-gray-400">未同步微信</p>}
            </div>

            <div className="space-y-2 mb-2">
              {(selected.body_blocks || []).slice(0, 5).map((block: any, i: number) => (
                <div key={i}>
                  {block.type === 'title' && <h4 className="text-xs font-bold text-gray-800">{block.content}</h4>}
                  {block.type === 'paragraph' && <p className="text-[10px] text-gray-600">{block.content}</p>}
                  {block.type === 'cta' && <div className="bg-emerald-600 text-white rounded p-1.5 text-[10px] text-center">{block.content}</div>}
                </div>
              ))}
            </div>

            <div className="space-y-1.5 pt-2 border-t border-gray-100">
              <button className="btn-primary btn-sm w-full text-xs" onClick={() => handleSaveDraft(selected)}
                disabled={!!selected.external_draft_id}>
                {selected.external_draft_id ? '草稿已保存' : '保存草稿到微信'}
              </button>
              <button className="btn-secondary btn-sm w-full text-xs" onClick={() => handlePublish(selected)}
                disabled={!selected.external_draft_id || !!selected.external_publish_id}>
                {selected.external_publish_id ? '已发布' : '发布到微信'}
              </button>
              <button className="btn-secondary btn-sm w-full text-xs" onClick={() => {
                setExpForm({ type: 'title', a: selected.title, b: selected.title });
                setShowExp(true);
              }}>创建A/B实验</button>
            </div>
          </div>
        )}
      </div>

      {/* Monthly Plan Modal */}
      {showMonthly && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={() => setShowMonthly(false)}>
          <div className="bg-white rounded-lg p-5 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">📅 7月内容计划</h3>
              <button onClick={() => setShowMonthly(false)} className="text-gray-400 text-lg">✕</button>
            </div>
            {monthlyPlan ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">目标：{monthlyPlan.targetCount}篇 · 已建议：{monthlyPlan.count}篇</p>
                <div className="space-y-2">
                  {(monthlyPlan.suggestions || []).map((s: any, i: number) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-3 text-xs">
                      <div className="flex items-start justify-between">
                        <p className="font-medium text-gray-800">第{s.week}周 · {s.title}</p>
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{s.article_type}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">参考知识卡：{s.knowledge_card_refs?.join(', ')}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">理由：{s.reason}</p>
                      {s.holiday_context && <p className="text-[10px] text-orange-500">节气：{s.holiday_context}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">生成中...</p>
            )}
          </div>
        </div>
      )}

      {/* A/B Experiment Modal */}
      {showExp && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowExp(false)}>
          <div className="bg-white rounded-lg p-5 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">创建A/B实验</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">实验类型</p>
                <select className="select-field text-xs" value={expForm.type} onChange={e => setExpForm({...expForm, type: e.target.value})}>
                  <option value="title">标题</option>
                  <option value="summary">摘要</option>
                  <option value="cover">封面文案</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">版本 A</p>
                <input className="input-field text-xs" value={expForm.a} onChange={e => setExpForm({...expForm, a: e.target.value})} />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">版本 B</p>
                <input className="input-field text-xs" value={expForm.b} onChange={e => setExpForm({...expForm, b: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn-primary btn-sm text-xs" onClick={handleCreateExp}>创建实验</button>
              <button className="btn-secondary btn-sm text-xs" onClick={() => setShowExp(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
