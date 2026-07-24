'use client';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDateTime } from '@/lib/utils';
import type { Script } from '@/lib/constants/types';

interface ScriptEditorPaneProps {
  selected: Script | undefined;
  editingScriptId: string | null;
  editForm: Partial<Script>;
  isEditing: boolean;
  getAccountName: (id: string | null) => string;
  onStartEdit: (id: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onSetEditForm: (f: Partial<Script>) => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] text-gray-400 font-medium mb-0.5">{label}</p>
      <div className="text-xs text-gray-700 whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function EditField({ label, keyName, value, type, onChange }: {
  label: string; keyName: string; value: string; type: 'text' | 'area' | 'bigarea'; onChange: (key: string, val: string) => void;
}) {
  if (type === 'bigarea') {
    return (
      <div className="mb-3">
        <p className="text-[10px] text-gray-400 font-medium mb-0.5">{label}</p>
        <textarea className="input-field w-full text-xs min-h-[200px]" value={value}
          onChange={e => onChange(keyName, e.target.value)} />
      </div>
    );
  }
  if (type === 'area') {
    return (
      <div className="mb-3">
        <p className="text-[10px] text-gray-400 font-medium mb-0.5">{label}</p>
        <textarea className="input-field w-full text-xs min-h-[60px]" value={value}
          onChange={e => onChange(keyName, e.target.value)} />
      </div>
    );
  }
  return (
    <div className="mb-3">
      <p className="text-[10px] text-gray-400 font-medium mb-0.5">{label}</p>
      <input className="input-field w-full text-xs" value={value}
        onChange={e => onChange(keyName, e.target.value)} />
    </div>
  );
}

export default function ScriptEditorPane({
  selected, editingScriptId, editForm, isEditing,
  getAccountName, onStartEdit, onSaveEdit, onCancelEdit, onDelete, onSetEditForm,
}: ScriptEditorPaneProps) {
  if (!selected) {
    return (
      <div className="flex-1 border border-dashed border-gray-200 rounded-lg" />
    );
  }

  const key = selected.id;
  const val = (k: string) => editingScriptId === key ? (editForm as any)[k] ?? '' : (selected as any)[k] ?? '';
  const handleChange = (k: string, v: string) => {
    if (editingScriptId === key) onSetEditForm({ ...editForm, [k]: v });
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input className="input-field w-full text-sm font-semibold" value={editForm.title ?? ''}
              onChange={e => onSetEditForm({...editForm, title: e.target.value})} />
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-800 truncate">{selected.title}</h2>
              <StatusBadge status={selected.status} />
            </div>
          )}
          <p className="text-[10px] text-gray-400 mt-0.5">
            {getAccountName(selected.account_id)} · v{selected.version} · {formatDateTime(selected.created_at)}
          </p>
        </div>
        <div className="flex gap-1 ml-2 flex-shrink-0">
          {isEditing ? (
            <>
              <button className="btn-primary btn-sm text-[10px]" onClick={onSaveEdit}>保存</button>
              <button className="btn-secondary btn-sm text-[10px]" onClick={onCancelEdit}>取消</button>
            </>
          ) : (
            <>
              <button className="btn-secondary btn-sm text-[10px]" onClick={() => onStartEdit(selected.id)}>编辑</button>
              <button className="btn-danger btn-sm text-[10px]" onClick={() => onDelete(selected.id)}>删除</button>
            </>
          )}
        </div>
      </div>

      {/* Content fields - scrollable */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {isEditing ? (
          <>
            <EditField label="前3秒钩子" keyName="hook" value={editForm.hook ?? ''} type="area" onChange={handleChange} />
            <EditField label="完整口播" keyName="main_script" value={editForm.main_script ?? ''} type="bigarea" onChange={handleChange} />
            <EditField label="字幕重点" keyName="subtitle_points" value={editForm.subtitle_points ?? ''} type="area" onChange={handleChange} />
            <EditField label="封面标题" keyName="cover_text" value={editForm.cover_text ?? ''} type="text" onChange={handleChange} />
            <EditField label="评论区引导" keyName="comment_reply" value={editForm.comment_reply ?? ''} type="area" onChange={handleChange} />
            <EditField label="私信承接话术" keyName="private_message_cta" value={editForm.private_message_cta ?? ''} type="area" onChange={handleChange} />
            <EditField label="风险提醒" keyName="risk_notes" value={editForm.risk_notes ?? ''} type="area" onChange={handleChange} />
          </>
        ) : (
          <>
            {selected.hook != null && <Field label="前3秒钩子" value={selected.hook || '(无内容)'} />}
            {selected.main_script != null && <Field label="完整口播" value={selected.main_script || '(无内容)'} />}
            {selected.subtitle_points != null && <Field label="字幕重点" value={selected.subtitle_points || '(无内容)'} />}
            {selected.cover_text != null && <Field label="封面标题" value={selected.cover_text || '(无内容)'} />}
            {selected.comment_reply != null && <Field label="评论区引导" value={selected.comment_reply || '(无内容)'} />}
            {selected.private_message_cta != null && <Field label="私信承接话术" value={selected.private_message_cta || '(无内容)'} />}
            {selected.risk_notes != null && <Field label="风险提醒" value={selected.risk_notes || '(无内容)'} />}
          </>
        )}
      </div>
    </div>
  );
}
