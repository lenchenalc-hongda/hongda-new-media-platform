/**
 * Phase 7 follow-up boundary: derive attribution from referral facts already
 * persisted on RLS-scoped GLH messages.
 *
 * No database migration, provider call, Production mutation, or invented
 * attribution identifier is authorized by this task.
 */
export const GLH_PHASE7_PERSISTED_REFERRAL_READ_MODEL_SCOPE = {
  taskId: 'GLH-P7-PERSISTED-REFERRAL-READMODEL-002',
  sourceOfTruth: 'GLH_MESSAGES_MEDIA_METADATA_REFERRAL',
  selection: 'LATEST_VALID_REFERRAL_PER_ACCESSIBLE_LEAD',
  fallback: 'UNKNOWN',
  deduplicateByLead: true,
  migrationAuthorized: false,
  providerCallsAuthorized: false,
  productionChanged: false,
} as const;
