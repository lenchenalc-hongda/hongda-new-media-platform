'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { MOCK_POSTS, MOCK_ACCOUNTS } from '@/lib/constants/mock-data';
import { formatDate, getStatusLabel, getPlatformLabel, truncate } from '@/lib/utils';
import { POST_STATUSES } from '@/lib/constants';

export default function CalendarPage() {
  const [posts] = useState(MOCK_POSTS);
  const [filterStatus, setFilterStatus] = useState('');

  const getAccountName = (id: string) => MOCK_ACCOUNTS.find(a => a.id === id)?.name || '';

  const filtered = posts.filter(p => !filterStatus || p.status === filterStatus);
  const sorted = [...filtered].sort((a, b) => {
    const da = a.publish_date ? new Date(a.publish_date).getTime() : 0;
    const db = b.publish_date ? new Date(b.publish_date).getTime() : 0;
    return db - da;
  });

  return (
    <AppLayout>
      <PageHeader
        title="发布日历"
        description="查看和管理发布排期"
        actions={
          <button className="btn-primary" onClick={() => alert('新增发布功能将在对接数据库后开放')}>新增发布</button>
        }
      />

      <div className="flex gap-3 mb-4">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="select-field w-40">
          <option value="">全部状态</option>
          {POST_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="table-header">标题</th>
                <th className="table-header">账号</th>
                <th className="table-header">平台</th>
                <th className="table-header">发布日期</th>
                <th className="table-header">状态</th>
                <th className="table-header">类型</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(post => (
                <tr key={post.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="table-cell font-medium">{truncate(post.title, 40)}</td>
                  <td className="table-cell text-xs">{getAccountName(post.account_id)}</td>
                  <td className="table-cell text-xs">{getPlatformLabel(post.platform)}</td>
                  <td className="table-cell text-xs text-gray-500">{formatDate(post.publish_date)}</td>
                  <td className="table-cell"><StatusBadge status={post.status} /></td>
                  <td className="table-cell text-xs">{post.content_type || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length === 0 && <EmptyState title="暂无发布记录" />}
      </div>

      <div className="mt-6 card">
        <h3 className="font-semibold text-gray-800 mb-3">状态说明</h3>
        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
          {POST_STATUSES.map(s => (
            <span key={s.value}><StatusBadge status={s.value} /> {s.label}</span>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
