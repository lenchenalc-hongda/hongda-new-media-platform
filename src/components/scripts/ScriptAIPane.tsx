'use client';
import ScoreCard from '@/components/scripts/ScoreCard';
import { formatDateTime } from '@/lib/utils';
import type { ScriptScoreResult } from '@/lib/ai/script-scoring';

interface ScriptAIPaneProps {
  selectedId: string | null;
  selectedStatus: string | undefined;
  scoreResult: ScriptScoreResult | null;
  pushedToTopics: boolean;
  getAccountName: (id: string | null) => string;
  onAiAction: (action: string) => void;
  onSaveDraft: () => void;
  onSavePendingReview: () => void;
  onPushToTopics: () => void;
  onDelete: () => void;
  onStartEdit: () => void;
  onRescore?: () => void;
  onDuplicateRewrite?: () => void;
  onDeepOptimize?: () => void;
  scoringAction?: string | null;
}

const AI_ACTIONS = [
  { action: '更口语', label: '更口语' },
  { action: '更专业', label: '更专业' },
  { action: '更像老板口吻', label: '老板口吻' },
  { action: '更适合视频号', label: '视频号版' },
  { action: '更适合抖音', label: '抖音版' },
  { action: '更短', label: '更短' },
  { action: '更有冲突', label: '更有冲突' },
  { action: '更强转化', label: '更强转化' },
  { action: '强化前3秒钩子', label: '强化钩子' },
  { action: '生成3个标题', label: '生成标题' },
  { action: '生成封面文案', label: '封面文案' },
  { action: '检查风险表达', label: '查风险' },
];

export default function ScriptAIPane({
  selectedId, selectedStatus, scoreResult, pushedToTopics,
  getAccountName, onAiAction, onSaveDraft, onSavePendingReview,
  onPushToTopics, onDelete, onStartEdit,
  onRescore, onDuplicateRewrite, onDeepOptimize,
  scoringAction,
}: ScriptAIPaneProps) {
  if (!selectedId) {
    return (
      <div className="w-[280px] flex-shrink-0 flex flex-col items-center justify-center py-16 border border-dashed border-gray-200 rounded-lg">
        <p className="text-2xl mb-2">🤖</p>
        <p className="text-xs text-gray-400">选择脚本后显示AI操作</p>
      </div>
    );
  }

  return (
    <div className="w-[280px] flex-shrink-0 flex flex-col h-full">
      {/* Save / Status actions */}
      <div className="space-y-1.5 mb-3">
        <div className="flex gap-1">
          {pushedToTopics ? (
            <span className="flex-1 text-center text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded">✅ 已推进选题库</span>
          ) : (
            <button className="btn-secondary btn-sm text-[10px] flex-1" onClick={onPushToTopics}>推进选题库</button>
          )}
          <button className="btn-secondary btn-sm text-[10px] flex-1" onClick={onStartEdit}>编辑</button>
          <button className="btn-danger btn-sm text-[10px] flex-1" onClick={onDelete}>删除</button>
        </div>
        <div className="flex gap-1 mt-1">
          <button className="btn-secondary btn-sm text-[10px] flex-1" onClick={onRescore} disabled={scoringAction === 'rescore'}>
            {scoringAction === 'rescore' ? '评分中...' : '重新评分'}
          </button>
          <button className="btn-secondary btn-sm text-[10px] flex-1" onClick={onDuplicateRewrite} disabled={!!scoringAction}>
            {scoringAction === 'duplicate' ? '生成中...' : '复制重写'}
          </button>
          <button className="btn-secondary btn-sm text-[10px] flex-1" onClick={onDeepOptimize} disabled={!!scoringAction}>
            {scoringAction === 'optimize' ? '优化中...' : '深度优化'}
          </button>
        </div>
      </div>

      {/* ScoreCard */}
      {scoreResult && (
        <div className="mb-3">
          <ScoreCard
            score={scoreResult.totalScore}
            grade={scoreResult.grade}
            dimensions={scoreResult.dimensions}
            penalties={scoreResult.penalties}
            strengths={scoreResult.strengths}
            weaknesses={scoreResult.weaknesses}
            rewriteSuggestions={scoreResult.rewriteSuggestions}
            recommendedStatus={scoreResult.recommendedStatus}
            riskLevel={scoreResult.riskLevel}
            riskPoints={scoreResult.riskPoints}
            saferExpressions={scoreResult.saferExpressions}
            wordCount={scoreResult.wordCount}
            duration={scoreResult.duration}
          />
        </div>
      )}

      {/* AI Actions */}
      <div className="mb-2">
        <p className="text-[10px] text-gray-400 font-medium mb-1">AI 操作</p>
        <div className="grid grid-cols-2 gap-1">
          {AI_ACTIONS.map(act => (
            <button key={act.action}
              className="text-[10px] px-2 py-1 rounded bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 transition-colors"
              onClick={() => onAiAction(act.action)}
            >
              {act.label}
            </button>
          ))}
        </div>
      </div>

      {/* Source traceability */}
      <div className="mt-auto pt-2 border-t border-gray-100">
        <p className="text-[9px] text-gray-300 font-medium mb-1">来源追溯</p>
        <div className="text-[9px] text-gray-400 space-y-0.5">
          <p>状态：{selectedStatus || '-'}</p>
          <p>推荐：{scoreResult?.recommendedStatus === 'pending_review' ? '待审核' :
                     scoreResult?.recommendedStatus === 'draft' ? '草稿' :
                     scoreResult?.recommendedStatus === 'needs_rewrite' ? '需重写' :
                     scoreResult?.recommendedStatus === 'discard' ? '不建议保存' : '-'}</p>
          {scoreResult && (
            <>
              <p>风险：{scoreResult.riskLevel}</p>
              <p>字数：{scoreResult.wordCount}字</p>
              <p>时长：{scoreResult.duration}秒</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
