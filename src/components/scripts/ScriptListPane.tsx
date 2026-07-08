'use client';
import { MOCK_ACCOUNTS } from '@/lib/constants/mock-data';
import { truncate, formatDateTime } from '@/lib/utils';
import { PLATFORMS } from '@/lib/constants';
import type { Script } from '@/lib/constants/types';
import type { ScriptScoreResult } from '@/lib/ai/script-scoring';

interface ScriptListPaneProps {
  scripts: Script[];
  // Added by ScriptsContent
  onGenerateClick?: () => void;
  search: string;
  onSearchChange: (q: string) => void;
  filters: Record<string, string>;
  onFilterChange: (f: Record<string, string>) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  getScoreResult: (s: Script) => ScriptScoreResult;
}

export default function ScriptListPane({
  scripts, search, onSearchChange, filters, onFilterChange,
  selectedId, onSelect, selectedIds, onToggleSelect, onToggleSelectAll,
  getScoreResult, onGenerateClick,
}: ScriptListPaneProps) {
  const allSelected = scripts.length > 0 && selectedIds.size === scripts.length;

  return (
    <div className="w-[320px] flex-shrink-0 flex flex-col h-full">
      {/* Generate Button */}
      <div className="mb-2">
        <button className="btn-primary w-full py-2 text-xs font-medium" onClick={() => onGenerateClick?.()}>
          ✨ AI生成脚本
        </button>
      </div>

      {/* Search + Filters */}
      <div className="space-y-2 mb-2">
        <input type="text" placeholder="搜索脚本标题、口播..." className="input-field w-full text-xs"
          value={search} onChange={e => onSearchChange(e.target.value)} />
        <div className="flex gap-1">
          <select className="select-field text-xs flex-1" value={filters.account || ''}
            onChange={e => onFilterChange({ ...filters, account: e.target.value })}>
            <option value="">全部账号</option>
            {MOCK_ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="select-field text-xs flex-1" value={filters.platform || ''}
            onChange={e => onFilterChange({ ...filters, platform: e.target.value })}>
            <option value="">全部平台</option>
            {PLATFORMS.map(pl => <option key={pl.value} value={pl.value}>{pl.label}</option>)}
          </select>
        </div>
      </div>

      {/* Queue header */}
      <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1 px-1">
        <span className="flex items-center gap-1">
          <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} className="w-3 h-3" />
          全选
        </span>
        <span>{scripts.length} 个脚本</span>
      </div>

      {/* Script list */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {scripts.map(s => {
          const account = MOCK_ACCOUNTS.find(a => a.id === s.account_id);
          const sr = getScoreResult(s);
          const isSelected = selectedIds.has(s.id);
          const isActive = selectedId === s.id;
          return (
            <div key={s.id}
              className={'flex items-start gap-1.5 p-2 rounded-lg cursor-pointer transition-colors ' +
                (isActive ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-gray-50')}
              onClick={() => onSelect(s.id)}
            >
              <div className="pt-0.5" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(s.id)} className="w-3 h-3" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-xs font-medium text-gray-800 leading-tight truncate">{s.title}</p>
                  <span className={'text-[9px] font-medium px-1 py-0.5 rounded ' + (
                    sr.grade === 'S' || sr.grade === 'A' ? 'bg-green-100 text-green-700' :
                    sr.grade === 'B' ? 'bg-blue-100 text-blue-700' :
                    sr.grade === 'C' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-600'
                  )}>
                    {sr.grade}·{sr.totalScore}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[9px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded">{account?.name?.split('-')[0] || '-'}</span>
                  {s.hook && <span className="text-[9px] text-gray-400 truncate">{truncate(s.hook, 20)}</span>}
                </div>
                <p className="text-[9px] text-gray-300 mt-0.5">{formatDateTime(s.created_at)}</p>
              </div>
            </div>
          );
        })}
        {scripts.length === 0 && (
          <div className="text-center py-6 text-[10px] text-gray-400">暂无脚本，点击上方"AI生成脚本"开始创作</div>
        )}
      </div>
    </div>
  );
}
