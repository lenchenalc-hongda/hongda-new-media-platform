'use client';
import { useState, useMemo } from 'react';
import { MOCK_ACCOUNTS, MOCK_KNOWLEDGE_NEW } from '@/lib/constants/mock-data';
import { PLATFORMS, SCRIPT_STRUCTURES, ACTING_STYLES, TONE_STYLES, CONVERSION_GOALS } from '@/lib/constants';
import { generateHook, splitBroadTopic, generateScriptStrategy, runPipeline } from '@/lib/ai/script-pipeline';
import { scoreScript } from '@/lib/ai/script-scoring';

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
  });
  // Pipeline preview state
  const [pipelineResult, setPipelineResult] = useState<any>(null);
  const [angles, setAngles] = useState<any[]>([]);
  const [selectedAngle, setSelectedAngle] = useState<any>(null);
  const [anglesLoading, setAnglesLoading] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<'15' | '30' | '60'>('30');

  const update = (key: string, value: any) => setForm({ ...form, [key]: value });
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
    return generateHook({
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
    return isBroad ? splitBroadTopic(topic) : [];
  }, [form.customer_pain, form.product_or_process, isBroad]);

  const canNext = () => {
    if (step === 1) return !!form.account_id && !!form.platform;
    if (step === 2) return true;
    if (step === 3) return true;
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
      result = runPipeline({
        account: selectedAccount || {},
        topic: form.product_or_process || form.customer_pain,
        customerPain: form.customer_pain,
        productOrProcess: form.product_or_process,
        material: form.material,
        knowledgeCards: selectedCards,
        video_length: form.video_length,
      });
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
              <span>脚本参数</span>
              <span>参考知识</span>
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
                  {MOCK_ACCOUNTS.map(a => (
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

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">
                    要讲什么产品/工艺
                  </label>
                  <input className="input-field"
                    placeholder="如：PE材质热转印、花膜结构、防背粘工艺"
                    value={form.product_or_process}
                    onChange={e => update('product_or_process', e.target.value)} />
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
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">材质（可选）</label>
                  <select className="select-field" value={form.material}
                    onChange={e => update('material', e.target.value)}>
                    <option value="">不限</option>
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
                  <button className="btn-secondary text-[10px] px-2 py-1" disabled={anglesLoading}
                    onClick={async () => {
                      if (!form.customer_pain && !form.product_or_process) return;
                      setAnglesLoading(true);
                      try {
                        const res = await fetch('/api/ai/script/angles', {
                          method: 'POST', headers: {'Content-Type':'application/json'},
                          body: JSON.stringify({ customerPain: form.customer_pain, productOrProcess: form.product_or_process, material: form.material, account: selectedAccount || {} }),
                        });
                        const data = await res.json();
                        if (data.angles) setAngles(data.angles);
                      } catch {}
                      setAnglesLoading(false);
                    }}>
                    {anglesLoading ? '生成中...' : angles.length > 0 ? '重新生成' : '生成角度建议'}
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

              {/* Hook preview */}
              {previewHook && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs text-green-700 font-medium">开头钩子预览：</p>
                  <p className="text-sm text-green-800 mt-1">{previewHook}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Script Parameters */}
          {step === 3 && (
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
          )}

          {/* Step 4: Knowledge References */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700">选择参考知识卡</h3>
              <p className="text-xs text-gray-400">
                知识卡提供判断依据，不会直接搬进脚本。
              </p>
              {(() => {
                const filtered = MOCK_KNOWLEDGE_NEW.filter(k =>
                  k.applicable_accounts.includes(form.account_id) &&
                  k.knowledge_status === '已确认'
                );
                const groups: Record<string, any[]> = {};
                filtered.forEach(k => {
                  if (!groups[k.category]) groups[k.category] = [];
                  groups[k.category].push(k);
                });
                return (
                  <>
                    {Object.keys(groups).length === 0 && (
                      <p className="text-sm text-gray-400 py-4 text-center">暂无匹配的知识卡</p>
                    )}
                    {Object.entries(groups).map(([cat, cards]) => (
                      <div key={cat}>
                        <h4 className="text-xs font-medium text-gray-500 mb-1 mt-2">
                          {cat}（{cards.length}）
                        </h4>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {cards.map(k => (
                            <label key={k.id}
                              className="flex items-start gap-2 p-2 hover:bg-blue-50 rounded cursor-pointer">
                              <input type="checkbox" className="mt-0.5 w-3.5 h-3.5"
                                checked={form.knowledge_refs.includes(k.id)}
                                onChange={e => update('knowledge_refs',
                                  e.target.checked
                                    ? [...form.knowledge_refs, k.id]
                                    : form.knowledge_refs.filter(r => r !== k.id)
                                )} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-700">{k.title}</p>
                                <p className="text-xs text-gray-400 truncate">
                                  {k.core_conclusion?.slice(0, 60)}
                                </p>
                              </div>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                k.content_scope === '可对外'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                {k.content_scope}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          )}

          {/* Step 5: Preview Results */}
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
            {step > 1 && step <= 4 && (
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
