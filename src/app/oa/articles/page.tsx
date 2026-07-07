'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { MOCK_OA_ARTICLES, MOCK_OA_TEMPLATES } from '@/lib/constants/oa-mock-data';
import { formatDateTime } from '@/lib/utils';

export default function ArticlesPage() {
  const [articles] = useState(MOCK_OA_ARTICLES);
  const [selected, setSelected] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = statusFilter ? articles.filter(a => a.publish_status === statusFilter) : articles;

  return (
    <AppLayout>
      <PageHeader title="公众号文章库" description="管理所有文章" />
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
          {filtered.map(a => {
            const template = MOCK_OA_TEMPLATES.find(t => t.id === a.template_id);
            return (
              <div key={a.id} onClick={() => setSelected(a)}
                className={'card cursor-pointer p-3 transition-colors ' + (selected?.id === a.id ? 'ring-2 ring-emerald-400 border-emerald-300' : 'hover:border-gray-300')}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800 flex-1">{a.title}</p>
                  <StatusBadge status={a.publish_status === 'published_mock' ? '已发布' : a.publish_status === 'scheduled' ? '已排期' : a.publish_status} />
                </div>
                <div className="flex flex-wrap gap-1 mt-1 text-[10px] text-gray-400">
                  <span>{a.article_type}</span>
                  <span>·</span>
                  <span>{a.word_count}字</span>
                  <span>·</span>
                  <span>阅读{a.estimated_read_time}分钟</span>
                  {template && <><span>·</span><span>模板：{template.name}</span></>}
                </div>
                <p className="text-[10px] text-gray-300 mt-1">{formatDateTime(a.updated_at)}</p>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="text-center py-8 text-xs text-gray-400">暂无文章</p>}
        </div>

        {selected && (
          <div className="w-96 border border-gray-200 rounded-lg p-4 bg-white max-h-[70vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-800 mb-1">{selected.title}</h3>
            <p className="text-[10px] text-gray-400 mb-3">{selected.article_type} · {selected.column_name}</p>
            <div className="space-y-2">
              {(selected.body_blocks || []).map((block: any, i: number) => (
                <div key={i}>
                  {block.type === 'title' && <h4 className="text-sm font-bold text-gray-800 mt-2">{block.content}</h4>}
                  {block.type === 'paragraph' && <p className="text-xs text-gray-700 leading-relaxed">{block.content}</p>}
                  {block.type === 'quote' && <div className="border-l-4 border-emerald-400 bg-emerald-50 p-2 text-xs text-emerald-800 rounded">{block.content}</div>}
                  {block.type === 'cta' && <div className="bg-emerald-600 text-white rounded p-2 text-xs text-center">{block.content}</div>}
                  {block.type === 'tip' && <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-700">{block.content}</div>}
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 text-[10px] text-gray-400 space-y-1">
              <p>状态：{selected.publish_status}</p>
              <p>知识卡来源：{selected.source_knowledge_card_ids?.length || 0}张</p>
              {selected.schedule_at && <p>排期：{formatDateTime(selected.schedule_at)}</p>}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
