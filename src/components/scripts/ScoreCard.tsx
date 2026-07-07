'use client';

interface ScoreCardProps {
  score: number;
  grade: string;
  dimensions: { name: string; label: string; maxScore: number; score: number; deduction: number; reason: string[] }[];
  penalties: { reason: string; deduction: number }[];
  strengths: string[];
  weaknesses: string[];
  rewriteSuggestions: string[];
  recommendedStatus: string;
  riskLevel: string;
  riskPoints: string[];
  saferExpressions: string[];
  wordCount: number;
  duration: string;
}

function getScoreColor(score: number): string {
  if (score >= 85) return 'text-green-600';
  if (score >= 70) return 'text-blue-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function getGradeBadge(grade: string): string {
  const colors: Record<string, string> = {
    S: 'bg-green-100 text-green-800 border-green-300',
    A: 'bg-blue-100 text-blue-800 border-blue-300',
    B: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    C: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    D: 'bg-orange-100 text-orange-800 border-orange-300',
    F: 'bg-red-100 text-red-800 border-red-300',
  };
  return colors[grade] || 'bg-gray-100 text-gray-800 border-gray-300';
}

function getStatusLabel(status: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    pending_review: { label: '推荐待审核', color: 'text-blue-600 bg-blue-50' },
    draft: { label: '保存草稿', color: 'text-yellow-600 bg-yellow-50' },
    needs_rewrite: { label: '草稿·需重写', color: 'text-orange-600 bg-orange-50' },
    discard: { label: '不建议保存', color: 'text-red-600 bg-red-50' },
  };
  return map[status] || { label: status, color: 'text-gray-600 bg-gray-50' };
}

export default function ScoreCard(props: ScoreCardProps) {
  const statusInfo = getStatusLabel(props.recommendedStatus);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header: Score + Grade */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">脚本质量评分</span>
        <div className="flex items-center gap-3">
          <span className={'text-2xl font-bold ' + getScoreColor(props.score)}>{props.score}<span className="text-sm font-normal">/100</span></span>
          <span className={'px-2.5 py-0.5 rounded text-xs font-bold border ' + getGradeBadge(props.grade)}>{props.grade}级</span>
          <span className={'px-2.5 py-0.5 rounded text-xs font-medium ' + statusInfo.color}>{statusInfo.label}</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Meta info */}
        <div className="flex gap-4 text-xs text-gray-500">
          <span>字数：{props.wordCount}字</span>
          <span>时长：{props.duration}秒</span>
          <span>风险等级：
            <span className={props.riskLevel === '低' ? 'text-green-600' : props.riskLevel === '中' ? 'text-yellow-600' : 'text-red-600'}>
              {props.riskLevel}
            </span>
          </span>
        </div>

        {/* Dimension bars */}
        <div className="space-y-1.5">
          {props.dimensions.map(d => (
            <div key={d.name} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-20 flex-shrink-0 text-right">{d.label}</span>
              <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden relative">
                <div
                  className={'h-full rounded-full transition-all ' + (d.score >= d.maxScore * 0.8 ? 'bg-green-400' : d.score >= d.maxScore * 0.5 ? 'bg-yellow-400' : 'bg-red-400')}
                  style={{ width: (d.maxScore > 0 ? (d.score / d.maxScore) * 100 : 0) + '%' }}
                />
                {d.deduction > 0 && (
                  <div className="absolute right-1 top-0 h-full flex items-center">
                    <span className="text-[9px] text-gray-500">-{d.deduction}</span>
                  </div>
                )}
              </div>
              <span className="text-xs font-medium text-gray-600 w-8">{d.score}/{d.maxScore}</span>
            </div>
          ))}
        </div>

        {/* Penalties */}
        {props.penalties.length > 0 && (
          <div>
            <p className="text-xs font-medium text-red-600 mb-1">扣分项</p>
            <div className="space-y-0.5">
              {props.penalties.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-red-500 font-medium">{p.deduction}</span>
                  <span className="text-gray-600">{p.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Strengths */}
        {props.strengths.length > 0 && (
          <div>
            <p className="text-xs font-medium text-green-600 mb-1">优点</p>
            <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
              {props.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}

        {/* Weaknesses */}
        {props.weaknesses.length > 0 && (
          <div>
            <p className="text-xs font-medium text-orange-600 mb-1">问题</p>
            <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
              {props.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Rewrite Suggestions */}
        {props.rewriteSuggestions.length > 0 && (
          <div>
            <p className="text-xs font-medium text-blue-600 mb-1">修改建议</p>
            <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
              {props.rewriteSuggestions.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}

        {/* Risk Points */}
        {props.riskPoints.length > 0 && props.riskPoints[0] !== '未发现明显风险' && (
          <div className="bg-red-50 border border-red-200 rounded p-2">
            <p className="text-xs font-medium text-red-700 mb-1">⚠ 风险提醒</p>
            <ul className="list-disc list-inside text-xs text-red-600 space-y-0.5">
              {props.riskPoints.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            {props.saferExpressions.length > 0 && (
              <div className="mt-1.5">
                <p className="text-xs font-medium text-green-700">建议替换为：</p>
                {props.saferExpressions.map((se, i) => (
                  <p key={i} className="text-xs text-green-600 ml-2">→ {se}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
