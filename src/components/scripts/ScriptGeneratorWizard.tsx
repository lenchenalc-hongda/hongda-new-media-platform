'use client';
import { useState, useMemo, useEffect } from 'react';
import { MOCK_ACCOUNTS, MOCK_KNOWLEDGE_NEW } from '@/lib/constants/mock-data';
import { PLATFORMS, SCRIPT_STRUCTURES, ACTING_STYLES, TONE_STYLES, CONVERSION_GOALS } from '@/lib/constants';
import { scoreScript } from '@/lib/ai/script-scoring';

// Simple inline replacements (no backend import needed)
function simpleSplitBroadTopic(topic: string): string[] {
  return [topic];
}
function simpleScriptStrategy(input: any): any {
  return {
    topic: input.customerPain || input.topic || '',
    hook: input.topic || input.customerPain || '',
    targetCustomer: input.account?.target_audience || '有需求的客户',
    customerPain: input.customerPain || '',
    corePoint: '',
    whyWatch: '',
    conversionGoal: ''
  };
}
function simpleGenerateHook(input: any): string {
  return input.topic || input.customerPain || '';
}
function simpleRunPipeline(input: any): any {
  const strategy = simpleScriptStrategy(input);
  const hook = simpleGenerateHook(input);
  const pain = input.customerPain || input.productOrProcess || '';
  const mat = input.material || '';
  const lines: string[] = [hook || pain || ''];
  if (mat) {
    lines.push(mat + '的工艺方案需要看具体要求。');
  } else if (pain) {
    lines.push(pain.slice(0, 20) + '？这需要看具体产品和测试要求。');
  } else {
    lines.push('热转印的方案取决于你的产品和具体要求。');
  }
  lines.push('你把产品图和材质发我，我帮你判断最合适的方案。');
  const script = lines.join('\n');
  const variants = ['15', '30', '60'].map(d => ({
    duration: d, hook, script,
    wordCount: script.length, estimatedSeconds: parseInt(d),
    score: { totalScore: 60, grade: 'C' as const, riskLevel: '低' as const,
      weaknesses: [], strengths: [], rewriteSuggestions: [] },
  }));
  return { strategy, hook, variants, score: { totalScore: 60, grade: 'C' } };
}


interface ScriptGeneratorWizardProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (data: any) => void;
}

export default function ScriptGeneratorWizard({ open, onClose, onGenerate }: ScriptGeneratorWizardProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    account_id: '', platform: '',
    product_or_process: '', customer_pain: '', material: '',
    structure: '', video_length: '30', acting_style: '', tone_style: '',
    knowledge_refs: [] as string[],
    knowledgeMode: 'none' as 'none' | 'auto' | 'manual',
  });
  const [productSuggestions, setProductSuggestions] = useState<string[]>([]);
  const [painSuggestions, setPainSuggestions] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState<string | null>(null);
  // Pipeline preview state
  const [pipelineResult, setPipelineResult] = useState<any>(null);
  const [angles, setAngles] = useState<any[]>([]);
  const [selectedAngle, setSelectedAngle] = useState<any>(null);
  const [anglesLoading, setAnglesLoading] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<'15' | '30' | '60'>('30');
  const [angleCounter, setAngleCounter] = useState(0);
  const [hookResults, setHookResults] = useState<any[]>([]);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [selectedHookId, setSelectedHookId] = useState<string | null>(null);
  const [selectedHookText, setSelectedHookText] = useState<string>('');
  const [rewriteFeedback, setRewriteFeedback] = useState<string>('');
  const [showRewriteInput, setShowRewriteInput] = useState(false);
  const [optimizedResult, setOptimizedResult] = useState<any>(null);
  const [showOptimizeCompare, setShowOptimizeCompare] = useState(false);
  const [optimizeLoading, setOptimizeLoading] = useState(false);

  const update = (key: string, value: any) => setForm({ ...form, [key]: value });

  useEffect(() => {
    if (selectedAngle && form.customer_pain) {
      fetchHooks();
    }
  }, [selectedAngle?.id]);

  useEffect(() => {
    if (form.knowledgeMode === 'auto' && (form.customer_pain || form.product_or_process || form.account_id)) {
      fetch('/api/ai/script/recommend-knowledge', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ account: selectedAccount, platform: form.platform, productOrProcess: form.product_or_process, customerPain: form.customer_pain, material: form.material }),
      }).then(res => res.json()).then(data => {
        if (data.cards && data.cards.length > 0) {
          setProductSuggestions(data.cards.map((c: any) => c.title));
        }
      }).catch(() => {});
    }
  }, [form.knowledgeMode]);

  const fetchHooks = async (style?: string) => {
    setHooksLoading(true);
    try {
      const controller = new AbortController();
      const ftimeout = setTimeout(() => controller.abort(), 35000);
      const res = await fetch("/api/ai/script/hooks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          customerPain: form.customer_pain,
          productOrProcess: form.product_or_process,
          material: form.material,
          account: selectedAccount || {},
          angle: selectedAngle || undefined,
        }),
      });
      clearTimeout(ftimeout);
      const data = await res.json();
      if (data.hooks) {
        setHookResults(data.hooks);
        if (data.hooks.length > 0) {
          setSelectedHookId(data.hooks[0].hook.id);
          setSelectedHookText(data.hooks[0].hook.hookText);
        }
      }
    } catch (e) { 
      console.warn("[Wizard] Hook fetch failed, using fallback:", e);
      // Fallback hooks that always work
      const pain = form.customer_pain || selectedAngle?.customerPain || form.product_or_process || '热转印';
                      const mat = form.material || '';
                      const accName = selectedAccount?.name?.split('-')[0] || '';
                      const accTarget = selectedAccount?.target_audience || '';
                      const angleTitle = selectedAngle?.title || pain;
                      
                      // Generate hooks dynamically based on input
                      const hookTexts = [];
                      const keywords = (pain + ' ' + mat).toLowerCase();
                      
                      if (keywords.includes('多少钱') || keywords.includes('价格') || keywords.includes('报价') || keywords.includes('成本')) {
                        hookTexts.push(
                          { text: '客户只说报个价，我一般会先发三个问题过去。', type: 'direct_question', tension: 'price', why: '帮客户理解报价需要哪些信息' },
                          { text: '一张图就想拿到最低价，我给不出也建议你不要信。', type: 'warning', tension: 'cost_waste', why: '客户怕买贵了' },
                          { text: mat ? mat + '的价格不是一张图能报的。' : '价格跟材质数量工艺要求有关。', type: 'cost_conflict', tension: 'price', why: '跟钱有关客户都在意' }
                        );
                      }
                      if (keywords.includes('pe') || keywords.includes('pp') || keywords.includes('abs') || keywords.includes('材质') || keywords.includes('材料') || keywords.includes('塑料')) {
                        hookTexts.push(
                          { text: mat ? mat + '能不能做热转印？先别急着回答。' : 'PE瓶不是不能印，是不能直接承诺。', type: 'material_risk', tension: 'can_or_cannot', why: '帮客户理解材质判断逻辑' },
                          { text: '同样的瓶子，不一样的材质，结果是两个方案。', type: 'comparison', tension: 'wrong_assumption', why: '纠正客户的材质认知误区' }
                        );
                      }
                      if (keywords.includes('会不会掉') || keywords.includes('附着力') || keywords.includes('测试')) {
                        hookTexts.push(
                          { text: '你问我会不会掉，我最怕直接回答不会。', type: 'test_risk', tension: 'fear_of_failure', why: '怕翻车是客户最大的顾虑' },
                          { text: '客户的测试要求不一样，回答也不一样。', type: 'test_risk', tension: 'quality_risk', why: '客户担心质量不过关' }
                        );
                      }
                      if (keywords.includes('颜色') || keywords.includes('色差')) {
                        hookTexts.push(
                          { text: '客户说颜色按图片做，这个风险很大。', type: 'warning', tension: 'quality_risk', why: '手机看到的颜色不等于印出来的颜色' },
                          { text: '同样的潘通号，不同材质印出来颜色也不一样。', type: 'counterintuitive', tension: 'quality_risk', why: '色差问题客户最头疼' }
                        );
                      }
                      if (keywords.includes('打样') || keywords.includes('样品')) {
                        hookTexts.push(
                          { text: '打样和大货做到一模一样，真的那么简单吗？', type: 'direct_question', tension: 'quality_risk', why: '客户想知道打样和大货的区别' }
                        );
                      }
                      if (accName === '小林' || accName === '小陈') {
                        hookTexts.push(
                          { text: '刚入行的时候，看材质我也分不清。', type: 'nini_perspective', tension: 'wrong_assumption', why: '新手视角更容易代入' }
                        );
                      } else if (accName === '老板' || accName === '许总') {
                        hookTexts.push(
                          { text: '做了20年印刷，我告诉你最大的坑是什么。', type: 'boss_experience', tension: 'fear_of_failure', why: '老板身份自带权威感' }
                        );
                      }
                      hookTexts.push(
                        { text: '客户只发一张图，我怎么判断能不能做？', type: 'direct_question', tension: 'can_or_cannot', why: '帮客户理解判断需要哪些信息' },
                        { text: '不看材质就承诺能做的，风险很大。', type: 'warning', tension: 'fear_of_failure', why: '怕踩坑的内容天然吸引关注' },
                        { text: '不打样就直接做大货，十个有八个翻车。', type: 'warning', tension: 'fear_of_failure', why: '客户怕翻车' },
                        { text: '按上次一样做就行，这话不能直接听。', type: 'customer_quote', tension: 'quality_risk', why: '客户原话更容易产生共鸣' }
                      );
                      
                      // Shuffle and pick top 5
                      const shuffled = [...hookTexts].sort(() => Math.random() - 0.5);
                      const topHooks = shuffled.slice(0, 5);
                      const fallbackHooks = topHooks.map((h, i) => ({
                        hook: {
                          id: 'fb_' + Date.now() + '_' + i,
                          hookText: h.text,
                          hookType: h.type,
                          tensionType: h.tension,
                          targetCustomer: accTarget,
                          whyItWorks: h.why,
                          riskNotes: '',
                          similarityToRecentScripts: 0,
                          score: 0,
                          scoreDetail: { specificity: 0, conflictStrength: 0, spokenNaturalness: 0, ctaPotential: 0, riskSafety: 0 },
                        },
                        totalScore: Math.round(85 - i * 3 + Math.random() * 5),
                        grade: 'A',
                        dimensions: [],
                        penalties: [],
                        strengths: [h.type === 'direct_question' ? '开头有明确问题' : h.type === 'warning' ? '风险预警明确' : h.type === 'material_risk' ? '材质风险直接' : '内容有冲突'],
                        weaknesses: [],
                        rank: i + 1,
                      }));
      setHookResults(fallbackHooks);
      if (fallbackHooks.length > 0) {
        setSelectedHookId(fallbackHooks[0].hook.id);
        setSelectedHookText(fallbackHooks[0].hook.hookText);
      }
    }
    setHooksLoading(false);
  };

  const handleSuggestProducts = async () => {
    // Immediate feedback: show local suggestions right away
    const fb = ['热转印工艺讲解','PE瓶材质判断','小批量热转印方案','丝印和热转印对比','附着力测试教程','打样流程','防背粘工艺','颜色还原技巧'];
    setProductSuggestions(fb);
    setSuggestLoading(null);
    // Async API upgrade: try to get better suggestions from AI
    try {
      const res = await fetch('/api/ai/script/suggest-products', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ account: selectedAccount, platform: form.platform, knowledgeMode: form.knowledgeMode, material: form.material }),
      });
      const data = await res.json();
      if (data.suggestions && data.suggestions.length > 0) {
        setProductSuggestions(data.suggestions.map((s: any) => s.title));
      }
    } catch {}
  };

  const handleSuggestPains = async () => {
    // Immediate feedback: show local suggestions right away
    const fb = ['客户问多少钱','PE能不能做热转印','附着力测试','颜色按图片做','打样和大货不一样','小批量能不能做','材质不确定','客户只发图片'];
    setPainSuggestions(fb);
    setSuggestLoading(null);
    // Async API upgrade: try to get better suggestions from AI
    try {
      const res = await fetch('/api/ai/script/suggest-pains', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ account: selectedAccount, platform: form.platform, productOrProcess: form.product_or_process, material: form.material }),
      });
      const data = await res.json();
      if (data.suggestions && data.suggestions.length > 0) {
        setPainSuggestions(data.suggestions.map((s: any) => s.pain));
      }
    } catch {}
  };

  const handleSelectHook = (hook: any) => {
    setSelectedHookId(hook.id);
    setSelectedHookText(hook.hookText);
  };

  const selectedAccount = MOCK_ACCOUNTS.find(a => a.id === form.account_id);

  // Auto-suggest pain points and hooks based on selection
  const suggestions = useMemo(() => {
    if (!selectedAccount) return { pains: [], materials: [] };
    const pains = ['客户问多少钱', '材质能不能做热转印', '附着力测试', '颜色按图片做', '打样和大货不一致', '小批量能不能做'];
    const materials = ['PE', 'PP', 'ABS', 'PET', '不锈钢', '玻璃', 'PC'];
    return { pains, materials };
  }, [selectedAccount]);

  // Preview hook for the current form state
  const previewHook = useMemo(() => {
    if (!form.customer_pain && !form.product_or_process) return '';
    return simpleGenerateHook({
      pain: form.customer_pain,
      product: form.product_or_process,
      material: form.material,
      topic: form.product_or_process,
    });
  }, [form.customer_pain, form.product_or_process, form.material]);

  // Check if topic is broad
  const isBroad = useMemo(() => {
    const topic = form.customer_pain || form.product_or_process || '';
    return topic.length > 12 ||
      ['介绍', '注意事项', '说清楚', '全部', '常见问题'].some(k => topic.includes(k));
  }, [form.customer_pain, form.product_or_process]);

  const subTopics = useMemo(() => {
    const topic = form.customer_pain || form.product_or_process || '';
    return isBroad ? simpleSplitBroadTopic(topic) : [];
  }, [form.customer_pain, form.product_or_process, isBroad]);

  const canNext = () => {
    if (step === 1) return !!form.account_id && !!form.platform;
    if (step === 2) return true;
    if (step === 3) return !!selectedHookText;
    if (step === 4) return true;
    return true;
  };

  const handleGenerate = async () => {
    const selectedCards = form.knowledge_refs
      ? MOCK_KNOWLEDGE_NEW.filter(k => form.knowledge_refs.includes(k.id))
      : [];
    let result = null;
    // Try DeepSeek API first
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch('/api/ai/script/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: selectedAccount || {},
          topic: form.product_or_process || form.customer_pain,
          customerPain: form.customer_pain,
          productOrProcess: form.product_or_process,
          material: form.material,
          knowledgeCards: selectedCards,
          video_length: form.video_length,
          selectedAngleId: selectedAngle?.id || null,
          selectedHookId: selectedHookId || null,
          selectedHookText: selectedHookText || null,
          knowledgeMode: form.knowledgeMode,
          forceSync: true,
          pipelineConfig: { useAI: true, aiProvider: 'deepseek' },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json(); 
      if (data && data.variants && data.variants.length > 0) { result = data; }
      else if (data && data.error) { console.warn('[Wizard] API error:', data.error); }
    } catch (e) { console.warn('[Wizard] AI API failed, using rule engine:', e); }
    // Fall back to rule engine
    if (!result) {
      result = simpleRunPipeline({
        account: selectedAccount || {},
        topic: form.product_or_process || form.customer_pain,
        customerPain: form.customer_pain,
        productOrProcess: form.product_or_process,
        material: form.material,
        knowledgeCards: selectedCards,
        video_length: form.video_length,
      });
    }
    // Force selected hook as first sentence (smart: skip if already matching)
    if (result && selectedHookText && result.variants) {
      result.variants.forEach((v: any) => {
        const lines = v.script.split('\n').filter((l: string) => l.trim());
        if (lines.length > 0 && selectedHookText) {
          if (lines[0].trim() !== selectedHookText.trim()) {
            // Script doesn't start with selected hook - prepend it
            v.script = selectedHookText + '\n' + lines.slice(1).join('\n');
          }
          v.hook = selectedHookText;
        }
      });
      if (result.bestVariant) {
        const lines = result.bestVariant.script.split('\n').filter((l: string) => l.trim());
        if (lines.length > 0 && selectedHookText) {
          if (lines[0].trim() !== selectedHookText.trim()) {
            result.bestVariant.script = selectedHookText + '\n' + lines.slice(1).join('\n');
          }
          result.bestVariant.hook = selectedHookText;
        }
      }
      if (result.strategy) result.strategy.hook = selectedHookText;
    }
    setPipelineResult(result);
    setSelectedDuration((form.video_length || '30') as '15' | '30' | '60');
    setStep(5);
  };

  const handleConfirmGenerate = () => {
    if (!pipelineResult) return;
    onGenerate({
      ...form,
      pipelineResult,
      selectedDuration,
    });
    handleClose();
  };

  const handleClose = () => {
    onClose();
    setStep(1);
    setPipelineResult(null);
  };

  const handleOptimize = async () => {
    if (!pipelineResult?.bestVariant) return;
    setOptimizeLoading(true);
    try {
      const v = pipelineResult.bestVariant;
      const res = await fetch('/api/ai/script/optimize', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          script: v.script, hook: v.hook, duration: selectedDuration,
          totalScore: v.score?.totalScore,
          weaknesses: v.score?.weaknesses,
          rewriteSuggestions: v.score?.rewriteSuggestions,
        }),
      });
      const data = await res.json();
      if (data.optimizedScript) { setOptimizedResult(data); setShowOptimizeCompare(true); }
    } catch {}
    setOptimizeLoading(false);
  };

  const handleOptimizeConfirm = () => {
    if (!optimizedResult) return;
    const nr = { ...pipelineResult };
    const optScript = optimizedResult.optimizedScript;
    // Recalculate scores for all variants using local scoring engine
    nr.variants = pipelineResult.variants.map((v: any) => {
      const newScore = scoreScript(optScript, v.duration);
      return { ...v, script: optScript, score: newScore };
    });
    // Update best variant with new score
    const scored = [...nr.variants].sort((a: any, b: any) => (b.score?.totalScore||0) - (a.score?.totalScore||0));
    nr.bestVariant = scored[0] || { ...nr.bestVariant, script: optScript };
    const bs = nr.bestVariant.score;
    nr.recommendedStatus = 'draft';
    if (bs) {
      if (bs.totalScore >= 85 && bs.riskLevel !== '高') nr.recommendedStatus = 'pending_review';
      else if (bs.totalScore >= 70) nr.recommendedStatus = 'draft';
      else if (bs.totalScore >= 60) nr.recommendedStatus = 'needs_rewrite';
      else nr.recommendedStatus = 'discard';
    }
    nr.risk = { riskLevel: bs?.riskLevel || '低', riskPoints: bs?.riskPoints || [], allowSave: bs?.riskLevel !== '高' };
    setPipelineResult(nr);
    setShowOptimizeCompare(false);
  };

  const handleRewrite = async () => {
    if (!pipelineResult) return;
    const bestScript = pipelineResult.bestVariant?.script || '';
    const bestHook = pipelineResult.bestVariant?.hook || '';
    try {
      const res = await fetch('/api/ai/rewrite-script', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ script: bestScript, hook: bestHook, feedback: '请用更口语化、更短句、更像工厂老板在说话的方式重写' }),
      });
      const data = await res.json();
      if (data.script) {
        const newResult = { ...pipelineResult };
        newResult.variants = pipelineResult.variants.map((v: any) => ({
          ...v, script: data.script, hook: data.hook || v.hook,
        }));
        newResult.bestVariant = { ...newResult.bestVariant, script: data.script, hook: data.hook || newResult.bestVariant?.hook };
        setPipelineResult(newResult);
      }
    } catch {}
  };

  const handleRewriteWithFeedback = async () => {
    if (!pipelineResult || !rewriteFeedback.trim()) return;
    const bestScript = pipelineResult.bestVariant?.script || '';
    const bestHook = pipelineResult.bestVariant?.hook || '';
    try {
      const res = await fetch('/api/ai/rewrite-script', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ script: bestScript, hook: bestHook, feedback: rewriteFeedback }),
      });
      const data = await res.json();
      if (data.script) {
        const newResult = { ...pipelineResult };
        newResult.variants = pipelineResult.variants.map((v: any) => ({
          ...v, script: data.script, hook: data.hook || v.hook,
        }));
        newResult.bestVariant = { ...newResult.bestVariant, script: data.script, hook: data.hook || newResult.bestVariant?.hook };
        setPipelineResult(newResult);
        setShowRewriteInput(false);
        setRewriteFeedback('');
      }
    } catch {}
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[800px] max-h-[90vh] overflow-y-auto mx-4 shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-800">短视频脚本流水线</h2>
            <p className="text-xs text-gray-400 mt-1">
              {step <= 4 ? `第${step}步 / 共4步` : '生成结果'}
            </p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Progress bar (only for steps 1-4) */}
        {step <= 4 && (
          <>
            <div className="flex px-5 pt-4 gap-1">
              {[1, 2, 3, 4].map(s => (
                <div key={s} className={`flex-1 h-1.5 rounded ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
              ))}
            </div>
            <div className="flex justify-between px-5 text-xs text-gray-400 mt-1">
              <span>账号平台</span>
              <span>内容定位</span>
              <span>钩子选择</span>
              <span>脚本参数</span>
            </div>
          </>
        )}

        {/* Body */}
        <div className="p-5">
          {/* Step 1: Account & Platform */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700">选择账号和发布平台</h3>
              <div>
                <label className="block text-xs text-gray-500 mb-1">所属账号</label>
                <select className="select-field" value={form.account_id}
                  onChange={e => update('account_id', e.target.value)}>
                  <option value="">请选择账号</option>
                  {(MOCK_ACCOUNTS || []).map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name.split('-')[0]}（{a.platform === 'weixin' ? '视频号' : '抖音'}）
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">发布平台</label>
                <select className="select-field" value={form.platform}
                  onChange={e => update('platform', e.target.value)}>
                  <option value="">请选择平台</option>
                  {PLATFORMS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              {selectedAccount && (
                <div className="bg-blue-50 p-3 rounded text-xs text-blue-700 leading-relaxed">
                  <strong>账号人设：</strong>{selectedAccount.persona}<br />
                  <strong>目标客户：</strong>{selectedAccount.target_audience}<br />
                  <strong>转化目标：</strong>{selectedAccount.conversion_goal}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Content Positioning */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700">内容定位</h3>
              <p className="text-xs text-gray-400">
                明确你想讲什么。如果主题太宽泛，系统会自动拆分成具体子选题。
              </p>

              {/* 知识库参考模式 */}
              <div>
                <h4 className="text-xs font-medium text-gray-600 mb-2">参考知识库</h4>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <button onClick={() => update('knowledgeMode', 'none')}
                    className={`p-2.5 rounded-lg border text-xs text-center transition-all ${form.knowledgeMode === 'none' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    <div className="font-medium text-gray-700 text-[11px]">不使用知识库</div>
                    <div className="text-[9px] text-gray-400 mt-0.5">轻量问答｜评论答疑</div>
                  </button>
                  <button onClick={() => update('knowledgeMode', 'auto')}
                    className={`p-2.5 rounded-lg border text-xs text-center transition-all ${form.knowledgeMode === 'auto' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    <div className="font-medium text-gray-700 text-[11px]">自动推荐知识卡</div>
                    <div className="text-[9px] text-gray-400 mt-0.5">系统自动匹配</div>
                  </button>
                  <button onClick={() => update('knowledgeMode', 'manual')}
                    className={`p-2.5 rounded-lg border text-xs text-center transition-all ${form.knowledgeMode === 'manual' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    <div className="font-medium text-gray-700 text-[11px]">手动选择知识卡</div>
                    <div className="text-[9px] text-gray-400 mt-0.5">自选工艺/材料FAQ</div>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">
                    要讲什么产品/工艺
                  </label>
                  <input className="input-field"
                    placeholder="如：PE材质热转印、花膜结构、防背粘工艺"
                    value={form.product_or_process}
                    onChange={e => update('product_or_process', e.target.value)} />

                  <button className="btn-secondary text-[10px] px-2 py-1 mt-1" onClick={handleSuggestProducts} disabled={suggestLoading === 'products'}>
                    {suggestLoading === 'products' ? 'AI推荐中...' : '帮我推荐产品/工艺方向'}
                  </button>
                  {productSuggestions.length > 0 && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded-lg">
                      <p className="text-[10px] font-medium text-blue-600 mb-1">AI推荐的产品/工艺方向（点击选择）：</p>
                      <div className="flex flex-wrap gap-1">
                        {productSuggestions.map((s, i) => (
                          <button key={i} className="text-[10px] bg-white hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200"
                            onClick={() => { update('product_or_process', s); setProductSuggestions([]); }}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">
                    客户痛点/问题
                  </label>
                  <input className="input-field"
                    placeholder="如：客户问多少钱、PE能不能做热转印、附着力测试"
                    value={form.customer_pain}
                    onChange={e => update('customer_pain', e.target.value)} />
                  {selectedAccount && suggestions.pains.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {suggestions.pains.map(p => (
                        <button key={p} className="text-xs bg-gray-100 hover:bg-blue-100 px-2 py-0.5 rounded"
                          onClick={() => update('customer_pain', p)}>
                          {p}
                        </button>
                      ))}
                    </div>
                  )}

                  <button className="btn-secondary text-[10px] px-2 py-1 mt-1" onClick={handleSuggestPains} disabled={suggestLoading === 'pains'}>
                    {suggestLoading === 'pains' ? 'AI推荐中...' : '帮我推荐客户痛点'}
                  </button>
                  {painSuggestions.length > 0 && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded-lg">
                      <p className="text-[10px] font-medium text-blue-600 mb-1">AI推荐的客户痛点（点击选择）：</p>
                      <div className="flex flex-wrap gap-1">
                        {painSuggestions.map((s, i) => (
                          <button key={i} className="text-[10px] bg-white hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200"
                            onClick={() => { update('customer_pain', s); setPainSuggestions([]); }}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">材质（可选）</label>
                  <select className="select-field" value={form.material}
                    onChange={e => update('material', e.target.value)}>
                    <option value="">不限</option>
                    <option value="不确定">不确定</option>
                    {suggestions.materials.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Angle Generator */}
              <div className="border-t border-gray-100 pt-3 mt-1">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-gray-600">内容角度建议</h4>
                  <button className="btn-secondary text-[10px] px-2 py-1"
                    onClick={async () => {
                      setAnglesLoading(true);
                      try {
                        const actrl = new AbortController();
                        const ato = setTimeout(() => actrl.abort(), 35000);
                        const res = await fetch('/api/ai/script/angles', {
                          method: 'POST', headers: {'Content-Type':'application/json'}, signal: actrl.signal,
                          body: JSON.stringify({ customerPain: form.customer_pain, productOrProcess: form.product_or_process, material: form.material, account: selectedAccount || {} }),
                        });
                        clearTimeout(ato);
                        if (res.ok) {
                          const data = await res.json();
                          if (data.angles && data.angles.length > 0) { setAngles(data.angles); setAnglesLoading(false); return; }
                        }
                      } catch {}
                      // Local fallback
                      const pain = form.customer_pain || form.product_or_process || '热转印';
                      const mat = form.material || '';
                      const accName = selectedAccount?.name?.split('-')[0] || '';
                      const targetAud = selectedAccount?.target_audience || '';
                      const fbAngles = [
                        { id: 'fa_' + angleCounter + '_1', title: '客户对' + pain.slice(0,10) + '最常犯的错', angleType: 'customer_misunderstanding', targetCustomer: targetAud, customerPain: pain, coreConflict: '客户以为很简单，实际很多细节要注意', whyItWorks: '客户想知道自己是不是做错了', recommendedAccount: accName, recommendedPlatform: '视频号', riskLevel: '低', score: Math.round(75 + Math.random() * 20), similarity: 0 },
                        { id: 'fa_' + angleCounter + '_2', title: (mat || pain) + '能不能做热转印？判断逻辑', angleType: 'material_risk', targetCustomer: targetAud, customerPain: pain, coreConflict: mat ? mat + '看着能印，但附着力不一定过关' : '不先确认就看图报价风险很大', whyItWorks: '客户怕做错了浪费钱', recommendedAccount: accName, recommendedPlatform: '视频号', riskLevel: '中', score: Math.round(75 + Math.random() * 20), similarity: 0 },
                        { id: 'fa_' + angleCounter + '_3', title: (mat || pain) + '的报价逻辑，一次说清楚', angleType: 'cost_logic', targetCustomer: '正在询价的客户', customerPain: pain, coreConflict: '只看图片报的价格不靠谱，需要知道材质和数量', whyItWorks: '客户想知道价格但不知道怎么问', recommendedAccount: accName, recommendedPlatform: '视频号', riskLevel: '低', score: Math.round(75 + Math.random() * 20), similarity: 0 },
                        { id: 'fa_' + angleCounter + '_4', title: '做过20年印刷的老师傅说' + (mat || pain.slice(0,6)), angleType: 'factory_experience', targetCustomer: '关心工艺细节的客户', customerPain: pain, coreConflict: '看起来一样的工艺，细节差很多', whyItWorks: '老师傅经验值得信', recommendedAccount: accName, recommendedPlatform: '视频号', riskLevel: '低', score: Math.round(75 + Math.random() * 20), similarity: 0 },
                        { id: 'fa_' + angleCounter + '_5', title: '一个做' + (pain.slice(0,8) || mat || '热转印') + '客户的真实经历', angleType: 'case_story', targetCustomer: '有类似需求的客户', customerPain: pain, coreConflict: '客户之前踩过坑，换对方法才做对', whyItWorks: '真实案例有说服力', recommendedAccount: accName, recommendedPlatform: '视频号', riskLevel: '低', score: Math.round(75 + Math.random() * 20), similarity: 0 },
                        { id: 'fa_' + angleCounter + '_6', title: (mat || pain) + '要不要先测试？', angleType: 'test_requirement', targetCustomer: '有测试要求的客户', customerPain: pain, coreConflict: '不打样测试直接大货，翻车是迟早的事', whyItWorks: '客户怕测试太麻烦，但更怕出问题', recommendedAccount: accName, recommendedPlatform: '视频号', riskLevel: '低', score: Math.round(75 + Math.random() * 20), similarity: 0 },
                        { id: 'fa_' + angleCounter + '_7', title: '回答一下关于' + (pain.slice(0,8) || mat || '热转印') + '的高赞评论', angleType: 'comment_reply', targetCustomer: '正搜索相关问题的客户', customerPain: pain, coreConflict: '很多人问但答案没那么简单', whyItWorks: '真实问题引起共鸣', recommendedAccount: accName, recommendedPlatform: '视频号', riskLevel: '低', score: Math.round(75 + Math.random() * 20), similarity: 0 },
                        { id: 'fa_' + angleCounter + '_8', title: (mat || '价格') + '相关的3个最坑误区', angleType: 'customer_misunderstanding', targetCustomer: targetAud, customerPain: pain, coreConflict: '客户以为知道，其实搞反了', whyItWorks: '纠正认知有传播力', recommendedAccount: accName, recommendedPlatform: '视频号', riskLevel: '低', score: Math.round(75 + Math.random() * 20), similarity: 0 },
                      ].sort(() => Math.random() - 0.5);
                      setAngles(fbAngles);
                      setSelectedAngle(null);
                      setAngleCounter(c => c + 1);
                      setAnglesLoading(false);
                    }}>
                    {angles.length > 0 ? '重新生成' : '生成角度建议'}
                  </button>
                </div>

                {angles.length > 0 && (
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                    {angles.map(a => (
                      <button key={a.id}
                        onClick={() => { setSelectedAngle(a); update('customer_pain', a.customerPain || form.customer_pain); }}
                        className={`text-left p-2 rounded border text-[10px] transition-all ${
                          selectedAngle?.id === a.id
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}>
                        <span className={`text-[9px] px-1 py-0.5 rounded ${
                          a.riskLevel === '高' ? 'bg-red-100 text-red-600' :
                          a.riskLevel === '中' ? 'bg-yellow-100 text-yellow-600' :
                          'bg-green-100 text-green-600'
                        }`}>{a.angleType}</span>
                        <p className="mt-0.5 text-gray-700 font-medium leading-tight">{a.title}</p>
                        <p className="text-[8px] text-gray-400 mt-0.5 line-clamp-1">{a.coreConflict}</p>
                      </button>
                    ))}
                  </div>
                )}
                {!anglesLoading && angles.length === 0 && form.customer_pain && (
                  <p className="text-[10px] text-gray-400">点击"生成角度建议"获取不同内容方向</p>
                )}
                {/* Selected angle status */}
                {selectedAngle && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mt-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-blue-600">✓ 已选择角度</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{selectedAngle.angleType || '客户问题型'}</span>
                      </div>
                      <button className="text-[9px] text-blue-400 hover:text-blue-600" onClick={() => setSelectedAngle(null)}>取消</button>
                    </div>
                    <p className="text-xs font-medium text-blue-800 mt-1">{selectedAngle.title || selectedAngle.customerPain}</p>
                    <p className="text-[10px] text-blue-500 mt-0.5">{selectedAngle.coreConflict}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
              </div>

              {/* Broad topic warning */}
              {isBroad && subTopics.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs text-yellow-700 font-medium mb-2">
                    输入主题较宽泛，系统将拆分成以下具体子选题：
                  </p>
                  <div className="space-y-1">
                    {subTopics.slice(0, 5).map((st, i) => (
                      <label key={i} className="flex items-center gap-2 text-xs text-yellow-800 cursor-pointer">
                        <input type="radio" name="subtopic"
                          className="w-3 h-3"
                          defaultChecked={i === 0}
                          onChange={() => update('customer_pain', st)} />
                        {st}
                      </label>
                    ))}
                  </div>
                </div>
              )}


            </div>
          )}

                    {/* Step 3: Hook Selection */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700">选择开头钩子</h3>
              <p className="text-xs text-gray-400">
                一个好的钩子决定了视频的前3秒。系统已生成{hookResults.length}个钩子候选，默认选最高分。
              </p>
              {!selectedAngle && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-center text-sm text-yellow-700">
                  请先在"内容定位"步骤选择一个内容角度，然后系统会为你生成对应的钩子
                </div>
              )}
              {selectedAngle && hookResults.length === 0 && !hooksLoading && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => fetchHooks()}>
                    生成钩子候选
                  </button>
                </div>
              )}
              {(() => {
                if (hooksLoading) {
                  return <div className="text-center py-8 text-gray-400 text-sm">正在生成钩子候选...</div>;
                }
                if (hookResults.length === 0) return null;
                const top5 = hookResults.slice(0, 5);
                return (
                  <div className="space-y-2">
                    {top5.map((result: any, idx: number) => {
                      const hook = result.hook;
                      const isSelected = selectedHookId === hook.id;
                      const typeColor =
                        hook.hookType === 'direct_question' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                        hook.hookType === 'customer_quote' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                        hook.hookType === 'warning' ? 'bg-red-50 border-red-200 text-red-700' :
                        hook.hookType === 'counterintuitive' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                        hook.hookType === 'cost_conflict' ? 'bg-green-50 border-green-200 text-green-700' :
                        hook.hookType === 'material_risk' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                        hook.hookType === 'test_risk' ? 'bg-pink-50 border-pink-200 text-pink-700' :
                        'bg-gray-50 border-gray-200 text-gray-700';
                      const typeLabel: Record<string, string> = {
                        direct_question: '直接提问', customer_quote: '客户原话', warning: '风险警告',
                        counterintuitive: '反常识', cost_conflict: '价格反转', material_risk: '材质风险',
                        test_risk: '测试风险', comparison: '对比', factory_secret: '工厂内幕',
                        comment_reply: '评论回复', boss_experience: '老板经验', nini_perspective: '小林/小陈视角',
                      };
                      return (
                        <button key={hook.id}
                          onClick={() => handleSelectHook(hook)}
                          className={`w-full text-left p-3 rounded-lg border transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}>
                          <div className="flex items-start gap-3">
                            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                              idx === 1 ? 'bg-gray-100 text-gray-600' :
                              'bg-orange-100 text-orange-600'
                            }`}>{idx + 1}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeColor}`}>
                                  {typeLabel[hook.hookType] || hook.hookType}
                                </span>
                              </div>
                              <p className={`text-sm font-medium ${isSelected ? 'text-blue-800' : 'text-gray-800'}`}>
                                {hook.hookText}
                              </p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{hook.whyItWorks}</p>
                            </div>
                            <div className="flex-shrink-0 text-center">
                              <div className={`text-lg font-bold ${
                                result.totalScore >= 85 ? 'text-green-600' :
                                result.totalScore >= 70 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>{result.totalScore}</div>
                              <div className="text-[9px] text-gray-400">分</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {hookResults.length > 5 && (
                      <p className="text-center text-xs text-gray-400">
                        还有{hookResults.length - 5}个钩子候选（点击"下一步"即可确认选择）
                      </p>
                    )}
                  </div>
                );
              })()}
              {hookResults.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  <button className="btn-secondary text-[10px] px-2 py-1" onClick={() => fetchHooks()}>重新生成</button>
                  <button className="btn-secondary text-[10px] px-2 py-1" onClick={() => fetchHooks('conflict')}>更冲突</button>
                  <button className="btn-secondary text-[10px] px-2 py-1" onClick={() => fetchHooks('spoken')}>更口语</button>
                  <button className="btn-secondary text-[10px] px-2 py-1" onClick={() => fetchHooks('account')}>更适合当前账号</button>
                </div>
              )}
            </div>
          )}{/* Step 4: Script Parameters */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700">脚本参数</h3>
              <p className="text-xs text-gray-400">
                这些参数决定了脚本的节奏、风格和时长。
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">视频时长</label>
                  <select className="select-field" value={form.video_length}
                    onChange={e => update('video_length', e.target.value)}>
                    <option value="15">15秒（1个核心点，80-120字）</option>
                    <option value="30">30秒（2个核心点，150-220字）</option>
                    <option value="60">60秒（3个核心点，280-420字）</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">脚本结构</label>
                  <select className="select-field" value={form.structure}
                    onChange={e => update('structure', e.target.value)}>
                    <option value="">系统自动选择</option>
                    {SCRIPT_STRUCTURES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">出镜方式</label>
                  <select className="select-field" value={form.acting_style}
                    onChange={e => update('acting_style', e.target.value)}>
                    <option value="">系统自动选择</option>
                    {ACTING_STYLES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">语气风格</label>
                  <select className="select-field" value={form.tone_style}
                    onChange={e => update('tone_style', e.target.value)}>
                    <option value="">系统自动选择</option>
                    {TONE_STYLES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}{/* Step 4: Generate Result */}
          {step === 5 && pipelineResult && (
            <div className="space-y-4">
              {/* Strategy Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-800 mb-2">脚本策略</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-700">
                  <div><strong>主题：</strong>{pipelineResult.strategy.topic}</div>
                  <div><strong>目标客户：</strong>{pipelineResult.strategy.targetCustomer}</div>
                  <div><strong>客户痛点：</strong>{pipelineResult.strategy.customerPain}</div>
                  <div><strong>核心观点：</strong>{pipelineResult.strategy.corePoint}</div>
                  <div><strong>用户为什么看：</strong>{pipelineResult.strategy.whyWatch}</div>
                  <div><strong>转化目标：</strong>{pipelineResult.strategy.conversionGoal}</div>
                </div>
              </div>

              {/* Hook highlight */}
              <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-center">
                <p className="text-xs text-green-600 mb-1">开头钩子</p>
                <p className="text-lg font-bold text-green-800">
                  「{pipelineResult.bestVariant?.hook || pipelineResult.strategy.hook}」
                </p>
              </div>

              {/* Duration Variants */}
              <h3 className="font-medium text-gray-700 mt-4">时长变体</h3>
              <div className="grid grid-cols-3 gap-3">
                {pipelineResult.variants.map((v: any) => (
                  <button key={v.duration}
                    onClick={() => setSelectedDuration(v.duration)}
                    className={`text-left p-3 rounded-lg border text-xs transition-all ${
                      selectedDuration === v.duration
                        ? 'border-blue-400 bg-blue-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}>
                    <div className="font-bold text-gray-700 mb-1">{v.duration}秒</div>
                    <div className="text-gray-500 mb-1">{v.wordCount}字</div>
                    {v.score && (
                      <div className="flex items-center gap-1">
                        <span className={`font-bold ${
                          v.score.totalScore >= 85 ? 'text-green-600' :
                          v.score.totalScore >= 70 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {v.score.totalScore}分
                        </span>
                        <span className="text-gray-400">· {v.score.grade}级</span>
                      </div>
                    )}
                    <div className="mt-1 text-gray-400 line-clamp-2">{v.script.slice(0, 40)}…</div>
                  </button>
                ))}
              </div>

              {/* Selected Variant Detail */}
              {(() => {
                const variant = pipelineResult.variants.find((v: any) => v.duration === selectedDuration);
                if (!variant) return null;
                return (
                  <div className="border border-gray-200 rounded-lg p-4 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-700">{selectedDuration}秒脚本</h4>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400">{variant.wordCount}字</span>
                        {variant.score && (
                          <>
                            <span className={`font-bold ${
                              variant.score.totalScore >= 85 ? 'text-green-600' :
                              variant.score.totalScore >= 70 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {variant.score.totalScore}分
                            </span>
                            <span className={`px-1 py-0.5 rounded text-white text-xs ${
                              pipelineResult.risk.riskLevel === '低' ? 'bg-green-500' :
                              pipelineResult.risk.riskLevel === '中' ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}>
                              {pipelineResult.risk.riskLevel}风险
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line bg-gray-50 p-3 rounded">
                      {variant.script}
                    </div>
                    {/* Scores & Risk */}
                    {variant.score && (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="font-medium text-gray-500 mb-1">优势：</p>
                          <ul className="text-green-600 space-y-0.5">
                            {variant.score.strengths.slice(0, 3).map((s: string, i: number) => (
                              <li key={i}>✓ {s}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-medium text-gray-500 mb-1">不足：</p>
                          <ul className="text-yellow-600 space-y-0.5">
                            {variant.score.weaknesses.slice(0, 3).map((w: string, i: number) => (
                              <li key={i}>○ {w}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                    {pipelineResult.risk.riskPoints.length > 0 && pipelineResult.risk.riskLevel !== '低' && (
                      <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-600">
                        <strong>风险提醒：</strong>
                        {pipelineResult.risk.riskPoints.join('、')}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Recommended status */}
              <div className="flex gap-2 mt-2">
                <button className="btn-primary text-xs px-3 py-1.5" onClick={handleOptimize} disabled={optimizeLoading}>
                  {optimizeLoading ? 'AI优化中...' : 'AI 深度优化'}
                </button>
              </div>

              {showOptimizeCompare && optimizedResult && (
                <div className="border border-blue-200 rounded-lg p-3 mt-2 bg-blue-50/30">
                  <h4 className="text-xs font-medium text-blue-700 mb-2">🎯 AI优化对比</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-gray-200 rounded p-2 bg-white">
                      <p className="text-[10px] font-medium text-gray-500 mb-1">优化前</p>
                      <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">{optimizedResult.before}</p>
                    </div>
                    <div className="border border-green-200 rounded p-2 bg-green-50">
                      <p className="text-[10px] font-medium text-green-600 mb-1">优化后 ✓</p>
                      <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">{optimizedResult.after}</p>
                    </div>
                  </div>
                  {optimizedResult.changes?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] font-medium text-blue-600 mb-1">改进项：</p>
                      {optimizedResult.changes.map((ch: string, i: number) => (
                        <p key={i} className="text-[10px] text-blue-600">✓ {ch}</p>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button className="btn-secondary text-xs px-2 py-1" onClick={() => setShowOptimizeCompare(false)}>保留原版</button>
                    <button className="btn-primary text-xs px-2 py-1" onClick={handleOptimizeConfirm}>使用优化版</button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button className="btn-secondary text-xs px-3 py-1.5" onClick={handleRewrite}>
                  ✏ AI重写
                </button>
                <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => setShowRewriteInput(!showRewriteInput)}>
                  💬 修改意见重写
                </button>
              </div>
              {showRewriteInput && (
                <div className="mt-2 flex gap-2">
                  <input className="input-field text-xs flex-1" placeholder="输入修改意见，如：更短一点、更像老板说话、去掉空话..."
                    value={rewriteFeedback} onChange={e => setRewriteFeedback(e.target.value)} />
                  <button className="btn-primary text-xs px-3 py-1.5" disabled={!rewriteFeedback.trim()} onClick={handleRewriteWithFeedback}>
                    重写
                  </button>
                </div>
              )}
              {form.knowledgeMode !== 'none' && form.knowledge_refs.length > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded p-2 text-xs text-purple-600 mt-2">
                  <strong>知识来源：</strong>已引用 {form.knowledge_refs.length} 张知识卡（{form.knowledgeMode === 'auto' ? '自动推荐' : '手动选择'}）
                </div>
              )}
              <div className={`text-center p-3 rounded-lg text-sm font-medium ${
                pipelineResult.recommendedStatus === 'pending_review'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : pipelineResult.recommendedStatus === 'draft'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : pipelineResult.recommendedStatus === 'needs_rewrite'
                  ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {pipelineResult.recommendedStatus === 'pending_review' && '✓ 推荐状态：待审核'}
                {pipelineResult.recommendedStatus === 'draft' && '○ 推荐状态：草稿'}
                {pipelineResult.recommendedStatus === 'needs_rewrite' && '⚠ 推荐状态：需重写'}
                {pipelineResult.recommendedStatus === 'discard' && '✕ 推荐状态：不建议保存'}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-200 flex justify-between items-center">
          <div>
            {step > 1 && step <= 5 && (
              <button className="btn-secondary text-sm" onClick={() => setStep(step - 1)}>
                上一步
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary text-sm" onClick={handleClose}>取消</button>
            {step < 4 && (
              <button className="btn-primary text-sm" disabled={!canNext()}
                onClick={() => setStep(step + 1)}>
                下一步
              </button>
            )}
            {step === 4 && (
              <button className="btn-primary text-sm" onClick={handleGenerate}>
                生成脚本
              </button>
            )}
            {step === 5 && (
              <button className="btn-primary text-sm" onClick={handleConfirmGenerate}>
                确认并添加到工作台
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
