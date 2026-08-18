// ===== Minimal Feature Flags =====
// Environment-variable driven feature switches.
// NOT a security boundary — real access must always be enforced by auth/roles.

export function parseFeatureFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

const FEATURE_FLAGS: Record<string, boolean> = {
  project_review_center: parseFeatureFlag(
    process.env.NEXT_PUBLIC_FEATURE_PROJECT_REVIEW_CENTER,
  ),
};

export function isFeatureEnabled(name: string): boolean {
  return FEATURE_FLAGS[name] === true;
}

export const FEATURES = {
  PROJECT_REVIEW_CENTER: 'project_review_center',
} as const;
