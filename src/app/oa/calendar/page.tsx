'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const BUSINESS_GOALS = [
  { value: 'customer_education', label: '客户教育' },
  { value: 'lead_generation', label: '销售线索' },
  { value: 'case_showcase', label: '案例展示' },
  { value: 'brand_building', label: '品牌建设' },
];
const TYPE_LABELS: Record<string, string> = {
  technical_guide: '📋 技术指南', faq: '❓ FAQ', case_study: '📖 案例',
  brand_story: '🏢 品牌', sales_enablement: '📱 销售', festival: '🎉 节日',
  solarterm: '🌿 节气', knowledge: '📖 知识',
};
const DEFAULT_MIX = '{"technical_guide":2,"festival":1,"brand_story":1,"case_study":1,"faq":1}';

export default function CalendarPage() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [goal, setGoal] = useState('customer_education');
  const [focus, setFocus] = useState('');
  const [audience, setAudience] = useState('');
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generatePlan = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/oa/generate-monthly-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year, targetCount: 6, businessGoal: goal, monthlyFocus: focus, targetAudience: audience }),
      });
      const data = await res.json();
      setPlan(data);
    } catch {}
    setLoading(false);
  };

  // Build calendar grid
  const days = useMemo(() => {
    const first = new Date(year, month - 1, 1).getDay();
    const total = new Date(year, month, 0).getDate();
    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = new Array(first).fill(null);
    for (let d = 1; d <= total; d++) {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }
    return weeks;
  }, [month, year]);

  const getPlansForDay = (day: number) =>
    plan?.articles?.filter((a: any) => parseInt(a.suggestedDate.slice(-2)) === day) || [];

  const buildUrl = (a: any) => {
    const params = new URLSearchParams();
    if (a.sourceCardIds?.length) params.set('sourceCardIds', a.sourceCardIds.join(','));
    if (a.suggestedTemplateId) params.set('templateId', a.suggestedTemplateId);
    params.set('articleType', a.articleType);
    return '/oa/article-factory?' + params.toString();
  };

  return (
    <AppLayout>
      <PageHeader title="发布日历" description={`${year}年${MONTHS[month-1]} · ${plan?.articles?.length || 0} 篇计划`} />
      <div className="flex gap-3 h-[calc(100vh-200px)]">
        {/* Left: Controls + Plan List */}
        <div className="w-72 flex-shrink-0 space-y-3">
          <div className="bg-white border rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-bold text-gray-700">月度计划设置</h4>
            <div className="flex gap-1">
              <select className="select-field text-xs flex-1" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
                {MONTHS.map((l, i) => <option key={i} value={i+1}>{l}</option>)}
              </select>
              <input className="input-field text-xs w-16" type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} />
            </div>
            <select className="select-field w-full text-xs" value={goal} onChange={e => setGoal(e.target.value)}>
              {BUSINESS_GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            <input className="input-field w-full text-xs" placeholder="月度主题（选填）" value={focus} onChange={e => setFocus(e.target.value)} />
            <input className="input-field w-full text-xs" placeholder="目标受众（选填）" value={audience} onChange={e => setAudience(e.target.value)} />
            <button className="btn-primary w-full text-xs py-1.5" onClick={generatePlan} disabled={loading}>
              {loading ? '生成中...' : '生成月度计划'}
            </button>
          </div>

          {plan && (
            <div className="bg-white border rounded-lg p-3 space-y-1 overflow-y-auto max-h-[400px]">
              <h4 className="text-xs font-bold text-gray-700 mb-2">文章计划清单</h4>
              {plan.articles?.map((a: any) => (
                <Link key={a.id} href={buildUrl(a)}
                  className="block p-2 rounded border border-gray-100 hover:border-blue-200 hover:bg-blue-50 no-underline transition-colors">
                  <div className="text-[10px] font-medium text-gray-800 truncate">{a.title}</div>
                  <div className="text-[9px] text-gray-400">{a.suggestedDate} · {TYPE_LABELS[a.articleType] || a.articleType}</div>
                  {a.targetAudience && <div className="text-[8px] text-gray-300 truncate">{a.targetAudience}</div>}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right: Calendar Grid */}
        <div className="flex-1 bg-white border rounded-lg p-3 overflow-auto">
          {!plan ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-xs">设置参数后点击"生成月度计划"</div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-400 mb-1">
                {['日','一','二','三','四','五','六'].map(d => <div key={d} className="py-1">{d}</div>)}
              </div>
              {days.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                  {week.map((day, di) => {
                    const plans = day ? getPlansForDay(day) : [];
                    return (
                      <div key={di} className={'min-h-[80px] p-1 rounded text-xs border ' + (day ? 'border-gray-100 bg-white' : 'border-transparent')}>
                        {day && (
                          <>
                            <span className="text-[10px] text-gray-400">{day}</span>
                            <div className="space-y-0.5 mt-0.5">
                              {plans.slice(0, 2).map((a: any) => (
                                <Link key={a.id} href={buildUrl(a)}
                                  className="block text-[8px] px-1 py-0.5 rounded no-underline truncate transition-colors hover:opacity-80"
                                  style={{
                                    backgroundColor: a.articleType === 'festival' || a.articleType === 'solarterm' ? '#fef3c7' :
                                      a.articleType === 'technical_guide' ? '#dbeafe' :
                                      a.articleType === 'case_study' ? '#f3e8ff' :
                                      a.articleType === 'brand_story' ? '#ecfeff' : '#f0fdf4',
                                    color: a.articleType === 'festival' || a.articleType === 'solarterm' ? '#92400e' :
                                      a.articleType === 'technical_guide' ? '#1e40af' :
                                      a.articleType === 'case_study' ? '#6b21a8' :
                                      a.articleType === 'brand_story' ? '#155e75' : '#166534',
                                  }}>
                                  {a.title.slice(0, 8)}
                                </Link>
                              ))}
                              {plans.length > 2 && <span className="text-[8px] text-gray-300">+{plans.length-2}</span>}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
