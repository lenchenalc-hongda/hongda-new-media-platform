/**
 * Phase 8 bounded-task bootstrap.
 *
 * The implementation must remain repository-only and fail closed:
 * - accept only explicitly non-Production, synthetic/test evidence;
 * - never connect to Supabase, Meta, WhatsApp, or another provider;
 * - never read or emit credentials or customer data.
 */
export const GLH_PHASE8_PILOT_EVIDENCE_TASK = {
  taskId: "GLH-P8-PILOT-EVIDENCE-BUNDLE-002",
  environment: "NON_PRODUCTION",
  productionChanged: false,
} as const;
