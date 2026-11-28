import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import {
  resolveWosV1AppRuntime,
  resolveWosV1QaAppRuntime,
} from './production-app-contract';
import {
  handleWosV1Request,
  type WosV1DataClient,
  type WosV1HandlerDependencies,
} from './production-app-handler';

export { handleWosV1Request };
export type { WosV1DataClient, WosV1HandlerDependencies };

export async function createWosV1HandlerDependencies(): Promise<WosV1HandlerDependencies> {
  const runtime = resolveWosV1AppRuntime({
    vercelEnv: process.env.VERCEL_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    authMode: process.env.AUTH_MODE,
    appEnabled: process.env.WOS_V1_APP_ENABLED,
    writesEnabled: process.env.WOS_V1_APP_WRITES_ENABLED,
  });
  const client = runtime.readsEnabled ? await createClient() : null;
  return {
    runtime,
    client: client as unknown as WosV1DataClient | null,
    resolveIdentity: async candidate =>
      resolveVerifiedSupabaseIdentity(
        candidate as unknown as NonNullable<Awaited<ReturnType<typeof createClient>>>,
      ),
  };
}

export async function createWosV1QaHandlerDependencies(): Promise<WosV1HandlerDependencies> {
  const runtime = resolveWosV1QaAppRuntime({
    vercelEnv: process.env.VERCEL_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    authMode: process.env.AUTH_MODE,
    qaEnabled: process.env.WOS_V1_QA_APP_ENABLED,
    qaWritesEnabled: process.env.WOS_V1_QA_APP_WRITES_ENABLED,
    qaUatM2Enabled: process.env.WOS_V1_QA_UAT_M2_ENABLED,
    qaUatM2WritesEnabled: process.env.WOS_V1_QA_UAT_M2_WRITES_ENABLED,
    qaUatAuthorizationId: process.env.WOS_V1_QA_UAT_AUTHORIZATION_ID,
  });
  const client = runtime.readsEnabled ? await createClient() : null;
  return {
    runtime,
    client: client as unknown as WosV1DataClient | null,
    resolveIdentity: async candidate =>
      resolveVerifiedSupabaseIdentity(
        candidate as unknown as NonNullable<Awaited<ReturnType<typeof createClient>>>,
      ),
  };
}
