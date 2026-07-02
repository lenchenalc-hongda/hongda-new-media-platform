'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import AiResultCard from '@/components/ui/AiResultCard';
import EmptyState from '@/components/ui/EmptyState';
import { MOCK_LEADS, MOCK_ACCOUNTS } from '@/lib/constants/mock-data';
import { getPlatformLabel, getRequirementTypeLabel, getLeadGradeLabel, truncate, formatDate } from '@/lib/utils';
import { PLATFORMS, LEAD_STATUSES, LEAD_GRADES, REQUIREMENT_TYPES } from '@/lib/constants';
import type { Lead } from '@/lib/constants/types';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>(MOCK_LEADS);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editLead, setEditLead] = useState<Partial<Lead>>({});

  const getAccountName = (id: string | null) => MOCK_ACCOUNTS.find(a => a.id === id)?.name || '-';

  const filtered = leads.filter(l => {
    if (search && !l.customer_name?.includes(search) && !l.company?.includes(search)) return false;
    if (filters.source_platform && l.source_platform !== filters.source_platform) return false;
    if (filters.lead_grade && l.lead_grade !== filters.lead_grade) return false;
    if (filters.status && l.status !== filters.status) return false;
    return true;
  });

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
        description={`共 ${leads.length} 条线索`}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => alert('CSV导入功能将在后续版本实现')}>CSV导入</button>
            <button className="btn-primary" onClick={() => { setEditLead({}); setShowForm(true); }}>新增线索</button>
          </div>
        }
      />

      {aiResult && <AiResultCard title="AI线索评分" content={aiResult} onDismiss={() => setAiResult(null)} />}

      {showForm && (
        <div className="card mb-4 p-4 bg-blue-50 border-blue-200">
          <h3 className="font-semibold text-gray-800 mb-3">新增线索</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">客户名称 *</label>
              <input className="input-field" value={editLead.customer_name || ''} onChange={e => setEditLead({...editLead, customer_name: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">公司名称</label>
              <input className="input-field" value={editLead.company || ''} onChange={e => setEditLead({...editLead, company: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">产品需求</label>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="flex flex-wrap gap-2 mb-3">
            <select className="select-field w-[120px]" value={filters.status || ''} onChange={e => setFilters({...filters, status: e.target.value})}>
              <option value="">全部状态</option>
              {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select className="select-field w-[120px]" value={filters.lead_grade || ''} onChange={e => setFilters({...filters, lead_grade: e.target.value})}>
              <option value="">全部等级</option>
              {LEAD_GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
          <div className="card p-0 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {filtered.map(l => (
                <button key={l.id} onClick={() => { setSelectedLead(l); setAiResult(null); }} className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${selectedLead?.id === l.id ? 'bg-blue-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">{l.customer_name || '未知'}</p>
                    {l.lead_grade && <span className={`badge-${l.lead_grade === 'A' ? 'green' : l.lead_grade === 'B' ? 'blue' : l.lead_grade === 'C' ? 'yellow' : 'gray'}`}>{l.lead_grade}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{l.company || ''} · {l.product || ''}</p>
                  <div className="flex gap-2 mt-1">
                    <StatusBadge status={l.status} />
                    {l.is_urgent && <span className="badge-red">紧急</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedLead ? (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-800">{selectedLead.customer_name || '未知客户'}</h3>
                  <p className="text-xs text-gray-400">{selectedLead.company} · {getPlatformLabel(selectedLead.source_platform || '')}</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary btn-sm" onClick={handleScore}>AI评分</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-400">来源账号：</span>{getAccountName(selectedLead.source_account_id)}</div>
                <div><span className="text-gray-400">来源视频：</span>{selectedLead.source_post_id || '-'}</div>
                <div><span className="text-gray-400">产品：</span>{selectedLead.product || '-'}</div>
                <div><span className="text-gray-400">材质：</span>{selectedLead.material || '-'}</div>
                <div><span className="text-gray-400">数量：</span>{selectedLead.quantity || '-'}</div>
                <div><span className="text-gray-400">需求类型：</span>{selectedLead.requirement_type ? getRequirementTypeLabel(selectedLead.requirement_type) : '-'}</div>
                <div><span className="text-gray-400">微信：</span>{selectedLead.wechat || '-'}</div>
                <div><span className="text-gray-400">电话：</span>{selectedLead.phone || '-'}</div>
                <div className="col-span-2"><span className="text-gray-400">客户痛点：</span>{selectedLead.pain_points || '-'}</div>
                <div className="col-span-2"><span className="text-gray-400">线索评分：</span>
                  <span className={`font-bold ${selectedLead.lead_score >= 70 ? 'text-green-600' : selectedLead.lead_score >= 40 ? 'text-yellow-600' : 'text-gray-500'}`}>
                    {selectedLead.lead_score}分 · {getLeadGradeLabel(selectedLead.lead_grade || '')}
                  </span>
                </div>
                <div className="col-span-2"><span className="text-gray-400">跟进状态：</span><StatusBadge status={selectedLead.status} /></div>
                <div className="col-span-2"><span className="text-gray-400">下一步动作：</span>{selectedLead.next_action || '-'}</div>
                <div className="col-span-2"><span className="text-gray-400">备注：</span>{selectedLead.notes || '-'}</div>
              </div>
            </div>
          ) : (
            <EmptyState title="请选择一个线索" description="从左侧列表选择查看详情" />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
