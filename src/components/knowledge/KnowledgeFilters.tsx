'use client';
import { MOCK_ACCOUNTS } from '@/lib/constants/mock-data';
import {
  KNOWLEDGE_CATEGORIES_NEW, CONTENT_SCOPES, KNOWLEDGE_STATUSES,
  KNOWLEDGE_CARD_TYPES
} from '@/lib/constants';

interface KnowledgeFiltersProps {
  filters: Record<string, string>;
  setFilters: (f: Record<string, string>) => void;
  search: string;
  setSearch: (s: string) => void;
}

const filterOptions: { key: string; label: string; options: { value: string; label: string }[] }[] = [
  { key: 'category', label: '按分类', options: KNOWLEDGE_CATEGORIES_NEW },
  { key: 'content_scope', label: '按可用范围', options: CONTENT_SCOPES },
  { key: 'knowledge_status', label: '按知识状态', options: KNOWLEDGE_STATUSES },
  { key: 'card_type', label: '按卡类型', options: KNOWLEDGE_CARD_TYPES },
  { key: 'account_id', label: '按适用账号', options: MOCK_ACCOUNTS.map(a => ({ value: a.id, label: a.name.split('-')[0] })) },
];

export default function KnowledgeFilters({ filters, setFilters, search, setSearch }: KnowledgeFiltersProps) {
  const activeCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <input
        type="text"
        placeholder="搜索标题 / 核心结论 / 客户问题 / 工艺 / 材料 / 禁忌..."
        className="input-field w-72"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {filterOptions.map(fo => (
        <select
          key={fo.key}
          className="select-field w-[120px]"
          value={filters[fo.key] || ''}
          onChange={e => setFilters({ ...filters, [fo.key]: e.target.value })}
        >
          <option value="">{fo.label}</option>
          {fo.options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}
      {activeCount > 0 && (
        <button className="text-xs text-gray-400 hover:text-red-500 ml-1" onClick={() => setFilters({})}>
          清除筛选 ({activeCount})
        </button>
      )}
    </div>
  );
}
