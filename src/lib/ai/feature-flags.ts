// ===== Feature Flags for Account Persona V2 =====
// Environment-variable-driven flags for safe rollout and rollback

export function isPersonaV2Enabled(): boolean {
  var val = process.env.PERSONA_V2_ENABLED;
  if (val === undefined || val === '') return true; // enabled by default in V5.2
  return val === 'true' || val === '1';
}

export function isPersonaReviewEnabled(): boolean {
  var val = process.env.PERSONA_V2_REVIEW_ENABLED;
  if (val === undefined || val === '') return true;
  return val === 'true' || val === '1';
}

export function isAutoRepairEnabled(): boolean {
  var val = process.env.PERSONA_V2_AUTO_REPAIR_ENABLED;
  if (val === undefined || val === '') return true;
  return val === 'true' || val === '1';
}

export function getFeatureFlags(): Record<string, boolean> {
  return {
    personaV2Enabled: isPersonaV2Enabled(),
    personaReviewEnabled: isPersonaReviewEnabled(),
    autoRepairEnabled: isAutoRepairEnabled(),
  };
}
