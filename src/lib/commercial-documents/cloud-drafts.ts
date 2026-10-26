import { getCurrentUser } from '@/lib/auth/current-user';
import { createClient } from '@/lib/supabase/server';
import { safeDraft, draftMetadata } from '@/lib/commercial-documents/cloud-draft-validation';

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

export { safeDraft, draftMetadata } from './cloud-draft-validation';
