'use client';
import StatusBadge from '@/components/ui/StatusBadge';
import { MOCK_ACCOUNTS } from '@/lib/constants/mock-data';
import { truncate, formatDateTime } from '@/lib/utils';
import type { Topic } from '@/lib/constants/types';

interface TopicTableProps {
  topics: Topic[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onRowClick: (topic: Topic) => void;
}

function getAccountLabel(id: string): string {
  return MOCK_ACCOUNTS.find(a => a.id === id)?.name?.split('-')[0] || id.slice(0, 8);
}

function getPriorityColor(p: string): string {
  if (p === '紧急' || p === '高') return 'text-red-600 bg-red-50';
  if (p === '中') return 'text-yellow-600 bg-yellow-50';
  return 'text-gray-500 bg-gray-50';
}

function getStatusColor(s: string): string {
  const map: Record<string, string> = {
    '待审核': 'bg-yellow-100 text-yellow-800',
    '已审核': 'bg-green-100 text-green-800',
    '已发布': 'bg-green-100 text-green-800',
    '待复盘': 'bg-blue-100 text-blue-800',
    '可复制': 'bg-purple-100 text-purple-800',
    '暂停': 'bg-gray-100 text-gray-500',
    '待策划': 'bg-gray-100 text-gray-600',
    '待转脚本': 'bg-orange-100 text-orange-700',
    '脚本中': 'bg-blue-100 text-blue-700',
    '已沉淀': 'bg-teal-100 text-teal-700',
  };
  return map[s] || 'bg-gray-100 text-gray-600';
}

function getScriptStatusColor(s: string): string {
  const map: Record<string, string> = {
    '未生成': 'bg-gray-100 text-gray-400',
    '已生成': 'bg-blue-100 text-blue-700',
    '待审核': 'bg-yellow-100 text-yellow-700',
    '已审核': 'bg-green-100 text-green-700',
    '已退回': 'bg-red-100 text-red-600',
    '已关联发布': 'bg-teal-100 text-teal-700',
  };
  return map[s] || 'bg-gray-100 text-gray-500';
}

export default function TopicTable({
  topics, selectedIds, onToggleSelect, onToggleSelectAll, onRowClick
}: TopicTableProps) {
  const allSelected = topics.length > 0 && selectedIds.size === topics.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="w-8 px-2 py-2 text-left">
              <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} className="w-4 h-4" />
            </th>
            <th className="px-2 py-2 text-left text-gray-500 font-medium text-xs">标题</th>
            <th className="px-2 py-2 text-left text-gray-500 font-medium text-xs">账号/平台</th>
            <th className="px-2 py-2 text-left text-gray-500 font-medium text-xs">类型</th>
            <th className="px-2 py-2 text-left text-gray-500 font-medium text-xs">来源</th>
            <th className="px-2 py-2 text-left text-gray-500 font-medium text-xs">目标客户</th>
            <th className="px-2 py-2 text-left text-gray-500 font-medium text-xs">客户痛点</th>
            <th className="px-2 py-2 text-left text-gray-500 font-medium text-xs">转化目标</th>
            <th className="px-2 py-2 text-left text-gray-500 font-medium text-xs">优先级</th>
            <th className="px-2 py-2 text-left text-gray-500 font-medium text-xs">状态</th>
            <th className="px-2 py-2 text-left text-gray-500 font-medium text-xs">脚本</th>
            <th className="px-2 py-2 text-left text-gray-500 font-medium text-xs">添加时间</th>
            <th className="px-2 py-2 text-left text-gray-500 font-medium text-xs">最后动作</th>
          </tr>
        </thead>
        <tbody>
          {topics.map(t => {
            const isSelected = selectedIds.has(t.id);
            return (
              <tr
                key={t.id}
                className={'border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ' + (isSelected ? 'bg-blue-50' : '')}
                onClick={() => onRowClick(t)}
              >
                <td className="w-8 px-2 py-2" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(t.id)} className="w-4 h-4" />
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-col">
                    <span className="text-gray-800 font-medium text-xs leading-tight">{truncate(t.title, 38)}</span>
                    {(t.customer_pain || t.product_process) && (
                      <span className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[260px]">
                        {t.customer_pain ? '痛点：' + truncate(t.customer_pain, 28) : ''}
                        {t.product_process ? ' · 工艺：' + truncate(t.product_process, 16) : ''}
                        {t.conversion_goal ? ' · 目标：' + truncate(t.conversion_goal, 12) : ''}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-700">{getAccountLabel(t.account_id)}</span>
                    <span className="text-[10px] text-gray-400">{t.platform || '-'}</span>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <span className="text-xs text-gray-600">{t.content_type}</span>
                </td>
                <td className="px-2 py-2">
                  <span className="text-xs text-gray-600">{t.topic_source || '-'}</span>
                </td>
                <td className="px-2 py-2">
                  <span className="text-xs text-gray-600 truncate max-w-[100px] inline-block align-middle">{t.target_customer || '-'}</span>
                </td>
                <td className="px-2 py-2">
                  <span className="text-xs text-gray-600 truncate max-w-[120px] inline-block align-middle">{t.customer_pain || '-'}</span>
                </td>
                <td className="px-2 py-2">
                  <span className="text-xs text-gray-600 truncate max-w-[80px] inline-block align-middle">{t.conversion_goal || '-'}</span>
                </td>
                <td className="px-2 py-2">
                  <span className={'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ' + getPriorityColor(t.priority)}>
                    {t.priority}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <span className={'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ' + getStatusColor(t.status)}>
                    {t.status}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <span className={'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ' + getScriptStatusColor(t.script_status)}>
                    {t.script_status}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{t.created_at ? formatDateTime(t.created_at) : '-'}</span>
                </td>
                <td className="px-2 py-2">
                  <span className="text-[10px] text-gray-400">{t.last_action || '-'}</span>
                </td>
              </tr>
            );
          })}
          {topics.length === 0 && (
            <tr>
              <td colSpan={13} className="text-center py-12 text-gray-400 text-sm">
                没有找到匹配的选题
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
