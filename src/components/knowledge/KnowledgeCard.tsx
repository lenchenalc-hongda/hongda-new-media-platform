'use client';
import { truncate } from '@/lib/utils';
import type { KnowledgeCardNew } from '@/lib/constants/types';
import type { MOCK_ACCOUNTS } from '@/lib/constants/mock-data';

interface KnowledgeCardProps {
  card: KnowledgeCardNew;
  accountName: (id: string | null) => string;
  onClick: () => void;
  onAction: (card: KnowledgeCardNew, action: string) => void;
}

function getScopeStyle(scope: string): string {
  const s: Record<string, string> = {
    '可对外': 'bg-green-100 text-green-700 border-green-200',
    '可模糊对外': 'bg-yellow-100 text-yellow-700 border-yellow-200',
    '仅内部参考': 'bg-gray-100 text-gray-500 border-gray-200',
    '禁止对外': 'bg-red-100 text-red-600 border-red-200',
  };
  return s[scope] || 'bg-gray-100 text-gray-500';
}

function getStatusStyle(st: string): string {
  const s: Record<string, string> = {
    '草稿': 'bg-gray-100 text-gray-500', '待审核': 'bg-yellow-100 text-yellow-700',
    '已确认': 'bg-green-100 text-green-700', '需更新': 'bg-red-100 text-red-600',
    '已过期': 'bg-red-100 text-red-600', '停用': 'bg-gray-100 text-gray-400',
  };
  return s[st] || 'bg-gray-100 text-gray-500';
}

const QUICK_ACTIONS = [
  ['选题', '生成选题'], ['脚本', '生成脚本'], ['风险', '风险检查'], ['详情', '查看详情'],
];

export default function KnowledgeCard({ card, accountName, onClick, onAction }: KnowledgeCardProps) {
  const borderColor = card.content_scope === '可对外' ? 'border-l-green-500'
    : card.content_scope === '可模糊对外' ? 'border-l-yellow-500'
    : card.content_scope === '禁止对外' ? 'border-l-red-500'
    : 'border-l-gray-300';

  return (
    <div className={'card cursor-pointer hover:shadow-md transition-shadow border-l-4 ' + borderColor} onClick={onClick}>
      <div className="flex items-start justify-between mb-1.5">
        <h4 className="text-sm font-medium text-gray-800">{truncate(card.title, 30)}</h4>
      </div>

      <div className="flex flex-wrap gap-1 mb-1.5">
        <span className={'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ' + getScopeStyle(card.content_scope)}>
          {card.content_scope}
        </span>
        <span className={'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ' + getStatusStyle(card.knowledge_status)}>
          {card.knowledge_status}
        </span>
        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600">{card.category}</span>
        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-600">{card.card_type}</span>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed mb-2">
        {truncate(card.core_conclusion || card.summary || '暂无核心结论', 80)}
      </p>

      <div className="flex items-center justify-between text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
        <div className="flex gap-1">
          {card.applicable_accounts.slice(0, 2).map(aid => (
            <span key={aid} className="bg-gray-50 px-1.5 py-0.5 rounded">{accountName(aid)}</span>
          ))}
          {card.applicable_accounts.length > 2 && <span>+{card.applicable_accounts.length - 2}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span>{card.usage_count}次引用</span>
          {card.updated_at && (
            <span className="text-gray-300">
              {new Date(card.updated_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mt-2">
        {QUICK_ACTIONS.map(([label, action]) => (
          <button key={label}
            className="text-[10px] px-2 py-0.5 rounded bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200"
            onClick={e => { e.stopPropagation(); onAction(card, action); }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
