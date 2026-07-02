'use client';
import { useState, useMemo } from 'react';
import { MOCK_ACCOUNTS, MOCK_KNOWLEDGE_NEW } from '@/lib/constants/mock-data';
import { PLATFORMS, AI_GENERATE_TYPES, SCRIPT_STRUCTURES, ACTING_STYLES, TONE_STYLES, CONVERSION_GOALS } from '@/lib/constants';

interface ScriptWizardProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (data: any) => void;
}

export default function ScriptWizard({ open, onClose, onGenerate }: ScriptWizardProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    account_id: '', platform: '', source: '', source_detail: '',
    target_audience: '', customer_pain: '', product_or_process: '', conversion_goal: '',
    structure: '', video_length: '45', acting_style: '', tone_style: '',
    knowledge_refs: [] as string[], risk_rules: [] as string[],
    manual_input: '', save_as_status: 'draft',
  });

  const update = (key: string, value: any) => setForm({ ...form, [key]: value });

  const selectedAccount = MOCK_ACCOUNTS.find(a => a.id === form.account_id);

  // Filter knowledge cards by selected account
  const filteredKnowledge = useMemo(() => {
    if (!form.account_id) return [];
    return MOCK_KNOWLEDGE_NEW.filter(k =>
      k.applicable_accounts.includes(form.account_id) && k.knowledge_status === '已确认'
    );
  }, [form.account_id]);

  // Group by category
  const knowledgeByCategory = useMemo(() => {
    const groups: Record<string, typeof filteredKnowledge> = {};
    filteredKnowledge.forEach(k => {
      if (!groups[k.category]) groups[k.category] = [];
      groups[k.category].push(k);
    });
    return groups;
  }, [filteredKnowledge]);

  const getSmartDefaults = () => {
    if (!selectedAccount) return '';
    let info = '▶ 账号人设：' + (selectedAccount.persona || '') + '\n';
    info += '▶ 定位：' + (selectedAccount.positioning || '') + '\n';
    info += '▶ 目标客户：' + (selectedAccount.target_audience || '') + '\n';
    info += '▶ 转化目标：' + (selectedAccount.conversion_goal || '');
    return info;
  };

  const canNext = () => {
    if (step === 1) return form.account_id && form.platform;
    if (step === 2) return true;
    if (step === 3) return true;
    if (step === 4) return true;
    return true;
  };

  const handleGenerate = () => {
    onGenerate(form);
    onClose();
    setStep(1);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[760px] max-h-[88vh] overflow-y-auto mx-4">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">AI生成脚本工作台</h2>
            <p className="text-xs text-gray-400 mt-1">第{step}步 / 共4步</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="flex px-5 pt-4 gap-1">
          {[1,2,3,4].map(s => (
            <div key={s} className={`flex-1 h-1.5 rounded ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
          ))}
        </div>
        <div className="flex justify-between px-5 text-xs text-gray-400 mt-1">
          <span>账号平台</span>
          <span>参考知识</span>
          <span>内容定位</span>
          <span>脚本参数</span>
        </div>
        <div className="p-5">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700">选择账号和发布平台</h3>
              <div>
                <label className="block text-xs text-gray-500 mb-1">所属账号</label>
                <select className="select-field" value={form.account_id} onChange={e => update('account_id', e.target.value)}>
                  <option value="">请选择账号</option>
                  {MOCK_ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.name.split('-')[0]}（{a.platform === 'weixin' ? '视频号' : '抖音'}）</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">发布平台</label>
                <select className="select-field" value={form.platform} onChange={e => update('platform', e.target.value)}>
                  <option value="">请选择平台</option>
                  {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              {selectedAccount && (
                <div className="bg-blue-50 p-3 rounded text-xs text-blue-700 leading-relaxed whitespace-pre-line">
                  {getSmartDefaults()}
                </div>
              )}
            </div>
          )}
          {/* Step 2: Knowledge References (moved from old step 5) */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700">选择参考知识卡</h3>
              {(() => {
                const filteredKnowledge = MOCK_KNOWLEDGE_NEW.filter(k =>
                  k.applicable_accounts.includes(form.account_id) && k.knowledge_status === '已确认'
                );
                const groups: Record<string, any[]> = {};
                filteredKnowledge.forEach(k => { if (!groups[k.category]) groups[k.category] = []; groups[k.category].push(k); });
                return (
                  <>
                    <p className="text-xs text-gray-400">已自动筛选出{form.account_id ? (MOCK_ACCOUNTS.find(a => a.id === form.account_id)?.name?.split('-')[0] || '') : ''}账号相关的知识卡，你选的知识卡将直接影响脚本内容</p>
                    {Object.keys(groups).length === 0 && <p className="text-sm text-gray-400 py-4 text-center">暂无匹配的知识卡</p>}
                    {Object.entries(groups).map(([cat, cards]) => (
                      <div key={cat}>
                        <h4 className="text-xs font-medium text-gray-500 mb-1 mt-3">{cat}（{(cards as any[]).length}）</h4>
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {(cards as any[]).map(k => (
                            <label key={k.id} className="flex items-start gap-2 p-2 hover:bg-blue-50 rounded cursor-pointer">
                              <input type="checkbox" className="mt-0.5 w-3.5 h-3.5"
                                checked={form.knowledge_refs.includes(k.id)}
                                onChange={e => update('knowledge_refs',
                                  e.target.checked ? [...form.knowledge_refs, k.id] : form.knowledge_refs.filter(r => r !== k.id)
                                )} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-700">{k.title}</p>
                                <p className="text-xs text-gray-400 truncate">{k.core_conclusion?.slice(0, 60)}</p>
                              </div>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${k.content_scope === '可对外' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{k.content_scope}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">保存到阶段</h4>
                      <select className="select-field" value={form.save_as_status}
                        onChange={e => update('save_as_status', e.target.value)}>
                        <option value="draft">保存为草稿</option>
                        <option value="pending_review">存为待审核</option>
                        <option value="approved">直接审核通过</option>
                        <option value="pending_filming">直接存为待拍摄</option>
                      </select>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700">内容定位</h3>
              <p className="text-xs text-gray-400">以下信息已根据所选账号和知识卡自动填充，你可以调整或直接下一步</p>
              {selectedAccount && (
                <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-600 border border-gray-200">
                  <table className="w-full"><tbody>
                    <tr><td className="py-1 text-gray-400 w-20">账号定位</td>
                      <td className="py-1">{selectedAccount.persona || '-'}</td></tr>
                    <tr><td className="py-1 text-gray-400">目标客户</td>
                      <td className="py-1">{selectedAccount.target_audience || '-'}</td></tr>
                  </tbody></table>
                </div>
              )}
              {form.knowledge_refs.length > 0 && (
                <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-700 border border-blue-200">
                  <p className="font-medium mb-1">已选知识卡将作为脚本依据：</p>
                  <p>{MOCK_KNOWLEDGE_NEW.find(k => k.id === form.knowledge_refs[0])?.core_conclusion || ''}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">本期内容要讲什么产品/工艺</label>
                  <input className="input-field" placeholder="如：热转印比水转印更适合小批量、PE材质能不能做热转印"
                    value={form.product_or_process} onChange={e => update('product_or_process', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">客户缺点</label>
                  <input className="input-field" placeholder="如：不知道材质能不能做、担心交期、觉得价格太贵"
                    value={form.customer_pain} onChange={e => update('customer_pain', e.target.value)} />
                </div>
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700">选择脚本参数</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">脚本结构</label>
                  <select className="select-field" value={form.structure} onChange={e => update('structure', e.target.value)}>
                    <option value="">请选择</option>
                    {SCRIPT_STRUCTURES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 mb-1">视频时长</label>
                  <select className="select-field" value={form.video_length} onChange={e => update('video_length', e.target.value)}>
                    <option value="15">15秒</option><option value="30">30秒</option>
                    <option value="45">45秒</option><option value="60">60秒</option>
                    <option value="90">90秒</option><option value="120">120秒</option>
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 mb-1">出镜方式</label>
                  <select className="select-field" value={form.acting_style} onChange={e => update('acting_style', e.target.value)}>
                    <option value="">请选择</option>
                    {ACTING_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 mb-1">语气风格</label>
                  <select className="select-field" value={form.tone_style} onChange={e => update('tone_style', e.target.value)}>
                    <option value="">请选择</option>
                    {TONE_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-700">参考知识卡</h3>
              <p className="text-xs text-gray-400">
                已自动筛选{selectedAccount?.name?.split('-')[0] || ''}账号相关的知识卡（共{filteredKnowledge.length}条）
              </p>
              {Object.keys(knowledgeByCategory).length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">暂无匹配的知识卡</p>
              )}
              {Object.entries(knowledgeByCategory).map(([cat, cards]) => (
                <div key={cat}>
                  <h4 className="text-xs font-medium text-gray-500 mb-1 mt-3">{cat}（{cards.length}）</h4>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {cards.map(k => (
                      <label key={k.id} className="flex items-start gap-2 p-2 hover:bg-blue-50 rounded cursor-pointer">
                        <input type="checkbox" className="mt-0.5 w-3.5 h-3.5"
                          checked={form.knowledge_refs.includes(k.id)}
                          onChange={e => update('knowledge_refs',
                            e.target.checked ? [...form.knowledge_refs, k.id] : form.knowledge_refs.filter(r => r !== k.id)
                          )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">{k.title}</p>
                          <p className="text-xs text-gray-400 truncate">{k.core_conclusion?.slice(0, 60)}</p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${k.content_scope === '可对外' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{k.content_scope}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-2">保存到阶段</h4>
                <select className="select-field" value={form.save_as_status}
                  onChange={e => update('save_as_status', e.target.value)}>
                  <option value="draft">保存为草稿</option>
                  <option value="pending_review">存为待审核</option>
                  <option value="approved">直接审核通过</option>
                  <option value="pending_filming">直接存为待拍摄</option>
                </select>
              </div>
            </div>
          )}
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-between">
          <div>
            {step > 1 && <button className="btn-secondary" onClick={() => setStep(step - 1)}>上一步</button>}
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>取消</button>
            {step < 4 ? (
              <button className="btn-primary" onClick={() => setStep(step + 1)}>下一步</button>
            ) : (
              <button className="btn-primary" onClick={handleGenerate}>生成并保存</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
