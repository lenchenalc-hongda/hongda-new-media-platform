'use client';
import { useState, useMemo, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import { OA_SOURCE_CARDS } from '@/lib/constants/oa-source-cards';
import { ARTICLE_TEMPLATES } from '@/lib/oa/article-templates';
import { runArticlePipeline, renderOAArticleHtml, renderVisualArticleHtml } from '@/lib/oa/article-pipeline';
import { generateLayoutPlan, renderLayoutHtml, checkLayoutQuality } from '@/lib/oa/article-layout-engine';
import type { OAArticleType, OAArticleDraft, GenerateArticleOutput, OALayoutPlan, OALayoutSectionType } from '@/lib/oa/types';
import { OA_STORAGE_KEYS, loadOAData, saveOAData } from '@/lib/oa/oa-storage';
import { saveToServer } from '@/lib/storage';

const ALL_SECTION_TYPES: { value: string; label: string }[] = [
  { value: 'hero_title', label: '标题区' },
  { value: 'intro_lead', label: '导读区' },
  { value: 'core_conclusion', label: '核心结论' },
  { value: 'numbered_chapter', label: '编号章节' },
  { value: 'text_paragraph', label: '正文段落' },
  { value: 'tech_tip', label: '技术提示' },
  { value: 'warning_note', label: '风险提示' },
  { value: 'case_snapshot', label: '案例拆解' },
  { value: 'quote_highlight', label: '引用高亮' },
  { value: 'cta_checklist', label: '行动引导' },
  { value: 'process_timeline', label: '流程步骤' },
  { value: 'checklist_panel', label: '检查清单' },
  { value: 'comparison_grid', label: '对比分析' },
  { value: 'risk_matrix', label: '风险矩阵' },
  { value: 'brand_transition', label: '品牌过渡' },
  { value: 'material_matrix', label: '材质矩阵' },
  { value: 'image_placeholder', label: '图片占位' },
];

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

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

  // Layout engine state
  const [layoutPlan, setLayoutPlan] = useState<OALayoutPlan | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [previewThemeId, setPreviewThemeId] = useState<string>('hongda_blue');
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editItems, setEditItems] = useState('');
  const [editVariant, setEditVariant] = useState('');

  const liveCards = useMemo(() => {
    const stored = loadOAData(OA_STORAGE_KEYS.SOURCE_CARDS, OA_SOURCE_CARDS);
    return stored.length > 0 ? stored : OA_SOURCE_CARDS;
  }, []);
  const filteredCards = useMemo(() => {
    let cards = liveCards;
    if (busFilter !== 'all') cards = cards.filter((c: any) => c.businessLine === busFilter);
    if (typeFilter !== 'all') cards = cards.filter((c: any) => c.type === typeFilter);
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
    // Generate layout plan using the layout engine
    const plan = generateLayoutPlan(draft, result?.strategy || {
      id: '', topic: '', articleType: (articleType || 'technical_guide') as OAArticleType,
      targetAudience: '', customerPain: '', corePoint: '', sourceCardIds: selectedIds,
      articleAngle: '', recommendedTemplateId: '', riskToAvoid: [], ctaType: 'save_article',
      coverTitle: '', summary: '',
    });
    setLayoutPlan(plan);
    setSelectedSectionId(null);
    setPreviewHtml(renderLayoutHtml(plan, draft, previewThemeId));
    // Also set the old preview for compatibility
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

  // ===== Layout plan editing functions =====

  const selectSection = (id: string) => {
    setSelectedSectionId(id);
    var section = layoutPlan?.sections.find(function(s) { return s.id === id; });
    if (section) {
      setEditTitle(section.title || '');
      setEditSubtitle(section.subtitle || '');
      setEditContent(section.content || '');
      setEditItems((section.items || []).join('\n'));
      setEditVariant(section.visualVariant || '');
    }
  };

  const updateLayout = function(updatedSections: any) {
    if (!layoutPlan || !draft) return;
    var newPlan = {
      ...layoutPlan,
      sections: updatedSections,
      updatedAt: new Date().toISOString(),
    };
    newPlan.qualityCheck = checkLayoutQuality(newPlan);
    setLayoutPlan(newPlan);
    setPreviewHtml(renderLayoutHtml(newPlan, draft, previewThemeId));
  };

  const moveSection = function(idx: number, dir: number) {
    if (!layoutPlan) return;
    var sections = [...layoutPlan.sections];
    var target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    var temp = sections[idx];
    sections[idx] = sections[target];
    sections[target] = temp;
    sections = sections.map(function(s, i) { return { ...s, order: i }; });
    updateLayout(sections);
  };

  const removeSection = function(idx: number) {
    if (!layoutPlan) return;
    var sections = layoutPlan.sections.filter(function(_, i) { return i !== idx; });
    sections = sections.map(function(s, i) { return { ...s, order: i }; });
    if (selectedSectionId === sections[idx]?.id) setSelectedSectionId(null);
    updateLayout(sections);
  };

  const addSection = function(e: React.ChangeEvent<HTMLSelectElement>) {
    var type = e.target.value;
    e.target.value = '';
    if (!type || !layoutPlan) return;
    var newSection = {
      id: 'sec_' + uid(),
      type: type as OALayoutSectionType,
      title: '',
      subtitle: '',
      content: '',
      items: undefined as string[] | undefined,
      data: {} as Record<string, any>,
      sourceBlockIds: [],
      order: layoutPlan.sections.length,
      editable: true,
    };
    updateLayout([...layoutPlan.sections, newSection]);
  };

  const applyEdit = function() {
    if (!layoutPlan || !selectedSectionId) return;
    var items = editItems.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
    var sections = layoutPlan.sections.map(function(s) {
      if (s.id !== selectedSectionId) return s;
      return {
        ...s,
        title: editTitle,
        subtitle: editSubtitle,
        content: editContent,
        items: items.length > 0 ? items : undefined,
        visualVariant: editVariant || undefined,
      };
    });
    updateLayout(sections);
    setMsg({ t: '已应用修改', s: 'ok' });
    setTimeout(function() { setMsg(null); }, 2000);
  };

  return (
    <AppLayout>
      <div className="max-w-[1400px] mx-auto">
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
          {['选来源卡', '选文章类型', '生成草稿', '版式编辑'].map(function(s, i) {
            var stepNum = i < 2 ? i + 1 : i + 3; // step 1,2 -> step 1,2; step 3 (index 2) -> step 4; step 4 (index 3) -> step 5
            return (
              <div key={i} className={'flex-1 text-center py-1.5 rounded ' + (step === stepNum ? 'bg-blue-600 text-white font-medium' : step > stepNum ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400')}>
                {stepNum}. {s}
              </div>
            );
          })}
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
              {filteredCards.map((card: any) => (
                <div key={card.id} className={'p-3 rounded-lg border cursor-pointer text-xs transition-colors ' + (selectedIds.includes(card.id) ? 'border-blue-500 bg-blue-50 ring-1' : 'border-gray-200 hover:border-gray-300')} onClick={() => toggleCard(card.id)}>
                  <div className="flex justify-between"><span className="font-medium text-gray-800">{card.title}</span><span className="text-[9px] px-1 bg-gray-100 rounded">{card.type}</span></div>
                  <p className="text-[10px] text-gray-500 mt-1">{card.targetAudience}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{card.coreConclusion?.slice(0, 50)}...</p>
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
                <button className="btn-primary text-xs px-4 py-1.5" onClick={handleRenderPreview}>版式编辑 →</button>
              </div>
            </div>
          </div>
        )}

        {step === 5 && draft && layoutPlan && (
          <div>
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  版式 · {layoutPlan.sections.length} 个模块 · {layoutPlan.qualityCheck.publishReady ? '✅ 发布达标' : '⚠️ 待优化'}
                </span>
                <select className="input-field text-[10px] p-0.5 w-24" value={previewThemeId} onChange={e => {
                  setPreviewThemeId(e.target.value);
                  setPreviewHtml(renderLayoutHtml(layoutPlan, draft, e.target.value));
                }}>
                  <option value="hongda_blue">宏达工业蓝</option>
                  <option value="uv_tech">UV科技风</option>
                  <option value="case_study">案例复盘</option>
                  <option value="brand_story">品牌故事</option>
                  <option value="sales_forward">销售简洁</option>
                  <option value="festival_light">节日轻品牌</option>
                </select>
              </div>
              <div className="flex gap-1">
                <button className="btn-secondary text-[10px] px-2 py-1" onClick={() => copyToClipboard(previewHtml, 'HTML')}>📋 复制HTML</button>
                <button className="btn-secondary text-[10px] px-2 py-1" onClick={() => draft && copyToClipboard(draft.bodyMarkdown + '\n\n---\n*草稿模式*', 'Markdown')}>📝 复制MD</button>
                <button className="btn-secondary text-[10px] px-2 py-1" onClick={handleSaveDraft}>💾 保存</button>
                <span className="ml-2 text-[10px] text-yellow-600 self-center">🔒 草稿模式</span>
              </div>
            </div>

            {/* Quality check banner */}
            {!layoutPlan.qualityCheck.publishReady && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-2 text-xs text-yellow-700">
                <strong>版式未达发布标准：</strong>
                {layoutPlan.qualityCheck.notes.map(function(n) {
                  return <div key={n} className="ml-2">• {n}</div>;
                })}
              </div>
            )}

            {/* Three-column layout */}
            <div className="flex gap-2" style={{ height: 'calc(100vh - 280px)' }}>
              {/* Left: Section tree */}
              <div className="w-56 flex-shrink-0 flex flex-col border rounded-lg bg-white p-2">
                <div className="text-xs font-medium text-gray-600 mb-2">版式结构</div>
                <div className="flex-1 overflow-y-auto space-y-0.5">
                  {layoutPlan.sections.map(function(s, i) {
                    return (
                      <div key={s.id}
                        className={'p-1.5 rounded border text-xs cursor-pointer transition-colors ' + (selectedSectionId === s.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-100 hover:border-gray-200')}
                        onClick={function() { selectSection(s.id); }}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-800 truncate">{s.type.replace(/_/g, ' ')}</span>
                          <div className="flex gap-0.5 flex-shrink-0">
                            <button className="text-[9px] px-1 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-500"
                              onClick={function(e) { e.stopPropagation(); moveSection(i, -1); }} disabled={i === 0}>↑</button>
                            <button className="text-[9px] px-1 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-500"
                              onClick={function(e) { e.stopPropagation(); moveSection(i, 1); }} disabled={i === layoutPlan.sections.length - 1}>↓</button>
                            <button className="text-[9px] px-1 py-0.5 rounded bg-red-50 hover:bg-red-100 text-red-500"
                              onClick={function(e) { e.stopPropagation(); removeSection(i); }}>×</button>
                          </div>
                        </div>
                        <p className="text-[9px] text-gray-400 truncate mt-0.5">{s.title || s.content || '(空)'}</p>
                      </div>
                    );
                  })}
                </div>
                {/* Add section dropdown */}
                <div className="pt-2 border-t mt-2">
                  <select className="input-field w-full text-[10px] p-1" value="" onChange={addSection}>
                    <option value="">+ 新增版式模块</option>
                    {ALL_SECTION_TYPES.map(function(st) {
                      return <option key={st.value} value={st.value}>{st.label}</option>;
                    })}
                  </select>
                </div>
              </div>

              {/* Center: Phone preview */}
              <div className="flex-1 flex flex-col items-center">
                <div className="bg-gray-100 rounded-lg overflow-auto flex items-start justify-center p-2"
                  style={{ width: '100%', maxHeight: '100%' }}>
                  <div className="bg-white shadow-lg rounded-lg overflow-hidden" style={{ width: '360px' }}>
                    <iframe srcDoc={previewHtml} title="手机预览"
                      style={{ width: '100%', border: 'none', minHeight: '600px' }} />
                  </div>
                </div>
              </div>

              {/* Right: Section editor */}
              <div className="w-72 flex-shrink-0 flex flex-col border rounded-lg bg-white p-2">
                <div className="text-xs font-medium text-gray-600 mb-2">组件编辑</div>
                {selectedSectionId ? (function() {
                  var section = layoutPlan.sections.find(function(s) { return s.id === selectedSectionId; });
                  if (!section) return <div className="text-xs text-gray-400">未找到模块</div>;
                  return (
                    <div className="flex-1 overflow-y-auto space-y-2">
                      <div>
                        <label className="text-[10px] text-gray-400">类型</label>
                        <input className="input-field w-full text-xs p-1 bg-gray-50" value={section.type} readOnly />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400">标题</label>
                        <input className="input-field w-full text-xs p-1" value={editTitle} onChange={function(e) { setEditTitle(e.target.value); }} />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400">副标题</label>
                        <input className="input-field w-full text-xs p-1" value={editSubtitle} onChange={function(e) { setEditSubtitle(e.target.value); }} />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400">内容</label>
                        <textarea className="input-field w-full text-xs p-1" rows={3} value={editContent} onChange={function(e) { setEditContent(e.target.value); }} />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400">列表项（每行一个）</label>
                        <textarea className="input-field w-full text-xs p-1" rows={3} value={editItems} onChange={function(e) { setEditItems(e.target.value); }} />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400">视觉变体</label>
                        <select className="input-field w-full text-xs p-1" value={editVariant} onChange={function(e) { setEditVariant(e.target.value); }}>
                          <option value="">默认</option>
                          <option value="compact">紧凑</option>
                          <option value="expanded">展开</option>
                        </select>
                      </div>
                      <button className="btn-primary text-xs w-full py-1" onClick={applyEdit}>应用修改</button>
                    </div>
                  );
                })() : (
                  <div className="flex items-center justify-center h-full text-gray-400 text-xs">选择左侧模块进行编辑</div>
                )}

                {/* Image suggestions */}
                {layoutPlan.imageSuggestions.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <div className="text-[10px] font-medium text-gray-500 mb-1">📷 图片建议</div>
                    {layoutPlan.imageSuggestions.map(function(img) {
                      return (
                        <div key={img.id} className="text-[9px] text-gray-400 mb-1 p-1 bg-gray-50 rounded">
                          <span className="font-medium">{img.imageType.replace(/_/g, ' ')}</span>
                          <span className="ml-1">({img.recommendedRatio})</span>
                          <p>{img.description}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between mt-2">
              <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => setStep(4)}>← 返回草稿</button>
              <button className="btn-primary text-xs px-3 py-1.5" onClick={() => copyToClipboard(previewHtml, 'HTML')}>复制HTML到公众号</button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
