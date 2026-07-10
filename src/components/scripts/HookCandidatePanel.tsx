'use client';
import { useState } from 'react';

export interface HookCandidate {
  id: string;
  hookText: string;
  hookType: string;
  tensionType: string;
  targetCustomer: string;
  score: number;
  scoreDetail: {
    specificity: number;
    conflictStrength: number;
    spokenNaturalness: number;
    ctaPotential: number;
    riskSafety: number;
  };
  whyItWorks: string;
  riskNotes: string;
  similarityToRecentScripts: number;
}

interface HookScoreResult {
  hook: HookCandidate;
  totalScore: number;
  grade: string;
  dimensions: {
    name: string;
    label: string;
    maxScore: number;
    score: number;
    reason: string[];
  }[];
  penalties: { reason: string; deduction: number }[];
  strengths: string[];
  weaknesses: string[];
  rank: number;
}

interface HookCandidatePanelProps {
  hooks: HookScoreResult[];
  loading: boolean;
  selectedHookId: string | null;
  onSelect: (hook: HookCandidate) => void;
  onRefresh: () => void;
}

const HOOK_TYPE_LABELS: Record<string, string> = {
  direct_question: '直接提问',
  customer_quote: '客户原话',
  warning: '风险警告',
  counterintuitive: '反常识',
  cost_conflict: '价格反转',
  material_risk: '材质风险',
  test_risk: '测试风险',
  comparison: '对比',
  factory_secret: '工厂内幕',
  comment_reply: '评论回复',
  boss_experience: '老板经验',
  nini_perspective: '小林/小陈视角',
};

const TENSION_TYPE_LABELS: Record<string, string> = {
  price: '价格冲突',
  can_or_cannot: '能做不能做',
  fear_of_failure: '怕翻车',
  cost_waste: '浪费钱',
  quality_risk: '质量风险',
  time_delay: '时间冲突',
  wrong_assumption: '错误认知',
  before_after: '前后对比',
};

const HOOK_TYPE_COLORS: Record<string, string> = {
  direct_question: 'bg-blue-50 border-blue-200 text-blue-700',
  customer_quote: 'bg-purple-50 border-purple-200 text-purple-700',
  warning: 'bg-red-50 border-red-200 text-red-700',
  counterintuitive: 'bg-orange-50 border-orange-200 text-orange-700',
  cost_conflict: 'bg-green-50 border-green-200 text-green-700',
  material_risk: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  test_risk: 'bg-pink-50 border-pink-200 text-pink-700',
  comparison: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  factory_secret: 'bg-slate-50 border-slate-200 text-slate-700',
  comment_reply: 'bg-cyan-50 border-cyan-200 text-cyan-700',
  boss_experience: 'bg-amber-50 border-amber-200 text-amber-700',
  nini_perspective: 'bg-teal-50 border-teal-200 text-teal-700',
};

const GRADE_COLORS: Record<string, string> = {
  S: 'text-green-600 bg-green-100',
  A: 'text-blue-600 bg-blue-100',
  B: 'text-yellow-600 bg-yellow-100',
  C: 'text-orange-600 bg-orange-100',
  D: 'text-red-600 bg-red-100',
  F: 'text-gray-500 bg-gray-200',
};

export default function HookCandidatePanel({
  hooks, loading, selectedHookId, onSelect, onRefresh,
}: HookCandidatePanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-700">选择开头钩子</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">推荐前5个 · 共{hooks.length}个候选</span>
          <button className="btn-secondary text-xs px-2 py-1" onClick={onRefresh} disabled={loading}>
            {loading ? '生成中...' : '重新生成'}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        一个好的开头钩子决定了用户会不会停下来看。系统默认选最高分的钩子，你也可以手动选择。
      </p>

      {loading && (
        <div className="text-center py-8 text-gray-400 text-sm">正在生成20个钩子候选...</div>
      )}

      {!loading && hooks.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">没有生成钩子，请先选择内容角度或检查输入</div>
      )}

      <div className="space-y-2">
        {hooks.map((result, idx) => {
          const hook = result.hook;
          const isSelected = selectedHookId === hook.id;
          const isExpanded = expandedId === hook.id;
          const isInTop5 = idx < 5;

          if (!isInTop5 && !isExpanded && !isSelected) {
            return null;
          }

          const typeLabel = HOOK_TYPE_LABELS[hook.hookType] || hook.hookType;
          const tensionLabel = TENSION_TYPE_LABELS[hook.tensionType] || hook.tensionType;
          const typeColor = HOOK_TYPE_COLORS[hook.hookType] || 'bg-gray-50 border-gray-200 text-gray-700';
          const gradeColor = GRADE_COLORS[result.grade] || 'text-gray-600 bg-gray-100';
          const highSim = (hook.similarityToRecentScripts || 0) > 0.65;

          return (
            <div key={hook.id}
              className={`rounded-lg border transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>
              {/* Main row */}
              <button
                onClick={() => onSelect(hook)}
                className="w-full text-left p-3 flex items-start gap-3"
              >
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                  idx === 1 ? 'bg-gray-100 text-gray-600' :
                  idx === 2 ? 'bg-orange-100 text-orange-600' :
                  'bg-gray-50 text-gray-400'
                }`}>
                  {idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeColor}`}>{typeLabel}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{tensionLabel}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${gradeColor}`}>{result.grade}</span>
                    {highSim && <span className="text-[9px] text-gray-400">相似度高</span>}
                  </div>
                  <p className={`text-sm font-medium leading-tight ${isSelected ? 'text-blue-800' : 'text-gray-800'}`}>
                    {hook.hookText}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{hook.whyItWorks}</p>
                </div>

                <div className="flex-shrink-0 text-center">
                  <div className={`text-lg font-bold ${
                    result.totalScore >= 85 ? 'text-green-600' :
                    result.totalScore >= 70 ? 'text-yellow-600' :
                    result.totalScore >= 60 ? 'text-orange-600' :
                    'text-red-600'
                  }`}>{result.totalScore}</div>
                  <div className="text-[9px] text-gray-400">分</div>
                </div>

                <button onClick={(e) => { e.stopPropagation(); toggleExpand(hook.id); }}
                  className="text-gray-300 hover:text-gray-500 text-xs mt-1">
                  {isExpanded ? '▲' : '▼'}
                </button>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 pt-0 border-t border-gray-100 mt-1">
                  <div className="grid grid-cols-5 gap-1 mt-2 mb-2">
                    {result.dimensions.map(d => {
                      const pct = d.maxScore > 0 ? Math.round(d.score / d.maxScore * 100) : 0;
                      return (
                        <div key={d.name} className="text-center">
                          <div className="text-[10px] text-gray-500">{d.label}</div>
                          <div className="text-xs font-bold text-gray-700">{d.score}/{d.maxScore}</div>
                          <div className="h-1 bg-gray-100 rounded mt-0.5">
                            <div className={`h-1 rounded ${
                              pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                            }`} style={{ width: pct + '%' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    {result.strengths.length > 0 && (
                      <div>
                        <p className="font-medium text-green-600 mb-0.5">优势</p>
                        <ul className="text-green-600 space-y-0.5">
                          {result.strengths.map((s, i) => (<li key={i}>✓ {s}</li>))}
                        </ul>
                      </div>
                    )}
                    {result.weaknesses.length > 0 && (
                      <div>
                        <p className="font-medium text-orange-600 mb-0.5">不足</p>
                        <ul className="text-orange-600 space-y-0.5">
                          {result.weaknesses.map((w, i) => (<li key={i}>○ {w}</li>))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex gap-2 text-[9px]">
                    {hook.targetCustomer && (
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                        🎯 {hook.targetCustomer}
                      </span>
                    )}
                    {hook.riskNotes && (
                      <span className="bg-red-50 px-1.5 py-0.5 rounded text-red-500">
                        ⚠ {hook.riskNotes}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hooks.length > 5 && (
        <button className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-2"
          onClick={() => setExpandedId(expandedId ? null : 'all')}>
          {expandedId === 'all' ? '收起' : '查看全部' + hooks.length + '个钩子'}
        </button>
      )}
    </div>
  );
}
