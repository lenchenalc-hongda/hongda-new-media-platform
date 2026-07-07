'use client';
import { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { MOCK_ANALYTICS, MOCK_MONTHLY_REPORT } from '@/lib/constants/oa-phase3';

export default function AnalyticsPage() {
  const [data] = useState(MOCK_ANALYTICS);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    const res = await fetch('/api/oa/monthly-report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: '2026-06' }),
    });
    const r = await res.json();
    setReport(r);
    setLoading(false);
  };

  const pushInsight = async (insightType: string, content: any) => {
    const res = await fetch('/api/oa/push-insight-to-knowledge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insightType, content }),
    });
    const r = await res.json();
    alert(r.message);
  };

  return (
    <AppLayout>
      <PageHeader title="公众号数据分析" description="文章表现与月度复盘"
        actions={<button className="btn-primary btn-sm text-xs" onClick={generateReport} disabled={loading}>
          {loading ? '生成中...' : '生成月报'}
        </button>}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-3 mb-6">
        {[
          { label: '总文章', value: data.totalArticles, color: 'text-blue-600' },
          { label: '总阅读', value: data.totalReads.toLocaleString(), color: 'text-emerald-600' },
          { label: '总分享', value: data.totalShares.toLocaleString(), color: 'text-purple-600' },
          { label: '总互动', value: data.totalMessages, color: 'text-yellow-600' },
          { label: '总线索', value: data.totalLeads, color: 'text-orange-600' },
          { label: '转化率', value: (data.totalLeads / data.totalReads * 100).toFixed(1) + '%', color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
            <p className="text-[10px] text-gray-400">{s.label}</p>
            <p className={'text-lg font-bold mt-0.5 ' + s.color}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Column Ranking */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-3">栏目表现排行</h3>
          <div className="space-y-2">
            {data.columnRanking.map(c => {
              const maxRead = Math.max(...data.columnRanking.map(x => x.reads));
              const width = (c.reads / maxRead) * 100;
              return (
                <div key={c.column}>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>{c.column}</span>
                    <span>{c.reads}阅读 · {c.leads}线索</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-emerald-500 h-2 rounded-full" style={{ width: width + '%' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent reads trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-3">最近30天阅读趋势</h3>
          <div className="flex items-end gap-1 h-28">
            {data.dailyReads.map((d: any) => {
              const max = Math.max(...data.dailyReads.map((x: any) => x.count));
              const height = (d.count / max) * 100;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center">
                  <div className="w-full bg-emerald-400 rounded-t" style={{ height: height + '%', minHeight: 4 }} title={`${d.date}: ${d.count}`} />
                  <span className="text-[8px] text-gray-400 mt-1 rotate-45 origin-left">{d.date.slice(-2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Monthly Report */}
      {report && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm mt-6">
          <h3 className="text-sm font-bold text-gray-700 mb-3">{report.month} 月报</h3>
          <div className="grid grid-cols-5 gap-3 mb-4">
            {[
              { label: '发布文章', value: report.publishedCount },
              { label: '准时率', value: report.onTimeRate + '%' },
              { label: '平均阅读', value: report.avgReadCount },
              { label: '平均分享', value: report.avgShareCount },
              { label: '带来线索', value: report.leadCount },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-xs font-bold text-gray-800">{s.value}</p>
                <p className="text-[10px] text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-medium text-gray-600 mb-2">高表现标题模式</p>
              <ul className="list-disc list-inside text-gray-500 space-y-0.5">
                {report.topTitlePatterns.map((p: string, i: number) => <li key={i}>{p}</li>)}
              </ul>
              <button className="text-emerald-600 hover:text-emerald-700 mt-2 text-[10px] font-medium"
                onClick={() => pushInsight('title_pattern', { pattern: report.topTitlePatterns[0] })}>
                → 沉淀为知识卡
              </button>
            </div>
            <div>
              <p className="font-medium text-gray-600 mb-2">高引用知识卡</p>
              <ul className="list-disc list-inside text-gray-500 space-y-0.5">
                {report.topKnowledgeCards.map((c: any, i: number) => <li key={i}>{c.title}（{c.references}次）</li>)}
              </ul>
              <button className="text-emerald-600 hover:text-emerald-700 mt-2 text-[10px] font-medium"
                onClick={() => pushInsight('template_pref', {})}>
                → 沉淀为模板推荐
              </button>
            </div>
          </div>

          <div className="mt-3 bg-orange-50 border border-orange-200 rounded p-2">
            <p className="text-xs font-medium text-orange-700 mb-1">低表现原因与建议</p>
            <ul className="list-disc list-inside text-[10px] text-orange-600 space-y-0.5">
              {report.lowPerformanceReasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
              {report.suggestions.map((s: string, i: number) => <li key={i}>💡 {s}</li>)}
            </ul>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
