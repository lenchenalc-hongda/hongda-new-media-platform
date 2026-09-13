// ===== Supabase Admin/Service Client (server-only) =====
// Must NEVER be imported from client components. Service role bypasses RLS,
// so every caller must complete application-layer authorization first.

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false },
  });
}
