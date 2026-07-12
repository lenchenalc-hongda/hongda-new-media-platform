'use client';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ScriptGeneratorWizard from '@/components/scripts/ScriptGeneratorWizard';
import ScriptListPane from '@/components/scripts/ScriptListPane';
import ScriptEditorPane from '@/components/scripts/ScriptEditorPane';
import ScriptAIPane from '@/components/scripts/ScriptAIPane';
import BulkActionBar from '@/components/scripts/BulkActionBar';
import type { Script } from '@/lib/constants/types';
import type { ScriptScoreResult } from '@/lib/ai/script-scoring';

interface ScriptsRendererProps {
  scripts: Script[];
  filtered: Script[];
  selected: Script | undefined;
  search: string;
  filters: Record<string, string>;
  showAiMenu: boolean;
  showWizard: boolean;
  aiResult: any;
  scoringAction: string | null;
  activeAiAction: string | null;
  scoreResult: ScriptScoreResult | null;
  pushedToTopics: Set<string>;
  selectedId: string | null;
  editingScriptId: string | null;
  editForm: Partial<Script>;
  selectedIds: Set<string>;
  getAccountName: (id: string | null) => string;
  getScoreResult: (s: Script) => ScriptScoreResult;
  handleAiAction: (action: string) => void;
  handleWizardGenerate: (data: any) => void;
  handleStartEdit: (id: string) => void;
  handleSaveEdit: () => void;
  handleCancelEdit: () => void;
  handleDeleteScript: (id: string) => void;
  handlePushToTopics: (id: string) => void;
  onRescore?: () => void;
  onDuplicateRewrite?: () => void;
  onDeepOptimize?: () => void;
  onBulkSaveDraft: () => void;
  onBulkSavePendingReview: () => void;
  onBulkPolish: () => void;
  onBulkRiskCheck: () => void;
  onBulkScore: () => void;
  onBulkDiscard: () => void;
  setEditForm: (f: any) => void;
  setSelectedId: (id: string | null) => void;
  setSearch: (q: string) => void;
  setFilters: (f: any) => void;
  setShowAiMenu: (s: boolean) => void;
  setShowWizard: (s: boolean) => void;
  setAiResult: (r: any) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}

export function ScriptsRenderer(p: ScriptsRendererProps) {
  const isEditing = p.editingScriptId === p.selected?.id;

  return (
    <AppLayout>
      <PageHeader title="脚本工厂" description="三栏脚本生产工作台" />

      {/* AI Result Toast */}
      {p.aiResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-3 text-xs text-blue-800 flex items-center justify-between">
          <span>{typeof p.aiResult.message === 'string' ? p.aiResult.message : '操作完成'}</span>
          <button className="text-blue-500 hover:text-blue-700 ml-2" onClick={() => p.setAiResult(null)}>关闭</button>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        count={p.selectedIds.size}
        onSaveDraft={p.onBulkSaveDraft}
        onSavePendingReview={p.onBulkSavePendingReview}
        onPolish={p.onBulkPolish}
        onRiskCheck={p.onBulkRiskCheck}
        onScore={p.onBulkScore}
        onDiscard={p.onBulkDiscard}
      />

      {/* Three-Column Workbench */}
      <div className="flex gap-3 h-[calc(100vh-240px)]">
        {/* Left: Script List Pane */}
        <ScriptListPane
          scripts={p.filtered}
          onGenerateClick={() => p.setShowWizard(true)}
          search={p.search}
          onSearchChange={p.setSearch}
          filters={p.filters}
          onFilterChange={p.setFilters}
          selectedId={p.selectedId}
          onSelect={(id) => { p.setSelectedId(id); p.handleCancelEdit(); }}
          selectedIds={p.selectedIds}
          onToggleSelect={p.onToggleSelect}
          onToggleSelectAll={p.onToggleSelectAll}
          getScoreResult={p.getScoreResult}
        />

        {/* Middle: Script Editor Pane */}
        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-white">
          <ScriptEditorPane
            selected={p.selected}
            editingScriptId={p.editingScriptId}
            editForm={p.editForm}
            isEditing={isEditing}
            getAccountName={p.getAccountName}
            onStartEdit={p.handleStartEdit}
            onSaveEdit={p.handleSaveEdit}
            onCancelEdit={p.handleCancelEdit}
            onDelete={(id) => { p.handleDeleteScript(id); }}
            onSetEditForm={p.setEditForm}
          />
        </div>

        {/* Right: AI Pane */}
        <ScriptAIPane
          selectedId={p.selectedId}
          selectedStatus={p.selected?.status}
          scoreResult={p.scoreResult}
          pushedToTopics={p.pushedToTopics.has(p.selectedId || '')}
          getAccountName={p.getAccountName}
          onAiAction={p.handleAiAction}
          onSaveDraft={() => {
            if (p.selected) {
              p.setEditForm({ ...p.selected, status: 'draft' as any });
              p.handleSaveEdit();
            }
          }}
          onSavePendingReview={() => {
            if (p.selected) {
              p.setEditForm({ ...p.selected, status: 'pending_review' as any });
              p.handleSaveEdit();
            }
          }}
          onPushToTopics={() => { if (p.selectedId) p.handlePushToTopics(p.selectedId); }}
          onDelete={() => { if (p.selectedId) p.handleDeleteScript(p.selectedId); }}
          onStartEdit={() => { if (p.selectedId) p.handleStartEdit(p.selectedId); }}
        />
      </div>

      {/* ScriptWizard Modal */}
      <ScriptGeneratorWizard open={p.showWizard} onClose={() => p.setShowWizard(false)} onGenerate={p.handleWizardGenerate} />
    </AppLayout>
  );
}
