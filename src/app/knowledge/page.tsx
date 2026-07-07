'use client';
import { useState, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import AiResultCard from '@/components/ui/AiResultCard';
import KnowledgeFilters from '@/components/knowledge/KnowledgeFilters';
import KnowledgeCard from '@/components/knowledge/KnowledgeCard';
import KnowledgeDrawer from '@/components/knowledge/KnowledgeDrawer';
import { MOCK_ACCOUNTS, MOCK_KNOWLEDGE_NEW } from '@/lib/constants/mock-data';
import { KNOWLEDGE_CARD_TYPES } from '@/lib/constants';
import { formatDateTime, truncate } from '@/lib/utils';
import type { KnowledgeCardNew } from '@/lib/constants/types';

const getAccountName = (id: string | null) => {
  if (!id) return '-';
  return MOCK_ACCOUNTS.find(a => a.id === id)?.name?.split('-')[0] || id;
};

const STATS = [
  { key: 'all', label: '全部知识卡', color: 'blue' },
  { key: '可对外', label: '可对外', color: 'green' },
  { key: '可模糊对外', label: '可模糊对外', color: 'yellow' },
  { key: '仅内部参考', label: '仅内部参考', color: 'gray' },
  { key: '已确认', label: '已确认', color: 'green' },
  { key: '待审核', label: '待审核', color: 'yellow' },
  { key: '草稿', label: '草稿', color: 'gray' },
  { key: '需更新', label: '需更新', color: 'red' },
  { key: '高频引用', label: '高频引用', color: 'purple' },
];

const COLORS: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200', green: 'bg-green-50 text-green-700 border-green-200',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200', gray: 'bg-gray-50 text-gray-600 border-gray-200',
  red: 'bg-red-50 text-red-700 border-red-200', purple: 'bg-purple-50 text-purple-700 border-purple-200',
};

export default function KnowledgePage() {
  const [cards, setCards] = useState<KnowledgeCardNew[]>(MOCK_KNOWLEDGE_NEW);
  const [detailCard, setDetailCard] = useState<KnowledgeCardNew | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [showAiResult, setShowAiResult] = useState<any>(null);
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
        if (![c.title, c.core_conclusion || '', c.summary || '', c.category, c.customer_questions || '', c.forbidden_expressions || ''].some(v => v.toLowerCase().includes(s))) return false;
      }
      if (filters.category && c.category !== filters.category) return false;
      if (filters.content_scope && c.content_scope !== filters.content_scope) return false;
      if (filters.knowledge_status && c.knowledge_status !== filters.knowledge_status) return false;
      if (filters.card_type && c.card_type !== filters.card_type) return false;
      if (filters.account_id && !c.applicable_accounts.includes(filters.account_id)) return false;
      if (filters.usage === 'high' && c.usage_count < 5) return false;
      return true;
    });
  }, [cards, filters, search]);

  // AI action handler
  const handleAiAction = (card: KnowledgeCardNew, action: string) => {
    const mockResults: Record<string, any> = {
      '完善': { '核心结论': card.core_conclusion, '适合情况': card.suitable_scenarios, '不适合': card.unsuitable_scenarios, '新表达': card.new_media_expression, '风险': card.risky_expressions },
      '生成选题': {
        '操作成功': '已从知识卡「' + card.title + '」生成3个选题',
        '选题1': card.title + '的3个关键判断点',
        '选题2': '客户必看：' + card.title + '避坑指南',
        '选题3': '做了19年热转印，聊聊' + card.title,
      },
      '生成脚本': {
        '标题': card.title,
        '钩子': truncate(card.core_conclusion || card.title, 20) + '？一次说清楚',
        '核心观点': card.core_conclusion,
        '时长': '30秒',
      },
      '风险检查': {
        '风险等级': card.risky_expressions ? '中' : '低',
        '风险点': card.risky_expressions || '未发现明显风险',
        '安全表达': card.safer_alternatives || '当前内容安全',
      },
      '可对外': {
        '可对外版本': card.core_conclusion,
        '保留信息': card.title + '的核心结论',
        '已删除': '内部细节和风险表达',
      },
      '老板口吻': {
        '老板版本': '做了19年热转印，' + (card.core_conclusion || '我来说说' + card.title),
      },
      '查看详情': null,
    };
    if (action === '查看详情') { setDetailCard(card); return; }
    if (action === '生成选题' || action === '生成脚本') {
      setShowAiResult(mockResults[action] || { '结果': '处理完成' });
      // Update usage count
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, usage_count: c.usage_count + 1, generated_topics_count: c.generated_topics_count + (action === '生成选题' ? 1 : 0), generated_scripts_count: c.generated_scripts_count + (action === '生成脚本' ? 1 : 0), last_used_at: new Date().toISOString() } : c));
    } else {
      setShowAiResult(mockResults[action] || { '结果': '处理完成' });
    }
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
        description={'共 ' + cards.length + ' 条知识卡 · 可对外 ' + statCounts['可对外'] + ' 条 · 已确认 ' + statCounts['已确认'] + ' 条'}
        actions={
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => setShowCardTypePicker(true)}>+ 新增知识卡</button>
          </div>
        }
      />

      {/* AI Result Banner */}
      {showAiResult && (
        <AiResultCard title="AI结果" content={showAiResult} onDismiss={() => setShowAiResult(null)} />
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-9 gap-2 mb-3">
        {STATS.map(s => {
          const count = statCounts[s.key] || 0;
          return (
            <div key={s.key}
              className={'card p-2 text-center border cursor-pointer hover:shadow-sm ' + (COLORS[s.color] || 'bg-white')}
              onClick={() => {
                if (s.key === 'all') setFilters({});
                else if (s.key === '高频引用') setFilters({ ...filters, usage: 'high' });
                else if (['可对外','可模糊对外','仅内部参考','禁止对外'].includes(s.key)) setFilters({ ...filters, content_scope: s.key, usage: '' });
                else setFilters({ ...filters, knowledge_status: s.key, usage: '' });
              }}
            >
              <p className="text-lg font-bold">{count}</p>
              <p className="text-xs truncate">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <KnowledgeFilters
        filters={filters}
        setFilters={setFilters}
        search={search}
        setSearch={setSearch}
      />

      {/* Card Type Picker */}
      {showCardTypePicker && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={() => setShowCardTypePicker(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">选择知识卡类型</h3>
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
              {KNOWLEDGE_CARD_TYPES.map(t => (
                <button key={t.value}
                  className={'px-3 py-2 rounded-lg text-sm border text-left hover:bg-blue-50 ' + (newCardType === t.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200')}
                  onClick={() => setNewCardType(t.value)}
                >
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
          <KnowledgeCard
            key={card.id}
            card={card}
            accountName={getAccountName}
            onClick={() => setDetailCard(card)}
            onAction={handleAiAction}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">没有匹配的知识卡，点"新增知识卡"创建</div>
      )}

      {/* Detail Drawer */}
      <KnowledgeDrawer
        card={detailCard}
        onClose={() => setDetailCard(null)}
        onAction={handleAiAction}
        accountName={getAccountName}
      />
    </AppLayout>
  );
}
