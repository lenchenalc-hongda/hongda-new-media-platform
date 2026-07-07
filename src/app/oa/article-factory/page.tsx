'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import { MOCK_OA_TEMPLATES } from '@/lib/constants/oa-mock-data';
import { MOCK_KNOWLEDGE_NEW } from '@/lib/constants/mock-data';
import type { ArticleBodyBlock } from '@/lib/constants/types';

export default function ArticleFactoryPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Record<string, any>>({
    article_type: '知识解释类',
    selectedCards: [] as string[],
    template_id: 'tpl_001',
  });
  const [result, setResult] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  const filteredCards = MOCK_KNOWLEDGE_NEW.filter(c => c.knowledge_status === '已确认');

  const handleGenerate = async () => {
    const res = await fetch('/api/oa/generate-article', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        article_type: form.article_type,
        knowledge_card_ids: form.selectedCards,
        holiday_context: form.holiday_context || '',
        tone_style: form.tone_style || '标准',
      }),
    });
    const data = await res.json();
    setResult(data);
    setStep(3);
  };

  const handleRenderPreview = async () => {
    if (!result) return;
    const res = await fetch('/api/oa/render-template', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: form.template_id,
        body_blocks: result.body_blocks || [],
      }),
    });
    const data = await res.json();
    setResult((prev: any) => ({ ...prev, _html: data.html }));
    setShowPreview(true);
  };

  const handleMockPublish = async () => {
    const res = await fetch('/api/oa/mock-publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: 'new_' + Date.now() }),
    });
    const data = await res.json();
    setResult((prev: any) => ({ ...prev, _publish: data }));
  };

  return (
    <AppLayout>
      <PageHeader title="公众号文章工厂" description="知识库驱动·AI生成·模板渲染·排期发布" />
      <div className="flex gap-1 mb-4">
        {[1,2,3].map(s => (
          <div key={s} className={'flex-1 h-2 rounded-full ' + (s === step ? 'bg-emerald-500' : s < step ? 'bg-emerald-300' : 'bg-gray-200')} />
        ))}
      </div>

      <div className="flex gap-4">
        {/* Left: Knowledge card selection */}
        <div className="w-72 flex-shrink-0 space-y-2">
          <p className="text-xs font-medium text-gray-600 mb-2">选择知识卡作为文章依据</p>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {filteredCards.map(card => (
              <label key={card.id} className={'flex items-start gap-2 p-2 rounded-lg border cursor-pointer text-xs ' +
                (form.selectedCards.includes(card.id) ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-gray-300')}>
                <input type="checkbox" checked={form.selectedCards.includes(card.id)}
                  onChange={() => setForm((prev: any) => ({
                    ...prev,
                    selectedCards: prev.selectedCards.includes(card.id)
                      ? prev.selectedCards.filter((id: string) => id !== card.id)
                      : [...prev.selectedCards, card.id],
                  }))} className="w-3.5 h-3.5 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-700">{card.title}</p>
                  <p className="text-[10px] text-gray-400">{card.category} · {card.card_type}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-gray-600">文章类型</p>
            <select className="select-field text-xs" value={form.article_type}
              onChange={e => setForm({...form, article_type: e.target.value})}>
              <option value="知识解释类">知识解释类</option>
              <option value="宣传信任类">宣传信任类</option>
              <option value="节日/节气类">节日/节气类</option>
            </select>
            {form.article_type === '节日/节气类' && (
              <input className="input-field text-xs" placeholder="节气/节日名称"
                value={form.holiday_context || ''}
                onChange={e => setForm({...form, holiday_context: e.target.value})} />
            )}
          </div>
        </div>

        {/* Middle: Generate & Edit */}
        <div className="flex-1 border border-gray-200 rounded-lg p-4 bg-white min-h-[400px]">
          {step === 1 && (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <p className="text-4xl mb-3">📝</p>
              <h3 className="text-sm font-bold text-gray-700">选择知识卡</h3>
              <p className="text-xs text-gray-400 mt-1">从左栏选择1-3张确认状态的知识卡</p>
              <div className="flex gap-2 mt-4">
                <select className="select-field text-xs w-auto" value={form.template_id}
                  onChange={e => setForm({...form, template_id: e.target.value})}>
                  {MOCK_OA_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button className="btn-primary btn-sm text-xs" disabled={form.selectedCards.length === 0}
                  onClick={handleGenerate}>开始生成</button>
              </div>
            </div>
          )}
          {step === 3 && result && (
            <div className="space-y-3">
              <input className="input-field w-full text-sm font-semibold" value={result.title || ''}
                onChange={e => setResult({...result, title: e.target.value})} />
              <div className="flex gap-3 text-xs text-gray-500">
                <span>字数：{result.word_count}字</span>
                <span>阅读：{result.estimated_read_time}分钟</span>
                <span>来源：{(result.source_knowledge_card_ids || []).length}张知识卡</span>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {(result.body_blocks || []).map((block: ArticleBodyBlock, i: number) => (
                  <div key={i}>
                    {block.type === 'title' && <h3 className="text-base font-bold text-gray-800 mt-3">{block.content}</h3>}
                    {block.type === 'paragraph' && <p className="text-sm text-gray-700 leading-relaxed">{block.content}</p>}
                    {block.type === 'quote' && <div className="border-l-4 border-emerald-500 bg-emerald-50 p-3 rounded text-sm text-emerald-800">{block.content}</div>}
                    {block.type === 'tip' && <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-700">{block.content}</div>}
                    {block.type === 'cta' && <div className="bg-emerald-600 text-white rounded-lg p-3 text-sm text-center font-medium">{block.content}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="w-64 flex-shrink-0 space-y-3">
          {step === 3 && result && (
            <>
              <button className="btn-primary btn-sm w-full text-xs" onClick={handleRenderPreview}>预览渲染</button>
              <button className="btn-secondary btn-sm w-full text-xs" onClick={handleMockPublish}>Mock 发布</button>
              {result._html && showPreview && (
                <div className="border border-gray-200 rounded-lg p-3 bg-white max-h-60 overflow-y-auto">
                  <p className="text-xs font-medium text-gray-600 mb-2">HTML 预览</p>
                  <div className="text-xs text-gray-700" dangerouslySetInnerHTML={{ __html: result._html }} />
                </div>
              )}
              {result._publish && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-green-700">已发布 (Mock)</p>
                  <p className="text-[10px] text-green-600 mt-1">ID: {result._publish.mock_publish_id}</p>
                </div>
              )}
              <div className="border border-gray-200 rounded-lg p-2">
                <p className="text-[10px] text-gray-400 font-medium mb-1">风险提醒</p>
                {(result.risk_notes || []).map((r: string, i: number) => (
                  <p key={i} className="text-[10px] text-orange-600">{r}</p>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
