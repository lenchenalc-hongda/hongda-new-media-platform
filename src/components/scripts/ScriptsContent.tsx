'use client';
import { ScriptsRenderer } from './ScriptsRenderer';
import { useState, useMemo } from 'react';
import { ALL_MOCK_SCRIPTS, MOCK_ACCOUNTS, MOCK_KNOWLEDGE_NEW, MOCK_TOPICS } from '@/lib/constants/mock-data';
import { usePersistentState, STORAGE_KEYS, saveData, getStoredData, saveToServer, loadFromServer } from '@/lib/storage';
import type { Script, Topic } from '@/lib/constants/types';
import { scoreScript, ScriptScoreResult } from '@/lib/ai/script-scoring';

export default function ScriptsContent() {
  const [scripts, setScripts] = usePersistentState<any>(STORAGE_KEYS.SCRIPTS, ALL_MOCK_SCRIPTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showWizard, setShowWizard] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [activeAiAction, setActiveAiAction] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [scoringAction, setScoringAction] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pushedToTopics, setPushedToTopics] = useState<Set<string>>(new Set());

  // Edit mode state
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Script>>({});

  const selected = scripts.find(s => s.id === selectedId);

  // 按创建时间排序（最新在最前）
  const filtered = [...scripts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).filter(s => {
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

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
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
  const handlePushToTopics = async (scriptId: string) => {
    const s = scripts.find(x => x.id === scriptId);
    if (!s) { console.warn('[push] Script not found:', scriptId); return; }
    const account = MOCK_ACCOUNTS.find(a => a.id === s.account_id);
    const newTopic: Topic = {
      id: 't' + Date.now(),
      org_id: 'org_001',
      account_id: s.account_id || 'a1',
      title: s.title || '未命名脚本',
      content_type: (s.ai_meta as any)?.structure || '客户问答',
      platform: account?.platform || '视频号',
      topic_source: '脚本工厂',
      target_customer: null, customer_pain: null, product_process: null,
      material: null, content_angle: null, core_point: null,
      why_user_watch: null, content_purpose: null, conversion_goal: null,
      comment_guidance: null, private_message_action: null,
      required_customer_info: null, sample_guidance: null,
      shooting_method: null, video_length: null, required_products: null,
      required_shots: null, required_factory_assets: null, required_case_images: null,
      logo_risk: null, privacy_risk: null, knowledge_refs: null,
      faq_refs: null, case_refs: null, viral_refs: null,
      review_refs: null, risk_rules: null,
      script_status: '已生成', linked_script_id: scriptId, linked_post_id: null,
      topic_score: null, score_detail: null, risk_level: null, risk_result: null,
      owner_id: null, last_action: null, is_this_week: false,
      planned_shoot_date: null, planned_publish_date: null,
      target_audience: null, product_or_process: null,
      source: '脚本工厂', priority: '中', status: '待审核',
      notes: '从脚本工厂推进过来',
      created_by: 'u1', created_at: new Date().toISOString(),
    };
    // Save to localStorage + server (for cross-page sync via Supabase)
    const currentTopics = getStoredData(STORAGE_KEYS.TOPICS, MOCK_TOPICS);
    const updated = [...currentTopics, newTopic];
    saveData(STORAGE_KEYS.TOPICS, updated);
    await saveToServer(STORAGE_KEYS.TOPICS, updated);
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
    // If pipelineResult is available, use the best variant from pipeline
    if (data.pipelineResult) {
      const pr = data.pipelineResult;
      const duration = data.selectedDuration || data.video_length || '30';
      const variant = pr.variants.find((v: any) => v.duration === duration) || pr.bestVariant || pr.variants[0];
      if (!variant) return;

      const account = MOCK_ACCOUNTS.find(a => a.id === data.account_id);
      const scoreResult = variant.score || scoreScript(variant.script, duration);
      const newScript: Script = {
        id: 's' + Date.now(), org_id: 'org_001',
        topic_id: null, account_id: data.account_id || 'a1',
        title: pr.strategy.topic || '未命名脚本', hook: variant.hook,
        main_script: variant.script, shot_list: [],
        subtitle_points: variant.subtitlePoints?.join(' · ') || '',
        cover_text: '',
        comment_reply: '',
        private_message_cta: pr.strategy.conversionGoal || '',
        risk_notes: '不要承诺具体价格和交期，以实际打样为准',
        version: 1, status: pr.recommendedStatus === 'pending_review' ? 'pending_review' : 'draft',
        ai_meta: {
          source: 'pipeline_v3', generated_by: 'script_factory_v3',
          quality_score: scoreResult.totalScore, score_detail: scoreResult,
          risk_level: scoreResult.riskLevel, risk_points: scoreResult.riskPoints,
          word_count: variant.wordCount,
        },
        created_by: 'u1', created_at: new Date().toISOString(),
      };
      setScripts(prev => [newScript, ...prev]);
      setSelectedId(newScript.id);
      setAiResult({
        message: '已生成短视频口播脚本「' + newScript.title + '」',
        '副标题': variant.hook, '评分': scoreResult.totalScore + '/100',
        '等级': scoreResult.grade, '风险': scoreResult.riskLevel,
        '字数': variant.wordCount + '字', '时长': duration + '秒',
      });
      return;
    }

    // Legacy: no pipelineResult, use old generation
    const account = MOCK_ACCOUNTS.find(a => a.id === data.account_id);
    const selectedCards = data.knowledge_refs
      ? MOCK_KNOWLEDGE_NEW.filter(k => data.knowledge_refs.includes(k.id))
      : [];
    // Simple inline generation (no backend import)
    const result = {
      title: data.customerPain || data.customer_pain || data.topic || '脚本',
      hook: data.topic || data.customerPain || data.customer_pain || '',
      script: [
        data.topic || data.customerPain || data.customer_pain || '',
        '需要看具体产品的材质和数量才能判断。',
        '你把产品图和材质发我，我帮你分析。',
      ].join('\n'),
      wordCount: 0,
      duration: (data.video_length || '30') + '秒',
      score: 60,
      grade: 'C',
      riskLevel: '低',
      subtitlePoints: "",
      coverText: "",
      commentGuidance: "",
      privateMessageCta: "",
      riskNotes: "",
      status: "draft",
    };
    const scriptText = result.script;
    const duration = data.video_length || '30';
    const scoreResult = scoreScript(scriptText, duration);
    const newScript: Script = {
      id: 's' + Date.now(), org_id: 'org_001',
      topic_id: null, account_id: data.account_id || 'a1',
      title: result.title, hook: result.hook,
      main_script: scriptText, shot_list: [],
      subtitle_points: result.subtitlePoints,
      cover_text: (result as any).coverText || '',
      comment_reply: result.commentGuidance,
      private_message_cta: result.privateMessageCta,
      risk_notes: result.riskNotes, version: 1, status: 'draft',
      ai_meta: {
        source: data.source || 'from_knowledge', generated_by: 'wizard_v2',
        quality_score: scoreResult.totalScore, score_detail: scoreResult,
        risk_level: scoreResult.riskLevel, risk_points: scoreResult.riskPoints,
        word_count: result.wordCount,
      },
      created_by: 'u1', created_at: new Date().toISOString(),
    };
    setScripts(prev => [newScript, ...prev]);
    setSelectedId(newScript.id);
    setAiResult({
      message: result.title ? '已生成短视频口播脚本「' + result.title + '」' : '已生成脚本',
      '副标题': result.hook, '评分': scoreResult.totalScore + '/100',
      '等级': scoreResult.grade, '风险': scoreResult.riskLevel,
      '字数': result.wordCount + '字',
    });
  };
  const getScoreResult = (s: Script): ScriptScoreResult => {
    if (s.ai_meta?.score_detail) return s.ai_meta.score_detail as ScriptScoreResult;
    const text = s.main_script || s.hook || '';
    return scoreScript(text, '30');
  };

  const handleDeleteScript = (id: string) => {
    setScripts(prev => prev.filter(s => s.id !== id));
    if (selectedId === id) { setSelectedId(null); setEditingScriptId(null); setEditForm({}); }
    setAiResult({ message: '已删除脚本 ✅' });
    setTimeout(() => setAiResult(null), 3000);
  };

  const handleRescore = async () => {
    if (!selected) return;
    setScoringAction('rescore');
    setAiResult({ message: '正在重新评分...' });
    await new Promise(r => setTimeout(r, 100));
    const result = scoreScript(selected.main_script || selected.hook || '', '30');
    setScripts(prev => prev.map(s =>
      s.id === selectedId ? { ...s, quality_score: result.totalScore, score_detail: result, risk_level: result.riskLevel } : s
    ));
    setScoringAction(null);
    setAiResult({ message: '重新评分完成 ✅' });
    setTimeout(() => setAiResult(null), 3000);
  };

  const handleDuplicateRewrite = async () => {
    if (!selected) return;
    setScoringAction('duplicate');
    setAiResult({ message: 'AI正在生成3个变体...' });
    try {
      const res = await fetch('/api/ai/script/duplicate-rewrite', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ script: selected.main_script, hook: selected.hook }),
      });
      const data = await res.json();
      if (data.variants) {
        const newScripts = data.variants.map((v: any, i: number) => {
          const vs = scoreScript(v.script, '30');
          return {
            id: 'dup_' + Date.now() + '_' + i,
            title: selected.title + '（' + v.tone + '）',
            hook: v.hook || selected.hook,
            main_script: v.script,
            account_id: selected.account_id,
            platform: selected.platform,
            status: 'draft',
            created_at: new Date().toISOString(),
            quality_score: vs.totalScore,
            score_detail: vs,
            risk_level: vs.riskLevel,
          };
        });
        setScripts(prev => [...newScripts, ...prev]);
        setAiResult({ message: '已生成 ' + newScripts.length + ' 个变体 ✅' });
      }
    } catch { setAiResult({ message: '复制重写失败' }); }
    setScoringAction(null);
    setTimeout(() => setAiResult(null), 3000);
  };

  const handleDeepOptimize = async () => {
    if (!selected) return;
    setScoringAction('optimize');
    setAiResult({ message: 'AI正在深度优化...' });
    try {
      const sd = selected.score_detail;
      const account = MOCK_ACCOUNTS.find(a => a.id === selected.account_id);
      const res = await fetch('/api/ai/script/optimize', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          script: selected.main_script,
          hook: selected.hook,
          duration: selected.video_length || '30',
          totalScore: sd?.totalScore,
          weaknesses: sd?.weaknesses,
          rewriteSuggestions: sd?.rewriteSuggestions,
          account: account || {},
          knowledgeCards: selected.knowledge_refs
            ? MOCK_KNOWLEDGE_NEW.filter(k => selected.knowledge_refs.includes(k.id))
            : [],
        }),
      });
      const data = await res.json();
      if (data.optimizedScript) {
        // Use AI score if available, fallback to local score
        const aiScore = data.aiScore;
        const newScore = aiScore?.totalScore ? {
          totalScore: aiScore.totalScore || 60,
          grade: aiScore.grade || 'C',
          weaknesses: aiScore.weaknesses || [],
          strengths: aiScore.strengths || [],
          riskLevel: aiScore.riskLevel || '低',
          rewriteSuggestions: aiScore.rewriteSuggestions || [],
          hookScore: aiScore.hookScore || 0,
          spokenScore: aiScore.spokenScore || 0,
          painScore: aiScore.painScore || 0,
          ctaScore: aiScore.ctaScore || 0,
        } : scoreScript(data.optimizedScript, '30');
        
        setAiResult({
          message: '深度优化完成 ✅',
          data: {
            before: data.before,
            after: data.after,
            changes: data.changes,
            oldScore: sd,
            newScore,
          }
        });
        // Show comparison for 15 seconds instead of 3
        setTimeout(() => setAiResult(null), 15000);
      }
    } catch { setAiResult({ message: '优化失败' }); }
    setScoringAction(null);
  };

  // === Multiselect & Bulk ===
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const handleToggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(s => s.id)));
  };
  const handleBulkSaveDraft = () => {
    setScripts(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, status: 'draft' as any } : s));
    setSelectedIds(new Set());
    setAiResult({ message: '已保存 ' + selectedIds.size + ' 个到草稿 ✅' });
    setTimeout(() => setAiResult(null), 3000);
  };
  const handleBulkSavePendingReview = () => {
    setScripts(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, status: 'pending_review' as any } : s));
    setSelectedIds(new Set());
    setAiResult({ message: '已提交 ' + selectedIds.size + ' 个到待审核 ✅' });
    setTimeout(() => setAiResult(null), 3000);
  };
  const handleBulkPolish = () => {
    setAiResult({ message: '批量润色 ' + selectedIds.size + ' 个脚本（mock）' });
    setTimeout(() => setAiResult(null), 3000);
  };
  const handleBulkRiskCheck = () => {
    setAiResult({ message: '批量风险检查 ' + selectedIds.size + ' 个脚本（mock）' });
    setTimeout(() => setAiResult(null), 3000);
  };
  const handleBulkScore = () => {
    setAiResult({ message: '批量重新评分 ' + selectedIds.size + ' 个脚本（mock）' });
    setTimeout(() => setAiResult(null), 3000);
  };
  const handleBulkDiscard = () => {
    setScripts(prev => prev.filter(s => !selectedIds.has(s.id)));
    setSelectedIds(new Set());
    setAiResult({ message: '已丢弃 ' + selectedIds.size + ' 个脚本' });
    setTimeout(() => setAiResult(null), 3000);
  };

  const selectedScoreResult = useMemo(() => {
    if (!selected) return null;
    return getScoreResult(selected);
  }, [selected]);

  return <ScriptsRenderer
    scripts={scripts} filtered={filtered} selected={selected}
    search={search} filters={filters}
    showAiMenu={showAiMenu} showWizard={showWizard}
    aiResult={aiResult} activeAiAction={activeAiAction}
    scoreResult={selectedScoreResult} selectedId={selectedId}
    editingScriptId={editingScriptId} editForm={editForm}
    pushedToTopics={pushedToTopics}
    selectedIds={selectedIds}
    getAccountName={getAccountName}
    getScoreResult={getScoreResult}
    handleAiAction={handleAiAction}
    handleWizardGenerate={handleWizardGenerate}
    handleStartEdit={handleStartEdit}
    handleSaveEdit={handleSaveEdit}
    handleCancelEdit={handleCancelEdit}
    handleDeleteScript={handleDeleteScript}
    scoringAction={scoringAction}
    onRescore={handleRescore}
    onDuplicateRewrite={handleDuplicateRewrite}
    onDeepOptimize={handleDeepOptimize}
    handlePushToTopics={handlePushToTopics}
    onBulkSaveDraft={handleBulkSaveDraft}
    onBulkSavePendingReview={handleBulkSavePendingReview}
    onBulkPolish={handleBulkPolish}
    onBulkRiskCheck={handleBulkRiskCheck}
    onBulkScore={handleBulkScore}
    onBulkDiscard={handleBulkDiscard}
    onToggleSelect={handleToggleSelect}
    onToggleSelectAll={handleToggleSelectAll}
    setEditForm={setEditForm}
    setSelectedId={setSelectedId}
    setSearch={setSearch} setFilters={setFilters}
    setShowAiMenu={setShowAiMenu}
    setShowWizard={setShowWizard}
    setAiResult={setAiResult}
  />;
}
