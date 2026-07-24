'use client';
import { useState, useMemo, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import { OA_SOURCE_CARDS } from '@/lib/constants/oa-source-cards';
import { getKnowledgeSourceCards, getAllSourceCards, getSourceCardsByIds } from '@/lib/oa/oa-knowledge-bridge';
import { OA_STORAGE_KEYS, loadOAData, saveOAData } from '@/lib/oa/oa-storage';
import { saveToServer } from '@/lib/storage';
import { ARTICLE_TEMPLATES, getTemplatesForArticleType } from '@/lib/oa/article-templates';
import type { OASourceCard, OASourceCardType, BusinessLine, OAArticleType } from '@/lib/oa/types';

// Blank form for new card
const BLANK_CARD: () => OASourceCard = () => ({
  id: 'card_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  type: 'knowledge', title: '', businessLine: 'heat_transfer',
  targetAudience: '', coreConclusion: '', keyPoints: [],
  applicableScenarios: [], riskNotes: [],
  outboundAllowed: true, updatedAt: new Date().toISOString(),
  sourceQuality: 'medium', visibility: 'public',
});

const TYPE_LABELS: Record<string, string> = {
  knowledge: '知识卡', faq: 'FAQ', case: '案例', product: '产品', equipment: '设备', brand: '品牌',
};
const BIZ_LABELS: Record<string, string> = {
  heat_transfer: '热转印', digital_heat_transfer: '数码热转印', uv_machine: 'UV机器', film: '花膜', brand: '品牌', general: '通用',
};
const QUAL_LABELS: Record<string, string> = { high: '高', medium: '中', low: '低' };
const VIS_LABELS: Record<string, string> = { public: '公开发布', internal: '内部参考', team: '仅团队' };

// Article type suggestions per card type
const SUGGEST_ARTICLE_TYPES: Record<string, OAArticleType[]> = {
  knowledge: ['technical_guide', 'process_sop', 'faq_answer'],
  faq: ['faq_answer', 'troubleshooting', 'sales_enablement'],
  case: ['case_study', 'brand_story', 'technical_guide'],
  product: ['machine_selection', 'sales_enablement', 'technical_guide'],
  equipment: ['machine_selection', 'troubleshooting', 'sales_enablement'],
  brand: ['brand_story', 'case_study', 'sales_enablement'],
};

function generateSuggestedTitles(card: OASourceCard): string[] {
  const types = SUGGEST_ARTICLE_TYPES[card.type] || ['technical_guide'];
  return types.map(t => {
    const tmpl = ARTICLE_TEMPLATES.find(a => a.id === t);
    const prefix = tmpl?.styleTokens?.introEmoji || '📄';
    return `${prefix} ${card.title.slice(0, 15)}：${(tmpl?.description || '深度解读').slice(0, 20)}`;
  });
}

export default function SourceCardsPage() {
  // Load cards from storage, seed with OA_SOURCE_CARDS mock if empty
  const [cards, setCards] = useState<OASourceCard[]>(() => {
    const stored = loadOAData(OA_STORAGE_KEYS.SOURCE_CARDS, []);
    const oaCards = stored.length > 0 ? stored : OA_SOURCE_CARDS;
    const knowledgeCards = getKnowledgeSourceCards();
    const oaIds = new Set(oaCards.map(c => c.id));
    return [...oaCards, ...knowledgeCards.filter(kc => !oaIds.has(kc.id))];
  });
  const [syncMsg, setSyncMsg] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edit, setEdit] = useState<OASourceCard | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [filters, setFilters] = useState({ type: '', line: '', quality: '', outbound: '' });

  // Sync to storage on any cards change
  useEffect(() => {
    const oaOnly = cards.filter(c => !c.id.startsWith('kb_'));
    saveOAData(OA_STORAGE_KEYS.SOURCE_CARDS, oaOnly);
    saveToServer(OA_STORAGE_KEYS.SOURCE_CARDS, oaOnly).catch(() => {});
  }, [cards]);

  const filtered = useMemo(() => {
    let list = cards;
    if (filters.type) list = list.filter(c => c.type === filters.type);
    if (filters.line) list = list.filter(c => c.businessLine === filters.line);
    if (filters.quality) list = list.filter(c => c.sourceQuality === filters.quality);
    if (filters.outbound === 'yes') list = list.filter(c => c.outboundAllowed);
    if (filters.outbound === 'no') list = list.filter(c => !c.outboundAllowed);
    return list;
  }, [cards, filters]);

  const selected = useMemo(() => cards.find(c => c.id === selectedId) || null, [cards, selectedId]);

  const selectCard = (id: string) => {
    setSelectedId(id);
    const c = cards.find(c => c.id === id);
    setEdit(c ? { ...c } : null);
    setIsNew(false);
  };

  const newCard = () => {
    const card = BLANK_CARD();
    setCards(prev => [card, ...prev]);
    setSelectedId(card.id);
    setEdit(card);
    setIsNew(true);
  };

  const saveCard = () => {
    if (!edit || edit.id.startsWith('kb_')) { setSyncMsg('知识库卡片不可编辑'); setTimeout(() => setSyncMsg(''), 2000); return; }
    const updated = { ...edit, updatedAt: new Date().toISOString() };
    setCards(prev => prev.map(c => c.id === updated.id ? updated : c));
    setEdit(updated);
    // Only save OA cards to storage (filter out knowledge cards)
    const oaOnly = cards.filter(c => !c.id.startsWith('kb_'));
    saveOAData(OA_STORAGE_KEYS.SOURCE_CARDS, oaOnly.map(c => c.id === updated.id ? updated : c));
    saveToServer(OA_STORAGE_KEYS.SOURCE_CARDS, oaOnly.map(c => c.id === updated.id ? updated : c)).catch(() => {});
    setSyncMsg('已保存');
    setTimeout(() => setSyncMsg(''), 2000);
  };

  const deleteCard = (id: string) => {
    if (id.startsWith('kb_')) { setSyncMsg('知识库卡片不可删除'); setTimeout(() => setSyncMsg(''), 2000); return; }
    if (!confirm('确定删除这条来源卡？')) return;
    setCards(prev => prev.filter(c => c.id !== id));
    if (selectedId === id) { setSelectedId(null); setEdit(null); }
  };

  const cloneCard = (id: string) => {
    const src = cards.find(c => c.id === id);
    if (!src) return;
    const clone: OASourceCard = { ...src, id: 'card_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: src.title + '（副本）', updatedAt: new Date().toISOString() };
    setCards(prev => [clone, ...prev]);
    setSelectedId(clone.id);
    setEdit(clone);
    setIsNew(true);
  };

  const updateField = (field: string, value: any) => {
    if (!edit) return;
    setEdit({ ...edit, [field]: value });
  };

  const updateArrayField = (field: string, value: string) => {
    if (!edit) return;
    const arr = (edit as any)[field] || [];
    // Toggle: if string already in array, remove; else add
    const updated = arr.includes(value) ? arr.filter((s: string) => s !== value) : [...arr, value];
    setEdit({ ...edit, [field]: updated });
  };

  // Suggestions for selected card
  const suggestions = useMemo(() => {
    if (!selected) return { types: [] as OAArticleType[], titles: [] as string[] };
    const types = SUGGEST_ARTICLE_TYPES[selected.type] || ['technical_guide'];
    const titles = generateSuggestedTitles(selected);
    return { types, titles };
  }, [selected]);

  return (
    <AppLayout>
      <PageHeader title="来源卡管理" description={`共 ${cards.length} 条 · ${filtered.length} 条筛选后`} />

      {syncMsg && <div className="mb-2 px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded">{syncMsg}</div>}

      <div className="flex gap-3 h-[calc(100vh-240px)]">
        {/* Left: Card list */}
        <div className="w-72 flex-shrink-0 flex flex-col">
          <button className="btn-primary w-full py-1.5 text-xs mb-2" onClick={newCard}>+ 新增来源卡</button>
          <div className="space-y-1 mb-2">
            <div className="flex gap-1">
              <select className="select-field text-[10px] flex-1" value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})}>
                <option value="">全部类型</option>
                {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="select-field text-[10px] flex-1" value={filters.line} onChange={e => setFilters({...filters, line: e.target.value})}>
                <option value="">全部方向</option>
                {Object.entries(BIZ_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex gap-1">
              <select className="select-field text-[10px] flex-1" value={filters.quality} onChange={e => setFilters({...filters, quality: e.target.value})}>
                <option value="">全部质量</option>
                <option value="high">高质量</option><option value="medium">中等</option><option value="low">待完善</option>
              </select>
              <select className="select-field text-[10px] flex-1" value={filters.outbound} onChange={e => setFilters({...filters, outbound: e.target.value})}>
                <option value="">对外权限</option><option value="yes">可对外</option><option value="no">仅内部</option>
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {filtered.map(card => (
              <div key={card.id}
                className={'p-2 rounded border text-xs cursor-pointer transition-colors ' + (selectedId === card.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200')}
                onClick={() => selectCard(card.id)}>
                <div className="flex justify-between">
                  <span className="font-medium text-gray-800 truncate">{card.title || '(无标题)'}</span>
                  <span className={'text-[9px] px-1 rounded ' + (!card.outboundAllowed ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500')}>
                    {TYPE_LABELS[card.type] || card.type}
                  </span>
                  {card.id.startsWith('kb_') && <span className="ml-1 text-[9px] bg-blue-100 text-blue-600 px-1 rounded">📚</span>}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{BIZ_LABELS[card.businessLine] || card.businessLine} · {(card.sourceQuality && QUAL_LABELS[card.sourceQuality]) || '-'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Middle: Edit form */}
        <div className="flex-1 overflow-y-auto border rounded-lg p-3 bg-white">
          {!edit && <div className="text-center py-12 text-gray-400 text-xs"><p className="text-2xl mb-2">📇</p><p>选择或新增一条来源卡</p></div>}
          {edit && (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-bold text-gray-800">{isNew ? '新增来源卡' : '编辑来源卡'}</h3>
                <div className="flex gap-1">
                  {!isNew && <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={() => cloneCard(edit.id)}>📋 复制</button>}
                  {!isNew && <button className="btn-danger text-[10px] px-2 py-0.5" onClick={() => deleteCard(edit.id)}>删除</button>}
                  <button className="btn-primary text-[10px] px-2 py-0.5" onClick={saveCard}>💾 保存</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] text-gray-400">标题 *</label><input className="input-field w-full text-xs p-1.5" value={edit.title} onChange={e => updateField('title', e.target.value)} /></div>
                <div className="flex gap-1">
                  <div className="flex-1"><label className="text-[10px] text-gray-400">类型</label><select className="select-field w-full text-xs p-1.5" value={edit.type} onChange={e => updateField('type', e.target.value)}>{Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div className="flex-1"><label className="text-[10px] text-gray-400">业务方向</label><select className="select-field w-full text-xs p-1.5" value={edit.businessLine} onChange={e => updateField('businessLine', e.target.value)}>{Object.entries(BIZ_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] text-gray-400">目标受众</label><input className="input-field w-full text-xs p-1.5" value={edit.targetAudience || ''} onChange={e => updateField('targetAudience', e.target.value)} /></div>
                <div><label className="text-[10px] text-gray-400">客户痛点</label><input className="input-field w-full text-xs p-1.5" value={edit.customerPain || ''} onChange={e => updateField('customerPain', e.target.value)} /></div>
              </div>

              <div><label className="text-[10px] text-gray-400">核心结论</label><textarea className="input-field w-full text-xs p-1.5" rows={2} value={edit.coreConclusion} onChange={e => updateField('coreConclusion', e.target.value)} /></div>

              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] text-gray-400">关键要点（每行一条）</label><textarea className="input-field w-full text-xs p-1.5" rows={3} value={edit.keyPoints.join('\n')} onChange={e => updateField('keyPoints', e.target.value.split('\n').filter(Boolean))} /></div>
                <div><label className="text-[10px] text-gray-400">适用场景（每行一条）</label><textarea className="input-field w-full text-xs p-1.5" rows={3} value={edit.applicableScenarios.join('\n')} onChange={e => updateField('applicableScenarios', e.target.value.split('\n').filter(Boolean))} /></div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] text-gray-400">不适用场景</label><textarea className="input-field w-full text-xs p-1.5" rows={2} value={(edit.unsuitableScenarios || []).join('\n')} onChange={e => updateField('unsuitableScenarios', e.target.value.split('\n').filter(Boolean))} /></div>
                <div><label className="text-[10px] text-gray-400">风险提示（每行一条）</label><textarea className="input-field w-full text-xs p-1.5" rows={2} value={edit.riskNotes.join('\n')} onChange={e => updateField('riskNotes', e.target.value.split('\n').filter(Boolean))} /></div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div><label className="text-[10px] text-gray-400">CTA建议</label><input className="input-field w-full text-xs p-1.5" value={edit.suggestedCTA || ''} onChange={e => updateField('suggestedCTA', e.target.value)} /></div>
                <div><label className="text-[10px] text-gray-400">质量评估</label><select className="select-field w-full text-xs p-1.5" value={edit.sourceQuality || 'medium'} onChange={e => updateField('sourceQuality', e.target.value)}>
                  <option value="high">高质量</option><option value="medium">中等</option><option value="low">待完善</option>
                </select></div>
                <div><label className="text-[10px] text-gray-400">可见性</label><select className="select-field w-full text-xs p-1.5" value={edit.visibility || 'public'} onChange={e => updateField('visibility', e.target.value)}>
                  {Object.entries(VIS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[10px] text-gray-400">
                  <input type="checkbox" checked={edit.outboundAllowed} onChange={e => updateField('outboundAllowed', e.target.checked)} />
                  允许对外发布
                </label>
                {!edit.outboundAllowed && <span className="text-[10px] text-red-500">⚠️ 仅内部参考</span>}
                <span className="text-[10px] text-gray-300 ml-auto">更新: {edit.updatedAt.slice(0, 16)}</span>
              </div>

              <details className="border-t pt-1">
                <summary className="text-[10px] text-gray-400 cursor-pointer">高级字段</summary>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div><label className="text-[10px] text-gray-400">关联产品</label><input className="input-field w-full text-xs p-1" value={edit.relatedProduct || ''} onChange={e => updateField('relatedProduct', e.target.value)} /></div>
                  <div><label className="text-[10px] text-gray-400">关联材质</label><input className="input-field w-full text-xs p-1" value={edit.relatedMaterial || ''} onChange={e => updateField('relatedMaterial', e.target.value)} /></div>
                  <div><label className="text-[10px] text-gray-400">关联工艺</label><input className="input-field w-full text-xs p-1" value={edit.relatedProcess || ''} onChange={e => updateField('relatedProcess', e.target.value)} /></div>
                  <div><label className="text-[10px] text-gray-400">负责人</label><input className="input-field w-full text-xs p-1" value={edit.owner || ''} onChange={e => updateField('owner', e.target.value)} /></div>
                </div>
              </details>
            </div>
          )}
        </div>

        {/* Right: Suggestions */}
        <div className="w-56 flex-shrink-0">
          <div className="border rounded-lg p-3 bg-white h-full">
            {!selected ? (
              <div className="text-center py-8 text-gray-400 text-[10px]"><p>选择卡片后显示可生成文章建议</p></div>
            ) : (
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-gray-700">可生成文章类型</h4>
                {suggestions.types.map(t => {
                  const tmpl = ARTICLE_TEMPLATES.find(a => a.id === t);
                  return <div key={t} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded">{tmpl?.name || t}</div>;
                })}

                <h4 className="text-xs font-medium text-gray-700 mt-3">建议文章标题</h4>
                {suggestions.titles.map((t, i) => <div key={i} className="text-[10px] bg-green-50 text-green-700 px-2 py-1 rounded">{t}</div>)}

                {!selected.outboundAllowed && (
                  <div className="text-[10px] bg-red-50 text-red-600 px-2 py-1 rounded border border-red-200">⚠️ 此卡片不允许对外发布，仅可用于内部参考。</div>
                )}
                <div className="text-[10px] text-gray-300 pt-2 border-t mt-3">
                  <p>ID: {selected.id.slice(0, 12)}...</p>
                  <p>质量: {QUAL_LABELS[selected.sourceQuality || 'medium']}</p>
                  <p>可见性: {VIS_LABELS[selected.visibility || 'public']}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
