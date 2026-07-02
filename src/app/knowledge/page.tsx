'use client';
import { useState, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import FilterBar from '@/components/ui/FilterBar';
import EmptyState from '@/components/ui/EmptyState';
import AiResultCard from '@/components/ui/AiResultCard';
import { MOCK_ACCOUNTS, MOCK_KNOWLEDGE_NEW } from '@/lib/constants/mock-data';
import {
  KNOWLEDGE_CATEGORIES_NEW, CONTENT_SCOPES, KNOWLEDGE_STATUSES,
  KNOWLEDGE_CARD_TYPES, KNOWLEDGE_APPLICABLE_PLATFORMS, TOPIC_CONTENT_TYPES, CONVERSION_GOALS
} from '@/lib/constants';
import {
  truncate, formatDate, formatDateTime, getKnowledgeCategoryLabel,
  getContentScopeLabel, getKnowledgeStatusLabel, getKnowledgeCardTypeLabel
} from '@/lib/utils';
import type { KnowledgeCardNew } from '@/lib/constants/types';

// ---------- Constants ----------
const getAccountName = (id: string | null) => {
  if (!id) return '-';
  return MOCK_ACCOUNTS.find(a => a.id === id)?.name?.split('-')[0] || id;
};

const STATS = [
  { key: 'all', label: '全部知识卡' },
  { key: '可对外', label: '可对外' },
  { key: '可模糊对外', label: '可模糊对外' },
  { key: '仅内部参考', label: '仅内部参考' },
  { key: '禁止对外', label: '禁止对外' },
  { key: '草稿', label: '草稿' },
  { key: '待审核', label: '待审核' },
  { key: '已确认', label: '已确认' },
  { key: '需更新', label: '需更新' },
  { key: '高频引用', label: '高频引用' },
];

export default function KnowledgePage() {
  const [cards, setCards] = useState<KnowledgeCardNew[]>(MOCK_KNOWLEDGE_NEW);
  const [detailCard, setDetailCard] = useState<KnowledgeCardNew | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [showAiResult, setShowAiResult] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [showCardTypePicker, setShowCardTypePicker] = useState(false);
  const [newCardType, setNewCardType] = useState('');

  const statCounts = useMemo(() => {
    const r: Record<string, number> = { all: cards.length };
    cards.forEach(c => {
      r[c.content_scope] = (r[c.content_scope] || 0) + 1;
      r[c.knowledge_status] = (r[c.knowledge_status] || 0) + 1;
    });
    r['高频引用'] = cards.filter(c => c.usage_count >= 5).length;
    return r;
  }, [cards]);

  const filtered = useMemo(() => {
    return cards.filter(c => {
      if (search) {
        const s = search.toLowerCase();
        const matchTarget = [c.title, c.core_conclusion || '', c.summary || '', c.category, c.customer_questions || '', c.forbidden_expressions || ''].some(v => v.toLowerCase().includes(s));
        if (!matchTarget) return false;
      }
      if (filters.category && c.category !== filters.category) return false;
      if (filters.content_scope && c.content_scope !== filters.content_scope) return false;
      if (filters.knowledge_status && c.knowledge_status !== filters.knowledge_status) return false;
      if (filters.card_type && c.card_type !== filters.card_type) return false;
      if (filters.account_id && !c.applicable_accounts.includes(filters.account_id)) return false;
      if (filters.usage && filters.usage === 'high' && c.usage_count < 5) return false;
      return true;
    });
  }, [cards, filters, search]);

  const getScopeColor = (scope: string) => {
    const colors: Record<string, string> = {
      '可对外': 'badge-green', '可模糊对外': 'badge-yellow',
      '仅内部参考': 'badge-gray', '禁止对外': 'badge-red'
    };
    return colors[scope] || 'badge-gray';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      '草稿': 'badge-gray', '待审核': 'badge-yellow', '已确认': 'badge-green',
      '需更新': 'badge-red', '已过期': 'badge-red', '停用': 'badge-gray'
    };
    return colors[status] || 'badge-gray';
  };

  const filterConfig = [
    { key: 'category', label: '按分类', options: KNOWLEDGE_CATEGORIES_NEW },
    { key: 'content_scope', label: '按可用范围', options: CONTENT_SCOPES },
    { key: 'knowledge_status', label: '按知识状态', options: KNOWLEDGE_STATUSES },
    { key: 'card_type', label: '按卡类型', options: KNOWLEDGE_CARD_TYPES },
    { key: 'account_id', label: '按适用账号', options: MOCK_ACCOUNTS.map(a => ({ value: a.id, label: a.name.split('-')[0] })) },
  ];

  // AI handler
  const handleAiAction = (card: KnowledgeCardNew, action: string) => {
    const mockResults: Record<string, any> = {
      '完善': { '核心结论': card.core_conclusion, '适合情况': card.suitable_scenarios, '不适合': card.unsuitable_scenarios, '新表达': card.new_media_expression, '风险': card.risky_expressions },
      '生成选题': { '选题1': card.title + '的3个关键点', '选题2': card.title + '客户必看', '选题3': card.title + '避坑指南' },
      '生成脚本': { '标题': card.title, '钩子': '你知道吗？' + truncate(card.core_conclusion || '', 20), '口播': card.new_media_expression || card.core_conclusion },
      '风险检查': { '风险等级': '低', '风险点': '无重大风险', '安全表达': '当前内容安全' },
      '可对外': { '可对外版本': card.core_conclusion, '保留信息': '核心结论', '删除信息': '内部细节' },
      '老板口吻': { '老板版本': '做了19年热转印，' + (card.core_conclusion || '') },
    };
    setShowAiResult(mockResults[action] || { '结果': '处理完成' });
  };

  const addNewCard = () => {
    if (!newCardType) return;
    const newCard: KnowledgeCardNew = {
      id: 'kn_new_' + Date.now(), org_id: 'org_001',
      title: '新' + newCardType, category: '工艺知识', card_type: newCardType,
      summary: '请完善内容', core_conclusion: '请完善核心结论',
      applicable_accounts: ['a1'], applicable_platforms: ['视频号'],
      applicable_content_types: ['工艺科普'], applicable_customers: '',
      content_scope: '仅内部参考', knowledge_status: '草稿',
      owner_id: 'u1', reviewer_id: '', version: 1,
      suitable_scenarios: '', unsuitable_scenarios: '', key_judgement_points: '',
      new_media_expression: '', unsuitable_expression: '', boss_tone_expression: '',
      technical_tone_expression: '', qa_tone_expression: '', video_channel_expression: '',
      douyin_expression: '', forbidden_expressions: '', risky_expressions: '',
      safer_alternatives: '', risk_reason: '', needs_human_review: false,
      customer_questions: '', standard_replies: '', required_followup_info: '',
      can_send_to_customer: false, topic_ideas: '', script_angles: '',
      linked_topic_ids: [], linked_script_ids: [], linked_teardown_ids: [],
      linked_lead_reply_ids: [], linked_case_ids: [], linked_review_ids: [],
      usage_count: 0, generated_topics_count: 0, generated_scripts_count: 0,
      linked_posts_count: 0, related_private_messages: 0, related_qualified_leads: 0,
      last_used_at: null, tags: [], attachments: [],
      source_type: '', source_reference: '', notes: '',
      created_by: 'u1', created_at: new Date().toISOString(),
    };
    setCards(prev => [newCard, ...prev]);
    setShowCardTypePicker(false);
    setNewCardType('');
    setDetailCard(newCard);
  };

  return (
    <AppLayout>
      <PageHeader
        title="新媒体知识引擎"
        description={'共 ' + cards.length + ' 条知识卡 · 可对外 ' + statCounts['可对外'] + ' 条'}
        actions={
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => setShowCardTypePicker(true)}>+ 新增知识卡</button>
          </div>
        }
      />

      {/* AI Result */}
      {showAiResult && (
        <AiResultCard title="AI结果" content={showAiResult} onDismiss={() => setShowAiResult(null)} />
      )}

      {/* Stats */}
      <div className="grid grid-cols-11 gap-2 mb-4">
        {STATS.map(s => {
          const count = statCounts[s.key] || 0;
          const colors: Record<string, string> = {
            blue: 'bg-blue-50 text-blue-700 border-blue-200', gray: 'bg-gray-50 text-gray-600 border-gray-200',
            yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200', green: 'bg-green-50 text-green-700 border-green-200',
            red: 'bg-red-50 text-red-700 border-red-200'
          };
          return (
            <div key={s.key}
              className={'card p-2 text-center border cursor-pointer hover:shadow-sm ' + ({
      'all': 'bg-blue-50 text-blue-700 border-blue-200',
      '可对外': 'bg-green-50 text-green-700 border-green-200',
      '可模糊对外': 'bg-yellow-50 text-yellow-700 border-yellow-200',
      '仅内部参考': 'bg-gray-50 text-gray-600 border-gray-200',
      '禁止对外': 'bg-red-50 text-red-700 border-red-200',
      '草稿': 'bg-gray-50 text-gray-600 border-gray-200',
      '待审核': 'bg-yellow-50 text-yellow-700 border-yellow-200',
      '已确认': 'bg-green-50 text-green-700 border-green-200',
      '需更新': 'bg-red-50 text-red-700 border-red-200',
      '高频引用': 'bg-purple-50 text-purple-700 border-purple-200',
    }[s.key] || 'bg-gray-50 text-gray-600 border-gray-200')}
              onClick={() => {
                if (s.key === 'all') setFilters({});
                else if (s.key === '高频引用') setFilters({ ...filters, usage: 'high' });
                else if (['可对外','可模糊对外','仅内部参考','禁止对外'].includes(s.key)) setFilters({ ...filters, content_scope: s.key, usage: '' });
                else setFilters({ ...filters, knowledge_status: s.key, usage: '' });
              }}>
              <p className="text-lg font-bold">{count}</p>
              <p className="text-xs truncate">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Filter */}
      <FilterBar filters={filterConfig} values={filters} onChange={(k, v) => setFilters({...filters, [k]: v})}
        searchValue={search} onSearchChange={setSearch}
        searchPlaceholder="搜索标题 / 核心结论 / 客户问题 / 工艺 / 材料 / 禁忌表达..." />

      {/* Card Type Picker */}
      {showCardTypePicker && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={() => setShowCardTypePicker(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">选择知识卡类型</h3>
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
              {KNOWLEDGE_CARD_TYPES.map(t => (
                <button key={t.value}
                  className={'px-3 py-2 rounded-lg text-sm border text-left hover:bg-blue-50 ' + (newCardType === t.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200')}
                  onClick={() => setNewCardType(t.value)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn-primary" onClick={addNewCard} disabled={!newCardType}>创建</button>
              <button className="btn-secondary" onClick={() => setShowCardTypePicker(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(card => (
          <div key={card.id}
            className={'card cursor-pointer hover:shadow-md transition-shadow border-l-4 ' + (card.content_scope === '可对外' ? 'border-l-green-500' : card.content_scope === '可模糊对外' ? 'border-l-yellow-500' : card.content_scope === '禁止对外' ? 'border-l-red-500' : 'border-l-gray-300')}
            onClick={() => setDetailCard(card)}>
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-800">{truncate(card.title, 28)}</h4>
            </div>
            <div className="flex flex-wrap gap-1 mb-1.5">
              <span className={getScopeColor(card.content_scope)}>{card.content_scope}</span>
              <span className={getStatusColor(card.knowledge_status)}>{card.knowledge_status}</span>
              <span className="badge-blue text-xs">{card.category}</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-2">{truncate(card.core_conclusion || card.summary, 80)}</p>
            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
              <div className="flex gap-1">
                {card.applicable_accounts.map(aid => (
                  <span key={aid} className="badge-gray text-xs">{getAccountName(aid)}</span>
                ))}
              </div>
              <span>{card.usage_count}次引用</span>
            </div>
            {/* Quick Actions */}
            <div className="flex flex-wrap gap-1 mt-2">
              {[
                ['选题', '生成选题'], ['脚本', '生成脚本'], ['风险', '风险检查'],
                ['查看', '查看详情']
              ].map(([label, action]) => (
                <button key={label}
                  className="text-xs px-2 py-0.5 rounded bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200"
                  onClick={e => {
                    e.stopPropagation();
                    if (action === '查看详情') setDetailCard(card);
                    else handleAiAction(card, action);
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <EmptyState title="暂无匹配知识卡" description="调整筛选条件或新增知识卡" />}

      {/* Detail Drawer */}
      {detailCard && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setDetailCard(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-xl overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between z-10">
              <h3 className="font-semibold text-gray-800 truncate max-w-md">{detailCard.title}</h3>
              <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={() => setDetailCard(null)}>×</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Basic Info */}
              <DetailSection title="基础信息">
                <InfoGrid items={[
                  ['知识卡标题', detailCard.title],
                  ['分类', getKnowledgeCategoryLabel(detailCard.category)],
                  ['卡类型', getKnowledgeCardTypeLabel(detailCard.card_type)],
                  ['可用范围', <span key="cs" className={getScopeColor(detailCard.content_scope)}>{detailCard.content_scope}</span>],
                  ['知识状态', <span key="ks" className={getStatusColor(detailCard.knowledge_status)}>{detailCard.knowledge_status}</span>],
                  ['版本', 'v' + detailCard.version],
                  ['负责人', getAccountName(detailCard.owner_id)],
                  ['最后更新', formatDateTime(detailCard.updated_at||"")],
                  ['适用账号', detailCard.applicable_accounts.map(a => getAccountName(a)).join('、') || '-'],
                  ['适用平台', detailCard.applicable_platforms.join('、') || '-'],
                  ['适用客户', detailCard.applicable_customers || '-'],
                ]} />
              </DetailSection>

              {/* Core Conclusion */}
              <DetailSection title="核心结论">
                <p className="text-sm text-gray-700">{detailCard.core_conclusion || '未填写'}</p>
                {detailCard.suitable_scenarios && <p className="text-xs text-green-600 mt-1">适合：{detailCard.suitable_scenarios}</p>}
                {detailCard.unsuitable_scenarios && <p className="text-xs text-red-500 mt-0.5">不适合：{detailCard.unsuitable_scenarios}</p>}
                {detailCard.key_judgement_points && <p className="text-xs text-blue-600 mt-0.5">判断重点：{detailCard.key_judgement_points}</p>}
              </DetailSection>

              {/* New Media Expression */}
              <DetailSection title="新媒体表达方式">
                {detailCard.video_channel_expression && <p className="text-sm text-gray-700">视频号：{detailCard.video_channel_expression}</p>}
                {detailCard.douyin_expression && <p className="text-sm text-gray-700 mt-1">抖音：{detailCard.douyin_expression}</p>}
                {detailCard.new_media_expression && <p className="text-sm text-gray-700 mt-1">通用：{detailCard.new_media_expression}</p>}
                {detailCard.unsuitable_expression && <p className="text-sm text-red-500 mt-1">不适合：{detailCard.unsuitable_expression}</p>}
                {!detailCard.video_channel_expression && !detailCard.douyin_expression && !detailCard.new_media_expression && <p className="text-xs text-gray-400">未填写</p>}
              </DetailSection>

              {/* Risk */}
              <DetailSection title="风险表达">
                {detailCard.forbidden_expressions && <p className="text-sm text-red-600">禁止：{detailCard.forbidden_expressions}</p>}
                {detailCard.risky_expressions && <p className="text-sm text-orange-500 mt-1">风险：{detailCard.risky_expressions}</p>}
                {detailCard.safer_alternatives && <p className="text-sm text-green-600 mt-1">替代：{detailCard.safer_alternatives}</p>}
                {detailCard.needs_human_review && <p className="text-xs text-red-500 mt-1">需要人工确认</p>}
                {!detailCard.forbidden_expressions && !detailCard.risky_expressions && <p className="text-xs text-gray-400">未填写风险信息</p>}
              </DetailSection>

              {/* Usage Data */}
              <DetailSection title="使用数据">
                <InfoGrid items={[
                  ['被引用次数', String(detailCard.usage_count)],
                  ['生成选题数', String(detailCard.generated_topics_count)],
                  ['生成脚本数', String(detailCard.generated_scripts_count)],
                  ['关联视频数', String(detailCard.linked_posts_count)],
                  ['相关私信', String(detailCard.related_private_messages)],
                  ['有效线索', String(detailCard.related_qualified_leads)],
                ]} />
              </DetailSection>

              {/* AI Actions */}
              <DetailSection title="AI操作">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['完善', '完善'], ['生成选题', '生成选题'], ['生成脚本', '生成脚本'],
                    ['生成FAQ', '完善'], ['检查风险', '风险检查'], ['改可对外', '可对外'],
                    ['老板口吻', '老板口吻'], ['视频号表达', '完善'], ['抖音表达', '完善'],
                  ].map(([label, action]) => (
                    <button key={label} className="btn-secondary btn-sm text-xs" onClick={() => handleAiAction(detailCard, action)}>
                      {label}
                    </button>
                  ))}
                </div>
              </DetailSection>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

// ---------- Subcomponents ----------
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
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
