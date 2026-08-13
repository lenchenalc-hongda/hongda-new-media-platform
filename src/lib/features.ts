// ===== Minimal Feature Flags =====
// Environment-variable driven feature switches.
// NOT a security boundary — real access must always be enforced by auth/roles.

const FEATURE_PREFIX = 'NEXT_PUBLIC_FEATURE_';

export function isFeatureEnabled(name: string): boolean {
  const key = FEATURE_PREFIX + name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const value = process.env[key];
  return value === 'true' || value === '1';
}

export const FEATURES = {
  PROJECT_REVIEW_CENTER: 'project_review_center',
} as const;
