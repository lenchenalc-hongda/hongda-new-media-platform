'use client';
import { ScriptsRenderer } from './ScriptsRenderer';
import { useState } from 'react';
import { ALL_MOCK_SCRIPTS, MOCK_ACCOUNTS, MOCK_KNOWLEDGE_NEW, MOCK_TOPICS } from '@/lib/constants/mock-data';
import { usePersistentState, STORAGE_KEYS, saveData, getStoredData } from '@/lib/storage';
import type { Script, Topic } from '@/lib/constants/types';
import { generateShortVideoScript, scoreVideoScript, checkScriptRisk } from '@/lib/ai/script-pipeline';

export default function ScriptsContent() {
  const [scripts, setScripts] = usePersistentState<any>(STORAGE_KEYS.SCRIPTS, ALL_MOCK_SCRIPTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [activeAiAction, setActiveAiAction] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pushedToTopics, setPushedToTopics] = useState<Set<string>>(new Set());

  // Edit mode state
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Script>>({});

  const selected = scripts.find(s => s.id === selectedId);

  const filtered = scripts.filter(s => {
    if (search) {
      const q = search.toLowerCase();
      if (!s.title?.toLowerCase().includes(q) && !s.main_script?.toLowerCase().includes(q)) return false;
    }
    if (filters.account && s.account_id !== filters.account) return false;
    if (filters.platform) {
      const acc = MOCK_ACCOUNTS.find(a => a.id === s.account_id);
      if (acc?.platform !== filters.platform) return false;
    }
    return true;
  });

  const getAccountName = (id: string | null) => MOCK_ACCOUNTS.find(a => a.id === id)?.name || '-';

  const handleAiAction = async (action: string) => {
    setActiveAiAction(action);
    try {
      const res = await fetch('/api/ai/rewrite-script', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: selected?.main_script || '', rewrite_style: action }),
      });
      const data = await res.json();
      setAiResult(data);
    } catch {
      setAiResult({ message: action + ' 完成（mock）' });
    }
    setTimeout(() => setAiResult(null), 8000);
  };

  // === Edit handlers ===
  const handleStartEdit = (scriptId: string) => {
    const s = scripts.find(x => x.id === scriptId);
    if (!s) return;
    setEditingScriptId(scriptId);
    setEditForm({
      title: s.title,
      hook: s.hook,
      main_script: s.main_script,
      cover_text: s.cover_text,
      comment_reply: s.comment_reply,
      private_message_cta: s.private_message_cta,
      risk_notes: s.risk_notes,
      subtitle_points: s.subtitle_points,
    });
  };

  const handleSaveEdit = () => {
    if (!editingScriptId) return;
    setScripts(prev => prev.map(s =>
      s.id === editingScriptId
        ? { ...s, ...editForm, version: (s.version || 0) + 1 }
        : s
    ));
    setEditingScriptId(null);
    setEditForm({});
    setAiResult({ message: '脚本已保存 ✅' });
    setTimeout(() => setAiResult(null), 3000);
  };

  const handleCancelEdit = () => {
    setEditingScriptId(null);
    setEditForm({});
  };

  // === Push to topics ===
  const handlePushToTopics = (scriptId: string) => {
    const s = scripts.find(x => x.id === scriptId);
    if (!s) return;
    const account = MOCK_ACCOUNTS.find(a => a.id === s.account_id);
    const newTopic: Topic = {
      id: 't' + Date.now(),
      org_id: 'org_001',
      account_id: s.account_id || 'a1',
      title: s.title || '未命名脚本',
      content_type: (s.ai_meta as any)?.structure || '客户问答',
      platform: account?.platform || '视频号',
      topic_source: '脚本工厂',
      target_customer: null,
      customer_pain: null,
      product_process: null,
      material: null,
      content_angle: null,
      core_point: null,
      why_user_watch: null,
      content_purpose: null,
      conversion_goal: null,
      comment_guidance: null,
      private_message_action: null,
      required_customer_info: null,
      sample_guidance: null,
      shooting_method: null,
      video_length: null,
      required_products: null,
      required_shots: null,
      required_factory_assets: null,
      required_case_images: null,
      logo_risk: null,
      privacy_risk: null,
      knowledge_refs: null,
      faq_refs: null,
      case_refs: null,
      viral_refs: null,
      review_refs: null,
      risk_rules: null,
      script_status: '已生成',
      linked_script_id: scriptId,
      linked_post_id: null,
      topic_score: null,
      score_detail: null,
      risk_level: null,
      risk_result: null,
      owner_id: null,
      last_action: null,
      is_this_week: false,
      planned_shoot_date: null,
      planned_publish_date: null,
      target_audience: null,
      product_or_process: null,
      source: '脚本工厂',
      priority: '中',
      status: '待审核',
      notes: '从脚本工厂推进过来',
      created_by: 'u1',
      created_at: new Date().toISOString(),
    };
    saveData(STORAGE_KEYS.TOPICS, [...getStoredData(STORAGE_KEYS.TOPICS, MOCK_TOPICS), newTopic]);
    setPushedToTopics(prev => new Set(prev).add(scriptId));
    setAiResult({
      message: '已推进到选题库待审核 ✅',
      '选题标题': newTopic.title,
      '担当账号': account?.name || '-',
      '状态': '待审核',
    });
    setTimeout(() => setAiResult(null), 5000);
  };

  // === Wizard generate ===
  const handleWizardGenerate = (data: any) => {
    const account = MOCK_ACCOUNTS.find(a => a.id === data.account_id);
    const selectedCards = data.knowledge_refs
      ? MOCK_KNOWLEDGE_NEW.filter(k => data.knowledge_refs.includes(k.id))
      : [];

    const result = generateShortVideoScript({
      ...data,
      account: account || {},
      video_length: data.video_length || '30',
      platform: data.platform || 'weixin',
      knowledgeCards: selectedCards,
      customer_pain: data.customer_pain || selectedCards[0]?.title || '',
      product_or_process: data.product_or_process || selectedCards[0]?.category || '',
    });

    const scriptText = result.script;
    const score = scoreVideoScript(scriptText, account);
    const risk = checkScriptRisk(scriptText, []);

    const newScript: Script = {
      id: 's' + Date.now(),
      org_id: 'org_001',
      topic_id: null,
      account_id: data.account_id || 'a1',
      title: result.title,
      hook: result.hook,
      main_script: scriptText,
      shot_list: [],
      subtitle_points: result.subtitlePoints,
      cover_text: (result as any).coverText || '',
      comment_reply: result.commentGuidance,
      private_message_cta: result.privateMessageCta,
      risk_notes: result.riskNotes,
      version: 1,
      status: 'draft',
      ai_meta: {
        source: data.source || 'from_knowledge',
        generated_by: 'wizard_v2',
        quality_score: score.score,
        score_detail: score,
        risk_level: risk.riskLevel,
        risk_points: risk.riskPoints,
        word_count: result.wordCount,
      },
      created_by: 'u1',
      created_at: new Date().toISOString(),
    };

    setScripts(prev => [newScript, ...prev]);
    setSelectedId(newScript.id);
    setAiResult({
      message: result.title ? '已生成短视频口播脚本「' + result.title + '」' : '已生成脚本',
      '副标题': result.hook,
      '评分': score.score + '/100',
      '等级': score.grade,
      '风险': risk.riskLevel,
      '字数': result.wordCount + '字',
    });
  };

  const getQualityScore = (s: Script): number => {
    if (s.ai_meta?.quality_score) return s.ai_meta.quality_score as number;
    const base = 65 + Math.floor(Math.random() * 25);
    return Math.min(base, 98);
  };

  const qualityScore = selected ? getQualityScore(selected) : 0;

  return <ScriptsRenderer
    scripts={scripts} filtered={filtered} selected={selected}
    search={search} filters={filters}
    showAiMenu={showAiMenu} showWizard={showWizard}
    aiResult={aiResult} activeAiAction={activeAiAction}
    qualityScore={qualityScore} selectedId={selectedId}
    editingScriptId={editingScriptId} editForm={editForm}
    pushedToTopics={pushedToTopics}
    getAccountName={getAccountName}
    getQualityScore={getQualityScore}
    handleAiAction={handleAiAction}
    handleWizardGenerate={handleWizardGenerate}
    handleStartEdit={handleStartEdit}
    handleSaveEdit={handleSaveEdit}
    handleCancelEdit={handleCancelEdit}
    handlePushToTopics={handlePushToTopics}
    setEditForm={setEditForm}
    setSelectedId={setSelectedId}
    setSearch={setSearch} setFilters={setFilters}
    setShowAiMenu={setShowAiMenu}
    setShowWizard={setShowWizard}
    setAiResult={setAiResult}
  />;
}
