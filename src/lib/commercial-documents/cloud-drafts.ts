import { getCurrentUser } from '@/lib/auth/current-user';
import { createClient } from '@/lib/supabase/server';
import { isDraftShape, normalizeImportedDraft, type CommercialDocumentDraft } from '@/lib/commercial-documents/template';

export const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' };
export async function draftContext() {
  const user = await getCurrentUser();
  if (!user || !['admin', 'manager', 'operator', 'sales'].includes(user.role)) return null;
  const db = await createClient();
  if (!db) return null;
  const { data: profile, error } = await db.from('profiles').select('id,org_id,role,is_active')
    .eq('user_id', user.id).maybeSingle();
  if (error || !profile?.is_active || profile.role !== user.role) return null;
  return { user, db, profile };
}

/** Drafts intentionally allow incomplete quote fields. They do not mutate CPC. */
export function safeDraft(value: unknown, salespersonName: string): CommercialDocumentDraft | null {
  if (!isDraftShape(value)) return null;
  const draft = normalizeImportedDraft(value, salespersonName);
  if (draft.kind !== 'quotation') return null; // machine contracts remain unchanged
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
