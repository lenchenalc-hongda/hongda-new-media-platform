'use client';
import {
  CASE_EDITOR_FIELD_LIMITS,
  type CaseEditorDraft,
  type CaseEditorField,
} from '@/lib/review-center/case-manage';

interface CaseCurationEditorProps {
  draft: CaseEditorDraft;
  editable: boolean;
  titleError?: string | null;
  fieldErrors?: Partial<Record<CaseEditorField, string>>;
  onDraftChange?: (field: CaseEditorField, value: string) => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs text-gray-500">{children}</label>;
}

export default function CaseCurationEditor({
  draft,
  editable,
  titleError,
  fieldErrors,
  onDraftChange,
}: CaseCurationEditorProps) {
  const change = (field: CaseEditorField, value: string) => {
    if (editable && onDraftChange) onDraftChange(field, value);
  };

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>案例标题</FieldLabel>
        <input
          id="case-manage-title"
          value={draft.title}
          disabled={!editable}
          maxLength={200}
          onChange={event => change('title', event.target.value)}
          className="input-field"
          aria-invalid={!!titleError}
        />
        {titleError && <p className="mt-1 text-sm text-red-600">{titleError}</p>}
      </div>

      <div>
        <FieldLabel>摘要</FieldLabel>
        <textarea
          value={draft.summary}
          disabled={!editable}
          maxLength={CASE_EDITOR_FIELD_LIMITS.summary}
          rows={4}
          onChange={event => change('summary', event.target.value)}
          className="input-field w-full"
          aria-invalid={!!fieldErrors?.summary}
        />
        {fieldErrors?.summary && <p className="mt-1 text-sm text-red-600">{fieldErrors.summary}</p>}
      </div>

      <div>
        <FieldLabel>核心教训</FieldLabel>
        <textarea
          value={draft.lessonSummary}
          disabled={!editable}
          maxLength={CASE_EDITOR_FIELD_LIMITS.lessonSummary}
          rows={4}
          onChange={event => change('lessonSummary', event.target.value)}
          className="input-field w-full"
          aria-invalid={!!fieldErrors?.lessonSummary}
        />
        {fieldErrors?.lessonSummary && <p className="mt-1 text-sm text-red-600">{fieldErrors.lessonSummary}</p>}
      </div>

      <div>
        <FieldLabel>预防措施</FieldLabel>
        <textarea
          value={draft.preventionSummary}
          disabled={!editable}
          maxLength={CASE_EDITOR_FIELD_LIMITS.preventionSummary}
          rows={4}
          onChange={event => change('preventionSummary', event.target.value)}
          className="input-field w-full"
          aria-invalid={!!fieldErrors?.preventionSummary}
        />
        {fieldErrors?.preventionSummary && <p className="mt-1 text-sm text-red-600">{fieldErrors.preventionSummary}</p>}
      </div>

      <div>
        <FieldLabel>适用说明</FieldLabel>
        <textarea
          value={draft.applicabilityNotes}
          disabled={!editable}
          maxLength={CASE_EDITOR_FIELD_LIMITS.applicabilityNotes}
          rows={3}
          onChange={event => change('applicabilityNotes', event.target.value)}
          className="input-field w-full"
          aria-invalid={!!fieldErrors?.applicabilityNotes}
        />
        {fieldErrors?.applicabilityNotes && <p className="mt-1 text-sm text-red-600">{fieldErrors.applicabilityNotes}</p>}
      </div>
    </div>
  );
}
