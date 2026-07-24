'use client';
import { useState, useMemo, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import { formatDateTime } from '@/lib/utils';
import { useOAStorage, OA_STORAGE_KEYS } from '@/lib/oa/oa-storage';
import { renderOAArticleHtml, scoreOAArticle, generateSalesForwardDraft, generateSeoMeta, generateTrainingDraft } from '@/lib/oa/article-pipeline';
import { getArticleTemplateById } from '@/lib/oa/article-templates';
import { OA_SOURCE_CARDS } from '@/lib/constants/oa-source-cards';
import { getKnowledgeSourceCards, getAllSourceCards, getSourceCardsByIds } from '@/lib/oa/oa-knowledge-bridge';
import type { OAArticleDraft, OAArticleReview, OABodyBlock, OABodyBlockType, OASourceCard } from '@/lib/oa/types';

const ARTICLE_TYPE_LABELS: Record<string, string> = {
  technical_guide: '技术指南', faq_answer: 'FAQ解答', machine_selection: '设备选型',
  process_sop: '工艺SOP', case_study: '案例复盘', troubleshooting: '排查指南',
  brand_story: '品牌故事', sales_enablement: '销售转发',
};
const USAGE_LABELS: Record<string, string> = {
  wechat_publish: '公众号', sales_forward: '销售转发', website_article: '官网',
  internal_training: '内部培训', video_script_expand: '视频扩写',
};
const BLOCK_TYPE_OPTIONS: { value: OABodyBlockType; label: string }[] = [
  { value: 'title', label: '标题' }, { value: 'lead', label: '导语' },
  { value: 'heading', label: '小标题' }, { value: 'paragraph', label: '段落' },
  { value: 'quote', label: '引用' }, { value: 'tip', label: '提示' },
  { value: 'checklist', label: '清单' }, { value: 'warning', label: '警告' },
  { value: 'case', label: '案例' }, { value: 'cta', label: 'CTA' },
  { value: 'image', label: '图片' },
];

const initialStatus = 'draft';

export default function ArticlesPage() {
  const [drafts, setDrafts, syncStatus] = useOAStorage<OAArticleDraft>(OA_STORAGE_KEYS.ARTICLE_DRAFTS, []);
  const [reviews, setReviews] = useOAStorage<OAArticleReview>(OA_STORAGE_KEYS.ARTICLE_REVIEWS, []);
  const [reviewComment, setReviewComment] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; s: 'ok' | 'err' | 'info' } | null>(null);
  const [filters, setFilters] = useState({ status: '', type: '', risk: '', usage: '' });
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [editKey, setEditKey] = useState(0); // force re-render on save

  const selected = useMemo(() => drafts.find(d => d.id === selectedId) || null, [drafts, selectedId, editKey]);

  // Build editable state from selected draft
  const [editForm, setEditForm] = useState<any>(null);
  const [targetStatus, setTargetStatus] = useState('');

  useMemo(() => {
    if (selected && (!editForm || editForm.id !== selected.id)) {
      setEditForm(JSON.parse(JSON.stringify(selected))); // deep clone
      setTargetStatus(selected.status);
    }
  }, [selected, editKey]);

  const filtered = useMemo(() => {
    let list = drafts;
    if (filters.status) list = list.filter(d => d.status === filters.status);
    if (filters.type) list = list.filter(d => d.strategyId?.startsWith(filters.type));
    if (filters.risk) list = list.filter(d => d.riskLevel === filters.risk);
    if (filters.usage) list = list.filter(d => d.usage === filters.usage);
    return list;
  }, [drafts, filters]);

  const persist = useCallback((updated: OAArticleDraft[]) => {
    setDrafts(() => updated);
    setEditKey(k => k + 1);
  }, [setDrafts]);

  const save = () => {
    if (!editForm) return;
    const updated = { ...editForm, updatedAt: new Date().toISOString() };
    const dt = (prev: OAArticleDraft[]) => prev.map(d => d.id === updated.id ? updated : d);
    setDrafts(dt);
    setEditForm(updated);
    showMsg('已保存', 'ok');
  };

  const showMsg = (t: string, s: 'ok' | 'err' | 'info') => {
    setMsg({ t, s }); setTimeout(() => setMsg(null), 3000);
  };

  const handleDelete = (id: string) => {
    if (!confirm('确定删除此草稿？')) return;
    setDrafts(prev => prev.filter(d => d.id !== id));
    if (selectedId === id) { setSelectedId(null); setEditForm(null); }
    showMsg('已删除', 'ok');
  };

  // ===== Status transitions =====
  const addReview = (action: string, comment: string, prevStatus: string, newStatus: string) => {
    const rev: OAArticleReview = {
      id: 'rev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      articleId: editForm?.id || '',
      action: action as any, comment, previousStatus: prevStatus, newStatus,
      score: editForm?.score, riskLevel: editForm?.riskLevel,
      createdAt: new Date().toISOString(),
    };
    setReviews(prev => [...prev, rev]);
  };

  const submitReview = () => {
    if (!editForm) return;
    const risk = editForm.riskLevel || 'low';
    if (risk === 'high') { showMsg('高风险文章不允许提交审核，请先调整内容', 'err'); return; }
    const updated = { ...editForm, status: 'pending_review' as const, updatedAt: new Date().toISOString() };
    setEditForm(updated);
    setDrafts(prev => prev.map(d => d.id === updated.id ? updated : d));
    addReview('submit', reviewComment || '提交审核', 'draft', 'pending_review');
    setReviewComment('');
    showMsg('已提交审核', 'ok');
  };

  const approve = () => {
    if (!editForm) return;
    const errors: string[] = [];
    if ((editForm.score ?? 0) < 70) errors.push('评分 ' + editForm.score + ' 低于70分');
    if (editForm.riskLevel === 'high') errors.push('风险等级为高');
    if (!editForm.bodyHtml && !renderOAArticleHtml(editForm)) errors.push('缺少正文HTML');
    if (!editForm.sourceCardIds?.length) errors.push('未引用任何来源卡');
    if (errors.length > 0) { showMsg('❌ ' + errors.join('；'), 'err'); return; }
    const updated = { ...editForm, status: 'approved' as const, updatedAt: new Date().toISOString() };
    setEditForm(updated);
    setDrafts(prev => prev.map(d => d.id === updated.id ? updated : d));
    addReview('approve', reviewComment || '审核通过', 'pending_review', 'approved');
    setReviewComment('');
    showMsg('已批准 ✅', 'ok');
  };

  const reject = () => {
    if (!editForm) return;
    const updated = { ...editForm, status: 'draft' as const, updatedAt: new Date().toISOString() };
    setEditForm(updated);
    setDrafts(prev => prev.map(d => d.id === updated.id ? updated : d));
    addReview('reject', reviewComment || '退回修改', 'pending_review', 'draft');
    setReviewComment('');
    showMsg('已退回修改', 'ok');
  };

  const rescore = () => {
    if (!editForm) return;
    const r = scoreOAArticle(editForm);
    const updated = { ...editForm, score: r.score, riskLevel: r.riskLevel as any, updatedAt: new Date().toISOString() };
    setEditForm(updated);
    setDrafts(prev => prev.map(d => d.id === updated.id ? updated : d));
    showMsg(`重新评分: ${r.score}/100, 风险: ${r.riskLevel}`, r.score >= 70 ? 'ok' : 'info');
  };

  const riskCheck = () => {
    if (!editForm) return;
    const r = scoreOAArticle(editForm);
    const updated = { ...editForm, riskLevel: r.riskLevel as any, updatedAt: new Date().toISOString() };
    setEditForm(updated);
    setDrafts(prev => prev.map(d => d.id === updated.id ? updated : d));
    showMsg(`风险检查完成: ${r.riskLevel}, ${r.notes.join('; ') || '无风险'}`, r.riskLevel === 'high' ? 'err' : 'ok');
  };

  const handleRenderPreview = () => {
    if (!editForm) return;
    setPreviewHtml(renderOAArticleHtml(editForm));
    setShowPreview(!showPreview);
  };

  const copyHtml = async () => {
    try { await navigator.clipboard.writeText(renderOAArticleHtml(editForm)); showMsg('HTML已复制', 'ok'); }
    catch { showMsg('复制失败', 'err'); }
  };

  const copyMarkdown = async () => {
    try {
      const sig = '\n\n---\n*草稿模式，未接入真实发布*';
      await navigator.clipboard.writeText((editForm?.bodyMarkdown || '') + sig);
      showMsg('Markdown已复制', 'ok');
    } catch { showMsg('复制失败', 'err'); }
  };

  // ===== BodyBlock operations =====
  const blockAdd = (type: OABodyBlockType) => {
    if (!editForm) return;
    const block: OABodyBlock = {
      id: 'b' + Date.now().toString(36), type, content: '',
      items: type === 'checklist' || type === 'tip' ? [] : undefined,
    };
    setEditForm({ ...editForm, bodyBlocks: [...(editForm.bodyBlocks || []), block] });
  };
  const blockDelete = (bid: string) => {
    if (!editForm) return;
    setEditForm({ ...editForm, bodyBlocks: editForm.bodyBlocks.filter((b: any) => b.id !== bid) });
  };
  const blockMove = (bid: string, dir: number) => {
    if (!editForm) return;
    const blocks = [...editForm.bodyBlocks];
    const idx = blocks.findIndex((b: any) => b.id === bid);
    if (idx < 0 || (dir < 0 && idx === 0) || (dir > 0 && idx === blocks.length - 1)) return;
    [blocks[idx], blocks[idx + dir]] = [blocks[idx + dir], blocks[idx]];
    setEditForm({ ...editForm, bodyBlocks: blocks });
  };
  const blockUpdate = (bid: string, field: string, value: any) => {
    if (!editForm) return;
    setEditForm({
      ...editForm,
      bodyBlocks: editForm.bodyBlocks.map((b: any) => b.id === bid ? { ...b, [field]: value } : b),
    });
  };

  // ===== Source cards for selected draft =====
  const sourceCards = useMemo(() => {
    if (!selected) return [];
    return getSourceCardsByIds(selected.sourceCardIds || []);
  }, [selected]);

  return (
    <AppLayout>
      <PageHeader title="文章编辑工作台" description={`${drafts.length} 篇草稿 · ${syncStatus.source === 'synced' ? '☁️ 已同步' : '💻 本地'}`} />

      {msg && (
        <div className={'mb-2 px-3 py-1.5 rounded text-xs ' + (
          msg.s === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' :
          msg.s === 'err' ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-blue-50 text-blue-700 border border-blue-200')}>{msg.t}</div>
      )}

      <div className="flex gap-2 h-[calc(100vh-230px)]">
        {/* Left: Filters + List */}
        <div className="w-64 flex-shrink-0 flex flex-col">
          <div className="grid grid-cols-2 gap-1 mb-2">
            <select className="select-field text-[10px]" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
              <option value="">全部状态</option>
              <option value="draft">草稿</option><option value="pending_review">待审核</option><option value="approved">已批准</option>
            </select>
            <select className="select-field text-[10px]" value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})}>
              <option value="">全部类型</option>
              {Object.entries(ARTICLE_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="select-field text-[10px]" value={filters.risk} onChange={e => setFilters({...filters, risk: e.target.value})}>
              <option value="">全部风险</option>
              <option value="low">低风险</option><option value="medium">中风险</option><option value="high">高风险</option>
            </select>
            <select className="select-field text-[10px]" value={filters.usage} onChange={e => setFilters({...filters, usage: e.target.value})}>
              <option value="">全部场景</option>
              {Object.entries(USAGE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {filtered.map(d => (
              <div key={d.id}
                className={'px-2 py-1.5 rounded border text-xs cursor-pointer transition-colors ' + (selectedId === d.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200')}
                onClick={() => { setSelectedId(d.id); setShowPreview(false); setPreviewHtml(''); }}>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-800 truncate">{d.title || '(无标题)'}</span>
                  <span className={'text-[9px] px-1 rounded ' + (d.status === 'approved' ? 'bg-green-100 text-green-700' : d.status === 'pending_review' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500')}>{d.status}</span>
                </div>
                <div className="text-[9px] text-gray-400 mt-0.5">
                  {d.score != null && <span className="mr-1">{d.score}分</span>}
                  {d.riskLevel && <span className={'mr-1 ' + (d.riskLevel === 'high' ? 'text-red-500' : d.riskLevel === 'medium' ? 'text-yellow-500' : '')}>{d.riskLevel === 'high' ? '⚠️高' : d.riskLevel === 'medium' ? '中' : '低'}风险</span>}
                  <span>{d.updatedAt?.slice(0, 10)}</span>
                  {(() => { const lr = reviews.filter(r => r.articleId === d.id).pop(); return lr ? <span className={'ml-1 ' + (lr.action === 'approve' ? 'text-green-500' : lr.action === 'reject' ? 'text-red-500' : 'text-gray-400')}>{lr.action === 'approve' ? '✅' : lr.action === 'reject' ? '❌' : lr.action === 'submit' ? '📤' : ''}</span> : null; })()}
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="text-center py-8 text-gray-400 text-[10px]">无匹配文章</div>}
          </div>
        </div>

        {/* Middle: Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!editForm ? (
            <div className="flex-1 flex items-center justify-center border rounded-lg bg-white text-gray-400 text-xs">选择左侧文章开始编辑</div>
          ) : (
            <div className="flex-1 overflow-y-auto border rounded-lg bg-white p-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-bold text-gray-800">文章编辑</h3>
                <div className="flex gap-1">
                  <button className="btn-danger text-[10px] px-2 py-0.5" onClick={() => handleDelete(editForm.id)}>删除</button>
                  <button className="btn-primary text-[10px] px-2 py-0.5" onClick={save}>💾 保存</button>
                </div>
              </div>

              {/* Basic fields */}
              <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
                <div><label className="text-[10px] text-gray-400">标题</label><input className="input-field w-full p-1 text-xs" value={editForm.title || ''} onChange={e => setEditForm({...editForm, title: e.target.value})} /></div>
                <div><label className="text-[10px] text-gray-400">封面大字</label><input className="input-field w-full p-1 text-xs" value={editForm.coverTitle || ''} onChange={e => setEditForm({...editForm, coverTitle: e.target.value})} /></div>
              </div>
              <div className="mb-2 text-xs">
                <label className="text-[10px] text-gray-400">摘要</label>
                <textarea className="input-field w-full p-1 text-xs" rows={2} value={editForm.summary || ''} onChange={e => setEditForm({...editForm, summary: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
                <div><label className="text-[10px] text-gray-400">使用场景</label>
                  <select className="select-field w-full p-1 text-xs" value={editForm.usage || 'wechat_publish'} onChange={e => setEditForm({...editForm, usage: e.target.value})}>
                    {Object.entries(USAGE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400">状态：<span className={'font-medium ' + (editForm.status === 'approved' ? 'text-green-600' : editForm.status === 'pending_review' ? 'text-yellow-600' : 'text-gray-500')}>{editForm.status}</span></label>
                  <div className="flex gap-1 mt-1">
                    {editForm.status === 'draft' && <button className="btn-secondary text-[9px] px-1.5 py-0.5" onClick={submitReview}>提交审核</button>}
                    {editForm.status === 'pending_review' && <><button className="btn-secondary text-[9px] px-1.5 py-0.5 bg-green-50" onClick={approve}>批准</button><button className="btn-secondary text-[9px] px-1.5 py-0.5 bg-red-50" onClick={reject}>退回</button></>}
                  </div>
                </div>
              </div>

              {/* Outline */}
              <div className="mb-2 text-xs"><label className="text-[10px] text-gray-400">大纲（每行一条）</label>
                <textarea className="input-field w-full p-1 text-xs" rows={2} value={(editForm.outline || []).join('\n')} onChange={e => setEditForm({...editForm, outline: e.target.value.split('\n').filter(Boolean)})} />
              </div>

              {/* Body Blocks */}
              <div className="border-t pt-1 mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400 font-medium">正文区块 ({editForm.bodyBlocks?.length || 0})</span>
                  <div className="flex gap-1">
                    <select className="text-[10px] border rounded p-0.5" value="" onChange={e => { if (e.target.value) blockAdd(e.target.value as any); e.target.value = ''; }}>
                      <option value="">+ 新增区块</option>
                      {BLOCK_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {(editForm.bodyBlocks || []).map((block: OABodyBlock, idx: number) => (
                    <div key={block.id} className="border rounded p-1.5 bg-gray-50 text-xs">
                      <div className="flex items-center gap-1 mb-1">
                        <select className="text-[10px] border rounded p-0.5 w-14" value={block.type} onChange={e => blockUpdate(block.id, 'type', e.target.value)}>
                          {BLOCK_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label.slice(0, 2)}</option>)}
                        </select>
                        <span className="text-[8px] text-gray-300 flex-1">{block.id.slice(0, 8)}</span>
                        <button className="text-[10px] text-gray-400 px-1" onClick={() => blockMove(block.id, -1)}>↑</button>
                        <button className="text-[10px] text-gray-400 px-1" onClick={() => blockMove(block.id, 1)}>↓</button>
                        <button className="text-[10px] text-red-400 px-1" onClick={() => blockDelete(block.id)}>✕</button>
                      </div>
                      <textarea className="input-field w-full p-1 text-xs" rows={block.type === 'title' || block.type === 'cta' ? 1 : 2}
                        value={block.content} onChange={e => blockUpdate(block.id, 'content', e.target.value)} />
                      {(block.type === 'checklist' || block.type === 'tip') && (
                        <textarea className="input-field w-full p-1 text-xs mt-1" rows={2} placeholder="每条一项"
                          value={(block.items || []).join('\n')} onChange={e => blockUpdate(block.id, 'items', e.target.value.split('\n').filter(Boolean))} />
                      )}
                      {block.type === 'image' && (
                        <div className="flex gap-1 mt-1">
                          <input className="input-field flex-1 p-1 text-[10px]" placeholder="图片URL" value={block.imageUrl || ''} onChange={e => blockUpdate(block.id, 'imageUrl', e.target.value)} />
                          <input className="input-field flex-1 p-1 text-[10px]" placeholder="替代文字" value={block.alt || ''} onChange={e => blockUpdate(block.id, 'alt', e.target.value)} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: AI/Audit Panel */}
        <div className="w-56 flex-shrink-0 flex flex-col">
          <div className="border rounded-lg bg-white p-3 flex-1 overflow-y-auto">
            {!editForm ? (
              <div className="text-center py-8 text-gray-400 text-[10px]">选择文章后显示操作</div>
            ) : (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-gray-700">AI 操作</h4>
                <button className="btn-secondary w-full text-[10px] py-1" onClick={rescore}>🔄 重新评分</button>
                <button className="btn-secondary w-full text-[10px] py-1" onClick={riskCheck}>⚠️ 风险检查</button>
                <button className="btn-secondary w-full text-[10px] py-1" onClick={handleRenderPreview}>🎨 {showPreview ? '关闭预览' : '套模板预览'}</button>
                <div className="border-t pt-1 mt-1">
                  <button className="btn-secondary w-full text-[10px] py-1" onClick={() => {
                    if (!editForm) return;
                    const sources = getSourceCardsByIds(editForm.sourceCardIds || []);
                    const sf = generateSalesForwardDraft(editForm, sources);
                    setDrafts(prev => [sf, ...prev]);
                    setSelectedId(sf.id);
                    showMsg('销售转发版已生成', 'ok');
                  }}>📤 生成销售转发版</button>
                  <button className="btn-secondary w-full text-[10px] py-1" onClick={() => {
                    if (!editForm) return;
                    const meta = generateSeoMeta(editForm);
                    showMsg('SEO: ' + meta.seoTitle.slice(0, 40) + '... | ' + meta.keywords.join(', '), 'info');
                  }}>🔍 生成官网SEO版</button>
                  <button className="btn-secondary w-full text-[10px] py-1" onClick={() => {
                    if (!editForm) return;
                    const sources = getSourceCardsByIds(editForm.sourceCardIds || []);
                    const td = generateTrainingDraft(editForm, sources);
                    setDrafts(prev => [td, ...prev]);
                    setSelectedId(td.id);
                    showMsg('内部培训版已生成', 'ok');
                  }}>📚 生成内部培训版</button>
                </div>

                <h4 className="text-xs font-medium text-gray-700 mt-3">复制操作</h4>
                <button className="btn-secondary w-full text-[10px] py-1" onClick={copyHtml}>📋 复制HTML</button>
                <button className="btn-secondary w-full text-[10px] py-1" onClick={copyMarkdown}>📝 复制Markdown</button>

                <h4 className="text-xs font-medium text-gray-700 mt-3">审核流程</h4>
                <div className="text-[10px] text-gray-500">
                  <p>状态: <span className={'font-medium ' + (editForm.status === 'approved' ? 'text-green-600' : editForm.status === 'pending_review' ? 'text-yellow-600' : '')}>{editForm.status}</span></p>
                  <p>评分: {editForm.score ?? '-'}/100</p>
                  <p className={editForm.riskLevel === 'high' ? 'text-red-500 font-medium' : editForm.riskLevel === 'medium' ? 'text-yellow-500' : ''}>风险: {editForm.riskLevel || '-'}</p>
                </div>
                <div className="flex gap-1 mt-1">
                  {editForm.status === 'draft' && <button className="btn-primary text-[10px] px-2 py-0.5 flex-1" onClick={submitReview}>提交审核</button>}
                  {editForm.status === 'pending_review' && (
                    <><button className="btn-secondary text-[10px] px-2 py-0.5 bg-green-50 flex-1" onClick={approve}>批准</button>
                    <button className="btn-secondary text-[10px] px-2 py-0.5 bg-red-50 flex-1" onClick={reject}>退回</button></>
                  )}
                </div>

                {/* Source cards traceability */}
                <h4 className="text-xs font-medium text-gray-700 mt-3">来源追溯</h4>
                {sourceCards.length === 0 ? (
                  <p className="text-[10px] text-gray-400">无来源卡</p>
                ) : (
                  sourceCards.map(c => (
                    <div key={c.id} className="text-[9px] bg-gray-50 rounded p-1.5">
                      <p className="font-medium text-gray-700">{c.title.slice(0, 24)}</p>
                      <p className="text-gray-400">{c.type} | {c.businessLine}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview overlay */}
      {showPreview && previewHtml && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-lg w-[700px] max-h-[90vh] overflow-auto p-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-xs font-medium text-gray-700">公众号预览</h4>
              <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={() => setShowPreview(false)}>关闭</button>
            </div>
            <iframe srcDoc={previewHtml} title="预览" className="w-full border rounded" style={{ minHeight: '400px' }} />
          </div>
        </div>
      )}
    </AppLayout>
  );
}
