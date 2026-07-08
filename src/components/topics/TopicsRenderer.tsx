'use client';
import React, { useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import AiResultCard from '@/components/ui/AiResultCard';
import TopicFilters from '@/components/topics/TopicFilters';
import TopicTable from '@/components/topics/TopicTable';
import TopicDrawer from '@/components/topics/TopicDrawer';
import { MOCK_ACCOUNTS, MOCK_KNOWLEDGE } from '@/lib/constants/mock-data';
import {
  TOPIC_CONTENT_TYPES, TOPIC_SOURCE_OPTIONS, TOPIC_STATUSES_NEW,
  TOPIC_PRIORITIES_NEW, TOPIC_PLATFORMS, CONVERSION_GOALS, SHOOTING_METHODS,
  TOPIC_GENERATE_TYPES
} from '@/lib/constants';
import { getStoredData, STORAGE_KEYS } from '@/lib/storage';
import type { Topic } from '@/lib/constants/types';

interface TopicsRendererProps {
  topics: Topic[]; setTopics: (f: any) => void;
  detailTopic: Topic | null; setDetailTopic: (t: Topic | null) => void;
  selectedIds: Set<string>; setSelectedIds: (s: any) => void;
  editingTopic: Partial<Topic>; setEditingTopic: (t: any) => void;
  filtered: Topic[];
  showAiResult: any; setShowAiResult: (r: any) => void;
  showAiWizard: boolean; setShowAiWizard: (s: boolean) => void;
  aiResult: any; setAiResult: (r: any) => void;
  wizardData: Record<string, any>; setWizardData: (d: any) => void;
  activeTab: string; setActiveTab: (t: any) => void;
  filters: Record<string, string>; setFilters: (f: any) => void;
  getAccountName: (id: string | null) => string;
  getContentTypeLabel: (t: string) => string;
  handleConvertToScript: (t: Topic) => void;
  handleGenerateFromWizard: () => void;
  handleBatchGenerate: () => void;
  handleBatchChangeStatus: (s: string) => void;
  handleBatchAddWeek: () => void;
  handleBatchArchive: () => void;
  handleBatchDelete: () => void;
  handleBatchAssign: () => void;
  handleSaveTopic: () => void;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  search: string; setSearch: (q: string) => void;
  wizardStep: number; setWizardStep: (s: any) => void;
  showForm: boolean; setShowForm: (v: boolean) => void;
}

const STATS = [
  { key: 'all', label: '全部选题', color: 'blue' },
  { key: '待审核', label: '待审核', color: 'yellow' },
  { key: '已审核', label: '已审核', color: 'green' },
  { key: '已发布', label: '已发布', color: 'green' },
  { key: '待复盘', label: '待复盘', color: 'yellow' },
  { key: '可复制', label: '可复制', color: 'purple' },
];

const STAT_COLORS: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  gray: 'bg-gray-50 text-gray-600 border-gray-200',
};

export default function TopicsRenderer(p: TopicsRendererProps) {
  const liveScripts = useMemo(() => getStoredData(STORAGE_KEYS.SCRIPTS, []), []);
  const statCounts: Record<string, number> = {
    all: p.filtered.length,
    '待审核': p.filtered.filter(t => t.status === '待审核').length,
    '已审核': p.filtered.filter(t => t.status === '已审核').length,
    '已发布': p.filtered.filter(t => t.status === '已发布').length,
    '待复盘': p.filtered.filter(t => t.status === '待复盘').length,
    '可复制': p.filtered.filter(t => t.status === '可复制').length,
  };

  return (
    <AppLayout>
      <PageHeader
        title="选题策划工作台"
        description={`共 ${p.topics.length} 个选题 · 本周 ${p.topics.filter(t => t.is_this_week).length} 个待拍`}
        actions={
          <div className="flex gap-2">
            <div className="relative group">
              <button className="btn-primary" onClick={() => p.setShowAiWizard(true)}>AI生成选题 ▾</button>
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 hidden group-hover:block">
                {TOPIC_GENERATE_TYPES.map(t => (
                  <button key={t.value} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => { p.setShowAiWizard(true); p.setWizardData({ ...p.wizardData, generateType: t.value }); }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn-secondary" onClick={() => { p.setEditingTopic({}); p.setShowForm(true); }}>新增选题</button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-6 gap-2 mb-3">
        {STATS.map(s => {
          const count = statCounts[s.key] || 0;
          return (
            <div key={s.key}
              className={'card p-2 text-center border cursor-pointer hover:shadow-sm ' + (STAT_COLORS[s.color] || 'bg-white')}
              onClick={() => {
                if (s.key === 'all') p.setFilters({ ...p.filters, status: '' });
                else p.setFilters({ ...p.filters, status: s.key });
              }}
            >
              <p className="text-lg font-bold">{count}</p>
              <p className="text-xs truncate">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* AI Result Banner */}
      {p.showAiResult && (
        <AiResultCard title="AI结果" content={p.showAiResult} onDismiss={() => p.setShowAiResult(null)}
          onApply={typeof p.showAiResult === 'object' && Object.keys(p.showAiResult).includes('操作成功') ? undefined : () => {}} />
      )}

      {/* Tab: All / This Week */}
      <div className="flex gap-4 mb-2 border-b border-gray-200">
        {[
          { key: 'all', label: `全部选题 (${p.topics.length})` },
          { key: 'week', label: `本周选题池 (${p.topics.filter(t => t.is_this_week).length})` },
        ].map(tab => (
          <button key={tab.key}
            className={'pb-2 px-1 text-sm font-medium border-b-2 transition-colors ' + (p.activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700')}
            onClick={() => { p.setActiveTab(tab.key as any); p.setSelectedIds(new Set()); }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + Filters */}
      <TopicFilters
        filters={p.filters}
        setFilters={p.setFilters}
        search={p.search}
        setSearch={p.setSearch}
      />

      {/* Batch Operations */}
      {p.selectedIds.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm text-blue-700 font-medium">已选 {p.selectedIds.size} 项</span>
          <button className="btn-primary btn-sm" onClick={p.handleBatchGenerate}>批量生成脚本</button>
          <button className="btn-secondary btn-sm" onClick={p.handleBatchAddWeek}>加入本周计划</button>
          <select className="select-field text-xs w-auto" onChange={e => { if (e.target.value) p.handleBatchChangeStatus(e.target.value); }} defaultValue="">
            <option value="">批量改状态</option>
            {TOPIC_STATUSES_NEW.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button className="btn-secondary btn-sm" onClick={p.handleBatchAssign}>批量分配</button>
          <button className="btn-secondary btn-sm" onClick={p.handleBatchArchive}>批量归档</button>
          <button className="btn-danger btn-sm" onClick={p.handleBatchDelete}>批量删除</button>
        </div>
      )}

      {/* Topic Table */}
      <div className="card p-0 overflow-hidden">
        <TopicTable
          topics={p.filtered}
          selectedIds={p.selectedIds}
          onToggleSelect={p.toggleSelect}
          onToggleSelectAll={p.toggleSelectAll}
          onRowClick={t => p.setDetailTopic(t)}
        />
      </div>

      {/* Quick Add Form */}
      {p.showForm && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={() => p.setShowForm(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">{p.editingTopic.id ? '编辑选题' : '新增选题'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">标题 *</label>
                <input className="input-field" value={p.editingTopic.title || ''} onChange={e => p.setEditingTopic({ ...p.editingTopic, title: e.target.value })} placeholder="选题标题" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">所属账号</label>
                <select className="select-field" value={p.editingTopic.account_id || 'a1'} onChange={e => p.setEditingTopic({ ...p.editingTopic, account_id: e.target.value })}>
                  {MOCK_ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">内容类型</label>
                <select className="select-field" value={p.editingTopic.content_type || '工艺科普'} onChange={e => p.setEditingTopic({ ...p.editingTopic, content_type: e.target.value })}>
                  {TOPIC_CONTENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">平台</label>
                <select className="select-field" value={p.editingTopic.platform || '视频号'} onChange={e => p.setEditingTopic({ ...p.editingTopic, platform: e.target.value })}>
                  {TOPIC_PLATFORMS.map(pf => <option key={pf.value} value={pf.value}>{pf.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">选题来源</label>
                <select className="select-field" value={p.editingTopic.topic_source || '手动新增'} onChange={e => p.setEditingTopic({ ...p.editingTopic, topic_source: e.target.value })}>
                  {TOPIC_SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">优先级</label>
                <select className="select-field" value={p.editingTopic.priority || '中'} onChange={e => p.setEditingTopic({ ...p.editingTopic, priority: e.target.value })}>
                  {TOPIC_PRIORITIES_NEW.map(pr => <option key={pr.value} value={pr.value}>{pr.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">转化目标</label>
                <select className="select-field" value={p.editingTopic.conversion_goal || ''} onChange={e => p.setEditingTopic({ ...p.editingTopic, conversion_goal: e.target.value })}>
                  <option value="">选择</option>
                  {CONVERSION_GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">客户痛点</label>
                <input className="input-field" value={p.editingTopic.customer_pain || ''} onChange={e => p.setEditingTopic({ ...p.editingTopic, customer_pain: e.target.value })} placeholder="客户遇到了什么问题？" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">目标客户</label>
                <input className="input-field" value={p.editingTopic.target_audience || ''} onChange={e => p.setEditingTopic({ ...p.editingTopic, target_audience: e.target.value })} placeholder="目标客户群体描述" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">产品/工艺</label>
                <input className="input-field" value={p.editingTopic.product_or_process || ''} onChange={e => p.setEditingTopic({ ...p.editingTopic, product_or_process: e.target.value })} placeholder="涉及的产品或工艺" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">备注</label>
                <textarea className="input-field" rows={2} value={p.editingTopic.notes || ''} onChange={e => p.setEditingTopic({ ...p.editingTopic, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn-primary" onClick={p.handleSaveTopic}>保存</button>
              <button className="btn-secondary" onClick={() => p.setShowForm(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Generation Wizard */}
      {p.showAiWizard && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => p.setShowAiWizard(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-2">AI生成选题向导</h3>
            <div className="flex gap-1 mb-4">
              {[1,2,3,4,5].map(s => (
                <div key={s} className={'flex-1 h-2 rounded-full ' + (s <= p.wizardStep ? 'bg-blue-500' : 'bg-gray-200')} />
              ))}
            </div>
            <p className="text-xs text-gray-400 mb-4">第 {p.wizardStep}/5 步</p>

            {p.wizardStep === 1 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">选择账号和平台</p>
                <select className="select-field" value={p.wizardData.account_id || 'a1'} onChange={e => p.setWizardData({ ...p.wizardData, account_id: e.target.value })}>
                  {MOCK_ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select className="select-field" value={p.wizardData.platform || '视频号'} onChange={e => p.setWizardData({ ...p.wizardData, platform: e.target.value })}>
                  {TOPIC_PLATFORMS.map(pf => <option key={pf.value} value={pf.value}>{pf.label}</option>)}
                </select>
              </div>
            )}
            {p.wizardStep === 2 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">选择选题来源</p>
                <select className="select-field" value={p.wizardData.topic_source || '客户私信'} onChange={e => p.setWizardData({ ...p.wizardData, topic_source: e.target.value })}>
                  {TOPIC_SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <textarea className="input-field" rows={3} placeholder="补充更多背景信息..." value={p.wizardData.background || ''} onChange={e => p.setWizardData({ ...p.wizardData, background: e.target.value })} />
              </div>
            )}
            {p.wizardStep === 3 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">填写内容策划信息</p>
                <input className="input-field" placeholder="目标客户" value={p.wizardData.target_customer || ''} onChange={e => p.setWizardData({ ...p.wizardData, target_customer: e.target.value })} />
                <input className="input-field" placeholder="客户痛点" value={p.wizardData.customer_pain || ''} onChange={e => p.setWizardData({ ...p.wizardData, customer_pain: e.target.value })} />
                <input className="input-field" placeholder="产品/工艺" value={p.wizardData.product_process || ''} onChange={e => p.setWizardData({ ...p.wizardData, product_process: e.target.value })} />
                <input className="input-field" placeholder="材料" value={p.wizardData.material || ''} onChange={e => p.setWizardData({ ...p.wizardData, material: e.target.value })} />
              </div>
            )}
            {p.wizardStep === 4 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">选择内容形式</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-500">内容类型</label>
                    <select className="select-field" value={p.wizardData.content_type || '工艺科普'} onChange={e => p.setWizardData({ ...p.wizardData, content_type: e.target.value })}>
                      {TOPIC_CONTENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs text-gray-500">转化目标</label>
                    <select className="select-field" value={p.wizardData.conversion_goal || ''} onChange={e => p.setWizardData({ ...p.wizardData, conversion_goal: e.target.value })}>
                      <option value="">选择</option>
                      {CONVERSION_GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs text-gray-500">出镜方式</label>
                    <select className="select-field" value={p.wizardData.shooting_method || ''} onChange={e => p.setWizardData({ ...p.wizardData, shooting_method: e.target.value })}>
                      <option value="">选择</option>
                      {SHOOTING_METHODS.map(sm => <option key={sm.value} value={sm.value}>{sm.label}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs text-gray-500">视频时长</label>
                    <select className="select-field" value={p.wizardData.video_length || '45-60秒'} onChange={e => p.setWizardData({ ...p.wizardData, video_length: e.target.value })}>
                      <option value="15-30秒">15-30秒</option>
                      <option value="30-45秒">30-45秒</option>
                      <option value="45-60秒">45-60秒</option>
                      <option value="60-90秒">60-90秒</option>
                      <option value="90秒+">90秒+</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            {p.wizardStep === 5 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">选择参考知识卡和风险规则</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {MOCK_KNOWLEDGE.map(k => (
                    <label key={k.id} className="flex items-center gap-2 text-sm text-gray-600">
                      <input type="checkbox" className="w-4 h-4" defaultChecked />
                      <span>{k.title}</span>
                    </label>
                  ))}
                </div>
                <textarea className="input-field" rows={3} placeholder="额外的风险规则补充..." value={p.wizardData.risk_notes || ''} onChange={e => p.setWizardData({ ...p.wizardData, risk_notes: e.target.value })} />
              </div>
            )}

            <div className="flex justify-between mt-6">
              <button className="btn-secondary" onClick={() => p.wizardStep > 1 ? p.setWizardStep((s: number) => s - 1) : p.setShowAiWizard(false)}>
                {p.wizardStep === 1 ? '取消' : '上一步'}
              </button>
              {p.wizardStep < 5 ? (
                <button className="btn-primary" onClick={() => p.setWizardStep((s: number) => s + 1)}>下一步</button>
              ) : (
                <button className="btn-primary" onClick={p.handleGenerateFromWizard}>生成选题</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail Drawer — answers "why, for whom, what happened next" */}
      <TopicDrawer
        topic={p.detailTopic}
        onClose={() => p.setDetailTopic(null)}
        onConvertToScript={p.handleConvertToScript}
        onUpdateStatus={(topicId, newStatus) => {
          p.setTopics((prev: any[]) => prev.map(t => t.id === topicId ? { ...t, status: newStatus } : t));
          // Update the detail view
          p.setDetailTopic((prev: any) => prev?.id === topicId ? { ...prev, status: newStatus } : prev);
        }}
        accounts={MOCK_ACCOUNTS}
        scripts={liveScripts}
      />
    </AppLayout>
  );
}
