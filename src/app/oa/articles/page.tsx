'use client';
import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import { formatDateTime } from '@/lib/utils';
import type { OAArticleDraft } from '@/lib/oa/types';

const ARTICLE_TYPE_LABELS: Record<string, string> = {
  technical_guide: '技术指南', faq_answer: 'FAQ解答', machine_selection: '设备选型',
  process_sop: '工艺SOP', case_study: '案例复盘', troubleshooting: '排查指南',
  brand_story: '品牌故事', sales_enablement: '销售转发',
};

export default function ArticlesPage() {
  const [drafts, setDrafts] = useState<OAArticleDraft[]>([]);
  const [selected, setSelected] = useState<OAArticleDraft | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('oa_drafts') || '[]');
      setDrafts(stored);
    } catch {}
  }, []);

  const handleDelete = (id: string) => {
    const updated = drafts.filter(d => d.id !== id);
    setDrafts(updated);
    localStorage.setItem('oa_drafts', JSON.stringify(updated));
    if (selected?.id === id) setSelected(null);
    setActionMsg('已删除');
    setTimeout(() => setActionMsg(null), 2000);
  };

  const handleCopyHtml = async (d: OAArticleDraft) => {
    const { renderOAArticleHtml } = await import('@/lib/oa/article-pipeline');
    try {
      await navigator.clipboard.writeText(renderOAArticleHtml(d));
      setActionMsg('HTML已复制');
    } catch { setActionMsg('复制失败'); }
    setTimeout(() => setActionMsg(null), 2000);
  };

  return (
    <AppLayout>
      <PageHeader title="文章列表" description={`共 ${drafts.length} 篇草稿`} />
      {actionMsg && <div className="mb-3 px-3 py-2 rounded text-xs bg-green-50 text-green-700 border border-green-200">{actionMsg}</div>}

      <div className="flex gap-3 h-[calc(100vh-240px)]">
        <div className="w-1/2 overflow-y-auto">
          {drafts.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-xs">
              <p className="text-3xl mb-2">📝</p>
              <p>暂无草稿，请先到文章工厂生成文章</p>
            </div>
          )}
          {drafts.map(d => (
            <div key={d.id} className={'p-3 rounded-lg border mb-1 cursor-pointer text-xs transition-colors ' + (selected?.id === d.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300')} onClick={() => setSelected(d)}>
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-800">{d.title || '无标题'}</span>
                <span className="text-[9px] bg-gray-100 px-1.5 py-0.5 rounded">{ARTICLE_TYPE_LABELS[d.strategyId?.split('_')[0]] || d.strategyId?.slice(0, 15) || '-'}</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                {d.score != null && <span className="mr-2">评分: {d.score}/100</span>}
                <span className="mr-2">风险: {d.riskLevel || '-'}</span>
                <span className="mr-2">来源: {d.sourceCardIds.length}条</span>
                <span>{formatDateTime(d.updatedAt)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="w-1/2 overflow-y-auto border rounded-lg p-3 bg-white">
          {!selected && <div className="text-center py-12 text-gray-400 text-xs"><p>选择左侧草稿查看详情</p></div>}
          {selected && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-sm font-bold text-gray-800">{selected.title}</h2>
                <div className="flex gap-1">
                  <button className="btn-secondary text-[10px] px-2 py-1" onClick={() => handleCopyHtml(selected)}>📋 复制HTML</button>
                  <button className="btn-danger text-[10px] px-2 py-1" onClick={() => handleDelete(selected.id)}>删除</button>
                </div>
              </div>
              <div className="text-[10px] text-gray-400 mb-2">来源: {selected.sourceCardIds.length}条 · 评分: {selected.score}/100 · 风险: {selected.riskLevel || '-'} · {formatDateTime(selected.updatedAt)}</div>
              <div className="text-xs text-gray-500 mb-2">{selected.summary}</div>
              <div className="border-t pt-2">
                {selected.bodyBlocks.map(block => (
                  <div key={block.id} className="mb-2 text-xs">
                    {block.type === 'title' && <h1 className="text-base font-bold">{block.content}</h1>}
                    {block.type === 'lead' && <p className="text-gray-500 italic">{block.content}</p>}
                    {block.type === 'heading' && <h2 className="text-sm font-semibold mt-3">{block.content}</h2>}
                    {block.type === 'paragraph' && <p className="text-gray-700 mt-1">{block.content}</p>}
                    {block.type === 'quote' && <blockquote className="text-blue-700 bg-blue-50 border-l-4 border-blue-500 p-2 mt-1">{block.content}</blockquote>}
                    {block.type === 'tip' && <div className="text-green-700 bg-green-50 p-2 mt-1 rounded">{block.content}{block.items?.map(i => <div key={i} className="ml-2">• {i}</div>)}</div>}
                    {block.type === 'warning' && <div className="text-red-600 bg-red-50 p-2 mt-1 rounded">{block.content}</div>}
                    {block.type === 'cta' && <div className="text-white bg-blue-600 text-center p-2 mt-2 rounded">{block.content}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
