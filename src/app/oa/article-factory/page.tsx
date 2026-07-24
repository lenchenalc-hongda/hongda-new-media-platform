'use client';
import { useState, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import { OA_SOURCE_CARDS } from '@/lib/constants/oa-source-cards';
import { getKnowledgeSourceCards } from '@/lib/oa/oa-knowledge-bridge';
import { ARTICLE_TEMPLATES, getTemplatesForArticleType } from '@/lib/oa/article-templates';
import { runArticlePipeline, renderOAArticleHtml } from '@/lib/oa/article-pipeline';
import type { OAArticleType, OAArticleDraft, GenerateArticleOutput } from '@/lib/oa/types';
import { OA_STORAGE_KEYS, loadOAData, saveOAData } from '@/lib/oa/oa-storage';
import { saveToServer } from '@/lib/storage';

export default function ArticleFactoryPage() {
  const [step, setStep] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [articleType, setArticleType] = useState<OAArticleType | ''>('');
  const [busFilter, setBusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [result, setResult] = useState<GenerateArticleOutput | null>(null);
  const [draft, setDraft] = useState<OAArticleDraft | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ t: string; s: 'ok' | 'err' } | null>(null);
  const [editBlocks, setEditBlocks] = useState(false);

  const liveCards = useMemo(() => {
    const stored = loadOAData(OA_STORAGE_KEYS.SOURCE_CARDS, OA_SOURCE_CARDS);
    return stored.length > 0 ? stored : OA_SOURCE_CARDS;
  }, []);
  const filteredCards = useMemo(() => {
    let cards = liveCards;  // show all cards (internal ones get warning badge)
    if (busFilter !== 'all') cards = cards.filter(c => c.businessLine === busFilter);
    if (typeFilter !== 'all') cards = cards.filter(c => c.type === typeFilter);
    return cards;
  }, [busFilter, typeFilter]);

  const toggleCard = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const handleGenerateStrategy = () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    try {
      const r = runArticlePipeline({ sourceCardIds: selectedIds, articleType: articleType || undefined });
      setResult(r); setDraft(r.draft); setStep(4);
    } catch (e: any) {
      setMsg({ t: e.message, s: 'err' });
      setTimeout(() => setMsg(null), 5000);
    }
    setLoading(false);
  };

  const handleReGenerate = () => {
    if (selectedIds.length === 0) return;
    const shuffled = [...selectedIds].sort(() => Math.random() - 0.5);
    try {
      const r = runArticlePipeline({ sourceCardIds: shuffled, articleType: articleType || undefined });
      setResult(r); setDraft(r.draft);
      setMsg({ t: '已重新生成', s: 'ok' });
      setTimeout(() => setMsg(null), 3000);
    } catch (e: any) { setMsg({ t: e.message, s: 'err' }); }
  };

  const handleRenderPreview = () => {
    if (!draft) return;
    setPreviewHtml(renderOAArticleHtml(draft));
    setStep(5);
  };

  const [syncStatus, setSyncStatus] = useState('本地');
  const handleSaveDraft = async () => {
    if (!draft) return;
    try {
      const stored = loadOAData(OA_STORAGE_KEYS.ARTICLE_DRAFTS, []);
      const updated = [draft, ...stored.filter((d: any) => d.id !== draft.id)];
      saveOAData(OA_STORAGE_KEYS.ARTICLE_DRAFTS, updated);
      await saveToServer(OA_STORAGE_KEYS.ARTICLE_DRAFTS, updated);
      setSyncStatus('已同步');
      setMsg({ t: '草稿已保存（已同步到服务器）', s: 'ok' });
      setTimeout(() => setMsg(null), 3000);
    } catch { setMsg({ t: '保存失败（已保持本地）', s: 'err' }); }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); setMsg({ t: label + ' 已复制', s: 'ok' }); }
    catch { setMsg({ t: '复制失败', s: 'err' }); }
    setTimeout(() => setMsg(null), 3000);
  };

  return (
    <AppLayout>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between">
          <PageHeader title="文章工厂" description="公众号文章生成流水线 · 草稿模式" />
          <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded h-fit">🔒 草稿模式</span>
        </div>

        {msg && (
          <div className={'mb-3 px-3 py-2 rounded text-xs ' + (msg.s === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')}>
            {msg.t}
          </div>
        )}

        <div className="flex gap-1 mb-4 text-xs">
          {['选来源卡', '选文章类型', '生成策略', '生成草稿', '预览'].map((s, i) => (
            <div key={i} className={'flex-1 text-center py-1.5 rounded ' + (step === i + 1 ? 'bg-blue-600 text-white font-medium' : step > i + 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400')}>
              {i + 1}. {s}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div className="flex gap-2 items-center">
              <select className="select-field w-40 text-xs" value={busFilter} onChange={e => setBusFilter(e.target.value)}>
                <option value="all">全部方向</option>
                <option value="heat_transfer">热转印</option>
                <option value="digital_heat_transfer">数码热转印</option>
                <option value="uv_machine">UV机器</option>
                <option value="brand">品牌</option>
              </select>
              <select className="select-field w-28 text-xs" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="all">全部类型</option>
                <option value="knowledge">知识卡</option><option value="faq">FAQ</option>
                <option value="case">案例</option><option value="equipment">设备</option><option value="brand">品牌</option>
              </select>
              <span className="text-xs text-gray-400">已选 {selectedIds.length} 条</span>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
              {filteredCards.map(card => (
                <div key={card.id} className={'p-3 rounded-lg border cursor-pointer text-xs transition-colors ' + (selectedIds.includes(card.id) ? 'border-blue-500 bg-blue-50 ring-1' : 'border-gray-200 hover:border-gray-300')} onClick={() => toggleCard(card.id)}>
                  <div className="flex justify-between"><span className="font-medium text-gray-800">{card.title}</span><span className="text-[9px] px-1 bg-gray-100 rounded">{card.type}</span></div>
                  <p className="text-[10px] text-gray-500 mt-1">{card.targetAudience}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{card.coreConclusion.slice(0, 50)}...</p>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button className="btn-primary text-xs px-4 py-1.5" disabled={selectedIds.length === 0} onClick={() => setStep(2)}>下一步 →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="text-xs text-gray-500 mb-3">已选 {selectedIds.length} 条来源卡：{loadOAData(OA_STORAGE_KEYS.SOURCE_CARDS, OA_SOURCE_CARDS).filter((c: any) => selectedIds.includes(c.id)).map((c: any) => c.title).join('、')}</p>
            <div className="grid grid-cols-2 gap-2">
              {ARTICLE_TEMPLATES.map(t => (
                <div key={t.id} className={'p-3 rounded-lg border cursor-pointer text-xs transition-colors ' + (articleType && t.suitableArticleTypes.includes(articleType as any) ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300')} onClick={() => setArticleType(t.suitableArticleTypes[0])}>
                  <span className="font-medium text-gray-800">{t.styleTokens?.introEmoji || '📄'} {t.name}</span>
                  <p className="text-[10px] text-gray-500">{t.description}</p>
                  <div className="flex flex-wrap gap-1 mt-1">{t.suitableArticleTypes.map(at => <span key={at} className="text-[8px] bg-gray-100 text-gray-500 px-1 rounded">{at}</span>)}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3">
              <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => setStep(1)}>← 上一步</button>
              <button className="btn-primary text-xs px-4 py-1.5" disabled={loading || !articleType} onClick={handleGenerateStrategy}>{loading ? '生成中...' : '生成文章 →'}</button>
            </div>
          </div>
        )}

        {step === 4 && draft && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div><span className="text-sm font-bold text-gray-800">{draft.title}</span><span className="ml-2 text-xs text-gray-400">{draft.score}/100 · 风险: {draft.riskLevel}</span></div>
              <div className="flex gap-1">
                <button className="btn-secondary text-[10px] px-2 py-1" onClick={handleReGenerate}>重新生成</button>
                <button className="btn-secondary text-[10px] px-2 py-1" onClick={() => setEditBlocks(!editBlocks)}>{editBlocks ? '完成编辑' : '编辑'}</button>
              </div>
            </div>
            <div className="border rounded-lg p-3 bg-white max-h-[400px] overflow-y-auto">
              {draft.bodyBlocks.map(block => (
                <div key={block.id} className="mb-2">
                  {editBlocks ? (
                    <textarea className="input-field w-full text-xs p-1" rows={2} value={block.content} onChange={e => {
                      setDraft({ ...draft, bodyBlocks: draft.bodyBlocks.map(b => b.id === block.id ? { ...b, content: e.target.value } : b) });
                    }} />
                  ) : (
                    <>
                      {block.type === 'title' && <h1 className="text-base font-bold">{block.content}</h1>}
                      {block.type === 'lead' && <p className="text-xs text-gray-500 italic">{block.content}</p>}
                      {block.type === 'heading' && <h2 className="text-sm font-semibold text-gray-700 mt-3">{block.content}</h2>}
                      {block.type === 'paragraph' && <p className="text-xs text-gray-600 mt-1">{block.content}</p>}
                      {block.type === 'quote' && <blockquote className="text-xs text-blue-700 bg-blue-50 border-l-4 border-blue-500 p-2 mt-1">{block.content}</blockquote>}
                      {block.type === 'tip' && <div className="text-xs text-green-700 bg-green-50 p-2 mt-1 rounded">{block.content}{block.items?.map(i => <div key={i} className="ml-2">• {i}</div>)}</div>}
                      {block.type === 'warning' && <div className="text-xs text-red-600 bg-red-50 p-2 mt-1 rounded">{block.content}</div>}
                      {block.type === 'cta' && <div className="text-xs text-white bg-blue-600 text-center p-2 mt-2 rounded">{block.content}</div>}
                    </>
                  )}
                  <span className="text-[8px] text-gray-300 ml-1">{block.type}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3">
              <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => setStep(2)}>← 上一步</button>
              <div className="flex gap-1">
                <button className="btn-secondary text-xs px-3 py-1.5" onClick={handleSaveDraft}>💾 保存草稿</button>
                <button className="btn-primary text-xs px-4 py-1.5" onClick={handleRenderPreview}>预览 →</button>
              </div>
            </div>
          </div>
        )}

        {step === 5 && previewHtml && (
          <div>
            <div className="flex gap-1 mb-2">
              <button className="btn-secondary text-[10px] px-2 py-1" onClick={() => copyToClipboard(previewHtml, 'HTML')}>📋 复制HTML</button>
              <button className="btn-secondary text-[10px] px-2 py-1" onClick={() => draft && copyToClipboard(draft.bodyMarkdown + '\n\n---\n*草稿模式，未接入真实发布*', 'Markdown')}>📝 复制MD</button>
              <button className="btn-secondary text-[10px] px-2 py-1" onClick={handleSaveDraft}>💾 保存</button>
              <span className="ml-auto text-[10px] text-yellow-600 self-center">🔒 草稿模式</span>
            </div>
            <div className="border rounded-lg bg-white max-h-[600px] overflow-auto">
              <iframe srcDoc={previewHtml} title="预览" className="w-full" style={{ minHeight: '500px', border: 'none' }} />
            </div>
            <div className="flex justify-between mt-2">
              <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => setStep(4)}>← 返回</button>
              <button className="btn-primary text-xs px-3 py-1.5" onClick={() => copyToClipboard(previewHtml, 'HTML')}>复制HTML到公众号</button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
