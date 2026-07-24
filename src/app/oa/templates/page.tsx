'use client';
import { useState, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import { OA_THEMES } from '@/lib/oa/oa-themes';
import { renderVisualArticleHtml, renderOAArticleHtml } from '@/lib/oa/article-pipeline';
import { MOCK_OA_TEMPLATES } from '@/lib/constants/oa-mock-data';
import type { OABodyBlock } from '@/lib/oa/types';

const CATEGORY_KEYS = ['all', 'technical', 'machine', 'case', 'brand', 'sales', 'festival'];

// Sample blocks for preview
const SAMPLE_BLOCKS: OABodyBlock[] = [
  { id: 's1', type: 'title', content: '热转印工艺深度解读：从选材到成品' },
  { id: 's2', type: 'lead', content: '你是否遇到这样的问题：材质不匹配导致附着力不达标？这篇文章帮你分析清楚。' },
  { id: 's3', type: 'heading', content: '第一步：确认材质类型' },
  { id: 's4', type: 'paragraph', content: '不同材质的表面能差异很大。PE、PP属于难粘材料，ABS和PC相对容易。' },
  { id: 's5', type: 'quote', content: '材质匹配是热转印成功的第一步，也是最容易被忽略的一步。' },
  { id: 's6', type: 'tip', content: '如果材质是PE或PP，建议先做表面处理测试。', items: ['电晕处理', '火焰处理', '底涂处理'] },
  { id: 's7', type: 'warning', content: '未经处理的PE/PP材料直接转印，脱落风险很高。' },
  { id: 's8', type: 'case', content: '某客户用PE瓶做热转印，前期测试附着力达标，批量生产时因批次差异出现问题。重新测试后调整工艺参数才解决。' },
  { id: 's9', type: 'cta', content: '发产品图和材质，我帮你免费评估工艺方案' },
];

const CATEGORY_LABELS: Record<string, string> = {
  all: '全部', technical: '技术', machine: '设备', case: '案例', brand: '品牌', sales: '销售', festival: '节日',
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState(MOCK_OA_TEMPLATES.map(t => ({ ...t, _isLegacy: true })));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState('all');
  const [previewTheme, setPreviewTheme] = useState('hongda_blue');
  const [mobilePreview, setMobilePreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showCopy, setShowCopy] = useState('');

  const selected = useMemo(() => templates.find(t => t.id === selectedId), [templates, selectedId]);

  const filtered = useMemo(() => {
    if (filterCat === 'all') return templates;
    return templates.filter(t => {
      const type = (t.article_type || t.name || '').toLowerCase();
      return type.includes(filterCat);
    });
  }, [templates, filterCat]);

  const handlePreviewWithTheme = (themeId: string) => {
    setPreviewTheme(themeId);
    const html = renderVisualArticleHtml({ bodyBlocks: SAMPLE_BLOCKS }, themeId);
    setPreviewHtml(html);
    setMobilePreview(true);
  };

  const handlePreviewDefault = () => {
    const html = renderOAArticleHtml({ bodyBlocks: SAMPLE_BLOCKS, templateId: selectedId || '' } as any);
    setPreviewHtml(html);
    setMobilePreview(true);
  };

  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(previewHtml);
      setShowCopy('已复制');
      setTimeout(() => setShowCopy(''), 2000);
    } catch { setShowCopy('复制失败'); }
  };

  return (
    <AppLayout>
      <PageHeader title="模板与组件中心" description={`${templates.length} 套模板 · ${OA_THEMES.length} 个主题 · 视觉组件系统`} />

      <div className="flex gap-2 h-[calc(100vh-220px)]">
        {/* Left: Template List */}
        <div className="w-64 flex-shrink-0 flex flex-col">
          <div className="flex gap-1 mb-2 flex-wrap">
            {CATEGORY_KEYS.map(k => (
              <button key={k} className={'text-[10px] px-2 py-0.5 rounded ' + (filterCat === k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}
                onClick={() => setFilterCat(k)}>{CATEGORY_LABELS[k]}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {filtered.map(t => (
              <div key={t.id} className={'p-2 rounded border text-xs cursor-pointer ' + (selectedId === t.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200')}
                onClick={() => setSelectedId(t.id)}>
                <div className="flex justify-between">
                  <span className="font-medium text-gray-800">{t.name}</span>
                  <span className="text-[9px] px-1 rounded bg-gray-100">{t.article_type || '-'}</span>
                </div>
                <p className="text-[9px] text-gray-400 mt-0.5">{(t as any).description ? (t as any).description.slice(0, 30) : ""}</p>
                {(t as any)._isLegacy && <span className="text-[8px] text-yellow-500">🔄 旧版</span>}
              </div>
            ))}
          </div>

          {/* Theme quick select */}
          <div className="border-t pt-2 mt-2">
            <p className="text-[10px] text-gray-400 mb-1">主题预览</p>
            <div className="flex flex-wrap gap-1">
              {OA_THEMES.map(th => (
                <button key={th.id} className={'w-5 h-5 rounded-full border ' + (previewTheme === th.id ? 'ring-2 ring-blue-500' : '')}
                  style={{ background: th.primaryColor }}
                  onClick={() => handlePreviewWithTheme(th.id)} title={th.name} />
              ))}
            </div>
          </div>
        </div>

        {/* Middle: Template Editor */}
        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-xs">选择左侧模板</div>
          ) : (
            <div className="bg-white border rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-gray-800">{selected.name}</h3>
                <span className="text-[10px] text-gray-400">{(selected as any)._isLegacy ? '🔄 旧版模板（只读）' : '新版模板'}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><label className="text-[10px] text-gray-400">类型</label><input className="input-field w-full p-1 text-xs" value={(selected as any).article_type || (selected as any).name || ''} readOnly /></div>
                <div><label className="text-[10px] text-gray-400">描述</label><input className="input-field w-full p-1 text-xs" value={(selected as any).description || ''} readOnly /></div>
              </div>

              <div className="text-xs"><label className="text-[10px] text-gray-400">区块结构</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {((selected as any).blocks || (selected as any).structure || []).map((b: any, i: number) => (
                    <span key={i} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{b.type || b.name || b}</span>
                  ))}
                  {!((selected as any).blocks) && !((selected as any).structure) && <span className="text-[10px] text-gray-400">旧版模板：使用文字块</span>}
                </div>
              </div>

              <div className="border-t pt-2">
                <p className="text-xs font-bold text-gray-700 mb-2">可用组件（视觉组件库）</p>
                <div className="grid grid-cols-6 gap-1 text-[10px]">
                  {['hero_header','title_block','lead_block','section_title','subheading','paragraph','quote','tip_box','warning_box','summary_box','checklist_block','step_flow','comparison_block','faq_block','timeline_block','case_block','image_single','image_text_split','cta_banner','contact_card','brand_footer','divider_line','icon_heading'].map(c => (
                    <div key={c} className="bg-gray-50 border rounded p-1 text-center text-gray-600 text-[9px]">{c.replace(/_/g, ' ')}</div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-2 flex gap-2 text-xs">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-400">标题样式</label>
                  <div className="flex gap-1 mt-1">
                    {['filled','line','icon','card'].map(s => <button key={s} className={'text-[9px] px-2 py-0.5 rounded ' + (s === 'filled' ? 'bg-blue-600 text-white' : 'bg-gray-100')}>{s}</button>)}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-400">分割线样式</label>
                  <div className="flex gap-1 mt-1">
                    {['line','pattern','icon','spacer'].map(s => <button key={s} className={'text-[9px] px-2 py-0.5 rounded ' + (s === 'line' ? 'bg-blue-600 text-white' : 'bg-gray-100')}>{s}</button>)}
                  </div>
                </div>
              </div>

              <div className="text-xs">
                <p className="text-[10px] text-gray-400 mb-1">品牌配置</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[10px] text-gray-400">Logo URL</label><input className="input-field w-full p-1 text-[10px]" placeholder="/logo.png" /></div>
                  <div><label className="text-[10px] text-gray-400">头图图案</label><input className="input-field w-full p-1 text-[10px]" placeholder="header-pattern.svg" /></div>
                  <div><label className="text-[10px] text-gray-400">页脚图案</label><input className="input-field w-full p-1 text-[10px]" placeholder="footer-pattern.svg" /></div>
                  <div><label className="text-[10px] text-gray-400">默认头图</label><input className="input-field w-full p-1 text-[10px]" placeholder="hero.jpg" /></div>
                </div>
              </div>

              <div className="border-t pt-2 flex gap-1 justify-end">
                <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={() => handlePreviewWithTheme(previewTheme)}>🎨 主题预览</button>
                <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={handlePreviewDefault}>📄 默认预览</button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Mobile Preview */}
        <div className="w-80 flex-shrink-0 flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400">📱 手机预览 (375px)</span>
            {showCopy && <span className="text-[10px] text-green-600">{showCopy}</span>}
            {mobilePreview && <button className="btn-secondary text-[9px] px-1.5 py-0.5" onClick={copyHtml}>📋 复制HTML</button>}
          </div>
          <div className="flex-1 border rounded-lg bg-gray-100 overflow-hidden flex items-start justify-center p-2">
            {!mobilePreview ? (
              <div className="text-center py-12 text-gray-400 text-xs">选择模板或主题后点击预览</div>
            ) : (
              <div className="bg-white shadow-lg rounded-lg overflow-hidden" style={{ width: '360px', maxHeight: '100%', overflow: 'auto' }}>
                <iframe srcDoc={previewHtml} title="手机预览" style={{ width: '100%', border: 'none' }} className="min-h-[500px]" />
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
