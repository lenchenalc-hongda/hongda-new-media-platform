'use client';
import { MOCK_ACCOUNTS } from '@/lib/constants/mock-data';
import {
  TOPIC_CONTENT_TYPES, TOPIC_SOURCE_OPTIONS, TOPIC_STATUSES_NEW,
  TOPIC_SCRIPT_STATUSES, TOPIC_PRIORITIES_NEW, TOPIC_PLATFORMS,
  CONVERSION_GOALS
} from '@/lib/constants';

interface TopicFiltersProps {
  filters: Record<string, string>;
  setFilters: (f: Record<string, string>) => void;
  search: string;
  setSearch: (s: string) => void;
}

const filterOptions: { key: string; label: string; options: { value: string; label: string }[] }[] = [
  { key: 'account_id', label: '按账号', options: MOCK_ACCOUNTS.map(a => ({ value: a.id, label: a.name })) },
  { key: 'platform', label: '按平台', options: TOPIC_PLATFORMS },
  { key: 'content_type', label: '按内容类型', options: TOPIC_CONTENT_TYPES },
  { key: 'topic_source', label: '按选题来源', options: TOPIC_SOURCE_OPTIONS },
  { key: 'conversion_goal', label: '按转化目标', options: CONVERSION_GOALS },
  { key: 'priority', label: '按优先级', options: TOPIC_PRIORITIES_NEW },
  { key: 'status', label: '按状态', options: TOPIC_STATUSES_NEW },
  { key: 'script_status', label: '按脚本状态', options: TOPIC_SCRIPT_STATUSES },
];

export default function TopicFilters({ filters, setFilters, search, setSearch }: TopicFiltersProps) {
  const activeCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <input
        type="text"
        placeholder="搜索标题 / 客户痛点 / 产品 / 工艺 / 来源"
        className="input-field w-72"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {filterOptions.map(fo => (
        <select
          key={fo.key}
          className="select-field w-[130px]"
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
        <button
          className="text-xs text-gray-400 hover:text-red-500 ml-1"
          onClick={() => setFilters({})}
        >
          清除筛选 ({activeCount})
        </button>
      )}
    </div>
  );
}
