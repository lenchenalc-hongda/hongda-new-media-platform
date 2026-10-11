/**
 * Phase 7 bootstrap contract for Global Lead Hub ad attribution.
 *
 * This file intentionally contains no provider credentials, outbound provider calls,
 * Production mutation, or database migration. It defines the fail-closed boundary
 * for the implementation task bound through Agent Control.
 */
export const GLH_PHASE7_AD_ATTRIBUTION_SCOPE = {
  taskId: "GLH-P7-AD-ATTRIBUTION-001",
  sourceOfTruth: "SUPABASE_POSTGRES",
  attributionFallback: "UNKNOWN",
  supportedMetadata: [
    "campaign",
    "adset",
    "ad",
    "creative",
    "referral",
  ],
  requirements: {
    persistMetadataOnlyWhenPresent: true,
    neverInventAttribution: true,
    idempotentWebhookReplay: true,
    organizationScopedReads: true,
    humanUiWorksWithoutProviderOrAi: true,
  },
  forbidden: {
    providerCalls: true,
    productionCutover: true,
    productionSql: true,
    productionRls: true,
    productionEnvironmentChanges: true,
    externalPublishing: true,
  },
  productionChanged: false,
} as const;
