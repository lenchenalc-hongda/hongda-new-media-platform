'use client';
import { useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { MOCK_ACCOUNTS } from '@/lib/constants/mock-data';
import { getPlatformLabel, truncate } from '@/lib/utils';
import { PLATFORMS, ACCOUNT_STATUSES } from '@/lib/constants';
import type { AccountWithStats, Platform, AccountStatus, ContentType } from '@/lib/constants/types';
import { usePersistentState, STORAGE_KEYS } from '@/lib/storage';

export default function AccountsPage() {
  const [accounts, setAccounts] = usePersistentState<AccountWithStats>(STORAGE_KEYS.ACCOUNTS, MOCK_ACCOUNTS);
  const [filterPlatform, setFilterPlatform] = useState('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<any>({});

  const filtered = accounts.filter(a => {
    if (filterPlatform && a.platform !== filterPlatform) return false;
    if (search && !a.name.includes(search) && !a.persona?.includes(search)) return false;
    return true;
  });

  const handleEdit = (account: AccountWithStats) => {
    setEditingId(account.id);
    setEditForm({ ...account });
  };

  const handleSave = () => {
    setAccounts(prev => prev.map(a => a.id === editingId ? { ...a, ...editForm } : a));
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个账号吗？')) {
      setAccounts(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleNew = () => {
    if (newForm.name) {
      const newAccount: AccountWithStats = {
        id: `a${Date.now()}`, org_id: 'org_001',
        name: newForm.name || '', platform: newForm.platform || 'weixin',
        owner_id: 'u1', persona: newForm.persona || '', positioning: newForm.positioning || '',
        target_audience: '', content_style: '', main_content_types: [] as ContentType[],
        conversion_goal: '', dos: '', donts: '', status: 'active',
        created_at: new Date().toISOString(),
        monthly_posts: 0, monthly_leads: 0, latest_review_summary: null,
      };
      setAccounts(prev => [...prev, newAccount]);
      setShowNew(false);
      setNewForm({});
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="账号矩阵"
        description={`共 ${accounts.length} 个账号`}
        actions={
          <button className="btn-primary" onClick={() => { setShowNew(true); setNewForm({}); }}>新增账号</button>
        }
      />

      <div className="flex gap-3 mb-4">
        <input
          type="text" placeholder="搜索账号名称或人设..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="input-field w-64"
        />
        <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)} className="select-field w-32">
          <option value="">全部平台</option>
          {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {/* New Account Form */}
      {showNew && (
        <div className="card mb-4 bg-blue-50 border-blue-200">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">新增账号</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">账号名称 *</label>
              <input className="input-field" value={newForm.name || ''} onChange={e => setNewForm({...newForm, name: e.target.value})} placeholder="如：小陈-热转印前端顾问" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">平台</label>
              <select className="select-field" value={newForm.platform || 'weixin'} onChange={e => setNewForm({...newForm, platform: e.target.value})}>
                {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">状态</label>
              <select className="select-field" value={newForm.status || 'active'} onChange={e => setNewForm({...newForm, status: e.target.value})}>
                {ACCOUNT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">人设</label>
              <input className="input-field" value={newForm.persona || ''} onChange={e => setNewForm({...newForm, persona: e.target.value})} placeholder="如：热转印前端顾问" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">定位</label>
              <input className="input-field" value={newForm.positioning || ''} onChange={e => setNewForm({...newForm, positioning: e.target.value})} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn-primary btn-sm" onClick={handleNew}>保存</button>
            <button className="btn-secondary btn-sm" onClick={() => setShowNew(false)}>取消</button>
          </div>
        </div>
      )}

      {/* Account Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(acc => (
          <div key={acc.id} className="card">
            {/* Edit Mode */}
            {editingId === acc.id ? (
              <div>
                <h3 className="font-semibold text-gray-800 text-sm mb-3">编辑 - {acc.name}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">账号名称</label>
                    <input className="input-field" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">平台</label>
                    <select className="select-field" value={editForm.platform || 'weixin'} onChange={e => setEditForm({...editForm, platform: e.target.value})}>
                      {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">状态</label>
                    <select className="select-field" value={editForm.status || 'active'} onChange={e => setEditForm({...editForm, status: e.target.value})}>
                      {ACCOUNT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">人设</label>
                    <input className="input-field" value={editForm.persona || ''} onChange={e => setEditForm({...editForm, persona: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">定位</label>
                    <textarea className="input-field h-16" value={editForm.positioning || ''} onChange={e => setEditForm({...editForm, positioning: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">目标用户</label>
                    <input className="input-field" value={editForm.target_audience || ''} onChange={e => setEditForm({...editForm, target_audience: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">内容风格</label>
                    <input className="input-field" value={editForm.content_style || ''} onChange={e => setEditForm({...editForm, content_style: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">转化目标</label>
                    <input className="input-field" value={editForm.conversion_goal || ''} onChange={e => setEditForm({...editForm, conversion_goal: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">✅ 应做</label>
                    <input className="input-field" value={editForm.dos || ''} onChange={e => setEditForm({...editForm, dos: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">❌ 不应做</label>
                    <input className="input-field" value={editForm.donts || ''} onChange={e => setEditForm({...editForm, donts: e.target.value})} />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="btn-primary btn-sm" onClick={handleSave}>保存</button>
                  <button className="btn-secondary btn-sm" onClick={() => setEditingId(null)}>取消</button>
                  <button className="btn-danger btn-sm ml-auto" onClick={() => handleDelete(acc.id)}>删除</button>
                </div>
              </div>
            ) : (
              /* View Mode */
              <div>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <Link href={`/accounts/${acc.id}`} className="no-underline">
                      <h3 className="font-semibold text-gray-800 hover:text-blue-700">{acc.name}</h3>
                    </Link>
                    <p className="text-xs text-gray-400">{getPlatformLabel(acc.platform)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={acc.status} />
                    <button onClick={() => handleEdit(acc)} className="text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded">
                      编辑
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-1"><span className="text-gray-400">人设：</span>{acc.persona}</p>
                <p className="text-sm text-gray-600 mb-3"><span className="text-gray-400">定位：</span>{truncate(acc.positioning, 50)}</p>
                <div className="flex gap-4 text-xs text-gray-500 pt-2 border-t border-gray-100">
                  <span>本月发布 {acc.monthly_posts}条</span>
                  <span>本月线索 {acc.monthly_leads}条</span>
                </div>
                {acc.latest_review_summary && (
                  <p className="text-xs text-blue-600 mt-2 bg-blue-50 p-2 rounded">{acc.latest_review_summary}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <EmptyState title="暂无账号" description="点击右上角新增账号" />
      )}
    </AppLayout>
  );
}
