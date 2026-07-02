'use client';
import { useState, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import FilterBar from '@/components/ui/FilterBar';
import EmptyState from '@/components/ui/EmptyState';
import AiResultCard from '@/components/ui/AiResultCard';
import { MOCK_TOPICS, MOCK_ACCOUNTS, MOCK_KNOWLEDGE, ALL_MOCK_SCRIPTS } from '@/lib/constants/mock-data';
import { usePersistentState, STORAGE_KEYS } from '@/lib/storage';
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
import TopicsRenderer from '@/components/topics/TopicsRenderer';

// ---------- Helpers ----------
const STATS = [
  { key: 'all', label: '全部选题', color: 'blue' },
  { key: '待审核', label: '待审核', color: 'yellow' },
  { key: '已审核', label: '已审核', color: 'green' },
  { key: '已发布', label: '已发布', color: 'green' },
  { key: '待复盘', label: '待复盘', color: 'yellow' },
  { key: '可复制', label: '可复制', color: 'purple' },
];

const QUALITY_DIMENSIONS_CN = [
  { key: 'pain_score', label: '客户痛点明确度', max: 20 },
  { key: 'account_score', label: '账号匹配度', max: 15 },
  { key: 'conversion_score', label: '业务转化价值', max: 20 },
  { key: 'media_score', label: '新媒体传播性', max: 15 },
  { key: 'executable_score', label: '拍摄可执行性', max: 10 },
  { key: 'knowledge_score', label: '知识库支撑度', max: 10 },
  { key: 'risk_score', label: '风险可控性', max: 10 },
];

const getAccountName = (id: string) => MOCK_ACCOUNTS.find(a => a.id === id)?.name || id;
const getAccountLabel = (id: string) => MOCK_ACCOUNTS.find(a => a.id === id)?.name?.split('-')[0] || id;

// ---------- Component ----------
export default function TopicsPage() {
  const [topics, setTopics] = usePersistentState<Topic>(STORAGE_KEYS.TOPICS, MOCK_TOPICS);
  const [activeTab, setActiveTab] = useState<'all' | 'week'>('all');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailTopic, setDetailTopic] = useState<Topic | null>(null);
  const [showAiWizard, setShowAiWizard] = useState(false);
  const [showAiResult, setShowAiResult] = useState<any>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Partial<Topic>>({});
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState<Record<string, any>>({});

  // Derived data
  const statCounts = useMemo(() => {
    const r: Record<string, number> = { all: topics.length };
    topics.forEach(t => { r[t.status] = (r[t.status] || 0) + 1; });
    
    
    return r;
  }, [topics]);

  const filtered = useMemo(() => {
    return topics.filter(t => {
      if (activeTab === 'week' && !t.is_this_week) return false;
      if (search) {
        const s = search.toLowerCase();
        const matchTarget = [t.title, t.customer_pain || '', t.product_process || '', t.material || '', t.topic_source || ''].some(v => v.toLowerCase().includes(s));
        if (!matchTarget) return false;
      }
      if (filters.account_id && t.account_id !== filters.account_id) return false;
      if (filters.platform && t.platform !== filters.platform) return false;
      if (filters.content_type && t.content_type !== filters.content_type) return false;
      if (filters.topic_source && t.topic_source !== filters.topic_source) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.script_status && t.script_status !== filters.script_status) return false;
      if (filters.conversion_goal && t.conversion_goal !== filters.conversion_goal) return false;
      if (filters.owner_id && t.owner_id !== filters.owner_id) return false;
      return true;
    });
  }, [topics, filters, search, activeTab]);

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0;

  // Handlers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(t => t.id)));
  };

  const handleAiGenerate = async (type: string) => {
    const res = await fetch('/api/ai/generate-topics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: MOCK_ACCOUNTS[0], target_audience: '中小企业采购', product_or_process: '热转印', customer_pain: '如何选择工艺', knowledge_cards: [] })
    });
    const data = await res.json();
    setShowAiResult(data.topics || data);
  };

  const handleConvertToScript = (topic: Topic) => {
    const newScriptId = `s_new_${Date.now()}`;
    setTopics(prev => prev.map(t =>
      t.id === topic.id ? { ...t, script_status: '已生成', linked_script_id: newScriptId, status: '脚本中', last_action: '已转入脚本工厂' } : t
    ));
    setShowAiResult({ '操作成功': '选题「' + topic.title + '」已转入脚本工厂', '关联脚本ID': newScriptId });
    setDetailTopic(null);
  };

  const handleGenerateFromWizard = () => {
    setShowAiResult({ 'AI生成建议': '基于所选条件，建议本周优先拍摄以下10个选题...' });
    setShowAiWizard(false);
  };

  // Batch operations
  const handleBatchGenerate = () => {
    setTopics(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, script_status: '已生成', status: '脚本中', last_action: '批量生成脚本' } : t));
    setSelectedIds(new Set());
  };
  const handleBatchChangeStatus = (status: string) => {
    setTopics(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, status, last_action: '批量改状态→' + status } : t));
    setSelectedIds(new Set());
  };
  const handleBatchAddWeek = () => {
    setTopics(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, is_this_week: true, last_action: '加入本周计划' } : t));
    setSelectedIds(new Set());
  };
  const handleBatchArchive = () => {
    setTopics(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, status: '暂停', last_action: '已归档暂停' } : t));
    setSelectedIds(new Set());
  };
  const handleBatchDelete = () => {
    setTopics(prev => prev.filter(t => !selectedIds.has(t.id)));
    setSelectedIds(new Set());
    setDetailTopic(null);
    setEditingTopic({});
  };
  const handleBatchAssign = () => {
    // Mock: assign to first user
    setTopics(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, owner_id: 'u1', last_action: '已分配' } : t));
    setSelectedIds(new Set());
  };

  // Quick form save
  // Quick form save — FIXED: proper braces and setTopics call
  const handleSaveTopic = () => {
    if (editingTopic.title) {
      const newTopic: Topic = {
        id: 't' + Date.now(), org_id: 'org_001',
        account_id: editingTopic.account_id || 'a1',
        title: editingTopic.title || '',
        content_type: editingTopic.content_type || '工艺科普',
        platform: editingTopic.platform || '视频号',
        topic_source: editingTopic.topic_source || '手动新增',
        target_customer: editingTopic.target_customer || null, customer_pain: editingTopic.customer_pain || null,
        product_process: editingTopic.product_process || null, material: editingTopic.material || null,
        content_angle: null, core_point: null, why_user_watch: null, content_purpose: null,
        conversion_goal: editingTopic.conversion_goal || null,
        comment_guidance: null, private_message_action: null, required_customer_info: null, sample_guidance: null,
        shooting_method: null, video_length: null, required_products: null, required_shots: null,
        required_factory_assets: null, required_case_images: null, logo_risk: null, privacy_risk: null,
        knowledge_refs: null, faq_refs: null, case_refs: null, viral_refs: null, review_refs: null, risk_rules: null,
        script_status: '未生成', linked_script_id: null, linked_post_id: null,
        topic_score: null, score_detail: null, risk_level: null, risk_result: null,
        owner_id: 'u1', last_action: '手动新增', is_this_week: false,
        planned_shoot_date: null, planned_publish_date: null,
        target_audience: editingTopic.target_audience || null,
        product_or_process: editingTopic.product_or_process || null,
        source: '手动新增', priority: editingTopic.priority || '中', status: '待策划',
        notes: editingTopic.notes || null, created_by: 'u1',
        created_at: new Date().toISOString(),
      };
      setTopics((prev: Topic[]) => [...prev, newTopic]);
      setEditingTopic({});
      setShowForm(false);
    }
  };

  // ---------- Render ----------
  const _getAccountName = (id: string | null) => MOCK_ACCOUNTS.find(a => a.id === id)?.name || '-';
  const _getContentTypeLabel = (t: string) => {
    const m: Record<string, string> = { '工艺科普': '工艺科普', '客户避坑': '客户避坑', '客户问答': '客户问答', '案例拆解': '案例拆解', '老板经验': '老板经验', '工厂实拍': '工厂实拍', '设备展示': '设备展示', '材料判断': '材料判断', '成本效率': '成本效率', '评论区答疑': '评论区答疑', '爆款改编': '爆款改编', '销售反馈': '销售反馈' };
    return m[t] || t;
  };

  return (
    <TopicsRenderer
      topics={topics} setTopics={setTopics}
      detailTopic={detailTopic} setDetailTopic={setDetailTopic}
      selectedIds={selectedIds} setSelectedIds={setSelectedIds}
      editingTopic={editingTopic} setEditingTopic={setEditingTopic}
      filtered={filtered}
      showAiResult={showAiResult} setShowAiResult={setShowAiResult}
      showAiWizard={showAiWizard} setShowAiWizard={setShowAiWizard}
      aiResult={aiResult} setAiResult={setAiResult}
      wizardData={wizardData} setWizardData={setWizardData}
      activeTab={activeTab} setActiveTab={setActiveTab}
      filters={filters} setFilters={setFilters}
      search={search} setSearch={setSearch}
      showForm={showForm} setShowForm={setShowForm}
      getAccountName={_getAccountName}
      getContentTypeLabel={_getContentTypeLabel}
      handleConvertToScript={handleConvertToScript}
      handleGenerateFromWizard={handleGenerateFromWizard}
      handleBatchGenerate={handleBatchGenerate}
      handleBatchChangeStatus={handleBatchChangeStatus}
      handleBatchAddWeek={handleBatchAddWeek}
      handleBatchArchive={handleBatchArchive}
      handleBatchDelete={handleBatchDelete}
      handleBatchAssign={handleBatchAssign}
      handleSaveTopic={handleSaveTopic}
      toggleSelect={toggleSelect}
      toggleSelectAll={toggleSelectAll}
      wizardStep={wizardStep} setWizardStep={setWizardStep}
    />
  );
}
