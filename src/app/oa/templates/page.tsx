'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import { MOCK_OA_TEMPLATES } from '@/lib/constants/oa-mock-data';

export default function TemplatesPage() {
  const [preview, setPreview] = useState<string | null>(null);

  const typeColors: Record<string, string> = {
    '知识解释类': 'border-l-emerald-500 bg-emerald-50',
    '宣传信任类': 'border-l-blue-500 bg-blue-50',
    '节日/节气类': 'border-l-purple-500 bg-purple-50',
  };

  return (
    <AppLayout>
      <PageHeader title="模板中心" description="管理文章排版模板" />
      <div className="grid grid-cols-3 gap-4">
        {MOCK_OA_TEMPLATES.map(t => (
          <div key={t.id} className={'card border-l-4 ' + (typeColors[t.article_type] || 'border-l-gray-300')}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-800">{t.name}</h3>
              {t.is_default && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">默认</span>}
            </div>
            <p className="text-xs text-gray-500">{t.article_type}</p>
            <div className="mt-2 space-y-1 text-[10px] text-gray-400">
              <p>头部：{t.header_style}</p>
              <p>正文：{t.body_style}</p>
              <p>CTA：{t.cta_style}</p>
              <p>尾部：{t.footer_style}</p>
            </div>
            <button className="btn-secondary btn-sm w-full text-xs mt-3" onClick={() => setPreview(t.id)}>预览布局</button>
          </div>
        ))}
      </div>
      {preview && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">{MOCK_OA_TEMPLATES.find(t => t.id === preview)?.name}</h3>
            <div className="space-y-2 border border-dashed border-gray-300 rounded-lg p-4 text-xs text-gray-500">
              <div className="bg-gray-100 p-3 rounded text-center font-medium">[ 头部：标题+导语区 ]</div>
              <div className="bg-gray-50 p-4 rounded text-center">[ 正文区 ]</div>
              <div className="bg-emerald-100 p-3 rounded text-center text-emerald-700 font-medium">[ CTA区 ]</div>
              <div className="bg-gray-100 p-2 rounded text-center text-[10px]">[ 尾注声明区 ]</div>
            </div>
            <button className="btn-primary btn-sm mt-3" onClick={() => setPreview(null)}>关闭</button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
