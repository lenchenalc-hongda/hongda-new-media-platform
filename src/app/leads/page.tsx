'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import AiResultCard from '@/components/ui/AiResultCard';
import EmptyState from '@/components/ui/EmptyState';
import { MOCK_LEADS, MOCK_ACCOUNTS } from '@/lib/constants/mock-data';
import { usePersistentState, STORAGE_KEYS } from '@/lib/storage';
import { getPlatformLabel, getRequirementTypeLabel, getLeadGradeLabel, truncate, formatDate } from '@/lib/utils';
import { PLATFORMS, LEAD_STATUSES, LEAD_GRADES, REQUIREMENT_TYPES, SOURCE_BRANCHES } from '@/lib/constants';
import type { Lead } from '@/lib/constants/types';

// 月份列表
const MONTHS = [
  { value: '', label: '全部月份' },
  { value: '2026-07', label: '2026年7月' },
  { value: '2026-06', label: '2026年6月' },
  { value: '2026-05', label: '2026年5月' },
  { value: '2026-04', label: '2026年4月' },
];

// 承接分支颜色映射
const BRANCH_COLORS: Record<string, string> = {
  '汕头宏达': 'bg-red-600 text-white px-2 py-0.5 rounded text-xs font-medium',
  '东莞宏达': 'bg-gray-900 text-white px-2 py-0.5 rounded text-xs font-medium',
};

export default function LeadsPage() {
  const [leads, setLeads] = usePersistentState<Lead>(STORAGE_KEYS.LEADS, MOCK_LEADS);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editLead, setEditLead] = useState<Partial<Lead>>({});

  const getAccountName = (id: string | null) => MOCK_ACCOUNTS.find(a => a.id === id)?.name || '-';

  const filtered = leads.filter(l => {
    if (search) {
      const q = search.toLowerCase();
      const match = [l.customer_name, l.company, l.product, l.notes]
        .filter(Boolean).some(v => v!.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (filters.source_branch && l.source_branch !== filters.source_branch) return false;
    if (filters.month && l.month !== filters.month) return false;
    if (filters.requirement_type && l.requirement_type !== filters.requirement_type) return false;
    if (filters.status && l.status !== filters.status) return false;
    if (filters.lead_grade && l.lead_grade !== filters.lead_grade) return false;
    return true;
  });

  // 统计
  const shantouCount = filtered.filter(l => l.source_branch === '汕头宏达').length;
  const dongguanCount = filtered.filter(l => l.source_branch === '东莞宏达').length;
  const urgentCount = filtered.filter(l => l.is_urgent).length;

  const handleScore = async () => {
    if (!selectedLead) return;
    const res = await fetch('/api/ai/lead-score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead: selectedLead }) });
    const data = await res.json();
    setAiResult(data);
  };

  const handleSaveLead = () => {
    if (editLead.customer_name) {
      const newLead: Lead = {
        id: `l${Date.now()}`, org_id: 'org_001',
        source_platform: editLead.source_platform || null,
        source_account_id: editLead.source_account_id || null,
        source_post_id: null,
        customer_name: editLead.customer_name || '',
        wechat: null, phone: null, company: editLead.company || null,
        region: null, product: editLead.product || null, material: null,
        quantity: editLead.quantity || null, requirement_type: editLead.requirement_type || null,
        product_images: [], artwork_requirement: null, test_requirement: null,
        is_urgent: false, current_process: null, pain_points: null,
        lead_score: 0, lead_grade: null, status: 'new', assigned_to: null,
        next_action: null, next_follow_up_date: null, notes: null,
        source_branch: editLead.source_branch || null,
        month: editLead.month || null,
        created_at: new Date().toISOString(),
      };
      setLeads(prev => [newLead, ...prev]);
      setShowForm(false);
      setEditLead({});
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="线索中心"
        description={"共 " + leads.length + " 条线索 · 汕头 " + leads.filter(l => l.source_branch === '汕头宏达').length + " 条 · 东莞 " + leads.filter(l => l.source_branch === '东莞宏达').length + " 条"}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => alert('CSV导入功能将在后续版本实现')}>CSV导入</button>
            <button className="btn-primary" onClick={() => { setEditLead({}); setShowForm(true); }}>新增线索</button>
          </div>
        }
      />

      {aiResult && <AiResultCard title="AI线索评分" content={aiResult} onDismiss={() => setAiResult(null)} />}

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <div className="card p-3 text-center border border-blue-200 bg-blue-50">
          <p className="text-lg font-bold text-blue-700">{filtered.length}</p>
          <p className="text-xs text-blue-600">全部线索</p>
        </div>
        <div className="card p-3 text-center border border-red-200 bg-red-50">
          <p className="text-lg font-bold text-red-700">{shantouCount}</p>
          <p className="text-xs text-red-600">汕头宏达</p>
        </div>
        <div className="card p-3 text-center border border-gray-300 bg-gray-50">
          <p className="text-lg font-bold text-gray-800">{dongguanCount}</p>
          <p className="text-xs text-gray-600">东莞宏达</p>
        </div>
        <div className="card p-3 text-center border border-yellow-200 bg-yellow-50">
          <p className="text-lg font-bold text-yellow-700">{urgentCount}</p>
          <p className="text-xs text-yellow-600">紧急线索</p>
        </div>
        <div className="card p-3 text-center border border-green-200 bg-green-50">
          <p className="text-lg font-bold text-green-700">{filtered.filter(l => l.lead_grade === 'A').length}</p>
          <p className="text-xs text-green-600">A级线索</p>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="card mb-4 p-4 bg-blue-50 border-blue-200">
          <h3 className="font-semibold text-gray-800 mb-3">新增线索</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">客户名称 *</label>
              <input className="input-field" value={editLead.customer_name || ''} onChange={e => setEditLead({...editLead, customer_name: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">公司名称</label>
              <input className="input-field" value={editLead.company || ''} onChange={e => setEditLead({...editLead, company: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">月份</label>
              <select className="select-field" value={editLead.month || ''} onChange={e => setEditLead({...editLead, month: e.target.value})}>
                <option value="">请选择</option>
                {MONTHS.slice(1).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">产品</label>
              <input className="input-field" value={editLead.product || ''} onChange={e => setEditLead({...editLead, product: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">数量</label>
              <input className="input-field" value={editLead.quantity || ''} onChange={e => setEditLead({...editLead, quantity: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">需求类型</label>
              <select className="select-field" value={editLead.requirement_type || ''} onChange={e => setEditLead({...editLead, requirement_type: e.target.value as any})}>
                <option value="">请选择</option>
                {REQUIREMENT_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">承接分支</label>
              <select className="select-field" value={editLead.source_branch || ''} onChange={e => setEditLead({...editLead, source_branch: e.target.value})}>
                <option value="">请选择</option>
                {SOURCE_BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">来源平台</label>
              <select className="select-field" value={editLead.source_platform || ''} onChange={e => setEditLead({...editLead, source_platform: e.target.value as any})}>
                <option value="">请选择</option>
                {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn-primary btn-sm" onClick={handleSaveLead}>保存</button>
            <button className="btn-secondary btn-sm" onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <input className="input-field w-48" placeholder="搜索客户名 / 公司 / 产品..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="select-field w-[130px]" value={filters.source_branch || ''} onChange={e => setFilters({...filters, source_branch: e.target.value})}>
          <option value="">全部分支</option>
          {SOURCE_BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        <select className="select-field w-[130px]" value={filters.month || ''} onChange={e => setFilters({...filters, month: e.target.value})}>
          {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select className="select-field w-[120px]" value={filters.requirement_type || ''} onChange={e => setFilters({...filters, requirement_type: e.target.value})}>
          <option value="">全部需求</option>
          {REQUIREMENT_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select className="select-field w-[120px]" value={filters.status || ''} onChange={e => setFilters({...filters, status: e.target.value})}>
          <option value="">全部状态</option>
          {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="select-field w-[100px]" value={filters.lead_grade || ''} onChange={e => setFilters({...filters, lead_grade: e.target.value})}>
          <option value="">全部等级</option>
          {LEAD_GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="table-header">月份</th>
                <th className="table-header">客户名</th>
                <th className="table-header">公司名称</th>
                <th className="table-header">产品</th>
                <th className="table-header">数量</th>
                <th className="table-header">需求类型</th>
                <th className="table-header">承接分支</th>
                <th className="table-header">等级</th>
                <th className="table-header">状态</th>
                <th className="table-header">当事人</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id}
                  onClick={() => { setSelectedLead(l); setAiResult(null); }}
                  className={'border-b border-gray-100 hover:bg-blue-50 cursor-pointer text-sm ' + (selectedLead?.id === l.id ? 'bg-blue-50' : '')}>
                  <td className="table-cell">{l.month || '-'}</td>
                  <td className="table-cell font-medium text-gray-800">{l.customer_name || '-'}</td>
                  <td className="table-cell text-gray-600">{l.company || '-'}</td>
                  <td className="table-cell text-gray-600">{l.product || '-'}</td>
                  <td className="table-cell text-gray-600">{l.quantity || '-'}</td>
                  <td className="table-cell">{l.requirement_type ? <StatusBadge status={l.requirement_type} /> : '-'}</td>
                  <td className="table-cell">
                    <span className={BRANCH_COLORS[l.source_branch || ''] || 'text-gray-500'}>
                      {l.source_branch || '-'}
                    </span>
                  </td>
                  <td className="table-cell">
                    {l.lead_grade && <span className={'badge-' + (l.lead_grade === 'A' ? 'green' : l.lead_grade === 'B' ? 'blue' : l.lead_grade === 'C' ? 'yellow' : 'gray')}>{l.lead_grade}</span>}
                  </td>
                  <td className="table-cell"><StatusBadge status={l.status} /></td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      {l.is_urgent && <span className="text-red-500 text-xs font-bold">紧</span>}
                      <span className="text-gray-400 text-xs">{l.assigned_to || '-'}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState title="暂无匹配线索" description="调整筛选条件或新增线索" />}
      </div>

      {/* Detail Panel */}
      {selectedLead && (
        <div className="card mt-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="font-semibold text-gray-800">{selectedLead.customer_name || '未知客户'}</h3>
                <p className="text-xs text-gray-400">{selectedLead.company} {selectedLead.source_branch ? '· ' : ''}{selectedLead.source_branch || ''}</p>
              </div>
              {selectedLead.source_branch && (
                <span className={BRANCH_COLORS[selectedLead.source_branch] || ''}>{selectedLead.source_branch}</span>
              )}
              <span className="text-xs text-gray-400">{selectedLead.month || ''}</span>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary btn-sm" onClick={handleScore}>AI评分</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-gray-400">客户名：</span>{selectedLead.customer_name || '-'}</div>
            <div><span className="text-gray-400">公司：</span>{selectedLead.company || '-'}</div>
            <div><span className="text-gray-400">月份：</span>{selectedLead.month || '-'}</div>
            <div><span className="text-gray-400">产品：</span>{selectedLead.product || '-'}</div>
            <div><span className="text-gray-400">材质：</span>{selectedLead.material || '-'}</div>
            <div><span className="text-gray-400">数量：</span>{selectedLead.quantity || '-'}</div>
            <div><span className="text-gray-400">需求类型：</span>{selectedLead.requirement_type ? getRequirementTypeLabel(selectedLead.requirement_type) : '-'}</div>
            <div><span className="text-gray-400">承接分支：</span>
              <span className={BRANCH_COLORS[selectedLead.source_branch || ''] || 'text-gray-500'}>{selectedLead.source_branch || '-'}</span>
            </div>
            <div><span className="text-gray-400">来源平台：</span>{getPlatformLabel(selectedLead.source_platform || '')}</div>
            <div><span className="text-gray-400">微信：</span>{selectedLead.wechat || '-'}</div>
            <div><span className="text-gray-400">电话：</span>{selectedLead.phone || '-'}</div>
            <div><span className="text-gray-400">地区：</span>{selectedLead.region || '-'}</div>
            <div className="col-span-3"><span className="text-gray-400">客户痛点：</span>{selectedLead.pain_points || '-'}</div>
            <div className="col-span-3"><span className="text-gray-400">工艺要求：</span>{selectedLead.artwork_requirement || '-'}</div>
            <div className="col-span-3"><span className="text-gray-400">测试要求：</span>{selectedLead.test_requirement || '-'}</div>
            <div className="col-span-3"><span className="text-gray-400">线索评分：</span>
              <span className={'font-bold ' + (selectedLead.lead_score >= 70 ? 'text-green-600' : selectedLead.lead_score >= 40 ? 'text-yellow-600' : 'text-gray-500')}>
                {selectedLead.lead_score}分 · {getLeadGradeLabel(selectedLead.lead_grade || '')}
              </span>
            </div>
            <div><span className="text-gray-400">跟进状态：</span><StatusBadge status={selectedLead.status} /></div>
            <div><span className="text-gray-400">当事人：</span>{selectedLead.assigned_to || '-'}</div>
            <div><span className="text-gray-400">下一步动作：</span>{selectedLead.next_action || '-'}</div>
            <div className="col-span-3"><span className="text-gray-400">备注：</span>{selectedLead.notes || '-'}</div>
          </div>
        </div>
      )}
      {!selectedLead && filtered.length > 0 && (
        <div className="mt-4"><EmptyState title="点击行选择线索" description="从上方表格中点击查看详情" /></div>
      )}
    </AppLayout>
  );
}
