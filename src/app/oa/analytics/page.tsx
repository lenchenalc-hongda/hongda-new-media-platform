'use client';
import { useState, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import { useOAStorage, OA_STORAGE_KEYS } from '@/lib/oa/oa-storage';
import { OA_SOURCE_CARDS } from '@/lib/constants/oa-source-cards';
import type { OAArticleDraft, OAArticleMetrics } from '@/lib/oa/types';

const USAGE_LABELS: Record<string, string> = {
  wechat_publish: '公众号', sales_forward: '销售转发', website_article: '官网',
  internal_training: '内部培训', video_script_expand: '视频扩写',
};
const TYPE_LABELS: Record<string, string> = {
  technical_guide: '技术指南', faq_answer: 'FAQ', machine_selection: '设备选型',
  process_sop: '工艺SOP', case_study: '案例复盘', troubleshooting: '排查指南',
  brand_story: '品牌故事', sales_enablement: '销售转发',
};
function now() { return new Date().toISOString(); }

export default function AnalyticsPage() {
  const [drafts] = useOAStorage<OAArticleDraft>(OA_STORAGE_KEYS.ARTICLE_DRAFTS, []);
  const [metrics, setMetrics] = useOAStorage<OAArticleMetrics>(OA_STORAGE_KEYS.ARTICLE_METRICS, []);
  const [sourceCards, setSourceCards] = useState<any[]>(() => {
    // Load from storage or use OA_SOURCE_CARDS
    if (typeof window === 'undefined') return OA_SOURCE_CARDS;
    try {
      const stored = JSON.parse(localStorage.getItem(OA_STORAGE_KEYS.SOURCE_CARDS) || '[]');
      return stored.length > 0 ? stored : OA_SOURCE_CARDS;
    } catch { return OA_SOURCE_CARDS; }
  });
  const [editMetricsId, setEditMetricsId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<OAArticleMetrics | null>(null);
  const [msg, setMsg] = useState('');

  const showMsg = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3000); };

  // Stats calculations
  const stats = useMemo(() => {
    const total = metrics.length;
    const sumViews = metrics.reduce((s, m) => s + m.views, 0);
    const sumLikes = metrics.reduce((s, m) => s + m.likes, 0);
    const sumShares = metrics.reduce((s, m) => s + m.shares, 0);
    const sumInquiries = metrics.reduce((s, m) => s + m.inquiries, 0);
    const sumSamples = metrics.reduce((s, m) => s + m.sampleRequests, 0);
    return { total, sumViews, sumLikes, sumShares, sumInquiries, sumSamples,
      avgViews: total > 0 ? Math.round(sumViews / total) : 0,
      engagementRate: sumViews > 0 ? ((sumLikes + sumShares) / sumViews * 100).toFixed(1) : '0',
      inquiryRate: sumViews > 0 ? (sumInquiries / sumViews * 100).toFixed(2) : '0',
    };
  }, [metrics]);

  // Per article type stats
  const byType = useMemo(() => {
    const map: Record<string, OAArticleMetrics[]> = {};
    metrics.forEach(m => { (map[m.articleType] = map[m.articleType] || []).push(m); });
    return Object.entries(map).map(([type, list]) => ({
      type, count: list.length, views: list.reduce((s, m) => s + m.views, 0),
      inquiries: list.reduce((s, m) => s + m.inquiries, 0),
      samples: list.reduce((s, m) => s + m.sampleRequests, 0),
      inquiryRate: list.reduce((s, m) => s + m.views, 0) > 0
        ? (list.reduce((s, m) => s + m.inquiries, 0) / list.reduce((s, m) => s + m.views, 0) * 100).toFixed(2) : '0',
    }));
  }, [metrics]);

  // By usage stats
  const byUsage = useMemo(() => {
    const map: Record<string, OAArticleMetrics[]> = {};
    metrics.forEach(m => { (map[m.usage] = map[m.usage] || []).push(m); });
    return Object.entries(map).map(([usage, list]) => ({
      usage, count: list.length, views: list.reduce((s, m) => s + m.views, 0),
      inquiries: list.reduce((s, m) => s + m.inquiries, 0),
    }));
  }, [metrics]);

  // High views / low inquiries
  const highViewLowInquiry = useMemo(() => metrics.filter(m => m.views > 100 && m.inquiries === 0).slice(0, 10), [metrics]);
  const lowViewHighInquiry = useMemo(() => metrics.filter(m => m.views < 50 && m.inquiries > 0).slice(0, 10), [metrics]);

  // Metrics entry
  const startEdit = (m: OAArticleMetrics | null, fromDraft?: OAArticleDraft) => {
    if (m) { setEditForm({ ...m }); setEditMetricsId(m.id); return; }
    if (fromDraft) {
      setEditForm({
        id: 'met_' + Date.now().toString(36), articleId: fromDraft.id,
        articleTitle: fromDraft.title || '', articleType: fromDraft.strategyId || fromDraft.strategyId || '',
        publishedAt: new Date().toISOString().slice(0, 10), articleUrl: '',
        views: 0, likes: 0, shares: 0, favorites: 0, newFollowers: 0, inquiries: 0,
        salesForwardCount: 0, sampleRequests: 0, quoteRequests: 0, customerQuestions: 0,
        notes: '', sourceCardIds: fromDraft.sourceCardIds || [], usage: fromDraft.usage || 'wechat_publish',
        updatedAt: now(),
      });
      setEditMetricsId('new');
    }
  };

  const saveMetrics = () => {
    if (!editForm) return;
    const updated = { ...editForm, updatedAt: now() };
    if (editMetricsId === 'new') setMetrics(prev => [...prev, updated] as any);
    else setMetrics(prev => prev.map(m => m.id === editMetricsId ? updated : m) as any);
    setEditMetricsId(null); setEditForm(null);
    showMsg('数据已保存');
  };

  // Push to source card
  const pushToSourceCard = (m: OAArticleMetrics, level: 'high' | 'medium' | 'low' | 'stop', notes: string) => {
    const cards = [...sourceCards];
    let changed = false;
    m.sourceCardIds.forEach(cid => {
      const idx = cards.findIndex(c => c.id === cid);
      if (idx >= 0) {
        cards[idx] = { ...cards[idx], performanceNotes: notes, recommendedReuseLevel: level, updatedAt: now() };
        changed = true;
      }
    });
    if (changed) {
      setSourceCards(cards);
      localStorage.setItem(OA_STORAGE_KEYS.SOURCE_CARDS, JSON.stringify(cards));
      fetch('/api/data?key=' + OA_STORAGE_KEYS.SOURCE_CARDS, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(cards),
      }).catch(() => {});
      showMsg('已更新来源卡复盘信息');
    }
  };

  return (
    <AppLayout>
      <PageHeader title="数据复盘" description={`${metrics.length} 条数据 · 手动录入模式`} />
      {msg && <div className="mb-2 px-3 py-1.5 text-xs bg-green-50 text-green-700 border rounded">{msg}</div>}

      <div className="flex gap-2 h-[calc(100vh-220px)]">
        {/* Left: Summary + Stats */}
        <div className="w-72 flex-shrink-0 overflow-y-auto space-y-2">
          <div className="bg-white border rounded-lg p-3">
            <h4 className="text-xs font-bold text-gray-700 mb-2">概览</h4>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <div className="bg-gray-50 p-2 rounded"><span className="text-gray-400">文章数</span><p className="font-bold">{stats.total}</p></div>
              <div className="bg-gray-50 p-2 rounded"><span className="text-gray-400">总阅读</span><p className="font-bold">{stats.sumViews}</p></div>
              <div className="bg-gray-50 p-2 rounded"><span className="text-gray-400">平均阅读</span><p className="font-bold">{stats.avgViews}</p></div>
              <div className="bg-gray-50 p-2 rounded"><span className="text-gray-400">互动率</span><p className="font-bold">{stats.engagementRate}%</p></div>
              <div className="bg-gray-50 p-2 rounded"><span className="text-gray-400">总咨询</span><p className="font-bold">{stats.sumInquiries}</p></div>
              <div className="bg-gray-50 p-2 rounded"><span className="text-gray-400">索样</span><p className="font-bold">{stats.sumSamples}</p></div>
            </div>
          </div>

          {/* Alert: High view / low inquiry */}
          {highViewLowInquiry.length > 0 && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <h4 className="text-xs font-bold text-amber-700 mb-1">⚠️ 高阅读低咨询</h4>
            {highViewLowInquiry.map(m => <div key={m.id} className="text-[9px] text-amber-600 py-0.5">{m.articleTitle.slice(0, 30)} ({m.views}阅读/0咨询)</div>)}
          </div>}

          {lowViewHighInquiry.length > 0 && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h4 className="text-xs font-bold text-blue-700 mb-1">💡 低阅读高咨询</h4>
            {lowViewHighInquiry.map(m => <div key={m.id} className="text-[9px] text-blue-600 py-0.5">{m.articleTitle.slice(0, 30)} ({m.views}阅读/{m.inquiries}咨询)</div>)}
          </div>}
        </div>

        {/* Middle: Per-type stats + Per-article list */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {/* By type table */}
          <div className="bg-white border rounded-lg p-3">
            <h4 className="text-xs font-bold text-gray-700 mb-2">按文章类型</h4>
            <table className="w-full text-[10px]">
              <thead><tr className="text-gray-400"><th className="text-left">类型</th><th>篇数</th><th>阅读</th><th>咨询</th><th>索样</th><th>咨询率</th></tr></thead>
              <tbody>{byType.map(r => <tr key={r.type} className="border-t border-gray-50"><td className="py-1">{TYPE_LABELS[r.type] || r.type}</td><td className="text-center">{r.count}</td><td className="text-center">{r.views}</td><td className="text-center">{r.inquiries}</td><td className="text-center">{r.samples}</td><td className="text-center">{r.inquiryRate}%</td></tr>)}</tbody>
            </table>
          </div>

          {/* By usage */}
          <div className="bg-white border rounded-lg p-3">
            <h4 className="text-xs font-bold text-gray-700 mb-2">按使用场景</h4>
            <table className="w-full text-[10px]">
              <thead><tr className="text-gray-400"><th className="text-left">场景</th><th>篇数</th><th>阅读</th><th>咨询</th></tr></thead>
              <tbody>{byUsage.map(r => <tr key={r.usage} className="border-t border-gray-50"><td className="py-1">{USAGE_LABELS[r.usage] || r.usage}</td><td className="text-center">{r.count}</td><td className="text-center">{r.views}</td><td className="text-center">{r.inquiries}</td></tr>)}</tbody>
            </table>
          </div>

          {/* Metrics entry form */}
          {editForm && (
            <div className="bg-white border rounded-lg p-3">
              <h4 className="text-xs font-bold text-gray-700 mb-2">{editMetricsId === 'new' ? '新增' : '编辑'}数据</h4>
              <div className="grid grid-cols-4 gap-1 text-[10px]">
                {['views','likes','shares','favorites','newFollowers','inquiries','salesForwardCount','sampleRequests','quoteRequests','customerQuestions'].map(f => (
                  <div key={f}><label className="text-gray-400">{f}</label>
                    <input className="input-field w-full p-0.5 text-[10px]" type="number" value={(editForm as any)[f] || 0}
                      onChange={e => setEditForm({...editForm, [f]: parseInt(e.target.value) || 0})} /></div>
                ))}
              </div>
              <div className="mt-1 text-[10px]"><label className="text-gray-400">备注</label>
                <textarea className="input-field w-full p-1 text-[10px]" rows={2} value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} />
              </div>
              <div className="flex gap-1 mt-1">
                <button className="btn-primary text-[10px] px-2 py-0.5" onClick={saveMetrics}>保存</button>
                <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={() => { setEditMetricsId(null); setEditForm(null); }}>取消</button>
              </div>
            </div>
          )}

          {/* Per-article list */}
          <div className="space-y-1">
            {drafts.filter(d => d.status === 'approved').map(d => {
              const m = metrics.find(mt => mt.articleId === d.id);
              return <div key={d.id} className="bg-white border rounded-lg p-2 flex items-center justify-between text-xs">
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 truncate font-medium">{d.title || '无标题'}</p>
                  <p className="text-[10px] text-gray-400">来源{d.sourceCardIds?.length || 0}条 · {(d.usage && USAGE_LABELS[d.usage]) || '-'} · {(d.strategyId && TYPE_LABELS[d.strategyId]) || '-'}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0 ml-2">
                  {m && <span className="text-[9px] text-gray-400 self-center">{m.views}阅</span>}
                  <button className="btn-secondary text-[9px] px-1.5 py-0.5" onClick={() => startEdit(m || null, d)}>{m ? '编辑' : '录入'}</button>
                  {m && <button className="btn-secondary text-[9px] px-1.5 py-0.5" onClick={() => pushToSourceCard(m, 'high', m.articleTitle + '表现良好')}>↻ 回写卡</button>}
                </div>
              </div>;
            })}
            {drafts.filter(d => d.status === 'approved').length === 0 && <div className="text-center py-8 text-gray-400 text-xs">暂无已批准的文章</div>}
          </div>
        </div>

        {/* Right: Source card performance */}
        <div className="w-56 flex-shrink-0 overflow-y-auto">
          <div className="bg-white border rounded-lg p-3">
            <h4 className="text-xs font-bold text-gray-700 mb-2">来源卡复盘</h4>
            {sourceCards.filter(c => c.performanceNotes).map(c => (
              <div key={c.id} className="text-[9px] bg-gray-50 rounded p-1.5 mb-1">
                <p className="font-medium text-gray-700 truncate">{c.title}</p>
                <p className={'text-[8px] ' + (c.recommendedReuseLevel === 'high' ? 'text-green-600' : c.recommendedReuseLevel === 'low' || c.recommendedReuseLevel === 'stop' ? 'text-red-500' : 'text-yellow-600')}>
                  {c.recommendedReuseLevel === 'high' ? '✅ 推荐复用' : c.recommendedReuseLevel === 'medium' ? '📌 可选复用' : c.recommendedReuseLevel === 'low' ? '⚠️ 谨慎复用' : c.recommendedReuseLevel === 'stop' ? '⛔ 不再使用' : ''}
                </p>
                <p className="text-gray-400 truncate">{c.performanceNotes?.slice(0, 40)}</p>
              </div>
            ))}
            {sourceCards.filter(c => c.performanceNotes).length === 0 && <p className="text-[10px] text-gray-400 text-center py-4">暂无复盘数据</p>}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
