'use client';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import ScriptWizard from '@/components/scripts/ScriptWizard';
import { MOCK_ACCOUNTS } from '@/lib/constants/mock-data';
import { truncate, formatDateTime, getPlatformLabel } from '@/lib/utils';
import { PLATFORMS } from '@/lib/constants';
import type { Script } from '@/lib/constants/types';

interface ScriptsRendererProps {
  scripts: Script[];
  filtered: Script[];
  selected: Script | undefined;
  search: string;
  filters: Record<string, string>;
  showAiMenu: boolean;
  showWizard: boolean;
  aiResult: any;
  activeAiAction: string | null;
  qualityScore: number;
  pushedToTopics: Set<string>;
  selectedId: string | null;
  editingScriptId: string | null;
  editForm: Partial<Script>;
  getAccountName: (id: string | null) => string;
  getQualityScore: (s: Script) => number;
  handleAiAction: (action: string) => void;
  handleWizardGenerate: (data: any) => void;
  handleStartEdit: (id: string) => void;
  handleSaveEdit: () => void;
  handleCancelEdit: () => void;
  handleDeleteScript: (id: string) => void;
  handlePushToTopics: (id: string) => void;
  setEditForm: (f: any) => void;
  setSelectedId: (id: string | null) => void;
  setSearch: (q: string) => void;
  setFilters: (f: any) => void;
  setShowAiMenu: (s: boolean) => void;
  setShowWizard: (s: boolean) => void;
  setAiResult: (r: any) => void;
}

export function ScriptsRenderer(p: ScriptsRendererProps) {
  const isEditing = p.editingScriptId === p.selected?.id;

  const renderField = (label: string, key: string, type: 'text' | 'area' | 'bigarea', isEditing: boolean) => {
    const val = isEditing ? (p.editForm as any)[key] ?? '' : (p.selected as any)?.[key] ?? '';
    if (isEditing) {
      if (type === 'bigarea') {
        return (
          <div className="mb-3">
            <p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p>
            <textarea className="input-field w-full text-sm min-h-[200px]" value={val}
              onChange={e => p.setEditForm({...p.editForm, [key]: e.target.value})} />
          </div>
        );
      }
      if (type === 'area') {
        return (
          <div className="mb-3">
            <p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p>
            <textarea className="input-field w-full text-sm min-h-[80px]" value={val}
              onChange={e => p.setEditForm({...p.editForm, [key]: e.target.value})} />
          </div>
        );
      }
      return (
        <div className="mb-3">
          <p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p>
          <input className="input-field w-full text-sm" value={val}
            onChange={e => p.setEditForm({...p.editForm, [key]: e.target.value})} />
        </div>
      );
    }
    if (type === 'bigarea') {
      return (
        <div className="mb-3">
          <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
          <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 whitespace-pre-wrap">{val || '无内容'}</div>
        </div>
      );
    }
    if (type === 'area') {
      return (
        <div className="mb-3">
          <p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p>
          <p className="text-xs text-gray-600 whitespace-pre-wrap">{val}</p>
        </div>
      );
    }
    return (
      <div className="mb-3">
        <p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p>
        <p className="text-sm text-gray-800">{val}</p>
      </div>
    );
  };

  return (
    <AppLayout>
      <PageHeader title="脚本工厂" description="AI生成短视频口播脚本" />

      {/* Search + Filter + AI Button */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input type="text" placeholder="搜索脚本标题、口播内容..." value={p.search}
          onChange={e => p.setSearch(e.target.value)} className="input-field w-64" />
        <select className="select-field w-[130px]" value={p.filters.account || ''}
          onChange={e => p.setFilters({...p.filters, account: e.target.value})}>
          <option value="">全部账号</option>
          {MOCK_ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="select-field w-[100px]" value={p.filters.platform || ''}
          onChange={e => p.setFilters({...p.filters, platform: e.target.value})}>
          <option value="">全部平台</option>
          {PLATFORMS.map(pl => <option key={pl.value} value={pl.value}>{pl.label}</option>)}
        </select>
        <div className="relative ml-auto">
          <button className="btn-primary" onClick={() => p.setShowWizard(true)}>
            AI生成脚本
          </button>
        </div>
      </div>

      {/* AI Result Toast */}
      {p.aiResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800 flex items-center justify-between">
          <span>{p.aiResult.message || '已生成'}</span>
          <button className="text-blue-500 hover:text-blue-700 ml-2 text-xs" onClick={() => p.setAiResult(null)}>关闭</button>
        </div>
      )}

      {/* Script List + Detail */}
      <div className="flex gap-4">
        {/* Left: Script List */}
        <div className="w-[360px] flex-shrink-0 space-y-2">
          {p.filtered.map(s => {
            const account = MOCK_ACCOUNTS.find(a => a.id === s.account_id);
            const score = p.getQualityScore(s);
            return (
              <div key={s.id} onClick={() => { p.setSelectedId(s.id); p.handleCancelEdit(); }}
                className={"card cursor-pointer transition-colors p-3 " + (p.selectedId === s.id ? 'ring-2 ring-blue-500 border-blue-400' : 'hover:border-gray-300')}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800 leading-tight flex-1">{truncate(s.title, 30)}</p>
                  <StatusBadge status={s.status} />
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{account?.name || '-'}</span>
                  {s.hook && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded truncate max-w-[180px]">{truncate(s.hook, 25)}</span>}
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-400">
                  <span>{score}分</span>
                  <span>{formatDateTime(s.created_at)}</span>
                </div>
              </div>
            );
          })}
          {p.filtered.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">没有脚本，点击上方 AI生成脚本 开始创作</div>
          )}
        </div>

        {/* Right: Script Detail */}
        <div className="flex-1">
          {p.selected ? (
            <div className="space-y-3">
              <div className="card">
                {/* Header + Action Buttons */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    {isEditing ? (
                      <input className="input-field w-full text-lg font-bold mb-1" value={p.editForm.title ?? ''}
                        onChange={e => p.setEditForm({...p.editForm, title: e.target.value})} />
                    ) : (
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-lg font-bold text-gray-800">{p.selected.title}</h2>
                        <StatusBadge status={p.selected.status} />
                      </div>
                    )}
                    <p className="text-xs text-gray-400">
                      {p.getAccountName(p.selected.account_id)} · v{p.selected.version} · 创建时间：{formatDateTime(p.selected.created_at)}
                    </p>
                  </div>
                  {/* Action Buttons */}
                  <div className="flex gap-2 ml-4 flex-shrink-0">
                    {isEditing ? (
                      <>
                        <button className="btn-primary btn-sm" onClick={p.handleSaveEdit}>保存</button>
                        <button className="btn-secondary btn-sm" onClick={p.handleCancelEdit}>取消</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-secondary btn-sm" onClick={() => p.handleStartEdit(p.selected!.id)}>编辑</button>
                        {p.pushedToTopics.has(p.selected!.id) ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 text-green-800">
                            ✅ 已推进到选题库待审核
                          </span>
                        ) : (
                          <button className="btn-primary btn-sm" onClick={() => p.handlePushToTopics(p.selected!.id)}>
                            推进到选题库待审核
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Fields */}
                {isEditing ? (
                  <>
                    {renderField('前3秒钩子', 'hook', 'area', true)}
                    {renderField('完整口播', 'main_script', 'bigarea', true)}
                    {renderField('字幕重点', 'subtitle_points', 'area', true)}
                    {renderField('封面标题', 'cover_text', 'text', true)}
                    {renderField('评论区引导', 'comment_reply', 'area', true)}
                    {renderField('私信承接话术', 'private_message_cta', 'area', true)}
                    {renderField('风险提醒', 'risk_notes', 'area', true)}
                  </>
                ) : (
                  <>
                    {renderField('前3秒钩子', 'hook', 'area', false)}
                    {renderField('完整口播', 'main_script', 'bigarea', false)}
                    {p.selected.subtitle_points && renderField('字幕重点', 'subtitle_points', 'area', false)}
                    {p.selected.cover_text && renderField('封面标题', 'cover_text', 'text', false)}
                    {p.selected.comment_reply && renderField('评论区引导', 'comment_reply', 'area', false)}
                    {p.selected.private_message_cta && renderField('私信承接话术', 'private_message_cta', 'area', false)}
                    {p.selected.risk_notes && renderField('风险提醒', 'risk_notes', 'area', false)}
                  </>
                )}

                {/* Quality Score */}
                <div className="bg-blue-50 rounded-lg p-3 mt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-800">脚本质量评分</span>
                    <span className="text-2xl font-bold text-blue-600">{p.qualityScore}<span className="text-sm">/100</span></span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-16">
              <p className="text-5xl mb-3">✍️</p>
              <h3 className="text-lg font-bold text-gray-700">点击左侧脚本查看详情</h3>
              <p className="text-sm text-gray-400 mt-1">或点击右上角“AI生成脚本”开始创作</p>
            </div>
          )}
        </div>
      </div>

      {/* ScriptWizard Modal */}
      <ScriptWizard open={p.showWizard} onClose={() => p.setShowWizard(false)} onGenerate={p.handleWizardGenerate} />
    </AppLayout>
  );
}
