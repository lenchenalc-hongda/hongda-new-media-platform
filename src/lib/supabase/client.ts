// ===== Supabase Browser Client =====
// For use in Client Components (automatic cookie forwarding).
// Falls back gracefully when Supabase is not configured.

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[supabase] No credentials configured. Using mock auth.');
    return null;
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
