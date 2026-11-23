export const WOS_PRODUCTION_SUPABASE_REF = 'amqpvxrurenevniilhtl' as const;
export const WOS_QA_SUPABASE_REF = 'xulmpqaknlwqqculbsek' as const;

export const WOS_V1_PRODUCTION_RPC_NAMES = {
  createOrder: 'wos_create_production_order',
  registerImage: 'wos_register_uploaded_reference_image',
  confirmOffice: 'wos_confirm_office_completeness',
  submitOrder: 'wos_submit_production_order',
  operatorAction: 'wos_operator_order_action',
  saveCorrection: 'wos_office_save_correction',
  resubmitOrder: 'wos_office_resubmit_order',
  reviewCorrection: 'wos_operator_review_correction',
} as const;

export const WOS_V1_WRITE_ROLES = ['admin', 'manager', 'sales', 'operator'] as const;

export type WosV1WriteRole = (typeof WOS_V1_WRITE_ROLES)[number];
export type WosSupabaseRuntime = 'production' | 'qa' | 'foreign';

export interface WosProductionRuntimeInput {
  readonly vercelEnv?: string;
  readonly supabaseUrl?: string;
  readonly writesEnabled?: string;
  readonly authMode?: string;
}

export interface WosProductionRuntimeState {
  readonly project: WosSupabaseRuntime;
  readonly environmentAccepted: boolean;
  readonly authAccepted: boolean;
  readonly writesEnabled: boolean;
}

export function classifyWosSupabaseRuntime(
  supabaseUrl: string | undefined,
): WosSupabaseRuntime {
  if (!supabaseUrl) return 'foreign';
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== 'https:' || url.port || url.username || url.password
      || (url.pathname !== '/' && url.pathname !== '')
      || url.search || url.hash) return 'foreign';
    if (url.hostname === WOS_PRODUCTION_SUPABASE_REF + '.supabase.co') {
      return 'production';
    }
    if (url.hostname === WOS_QA_SUPABASE_REF + '.supabase.co') return 'qa';
    return 'foreign';
  } catch {
    return 'foreign';
  }
}

export function resolveWosProductionRuntime(
  input: WosProductionRuntimeInput,
): WosProductionRuntimeState {
  const project = classifyWosSupabaseRuntime(input.supabaseUrl);
  const environmentAccepted = input.vercelEnv === 'production';
  const authAccepted = input.authMode === 'supabase';
  return {
    project,
    environmentAccepted,
    authAccepted,
    writesEnabled: project === 'production'
      && environmentAccepted
      && authAccepted
      && input.writesEnabled === 'true',
  };
}

export function canInvokeWosV1ProductionWrite(
  role: unknown,
  runtime: WosProductionRuntimeState,
): boolean {
  return runtime.writesEnabled
    && typeof role === 'string'
    && (WOS_V1_WRITE_ROLES as readonly string[]).includes(role);
}

export function wosV1ReadOnlyInvariant(): {
  readonly reviewReadyBeforeProof: false;
  readonly canStart: false;
} {
  return {
    reviewReadyBeforeProof: false,
    canStart: false,
  };
}
