import { isDraftShape, normalizeImportedDraft, type CommercialDocumentDraft } from './template';

/** Incomplete quotation drafts are valid, but untrusted identity, seller and account fields are normalized. */
export function safeDraft(value: unknown, salespersonName: string): CommercialDocumentDraft | null {
  if (!isDraftShape(value)) return null;
  const draft = normalizeImportedDraft(value, salespersonName);
  if (draft.kind !== 'quotation') return null;
  if (JSON.stringify(draft).length > 200_000) return null;
  return draft;
}
export function draftMetadata(draft: CommercialDocumentDraft) {
  return {
    document_no: draft.documentNo.slice(0, 80),
    buyer_name: draft.buyerName.slice(0, 300),
    project_name: draft.projectName.slice(0, 300),
    language: draft.language,
  };
}
