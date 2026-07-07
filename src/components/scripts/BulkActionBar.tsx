'use client';
interface BulkActionBarProps {
  count: number;
  onSaveDraft: () => void;
  onSavePendingReview: () => void;
  onPolish: () => void;
  onRiskCheck: () => void;
  onScore: () => void;
  onDiscard: () => void;
}

export default function BulkActionBar({ count, onSaveDraft, onSavePendingReview, onPolish, onRiskCheck, onScore, onDiscard }: BulkActionBarProps) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2 mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
      <span className="text-sm text-blue-700 font-medium w-24">已选 {count} 项</span>
      <button className="btn-primary btn-sm text-[11px]" onClick={onSaveDraft}>存草稿</button>
      <button className="btn-primary btn-sm text-[11px]" onClick={onSavePendingReview}>存待审核</button>
      <button className="btn-secondary btn-sm text-[11px]" onClick={onPolish}>润色</button>
      <button className="btn-secondary btn-sm text-[11px]" onClick={onRiskCheck}>风险检查</button>
      <button className="btn-secondary btn-sm text-[11px]" onClick={onScore}>重新评分</button>
      <button className="btn-danger btn-sm text-[11px]" onClick={onDiscard}>丢弃</button>
    </div>
  );
}
