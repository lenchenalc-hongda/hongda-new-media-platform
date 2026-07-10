'use client';
import { useState } from 'react';

export interface Angle {
  id: string;
  title: string;
  angleType: string;
  targetCustomer: string;
  customerPain: string;
  coreConflict: string;
  whyItWorks: string;
  recommendedAccount: string;
  recommendedPlatform: string;
  riskLevel: string;
  score: number;
  similarity?: number;
}

interface AngleSelectorProps {
  angles: Angle[];
  loading: boolean;
  selectedAngle: Angle | null;
  onSelect: (angle: Angle) => void;
  onRefresh: () => void;
}

const ANGLE_LABELS: Record<string, string> = {
  customer_question: '客户疑问', customer_misunderstanding: '客户误区',
  cost_logic: '成本逻辑', material_risk: '材质风险',
  test_requirement: '测试要求', sample_before_bulk: '打样先行',
  factory_experience: '工厂经验', comparison: '对比分析',
  comment_reply: '评论答疑', case_story: '案例故事',
  visual_factory_scene: '工厂实拍', after_sales_trust: '售后保障',
};

const ANGLE_COLORS: Record<string, string> = {
  customer_question: 'bg-blue-50 border-blue-200 text-blue-700',
  customer_misunderstanding: 'bg-orange-50 border-orange-200 text-orange-700',
  cost_logic: 'bg-green-50 border-green-200 text-green-700',
  material_risk: 'bg-red-50 border-red-200 text-red-700',
  test_requirement: 'bg-purple-50 border-purple-200 text-purple-700',
  sample_before_bulk: 'bg-cyan-50 border-cyan-200 text-cyan-700',
  factory_experience: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  comparison: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  comment_reply: 'bg-pink-50 border-pink-200 text-pink-700',
  case_story: 'bg-teal-50 border-teal-200 text-teal-700',
  visual_factory_scene: 'bg-slate-50 border-slate-200 text-slate-700',
  after_sales_trust: 'bg-rose-50 border-rose-200 text-rose-700',
};

export default function AngleSelector({ angles, loading, selectedAngle, onSelect, onRefresh }: AngleSelectorProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-700">选择内容角度</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{angles.length} 个角度</span>
          <button className="btn-secondary text-xs px-2 py-1" onClick={onRefresh} disabled={loading}>
            {loading ? '生成中...' : '重新生成'}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400">推荐的脚本方向，选择最适合你的切入角度</p>

      {loading && (
        <div className="text-center py-10 text-gray-400 text-sm">正在生成内容角度...</div>
      )}

      {!loading && angles.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">没有生成角度，请检查输入内容</div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {angles.map(a => {
          const isSelected = selectedAngle?.id === a.id;
          const highSim = (a.similarity || 0) > 0.65;
          const color = ANGLE_COLORS[a.angleType] || 'bg-gray-50 border-gray-200 text-gray-700';
          const label = ANGLE_LABELS[a.angleType] || a.angleType;

          return (
            <button key={a.id} onClick={() => onSelect(a)}
              className={`text-left p-3 rounded-lg border transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                  : highSim
                  ? 'border-gray-200 bg-gray-50 opacity-60 hover:opacity-80'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>

              {/* Type badge */}
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${color}`}>{label}</span>
                <div className="flex items-center gap-1">
                  {highSim && <span className="text-[9px] text-gray-400">相似度高</span>}
                  <span className={`text-[10px] font-bold ${
                    a.riskLevel === '高' ? 'text-red-500' : a.riskLevel === '中' ? 'text-yellow-500' : 'text-green-500'
                  }`}>{a.riskLevel}风险</span>
                </div>
              </div>

              {/* Title */}
              <p className="text-xs font-medium text-gray-800 leading-tight">{a.title}</p>

              {/* Conflict */}
              <p className="text-[10px] text-gray-500 mt-1 line-clamp-2">{a.coreConflict}</p>

              {/* Why it works */}
              <p className="text-[9px] text-gray-400 mt-1 italic">💡 {a.whyItWorks}</p>

              {/* Score bar */}
              <div className="mt-1.5 flex items-center gap-1">
                <div className="flex-1 bg-gray-100 rounded-full h-1">
                  <div className={`h-1 rounded-full ${a.score >= 85 ? 'bg-green-500' : a.score >= 75 ? 'bg-blue-500' : 'bg-gray-400'}`}
                    style={{ width: a.score + '%' }} />
                </div>
                <span className="text-[9px] text-gray-400">{a.score}分</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
