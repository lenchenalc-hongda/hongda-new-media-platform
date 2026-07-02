'use client';
import React from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import FilterBar from '@/components/ui/FilterBar';
import EmptyState from '@/components/ui/EmptyState';
import AiResultCard from '@/components/ui/AiResultCard';
import { MOCK_ACCOUNTS, MOCK_KNOWLEDGE } from '@/lib/constants/mock-data';
import { ALL_MOCK_SCRIPTS } from '@/lib/constants/mock-data';
import {
  TOPIC_CONTENT_TYPES, TOPIC_SOURCE_OPTIONS, TOPIC_STATUSES_NEW,
  TOPIC_SCRIPT_STATUSES, TOPIC_PRIORITIES_NEW, TOPIC_PLATFORMS,
  CONVERSION_GOALS, SHOOTING_METHODS, TOPIC_GENERATE_TYPES
} from '@/lib/constants';
import {
  getContentTypeLabel, truncate, formatDate, formatDateTime,
  getPlatformLabel, getStatusBadgeClass, getStatusLabel
} from '@/lib/utils';
import type { Topic } from '@/lib/constants/types';
import { generateShortVideoScript, checkScriptRisk } from '@/lib/ai/script-pipeline';
import ScriptWizard from '@/components/scripts/ScriptWizard';
import TopicDetailDrawer from '@/components/topics/TopicDetailDrawer';

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
  wizardStep: number;
  setWizardStep: (s: any) => void;
  showForm: boolean; setShowForm: (v: boolean) => void;
}

const QUALITY_DIMENSIONS_CN = [
  { key: 'customer_pain', label: '客户痛点明确度', max: 20 },
  { key: 'account_match', label: '账号匹配度', max: 15 },
  { key: 'business_value', label: '业务转化价值', max: 20 },
  { key: 'new_media', label: '新媒体传播性', max: 15 },
  { key: 'shootable', label: '拍摄可执行性', max: 10 },
  { key: 'knowledge', label: '知识库支撑度', max: 10 },
  { key: 'risk', label: '风险可控性', max: 10 },
]


const STATS = [
  { key: 'all', label: '全部选题', icon: '📋', color: 'blue' },
  { key: '待审核', label: '待审核', icon: '👀', color: 'yellow' },
  { key: '已审核', label: '已审核', icon: '✅', color: 'green' },
  { key: '已发布', label: '已发布', icon: '🚀', color: 'green' },
  { key: '待复盘', label: '待复盘', icon: '📊', color: 'yellow' },
  { key: '可复制', label: '可复制', icon: '📦', color: 'purple' },
];

const filterConfig = [
  { key: 'account_id', label: '按账号', options: MOCK_ACCOUNTS.map(a => ({ value: a.id, label: a.name })) },
  { key: 'platform', label: '按平台', options: TOPIC_PLATFORMS },
  { key: 'content_type', label: '按内容类型', options: TOPIC_CONTENT_TYPES },
  { key: 'topic_source', label: '按选题来源', options: TOPIC_SOURCE_OPTIONS },
  { key: 'conversion_goal', label: '按转化目标', options: CONVERSION_GOALS },
  { key: 'priority', label: '按优先级', options: TOPIC_PRIORITIES_NEW },
  { key: 'status', label: '按状态', options: TOPIC_STATUSES_NEW },
  { key: 'script_status', label: '按脚本状态', options: TOPIC_SCRIPT_STATUSES },
  { key: 'owner_id', label: '按负责人', options: MOCK_ACCOUNTS.map(a => ({ value: a.id, label: a.name.split('-')[0] })) },
];

export default function TopicsRenderer(p: TopicsRendererProps) {
  const { topics, setTopics, detailTopic, setDetailTopic,
    selectedIds, setSelectedIds, editingTopic, setEditingTopic,
    filtered, showAiResult, setShowAiResult, showAiWizard, setShowAiWizard,
    aiResult, setAiResult, wizardData, setWizardData,
    activeTab, setActiveTab, filters, setFilters,
    getAccountName, getContentTypeLabel, handleConvertToScript,
    handleGenerateFromWizard, handleBatchGenerate, handleBatchChangeStatus,
    handleBatchAddWeek, handleBatchArchive, handleBatchDelete,
    handleBatchAssign, handleSaveTopic, toggleSelect, toggleSelectAll,
    wizardStep, setWizardStep,
    search, setSearch,
    showForm, setShowForm,
  } = p;

  const statCounts: Record<string, number> = {
    all: filtered.length,
    '待审核': filtered.filter(t => t.status === '待审核').length,
    '已审核': filtered.filter(t => t.status === '已审核').length,
    '已发布': filtered.filter(t => t.status === '已发布').length,
    '待复盘': filtered.filter(t => t.status === '待复盘').length,
    '可复制': filtered.filter(t => t.status === '可复制').length,
  };

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0;
  const getAccountLabel = (id: string | null) => MOCK_ACCOUNTS.find(a => a.id === id)?.name?.split('-')[0] || '-';

  return (
    <AppLayout>
      <PageHeader
        title="选题策划工作台"
        description={`共 ${topics.length} 个选题 · 本周 ${topics.filter(t => t.is_this_week).length} 个待拍`}
        actions={
          <div className="flex gap-2">
            <div className="relative group">
              <button className="btn-primary" onClick={() => setShowAiWizard(true)}>AI生成选题 ▾</button>
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 hidden group-hover:block">
                {TOPIC_GENERATE_TYPES.map(t => (
                  <button key={t.value} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => { setShowAiWizard(true); setWizardData({ ...wizardData, generateType: t.value }); }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn-secondary" onClick={() => { setEditingTopic({}); }}>新增选题</button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-6 gap-2 mb-4">
        {STATS.map(s => {
          const count = (statCounts as any)[s.key] || 0;
          const colors: Record<string, string> = {
            blue: 'bg-blue-50 text-blue-700 border-blue-200',
            gray: 'bg-gray-50 text-gray-600 border-gray-200',
            yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
            green: 'bg-green-50 text-green-700 border-green-200',
            red: 'bg-red-50 text-red-700 border-red-200',
            purple: 'bg-purple-50 text-purple-700 border-purple-200',
          };
          return (
            <div key={s.key} className={`card p-2 text-center border ${colors[s.color] || 'bg-white'} cursor-pointer hover:shadow-sm`}
              onClick={() => {
                setFilters((prev: Record<string, string>) => ({ ...prev, status: s.key === 'all' || s.key === '高优先级' || s.key === '本周建议' ? '' : s.key }));
              }}>
              <p className="text-lg font-bold">{count}</p>
              <p className="text-xs truncate">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* AI Result Banner */}
      {showAiResult && (
        <AiResultCard title="AI结果" content={showAiResult} onDismiss={() => setShowAiResult(null)}
          onApply={typeof showAiResult === 'object' && Object.keys(showAiResult).includes('操作成功') ? undefined : () => {}} />
      )}

      {/* Tab: All / This Week */}
      <div className="flex gap-4 mb-3 border-b border-gray-200">
        {[
          { key: 'all', label: `全部选题 (${topics.length})` },
          { key: 'week', label: `本周选题池 (${topics.filter(t => t.is_this_week).length})` },
        ].map(tab => (
          <button key={tab.key}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => { setActiveTab(tab.key as any); setSelectedIds(new Set()); }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <FilterBar filters={filterConfig} values={filters} onChange={(k, v) => setFilters({ ...filters, [k]: v })}
        searchValue={search} onSearchChange={setSearch}
        searchPlaceholder="搜索标题 / 客户痛点 / 产品 / 工艺 / 材料 / 来源..." />

      {/* Batch Operations */}
      {someSelected && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm text-blue-700 font-medium">已选 {selectedIds.size} 项</span>
          <button className="btn-primary btn-sm" onClick={handleBatchGenerate}>批量生成脚本</button>
          <button className="btn-secondary btn-sm" onClick={handleBatchAddWeek}>加入本周计划</button>
          <select className="select-field text-xs w-auto" onChange={e => { if (e.target.value) handleBatchChangeStatus(e.target.value); }} defaultValue="">
            <option value="">批量改状态</option>
            {TOPIC_STATUSES_NEW.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button className="btn-secondary btn-sm" onClick={handleBatchAssign}>批量分配</button>
          <button className="btn-secondary btn-sm" onClick={handleBatchArchive}>批量归档</button>
          <button className="btn-danger btn-sm" onClick={handleBatchDelete}>批量删除</button>
        </div>
      )}

      {/* Topic Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="table-header w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4" />
                </th>
                <th className="table-header">标题</th>
                <th className="table-header">账号/平台</th>
                <th className="table-header">内容类型</th>
                <th className="table-header">选题来源</th>
                <th className="table-header">产品/工艺</th>
                <th className="table-header">优先级</th>
                <th className="table-header">状态</th>
                <th className="table-header">脚本状态</th>
                <th className="table-header">最后动作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(topic => (
                <tr key={topic.id}
                  className={`border-b border-gray-100 hover:bg-blue-50 cursor-pointer ${selectedIds.has(topic.id) ? 'bg-blue-50' : ''}`}
                  onClick={() => setDetailTopic(topic)}>
                  <td className="table-cell" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(topic.id)} onChange={() => toggleSelect(topic.id)} className="w-4 h-4" />
                  </td>
                  <td className="table-cell">
                    <div>
                      <span className="font-medium text-gray-800">{truncate(topic.title, 35)}</span>
                      <div className="text-xs text-gray-400 mt-0.5">
                        痛点：{topic.customer_pain ? truncate(topic.customer_pain, 20) : '-'} ｜ 工艺：{topic.product_process || '-'}
                      </div>
                    </div>
                  </td>
                  <td className="table-cell text-xs">
                    <div className="font-medium text-gray-700">{getAccountLabel(topic.account_id)}</div>
                    <div className="text-gray-400">{topic.platform || '-'}</div>
                  </td>
                  <td className="table-cell"><StatusBadge status={topic.content_type} /></td>
                  <td className="table-cell text-xs text-gray-500">{topic.topic_source || '-'}</td>
                  <td className="table-cell text-xs text-gray-500">{truncate(topic.product_process || '-', 12)}</td>
                  <td className="table-cell"><StatusBadge status={topic.priority} /></td>
                  <td className="table-cell"><StatusBadge status={topic.status} /></td>
                  <td className="table-cell"><StatusBadge status={topic.script_status || '未生成'} /></td>
                  <td className="table-cell text-xs text-gray-400">{topic.last_action || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState title="暂无匹配选题" description="调整筛选条件或点击新增/AI生成选题" />}
      </div>

      {/* Quick Add Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">{editingTopic.id ? '编辑选题' : '新增选题'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">标题 *</label><input className="input-field" value={editingTopic.title || ''} onChange={e => setEditingTopic({ ...editingTopic, title: e.target.value })} placeholder="选题标题" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">所属账号</label><select className="select-field" value={editingTopic.account_id || 'a1'} onChange={e => setEditingTopic({ ...editingTopic, account_id: e.target.value })}>{MOCK_ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">内容类型</label><select className="select-field" value={editingTopic.content_type || '工艺科普'} onChange={e => setEditingTopic({ ...editingTopic, content_type: e.target.value })}>{TOPIC_CONTENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">平台</label><select className="select-field" value={editingTopic.platform || '视频号'} onChange={e => setEditingTopic({ ...editingTopic, platform: e.target.value })}>{TOPIC_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">选题来源</label><select className="select-field" value={editingTopic.topic_source || '手动新增'} onChange={e => setEditingTopic({ ...editingTopic, topic_source: e.target.value })}>{TOPIC_SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">优先级</label><select className="select-field" value={editingTopic.priority || '中'} onChange={e => setEditingTopic({ ...editingTopic, priority: e.target.value })}>{TOPIC_PRIORITIES_NEW.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">转化目标</label><select className="select-field" value={editingTopic.conversion_goal || ''} onChange={e => setEditingTopic({ ...editingTopic, conversion_goal: e.target.value })}><option value="">选择</option>{CONVERSION_GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
              <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">客户痛点</label><input className="input-field" value={editingTopic.customer_pain || ''} onChange={e => setEditingTopic({ ...editingTopic, customer_pain: e.target.value })} placeholder="客户遇到了什么问题？" /></div>
              <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">目标客户</label><input className="input-field" value={editingTopic.target_audience || ''} onChange={e => setEditingTopic({ ...editingTopic, target_audience: e.target.value })} placeholder="目标客户群体描述" /></div>
              <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">产品/工艺</label><input className="input-field" value={editingTopic.product_or_process || ''} onChange={e => setEditingTopic({ ...editingTopic, product_or_process: e.target.value })} placeholder="涉及的产品或工艺" /></div>
              <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">备注</label><textarea className="input-field" rows={2} value={editingTopic.notes || ''} onChange={e => setEditingTopic({ ...editingTopic, notes: e.target.value })} /></div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn-primary" onClick={handleSaveTopic}>保存</button>
              <button className="btn-secondary" onClick={() => setShowForm(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Generation Wizard */}
      {showAiWizard && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowAiWizard(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-2">AI生成选题向导</h3>
            <div className="flex gap-1 mb-4">
              {[1,2,3,4,5].map(s => (
                <div key={s} className={`flex-1 h-2 rounded-full ${s <= wizardStep ? 'bg-blue-500' : 'bg-gray-200'}`} />
              ))}
            </div>
            <p className="text-xs text-gray-400 mb-4">第 {wizardStep}/5 步</p>

            {wizardStep === 1 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">选择账号和平台</p>
                <select className="select-field" value={wizardData.account_id || 'a1'} onChange={e => setWizardData({ ...wizardData, account_id: e.target.value })}>
                  {MOCK_ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select className="select-field" value={wizardData.platform || '视频号'} onChange={e => setWizardData({ ...wizardData, platform: e.target.value })}>
                  {TOPIC_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            )}
            {wizardStep === 2 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">选择选题来源</p>
                <select className="select-field" value={wizardData.topic_source || '客户私信'} onChange={e => setWizardData({ ...wizardData, topic_source: e.target.value })}>
                  {TOPIC_SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <textarea className="input-field" rows={3} placeholder="补充更多背景信息..." value={wizardData.background || ''} onChange={e => setWizardData({ ...wizardData, background: e.target.value })} />
              </div>
            )}
            {wizardStep === 3 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">填写内容策划信息</p>
                <input className="input-field" placeholder="目标客户" value={wizardData.target_customer || ''} onChange={e => setWizardData({ ...wizardData, target_customer: e.target.value })} />
                <input className="input-field" placeholder="客户痛点" value={wizardData.customer_pain || ''} onChange={e => setWizardData({ ...wizardData, customer_pain: e.target.value })} />
                <input className="input-field" placeholder="产品/工艺" value={wizardData.product_process || ''} onChange={e => setWizardData({ ...wizardData, product_process: e.target.value })} />
                <input className="input-field" placeholder="材料" value={wizardData.material || ''} onChange={e => setWizardData({ ...wizardData, material: e.target.value })} />
              </div>
            )}
            {wizardStep === 4 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">选择内容形式</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-500">内容类型</label><select className="select-field" value={wizardData.content_type || '工艺科普'} onChange={e => setWizardData({ ...wizardData, content_type: e.target.value })}>{TOPIC_CONTENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                  <div><label className="text-xs text-gray-500">转化目标</label><select className="select-field" value={wizardData.conversion_goal || ''} onChange={e => setWizardData({ ...wizardData, conversion_goal: e.target.value })}><option value="">选择</option>{CONVERSION_GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
                  <div><label className="text-xs text-gray-500">出镜方式</label><select className="select-field" value={wizardData.shooting_method || ''} onChange={e => setWizardData({ ...wizardData, shooting_method: e.target.value })}><option value="">选择</option>{SHOOTING_METHODS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                  <div><label className="text-xs text-gray-500">视频时长</label><select className="select-field" value={wizardData.video_length || '45-60秒'} onChange={e => setWizardData({ ...wizardData, video_length: e.target.value })}><option value="15-30秒">15-30秒</option><option value="30-45秒">30-45秒</option><option value="45-60秒">45-60秒</option><option value="60-90秒">60-90秒</option><option value="90秒+">90秒+</option></select></div>
                </div>
              </div>
            )}
            {wizardStep === 5 && (
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
                <textarea className="input-field" rows={3} placeholder="额外的风险规则补充..." value={wizardData.risk_notes || ''} onChange={e => setWizardData({ ...wizardData, risk_notes: e.target.value })} />
              </div>
            )}

            <div className="flex justify-between mt-6">
              <button className="btn-secondary" onClick={() => wizardStep > 1 ? setWizardStep((s: number) => s - 1) : setShowAiWizard(false)}>
                {wizardStep === 1 ? '取消' : '上一步'}
              </button>
              {wizardStep < 5 ? (
                <button className="btn-primary" onClick={() => setWizardStep((s: number) => s + 1)}>下一步</button>
              ) : (
                <button className="btn-primary" onClick={handleGenerateFromWizard}>生成选题</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      <TopicDetailDrawer
        detailTopic={detailTopic} setDetailTopic={setDetailTopic}
        topics={topics} setTopics={setTopics}
        editingTopic={editingTopic} setEditingTopic={setEditingTopic}
        showAiResult={showAiResult} setShowAiResult={setShowAiResult}
        aiResult={aiResult} setAiResult={setAiResult}
        wizardData={wizardData} setWizardData={setWizardData}
        setShowAiWizard={setShowAiWizard}
        getAccountName={getAccountName}
        handleConvertToScript={handleConvertToScript}
        handleSaveTopic={handleSaveTopic}
        handleGenerateFromWizard={handleGenerateFromWizard}
      />
    </AppLayout>
  );
}

// ---------- Subcomponents ----------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-100 rounded-lg p-4">
      <h4 className="font-medium text-sm text-gray-700 mb-3">{title}</h4>
      {children}
    </div>
  );
}

function InfoGrid({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {items.map(([k, v]) => (
        <div key={k} className="text-sm">
          <span className="text-gray-400">{k}：</span>
          <span className="text-gray-700">{v}</span>
        </div>
      ))}
    </div>
  );
}
 
