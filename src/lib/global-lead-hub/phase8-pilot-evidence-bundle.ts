import { createHash } from 'node:crypto';
import {
  canManageGlhOrganization,
  canViewAllGlhLeads,
  canViewGlhLead,
  type GlhAccessContext,
  type GlhLeadAccessRecord,
} from './access';
import {
  GLH_PHASE8_EVIDENCE_IDS,
  type GlhPhase8EvidenceId,
} from './phase8-non-production-pilot';

/**
 * Repository-only validator for a sanitized Phase 8 non-Production evidence
 * bundle. This module performs no database, provider, network, or environment
 * reads and never emits credential or customer data.
 */
export const GLH_PHASE8_PILOT_EVIDENCE_TASK = {
  taskId: 'GLH-P8-PILOT-EVIDENCE-BUNDLE-002',
  environment: 'NON_PRODUCTION',
  productionChanged: false,
} as const;

export const GLH_PHASE8_PILOT_EVIDENCE_SCHEMA_VERSION =
  'glh-phase8-pilot-evidence/v1' as const;
export const GLH_PHASE8_PILOT_EVIDENCE_REPORT_VERSION =
  'glh-phase8-pilot-evidence-report/v1' as const;
export const GLH_PHASE8_PILOT_EVIDENCE_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export const GLH_PHASE8_PILOT_EVIDENCE_CHECK_IDS = GLH_PHASE8_EVIDENCE_IDS;
export type GlhPhase8PilotEvidenceCheckId = GlhPhase8EvidenceId;

export type GlhPhase8JsonPrimitive = string | number | boolean | null;
export type GlhPhase8JsonValue =
  | GlhPhase8JsonPrimitive
  | readonly GlhPhase8JsonValue[]
  | { readonly [key: string]: GlhPhase8JsonValue };
export type GlhPhase8JsonObject = { readonly [key: string]: GlhPhase8JsonValue };

export interface GlhPhase8EvidenceSource {
  id: string;
  kind: string;
  capturedAt: string;
  digest: string;
}

export interface GlhPhase8EvidenceUser {
  id: string;
  classification: 'SYNTHETIC' | 'TEST';
  organizationId: string;
  role: 'SALES' | 'MANAGER' | 'ADMIN';
}

export interface GlhPhase8EvidenceContact {
  id: string;
  classification: 'SYNTHETIC' | 'TEST';
  organizationId: string;
  externalId: string;
}

export interface GlhPhase8EvidenceIdentitySet {
  users: readonly GlhPhase8EvidenceUser[];
  contacts: readonly GlhPhase8EvidenceContact[];
}

export interface GlhPhase8PilotEvidenceCheck {
  id: GlhPhase8PilotEvidenceCheckId;
  status: 'PASS' | 'FAIL';
  observedAt: string;
  sourceRefs: readonly string[];
  facts: GlhPhase8JsonObject;
}

export interface GlhPhase8PilotEvidenceIntegrity {
  algorithm: 'sha256';
  digest: string;
}

export interface GlhPhase8PilotEvidenceBundle {
  schemaVersion: typeof GLH_PHASE8_PILOT_EVIDENCE_SCHEMA_VERSION;
  taskId: typeof GLH_PHASE8_PILOT_EVIDENCE_TASK.taskId;
  environment: 'NON_PRODUCTION';
  mode: 'REPOSITORY_ONLY_SYNTHETIC';
  productionAccess: false;
  realProviderCalls: false;
  generatedAt: string;
  expiresAt: string;
  sources: readonly GlhPhase8EvidenceSource[];
  identities: GlhPhase8EvidenceIdentitySet;
  checks: readonly GlhPhase8PilotEvidenceCheck[];
  integrity: GlhPhase8PilotEvidenceIntegrity;
}

export type GlhPhase8PilotEvidenceIssueCode =
  | 'INVALID_EVIDENCE'
  | 'SCHEMA_VERSION_UNSUPPORTED'
  | 'TASK_MISMATCH'
  | 'PRODUCTION_ENVIRONMENT'
  | 'INVALID_ENVIRONMENT'
  | 'PRODUCTION_ACCESS_CLAIMED'
  | 'PROVIDER_ACCESS_CLAIMED'
  | 'INVALID_EVIDENCE_MODE'
  | 'MISSING_SOURCE'
  | 'DUPLICATE_SOURCE'
  | 'INVALID_SOURCE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TIME_RANGE'
  | 'EVIDENCE_FROM_FUTURE'
  | 'EVIDENCE_EXPIRED'
  | 'EVIDENCE_STALE'
  | 'INVALID_INTEGRITY'
  | 'TAMPER_DETECTED'
  | 'NON_SYNTHETIC_IDENTITY'
  | 'REAL_IDENTIFIER'
  | 'SECRET_LIKE_VALUE'
  | 'MISSING_CHECK'
  | 'DUPLICATE_CHECK'
  | 'UNKNOWN_CHECK'
  | 'INVALID_CHECK'
  | 'CHECK_REPORTED_FAILURE'
  | 'UNSUPPORTED_CLAIM'
  | 'MISSING_FACT'
  | 'INCONSISTENT_FACT';

export interface GlhPhase8PilotEvidenceIssue {
  code: GlhPhase8PilotEvidenceIssueCode;
  path: string;
  message: string;
  checkId?: GlhPhase8PilotEvidenceCheckId;
}

export interface GlhPhase8PilotEvidenceCheckReport {
  id: GlhPhase8PilotEvidenceCheckId;
  status: 'PASS' | 'FAIL';
  sourceRefs: readonly string[];
  errors: readonly GlhPhase8PilotEvidenceIssue[];
}

export interface GlhPhase8PilotEvidenceReport {
  reportVersion: typeof GLH_PHASE8_PILOT_EVIDENCE_REPORT_VERSION;
  taskId: typeof GLH_PHASE8_PILOT_EVIDENCE_TASK.taskId;
  environment: 'NON_PRODUCTION' | 'REJECTED';
  overallStatus: 'PASS' | 'FAIL';
  accepted: boolean;
  passed: number;
  failed: number;
  evidenceGeneratedAt: string | null;
  evidenceExpiresAt: string | null;
  checks: readonly GlhPhase8PilotEvidenceCheckReport[];
  errors: readonly GlhPhase8PilotEvidenceIssue[];
}

export interface GlhPhase8PilotEvidenceValidationOptions {
  evaluatedAt?: string;
  maxAgeMs?: number;
}

interface ParsedSource extends GlhPhase8EvidenceSource {}

interface ParsedUser extends GlhPhase8EvidenceUser {}

interface ParsedContact extends GlhPhase8EvidenceContact {}

interface ParsedCheck {
  id: GlhPhase8PilotEvidenceCheckId;
  status: 'PASS' | 'FAIL';
  observedAt: string;
  sourceRefs: readonly string[];
  facts: Record<string, unknown>;
}

interface ParseContext {
  issues: GlhPhase8PilotEvidenceIssue[];
  sources: Map<string, ParsedSource>;
  users: Map<string, ParsedUser>;
  contacts: Map<string, ParsedContact>;
  checks: Map<GlhPhase8PilotEvidenceCheckId, ParsedCheck>;
  generatedAt: number | null;
  expiresAt: number | null;
  evidenceNotBefore: number | null;
}

interface CheckResult {
  issues: GlhPhase8PilotEvidenceIssue[];
}

const REQUIRED_DESKTOP_REGIONS = [
  'queues',
  'conversation',
  'customer-card',
  'takeover',
  'compose',
] as const;

const VALID_ROLES = new Set(['SALES', 'MANAGER', 'ADMIN']);
const VALID_CLASSIFICATIONS = new Set(['SYNTHETIC', 'TEST']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertJsonLike(
  value: unknown,
  path: string,
  issues: GlhPhase8PilotEvidenceIssue[],
  ancestors = new Set<object>(),
): value is GlhPhase8JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return true;
    issues.push({
      code: 'INVALID_EVIDENCE',
      path,
      message: 'JSON-like evidence cannot contain NaN or Infinity.',
    });
    return false;
  }
  if (typeof value !== 'object') {
    issues.push({
      code: 'INVALID_EVIDENCE',
      path,
      message: 'Evidence contains a non-JSON value.',
    });
    return false;
  }
  if (ancestors.has(value)) {
    issues.push({
      code: 'INVALID_EVIDENCE',
      path,
      message: 'Evidence cannot contain circular references.',
    });
    return false;
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertJsonLike(item, `${path}/${index}`, issues, ancestors);
    });
  } else if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertJsonLike(item, `${path}/${escapeJsonPointer(key)}`, issues, ancestors);
    }
  } else {
    issues.push({
      code: 'INVALID_EVIDENCE',
      path,
      message: 'Evidence objects must be plain JSON objects.',
    });
  }
  ancestors.delete(value);
  return true;
}

function escapeJsonPointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => cloneJson(item)) as T;
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJson(item)]),
    ) as T;
  }
  return value;
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Cannot serialize a non-finite number.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  throw new TypeError('Cannot serialize a non-JSON value.');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function withoutIntegrity(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'integrity'),
  );
}

/**
 * Canonical bundle digest. The integrity field is excluded so callers can
 * compute a digest before attaching it to the bundle.
 */
export function computeGlhPhase8PilotEvidenceDigest(value: unknown): string {
  return sha256(stableStringify(withoutIntegrity(value)));
}

export function stringifyGlhPhase8PilotEvidenceReport(
  report: GlhPhase8PilotEvidenceReport,
): string {
  return JSON.stringify(report);
}

function issue(
  code: GlhPhase8PilotEvidenceIssueCode,
  path: string,
  message: string,
  checkId?: GlhPhase8PilotEvidenceCheckId,
): GlhPhase8PilotEvidenceIssue {
  return checkId
    ? { code, path, message, checkId }
    : { code, path, message };
}

function sortIssues(
  issues: readonly GlhPhase8PilotEvidenceIssue[],
): GlhPhase8PilotEvidenceIssue[] {
  return [...issues].sort((left, right) =>
    left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message));
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function readString(
  source: Record<string, unknown>,
  key: string,
  path: string,
  issues: GlhPhase8PilotEvidenceIssue[],
  checkId?: GlhPhase8PilotEvidenceCheckId,
): string | null {
  const value = source[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(issue(
      'MISSING_FACT',
      `${path}/${escapeJsonPointer(key)}`,
      `${key} must be a non-empty string.`,
      checkId,
    ));
    return null;
  }
  return value;
}

function readBoolean(
  source: Record<string, unknown>,
  key: string,
  path: string,
  issues: GlhPhase8PilotEvidenceIssue[],
  checkId?: GlhPhase8PilotEvidenceCheckId,
): boolean | null {
  const value = source[key];
  if (typeof value !== 'boolean') {
    issues.push(issue(
      'MISSING_FACT',
      `${path}/${escapeJsonPointer(key)}`,
      `${key} must be a boolean.`,
      checkId,
    ));
    return null;
  }
  return value;
}

function readNumber(
  source: Record<string, unknown>,
  key: string,
  path: string,
  issues: GlhPhase8PilotEvidenceIssue[],
  checkId?: GlhPhase8PilotEvidenceCheckId,
): number | null {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(issue(
      'MISSING_FACT',
      `${path}/${escapeJsonPointer(key)}`,
      `${key} must be a finite number.`,
      checkId,
    ));
    return null;
  }
  return value;
}

function readObject(
  source: Record<string, unknown>,
  key: string,
  path: string,
  issues: GlhPhase8PilotEvidenceIssue[],
  checkId?: GlhPhase8PilotEvidenceCheckId,
): Record<string, unknown> | null {
  const value = source[key];
  if (!isPlainObject(value)) {
    issues.push(issue(
      'MISSING_FACT',
      `${path}/${escapeJsonPointer(key)}`,
      `${key} must be a JSON object.`,
      checkId,
    ));
    return null;
  }
  return value;
}

function readArray(
  source: Record<string, unknown>,
  key: string,
  path: string,
  issues: GlhPhase8PilotEvidenceIssue[],
  checkId?: GlhPhase8PilotEvidenceCheckId,
): unknown[] | null {
  const value = source[key];
  if (!Array.isArray(value)) {
    issues.push(issue(
      'MISSING_FACT',
      `${path}/${escapeJsonPointer(key)}`,
      `${key} must be an array.`,
      checkId,
    ));
    return null;
  }
  return value;
}

function expectValue(
  actual: unknown,
  expected: unknown,
  path: string,
  message: string,
  issues: GlhPhase8PilotEvidenceIssue[],
  checkId: GlhPhase8PilotEvidenceCheckId,
): void {
  if (actual !== expected) {
    issues.push(issue('INCONSISTENT_FACT', path, message, checkId));
  }
}

function parseLead(
  value: unknown,
  path: string,
  issues: GlhPhase8PilotEvidenceIssue[],
  checkId: GlhPhase8PilotEvidenceCheckId,
): GlhLeadAccessRecord | null {
  if (!isPlainObject(value)) {
    issues.push(issue('MISSING_FACT', path, 'Lead evidence must be an object.', checkId));
    return null;
  }
  const organizationId = readString(
    value,
    'organizationId',
    path,
    issues,
    checkId,
  );
  const ownerValue = value.ownerProfileId;
  if (ownerValue !== null && typeof ownerValue !== 'string') {
    issues.push(issue(
      'INCONSISTENT_FACT',
      `${path}/ownerProfileId`,
      'ownerProfileId must be a string or null.',
      checkId,
    ));
  }
  const collaboratorsValue = value.collaboratorProfileIds;
  const collaboratorProfileIds = collaboratorsValue === undefined
    ? []
    : Array.isArray(collaboratorsValue)
      && collaboratorsValue.every(item => typeof item === 'string')
      ? collaboratorsValue as string[]
      : null;
  if (collaboratorProfileIds === null) {
    issues.push(issue(
      'INCONSISTENT_FACT',
      `${path}/collaboratorProfileIds`,
      'collaboratorProfileIds must be an array of strings.',
      checkId,
    ));
  }
  if (
    organizationId === null
    || (ownerValue !== null && typeof ownerValue !== 'string')
    || collaboratorProfileIds === null
  ) {
    return null;
  }
  return {
    organizationId,
    ownerProfileId: ownerValue,
    collaboratorProfileIds,
  };
}

function sourceExists(context: ParseContext, sourceId: string): boolean {
  return context.sources.has(sourceId);
}

function validateSourceRefs(
  sourceRefs: readonly string[],
  path: string,
  context: ParseContext,
  checkId: GlhPhase8PilotEvidenceCheckId,
): void {
  if (sourceRefs.length === 0) {
    context.issues.push(issue(
      'MISSING_SOURCE',
      path,
      'Each check must cite at least one evidence source.',
      checkId,
    ));
  }
  for (const sourceRef of sourceRefs) {
    if (!sourceExists(context, sourceRef)) {
      context.issues.push(issue(
        'MISSING_SOURCE',
        `${path}/${escapeJsonPointer(sourceRef)}`,
        `Check cites unknown source ${sourceRef}.`,
        checkId,
      ));
    }
  }
}

function validateRlsCheck(
  facts: Record<string, unknown>,
  path: string,
  context: ParseContext,
): CheckResult {
  const checkId: GlhPhase8PilotEvidenceCheckId = 'RLS_SALES_ISOLATION';
  const issues: GlhPhase8PilotEvidenceIssue[] = [];
  const salesAUserId = readString(facts, 'salesAUserId', path, issues, checkId);
  const ownLead = parseLead(
    facts.salesAOwnLead,
    `${path}/salesAOwnLead`,
    issues,
    checkId,
  );
  const restrictedLead = parseLead(
    facts.salesBRestrictedLead,
    `${path}/salesBRestrictedLead`,
    issues,
    checkId,
  );
  const foreignLead = parseLead(
    facts.foreignLead,
    `${path}/foreignLead`,
    issues,
    checkId,
  );
  const salesA = salesAUserId ? context.users.get(salesAUserId) : undefined;

  if (salesAUserId && !salesA) {
    issues.push(issue(
      'UNSUPPORTED_CLAIM',
      `${path}/salesAUserId`,
      'Sales A must reference a declared synthetic user.',
      checkId,
    ));
  }
  if (salesA && salesA.role !== 'SALES') {
    issues.push(issue(
      'INCONSISTENT_FACT',
      `${path}/salesAUserId`,
      'Sales A must have the SALES role.',
      checkId,
    ));
  }

  if (salesA && ownLead && restrictedLead && foreignLead) {
    const accessContext: GlhAccessContext = {
      actorProfileId: salesA.id,
      organizationId: salesA.organizationId,
      role: salesA.role,
      authSource: 'supabase',
    };
    const ownVisible = canViewGlhLead(accessContext, ownLead);
    const restrictedVisible = canViewGlhLead(accessContext, restrictedLead);
    const foreignVisible = canViewGlhLead(accessContext, foreignLead);
    const claimedOwnVisible = readBoolean(
      facts,
      'ownedLeadVisible',
      path,
      issues,
      checkId,
    );
    const claimedRestrictedVisible = readBoolean(
      facts,
      'salesBRestrictedLeadVisible',
      path,
      issues,
      checkId,
    );
    const claimedForeignVisible = readBoolean(
      facts,
      'foreignLeadVisible',
      path,
      issues,
      checkId,
    );

    if (!ownVisible) {
      issues.push(issue(
        'INCONSISTENT_FACT',
        `${path}/salesAOwnLead`,
        'Sales A must be able to read an owned lead.',
        checkId,
      ));
    }
    if (restrictedVisible) {
      issues.push(issue(
        'INCONSISTENT_FACT',
        `${path}/salesBRestrictedLead`,
        'Sales A must not read a restricted Sales B lead.',
        checkId,
      ));
    }
    if (foreignVisible) {
      issues.push(issue(
        'INCONSISTENT_FACT',
        `${path}/foreignLead`,
        'Sales A must not read a cross-organization lead.',
        checkId,
      ));
    }
    expectValue(
      claimedOwnVisible,
      ownVisible,
      `${path}/ownedLeadVisible`,
      'The owned-lead visibility claim must match the access contract.',
      issues,
      checkId,
    );
    expectValue(
      claimedRestrictedVisible,
      restrictedVisible,
      `${path}/salesBRestrictedLeadVisible`,
      'The restricted-lead visibility claim must match the access contract.',
      issues,
      checkId,
    );
    expectValue(
      claimedForeignVisible,
      foreignVisible,
      `${path}/foreignLeadVisible`,
      'The foreign-lead visibility claim must match the access contract.',
      issues,
      checkId,
    );
  }

  for (const key of [
    'rlsPolicyUsesTrustedProfileMembership',
    'rlsPolicyRequiresSameOrganization',
    'salesCanAccessOwnedOrAssignedOnly',
  ]) {
    expectValue(
      readBoolean(facts, key, path, issues, checkId),
      true,
      `${path}/${key}`,
      `${key} must be supported by the repository RLS contract.`,
      issues,
      checkId,
    );
  }

  return { issues };
}

function validateManagerAdminCheck(
  facts: Record<string, unknown>,
  path: string,
  context: ParseContext,
): CheckResult {
  const checkId: GlhPhase8PilotEvidenceCheckId =
    'MANAGER_ADMIN_ORGANIZATION_SCOPE';
  const issues: GlhPhase8PilotEvidenceIssue[] = [];
  const managerUserId = readString(facts, 'managerUserId', path, issues, checkId);
  const adminUserId = readString(facts, 'adminUserId', path, issues, checkId);
  const salesUserId = readString(facts, 'salesUserId', path, issues, checkId);
  const sameOrganizationLead = parseLead(
    facts.sameOrganizationLead,
    `${path}/sameOrganizationLead`,
    issues,
    checkId,
  );
  const foreignOrganizationLead = parseLead(
    facts.foreignOrganizationLead,
    `${path}/foreignOrganizationLead`,
    issues,
    checkId,
  );
  const manager = managerUserId ? context.users.get(managerUserId) : undefined;
  const admin = adminUserId ? context.users.get(adminUserId) : undefined;
  const sales = salesUserId ? context.users.get(salesUserId) : undefined;

  for (const [key, user, role] of [
    ['managerUserId', manager, 'MANAGER'],
    ['adminUserId', admin, 'ADMIN'],
    ['salesUserId', sales, 'SALES'],
  ] as const) {
    if (!user) {
      issues.push(issue(
        'UNSUPPORTED_CLAIM',
        `${path}/${key}`,
        `${key} must reference a declared synthetic user.`,
        checkId,
      ));
    } else if (user.role !== role) {
      issues.push(issue(
        'INCONSISTENT_FACT',
        `${path}/${key}`,
        `${key} must have the ${role} role.`,
        checkId,
      ));
    }
  }

  if (manager && admin && sales && sameOrganizationLead && foreignOrganizationLead) {
    const managerContext: GlhAccessContext = {
      actorProfileId: manager.id,
      organizationId: manager.organizationId,
      role: manager.role,
      authSource: 'supabase',
    };
    const adminContext: GlhAccessContext = {
      actorProfileId: admin.id,
      organizationId: admin.organizationId,
      role: admin.role,
      authSource: 'supabase',
    };
    const salesContext: GlhAccessContext = {
      actorProfileId: sales.id,
      organizationId: sales.organizationId,
      role: sales.role,
      authSource: 'supabase',
    };
    const expected = {
      managerCanViewAllLeads: canViewAllGlhLeads(managerContext),
      adminCanViewAllLeads: canViewAllGlhLeads(adminContext),
      managerCanViewSameOrganizationLead:
        canViewGlhLead(managerContext, sameOrganizationLead),
      adminCanViewSameOrganizationLead:
        canViewGlhLead(adminContext, sameOrganizationLead),
      managerCanViewForeignLead:
        canViewGlhLead(managerContext, foreignOrganizationLead),
      adminCanViewForeignLead:
        canViewGlhLead(adminContext, foreignOrganizationLead),
      managerCanManageOwnOrganization:
        canManageGlhOrganization(managerContext, manager.organizationId),
      adminCanManageOwnOrganization:
        canManageGlhOrganization(adminContext, admin.organizationId),
      managerCanManageForeignOrganization:
        canManageGlhOrganization(managerContext, foreignOrganizationLead.organizationId),
      adminCanManageForeignOrganization:
        canManageGlhOrganization(adminContext, foreignOrganizationLead.organizationId),
      salesCanManageOrganization:
        canManageGlhOrganization(salesContext, sales.organizationId),
    } as const;

    for (const [key, expectedValue] of Object.entries(expected)) {
      const claimed = readBoolean(facts, key, path, issues, checkId);
      expectValue(
        claimed,
        expectedValue,
        `${path}/${key}`,
        `${key} must match the organization-scoped access contract.`,
        issues,
        checkId,
      );
    }
    for (const key of [
      'managerCanViewAllLeads',
      'adminCanViewAllLeads',
      'managerCanViewSameOrganizationLead',
      'adminCanViewSameOrganizationLead',
      'managerCanManageOwnOrganization',
      'adminCanManageOwnOrganization',
    ]) {
      expectValue(
        expected[key as keyof typeof expected],
        true,
        `${path}/${key}`,
        `${key} must be true.`,
        issues,
        checkId,
      );
    }
    for (const key of [
      'managerCanViewForeignLead',
      'adminCanViewForeignLead',
      'managerCanManageForeignOrganization',
      'adminCanManageForeignOrganization',
      'salesCanManageOrganization',
    ]) {
      expectValue(
        expected[key as keyof typeof expected],
        false,
        `${path}/${key}`,
        `${key} must be false.`,
        issues,
        checkId,
      );
    }
  }

  return { issues };
}

function validateWebhookReplayCheck(
  facts: Record<string, unknown>,
  path: string,
): CheckResult {
  const checkId: GlhPhase8PilotEvidenceCheckId = 'WEBHOOK_REPLAY_IDEMPOTENCY';
  const issues: GlhPhase8PilotEvidenceIssue[] = [];
  readString(facts, 'externalEventId', path, issues, checkId);

  for (const [key, expected] of [
    ['firstDeliveryAcceptedLogicalMessages', 1],
    ['replayDeliveryAcceptedLogicalMessages', 0],
    ['logicalMessagesAfterReplay', 1],
    ['autoRepliesAfterReplay', 1],
    ['duplicateLogicalMessages', 0],
    ['duplicateAutoReplies', 0],
  ] as const) {
    const actual = readNumber(facts, key, path, issues, checkId);
    expectValue(
      actual,
      expected,
      `${path}/${key}`,
      `${key} must equal ${expected} for replay idempotency.`,
      issues,
      checkId,
    );
  }

  return { issues };
}

function validateTakeoverCheck(
  facts: Record<string, unknown>,
  path: string,
): CheckResult {
  const checkId: GlhPhase8PilotEvidenceCheckId =
    'HUMAN_TAKEOVER_STOPS_AUTOSEND';
  const issues: GlhPhase8PilotEvidenceIssue[] = [];
  const observations = [
    ['modeAfterTakeover', 'HUMAN_ACTIVE'],
    ['pendingAiAutoSendStatusAfter', 'BLOCKED'],
    ['customerFacingAutoSendAttemptsAfterTakeover', 0],
    ['autoSendAllowedAfterTakeover', false],
    ['draftAssistanceAvailable', true],
    ['draftAssistanceMode', 'COPILOT_ONLY'],
    ['originalMessagesPreserved', true],
  ] as const;

  for (const [key, expected] of observations) {
    let actual: unknown;
    if (typeof expected === 'string') {
      actual = readString(facts, key, path, issues, checkId);
    } else if (typeof expected === 'number') {
      actual = readNumber(facts, key, path, issues, checkId);
    } else {
      actual = readBoolean(facts, key, path, issues, checkId);
    }
    expectValue(
      actual,
      expected,
      `${path}/${key}`,
      `${key} must equal ${String(expected)}.`,
      issues,
      checkId,
    );
  }

  return { issues };
}

function validateOutageCheck(
  facts: Record<string, unknown>,
  path: string,
): CheckResult {
  const checkId: GlhPhase8PilotEvidenceCheckId = 'AI_PROVIDER_OUTAGE_FALLBACK';
  const issues: GlhPhase8PilotEvidenceIssue[] = [];
  const aiAvailable = readBoolean(facts, 'aiAvailable', path, issues, checkId);
  const providerCallSucceeded = readBoolean(
    facts,
    'providerCallSucceeded',
    path,
    issues,
    checkId,
  );
  const providerFailureRecorded = readBoolean(
    facts,
    'providerFailureRecorded',
    path,
    issues,
    checkId,
  );
  const inboundMessagesBefore = readNumber(
    facts,
    'inboundMessagesBefore',
    path,
    issues,
    checkId,
  );
  const inboundMessagesAfter = readNumber(
    facts,
    'inboundMessagesAfter',
    path,
    issues,
    checkId,
  );
  const inboundEvidencePreserved = readBoolean(
    facts,
    'inboundEvidencePreserved',
    path,
    issues,
    checkId,
  );
  const humanHandoffCreated = readBoolean(
    facts,
    'humanHandoffCreated',
    path,
    issues,
    checkId,
  );
  const humanWorkAvailable = readBoolean(
    facts,
    'humanWorkAvailable',
    path,
    issues,
    checkId,
  );

  expectValue(aiAvailable, false, `${path}/aiAvailable`, 'AI must be unavailable.', issues, checkId);
  expectValue(
    providerCallSucceeded,
    false,
    `${path}/providerCallSucceeded`,
    'The provider call must not succeed.',
    issues,
    checkId,
  );
  expectValue(
    providerFailureRecorded,
    true,
    `${path}/providerFailureRecorded`,
    'The provider failure must be recorded.',
    issues,
    checkId,
  );
  expectValue(
    inboundEvidencePreserved,
    true,
    `${path}/inboundEvidencePreserved`,
    'Inbound evidence must be preserved.',
    issues,
    checkId,
  );
  expectValue(
    humanHandoffCreated,
    true,
    `${path}/humanHandoffCreated`,
    'A human handoff must be created.',
    issues,
    checkId,
  );
  expectValue(
    humanWorkAvailable,
    true,
    `${path}/humanWorkAvailable`,
    'Human work must remain available.',
    issues,
    checkId,
  );
  if (
    inboundMessagesBefore === null
    || inboundMessagesAfter === null
    || inboundMessagesBefore < 1
    || inboundMessagesBefore !== inboundMessagesAfter
  ) {
    issues.push(issue(
      'INCONSISTENT_FACT',
      `${path}/inboundMessagesAfter`,
      'Outage evidence must preserve at least one inbound message.',
      checkId,
    ));
  }

  return { issues };
}

function validateHumanWorkCheck(
  facts: Record<string, unknown>,
  path: string,
): CheckResult {
  const checkId: GlhPhase8PilotEvidenceCheckId =
    'HUMAN_WORK_REMAINS_AVAILABLE_WITHOUT_AI';
  const issues: GlhPhase8PilotEvidenceIssue[] = [];
  for (const [key, expected] of [
    ['aiAvailable', false],
    ['originalMessagesPreserved', true],
    ['humanMessageWorkAvailable', true],
    ['taskWorkAvailable', true],
    ['followupWorkAvailable', true],
  ] as const) {
    const actual = readBoolean(facts, key, path, issues, checkId);
    expectValue(
      actual,
      expected,
      `${path}/${key}`,
      `${key} must equal ${String(expected)}.`,
      issues,
      checkId,
    );
  }
  return { issues };
}

function validateAcceptanceCheck(
  facts: Record<string, unknown>,
  path: string,
  context: ParseContext,
): CheckResult {
  const checkId: GlhPhase8PilotEvidenceCheckId = 'ACCEPTANCE_CASES_A_TO_G';
  const issues: GlhPhase8PilotEvidenceIssue[] = [];
  const cases = readArray(facts, 'cases', path, issues, checkId);
  const seen = new Set<string>();

  if (cases) {
    for (const [index, value] of cases.entries()) {
      const casePath = `${path}/cases/${index}`;
      if (!isPlainObject(value)) {
        issues.push(issue(
          'INCONSISTENT_FACT',
          casePath,
          'Each acceptance case must be an object.',
          checkId,
        ));
        continue;
      }
      const id = readString(value, 'id', casePath, issues, checkId);
      const status = readString(value, 'status', casePath, issues, checkId);
      const sourceRefsValue = readArray(value, 'sourceRefs', casePath, issues, checkId);
      const sourceRefs = sourceRefsValue?.every(item => typeof item === 'string')
        ? sourceRefsValue as string[]
        : null;
      if (sourceRefsValue && !sourceRefs) {
        issues.push(issue(
          'INCONSISTENT_FACT',
          `${casePath}/sourceRefs`,
          'Acceptance case sourceRefs must be strings.',
          checkId,
        ));
      }
      if (sourceRefs) {
        validateSourceRefs(sourceRefs, `${casePath}/sourceRefs`, context, checkId);
      }
      if (!id || !/^[A-G]$/.test(id)) {
        issues.push(issue(
          'INCONSISTENT_FACT',
          `${casePath}/id`,
          'Acceptance case ids must be A through G.',
          checkId,
        ));
      } else if (seen.has(id)) {
        issues.push(issue(
          'INCONSISTENT_FACT',
          `${casePath}/id`,
          `Acceptance case ${id} is duplicated.`,
          checkId,
        ));
      } else {
        seen.add(id);
      }
      expectValue(
        status,
        'PASS',
        `${casePath}/status`,
        `Acceptance case ${id ?? index} must pass.`,
        issues,
        checkId,
      );

      const assertions = readArray(value, 'assertions', casePath, issues, checkId);
      if (assertions && assertions.length < 2) {
        issues.push(issue(
          'UNSUPPORTED_CLAIM',
          `${casePath}/assertions`,
          'Each acceptance case requires at least two supporting assertions.',
          checkId,
        ));
      }
      for (const [assertionIndex, assertion] of (assertions ?? []).entries()) {
        const assertionPath = `${casePath}/assertions/${assertionIndex}`;
        if (!isPlainObject(assertion)) {
          issues.push(issue(
            'INCONSISTENT_FACT',
            assertionPath,
            'Acceptance assertions must be objects.',
            checkId,
          ));
          continue;
        }
        readString(assertion, 'name', assertionPath, issues, checkId);
        if (!Object.prototype.hasOwnProperty.call(assertion, 'expected')) {
          issues.push(issue(
            'UNSUPPORTED_CLAIM',
            `${assertionPath}/expected`,
            'Acceptance assertions require an expected value.',
            checkId,
          ));
        }
        if (!Object.prototype.hasOwnProperty.call(assertion, 'actual')) {
          issues.push(issue(
            'UNSUPPORTED_CLAIM',
            `${assertionPath}/actual`,
            'Acceptance assertions require an observed value.',
            checkId,
          ));
        }
        if (
          Object.prototype.hasOwnProperty.call(assertion, 'expected')
          && Object.prototype.hasOwnProperty.call(assertion, 'actual')
        ) {
          expectValue(
            stableStringify(assertion.actual),
            stableStringify(assertion.expected),
            `${assertionPath}/actual`,
            'Acceptance assertion expected and actual values must match.',
            issues,
            checkId,
          );
        }
      }
    }
  }

  for (const id of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
    if (!seen.has(id)) {
      issues.push(issue(
        'MISSING_FACT',
        `${path}/cases/${id}`,
        `Acceptance case ${id} is missing.`,
        checkId,
      ));
    }
  }

  return { issues };
}

interface DesktopRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function parseDesktopRegion(
  value: unknown,
  path: string,
  issues: GlhPhase8PilotEvidenceIssue[],
  checkId: GlhPhase8PilotEvidenceCheckId,
): DesktopRegion | null {
  if (!isPlainObject(value)) {
    issues.push(issue('INCONSISTENT_FACT', path, 'Desktop regions must be objects.', checkId));
    return null;
  }
  const name = readString(value, 'name', path, issues, checkId);
  const x = readNumber(value, 'x', path, issues, checkId);
  const y = readNumber(value, 'y', path, issues, checkId);
  const width = readNumber(value, 'width', path, issues, checkId);
  const height = readNumber(value, 'height', path, issues, checkId);
  if (name === null || x === null || y === null || width === null || height === null) {
    return null;
  }
  return { name, x, y, width, height };
}

function regionsOverlap(left: DesktopRegion, right: DesktopRegion): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function validateDesktopCheck(
  facts: Record<string, unknown>,
  path: string,
  context: ParseContext,
): CheckResult {
  const checkId: GlhPhase8PilotEvidenceCheckId = 'DESKTOP_1366X768_USABILITY';
  const issues: GlhPhase8PilotEvidenceIssue[] = [];
  const viewportWidth = readNumber(facts, 'viewportWidth', path, issues, checkId);
  const viewportHeight = readNumber(facts, 'viewportHeight', path, issues, checkId);
  const documentScrollWidth = readNumber(
    facts,
    'documentScrollWidth',
    path,
    issues,
    checkId,
  );
  readNumber(facts, 'documentScrollHeight', path, issues, checkId);
  const regionsValue = readArray(facts, 'regions', path, issues, checkId);
  const regions = (regionsValue ?? [])
    .map((region, index) => parseDesktopRegion(
      region,
      `${path}/regions/${index}`,
      issues,
      checkId,
    ))
    .filter((region): region is DesktopRegion => region !== null);
  const requiredControlsVisible = readBoolean(
    facts,
    'requiredControlsVisible',
    path,
    issues,
    checkId,
  );
  const overlapCount = readNumber(facts, 'overlapCount', path, issues, checkId);
  const screenshotSourceRef = readString(
    facts,
    'screenshotSourceRef',
    path,
    issues,
    checkId,
  );

  expectValue(
    viewportWidth,
    1366,
    `${path}/viewportWidth`,
    'Desktop UX evidence must use a 1366px viewport.',
    issues,
    checkId,
  );
  expectValue(
    viewportHeight,
    768,
    `${path}/viewportHeight`,
    'Desktop UX evidence must use a 768px viewport.',
    issues,
    checkId,
  );
  expectValue(
    requiredControlsVisible,
    true,
    `${path}/requiredControlsVisible`,
    'All required desktop controls must be visible.',
    issues,
    checkId,
  );
  if (
    viewportWidth !== null
    && documentScrollWidth !== null
    && documentScrollWidth > viewportWidth
  ) {
    issues.push(issue(
      'INCONSISTENT_FACT',
      `${path}/documentScrollWidth`,
      'The desktop layout must not overflow horizontally.',
      checkId,
    ));
  }

  const regionNames = new Set(regions.map(region => region.name));
  for (const required of REQUIRED_DESKTOP_REGIONS) {
    if (!regionNames.has(required)) {
      issues.push(issue(
        'MISSING_FACT',
        `${path}/regions/${required}`,
        `Required desktop region ${required} is missing.`,
        checkId,
      ));
    }
  }
  for (const region of regions) {
    if (
      viewportWidth !== null
      && viewportHeight !== null
      && (
        region.x < 0
        || region.y < 0
        || region.width <= 0
        || region.height <= 0
        || region.x + region.width > viewportWidth
        || region.y + region.height > viewportHeight
      )
    ) {
      issues.push(issue(
        'INCONSISTENT_FACT',
        `${path}/regions/${region.name}`,
        `Desktop region ${region.name} is outside the viewport.`,
        checkId,
      ));
    }
  }
  let computedOverlapCount = 0;
  for (let left = 0; left < regions.length; left++) {
    for (let right = left + 1; right < regions.length; right++) {
      if (regionsOverlap(regions[left], regions[right])) {
        computedOverlapCount++;
      }
    }
  }
  expectValue(
    overlapCount,
    computedOverlapCount,
    `${path}/overlapCount`,
    'Declared region overlap count must match the supplied geometry.',
    issues,
    checkId,
  );
  expectValue(
    computedOverlapCount,
    0,
    `${path}/regions`,
    'Required desktop regions must not overlap.',
    issues,
    checkId,
  );
  if (screenshotSourceRef && !sourceExists(context, screenshotSourceRef)) {
    issues.push(issue(
      'MISSING_SOURCE',
      `${path}/screenshotSourceRef`,
      'Desktop evidence must cite a declared screenshot source.',
      checkId,
    ));
  }

  return { issues };
}

function validateSecretCheck(
  facts: Record<string, unknown>,
  path: string,
): CheckResult {
  const checkId: GlhPhase8PilotEvidenceCheckId =
    'NO_BROWSER_OR_LOG_SECRET_EXPOSURE';
  const issues: GlhPhase8PilotEvidenceIssue[] = [];
  const expectations = [
    ['browserSecretCanaryHits', 0],
    ['logSecretCanaryHits', 0],
    ['serverOnlySecretsInBrowser', false],
    ['rawPayloadsInLogs', false],
    ['detectedSecretCount', 0],
  ] as const;
  for (const [key, expected] of expectations) {
    const actual = typeof expected === 'number'
      ? readNumber(facts, key, path, issues, checkId)
      : readBoolean(facts, key, path, issues, checkId);
    expectValue(
      actual,
      expected,
      `${path}/${key}`,
      `${key} must equal ${String(expected)}.`,
      issues,
      checkId,
    );
  }
  const scannedSurfaceCount = readNumber(
    facts,
    'scannedSurfaceCount',
    path,
    issues,
    checkId,
  );
  if (scannedSurfaceCount !== null && scannedSurfaceCount < 2) {
    issues.push(issue(
      'UNSUPPORTED_CLAIM',
      `${path}/scannedSurfaceCount`,
      'Secret evidence must scan at least browser and log surfaces.',
      checkId,
    ));
  }
  return { issues };
}

function scanSensitiveValues(
  value: unknown,
  path: string,
  issues: GlhPhase8PilotEvidenceIssue[],
  ancestors = new Set<object>(),
): void {
  if (typeof value === 'string') {
    if (
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)
      || /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/.test(value)
      || /\bsk-[A-Za-z0-9_-]{20,}\b/.test(value)
      || /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(value)
      || /\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}\b/i.test(value)
      || /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/.test(value)
      || /\bEAA[A-Za-z0-9]{20,}\b/.test(value)
    ) {
      issues.push(issue(
        'SECRET_LIKE_VALUE',
        path,
        'Evidence contains a credential- or token-like value.',
      ));
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      const domain = value.split('@')[1]?.toLowerCase() ?? '';
      const allowed = domain === 'example.com'
        || domain === 'example.org'
        || domain.endsWith('.test')
        || domain.endsWith('.invalid');
      if (!allowed) {
        issues.push(issue(
          'REAL_IDENTIFIER',
          path,
          'Evidence contains an email identifier outside reserved test domains.',
        ));
      }
    }
    if (/^\+?[1-9]\d{7,14}$/.test(value)) {
      issues.push(issue(
        'REAL_IDENTIFIER',
        path,
        'Evidence contains a phone-number-like identifier.',
      ));
    }
    return;
  }
  if (typeof value !== 'object' || value === null || ancestors.has(value)) return;

  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      scanSensitiveValues(item, `${path}/${index}`, issues, ancestors);
    });
  } else if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      const itemPath = `${path}/${escapeJsonPointer(key)}`;
      const sensitiveKey =
        /^(password|passwd|secret|token|credentials?|authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|service[_-]?role[_-]?key)$/i
          .test(key);
      if (sensitiveKey && item !== null && item !== '' && item !== false) {
        issues.push(issue(
          'SECRET_LIKE_VALUE',
          itemPath,
          `${key} must not contain credential material.`,
        ));
      }
      scanSensitiveValues(item, itemPath, issues, ancestors);
    }
  }
  ancestors.delete(value);
}

function parseSources(
  value: unknown,
  context: ParseContext,
): void {
  if (!Array.isArray(value) || value.length === 0) {
    context.issues.push(issue(
      'MISSING_SOURCE',
      '/sources',
      'Evidence must declare at least one source.',
    ));
    return;
  }

  value.forEach((sourceValue, index) => {
    const path = `/sources/${index}`;
    if (!isPlainObject(sourceValue)) {
      context.issues.push(issue('INVALID_SOURCE', path, 'Source must be an object.'));
      return;
    }
    const id = readString(sourceValue, 'id', path, context.issues);
    const kind = readString(sourceValue, 'kind', path, context.issues);
    const capturedAt = sourceValue.capturedAt;
    const digest = sourceValue.digest;
    if (!isIsoTimestamp(capturedAt)) {
      context.issues.push(issue(
        'INVALID_TIMESTAMP',
        `${path}/capturedAt`,
        'Source capturedAt must be an ISO-8601 UTC timestamp.',
      ));
    } else if (
      context.generatedAt !== null
      && (
        Date.parse(capturedAt) > context.generatedAt
        || (
          context.evidenceNotBefore !== null
          && Date.parse(capturedAt) < context.evidenceNotBefore
        )
      )
    ) {
      context.issues.push(issue(
        'INVALID_TIME_RANGE',
        `${path}/capturedAt`,
        'Source timestamp must not follow bundle generation or exceed the evidence freshness window.',
      ));
    }
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) {
      context.issues.push(issue(
        'INVALID_SOURCE',
        `${path}/digest`,
        'Source digest must be a lowercase SHA-256 hex digest.',
      ));
    }
    if (!id || !kind || !isIsoTimestamp(capturedAt) || typeof digest !== 'string') {
      return;
    }
    if (context.sources.has(id)) {
      context.issues.push(issue(
        'DUPLICATE_SOURCE',
        `${path}/id`,
        `Source ${id} is duplicated.`,
      ));
      return;
    }
    context.sources.set(id, { id, kind, capturedAt, digest });
  });
}

function parseIdentities(
  value: unknown,
  context: ParseContext,
): void {
  if (!isPlainObject(value)) {
    context.issues.push(issue(
      'NON_SYNTHETIC_IDENTITY',
      '/identities',
      'Evidence must declare synthetic user and contact identities.',
    ));
    return;
  }
  const users = value.users;
  const contacts = value.contacts;
  if (!Array.isArray(users) || users.length === 0) {
    context.issues.push(issue(
      'NON_SYNTHETIC_IDENTITY',
      '/identities/users',
      'Evidence must declare at least one synthetic or test user.',
    ));
  } else {
    users.forEach((userValue, index) => {
      const path = `/identities/users/${index}`;
      if (!isPlainObject(userValue)) {
        context.issues.push(issue(
          'NON_SYNTHETIC_IDENTITY',
          path,
          'User identity must be an object.',
        ));
        return;
      }
      const id = readString(userValue, 'id', path, context.issues);
      const organizationId = readString(
        userValue,
        'organizationId',
        path,
        context.issues,
      );
      const classification = userValue.classification;
      const role = userValue.role;
      if (
        typeof classification !== 'string'
        || !VALID_CLASSIFICATIONS.has(classification)
      ) {
        context.issues.push(issue(
          'NON_SYNTHETIC_IDENTITY',
          `${path}/classification`,
          'User classification must be SYNTHETIC or TEST.',
        ));
      }
      if (typeof role !== 'string' || !VALID_ROLES.has(role)) {
        context.issues.push(issue(
          'NON_SYNTHETIC_IDENTITY',
          `${path}/role`,
          'User role must be SALES, MANAGER, or ADMIN.',
        ));
      }
      if (
        !id
        || !organizationId
        || typeof classification !== 'string'
        || !VALID_CLASSIFICATIONS.has(classification)
        || typeof role !== 'string'
        || !VALID_ROLES.has(role)
      ) {
        return;
      }
      if (context.users.has(id)) {
        context.issues.push(issue(
          'NON_SYNTHETIC_IDENTITY',
          `${path}/id`,
          `User ${id} is duplicated.`,
        ));
        return;
      }
      context.users.set(id, {
        id,
        classification: classification as 'SYNTHETIC' | 'TEST',
        organizationId,
        role: role as 'SALES' | 'MANAGER' | 'ADMIN',
      });
    });
  }

  if (!Array.isArray(contacts) || contacts.length === 0) {
    context.issues.push(issue(
      'NON_SYNTHETIC_IDENTITY',
      '/identities/contacts',
      'Evidence must declare at least one synthetic or test contact.',
    ));
  } else {
    contacts.forEach((contactValue, index) => {
      const path = `/identities/contacts/${index}`;
      if (!isPlainObject(contactValue)) {
        context.issues.push(issue(
          'NON_SYNTHETIC_IDENTITY',
          path,
          'Contact identity must be an object.',
        ));
        return;
      }
      const id = readString(contactValue, 'id', path, context.issues);
      const organizationId = readString(
        contactValue,
        'organizationId',
        path,
        context.issues,
      );
      const externalId = readString(
        contactValue,
        'externalId',
        path,
        context.issues,
      );
      const classification = contactValue.classification;
      if (
        typeof classification !== 'string'
        || !VALID_CLASSIFICATIONS.has(classification)
      ) {
        context.issues.push(issue(
          'NON_SYNTHETIC_IDENTITY',
          `${path}/classification`,
          'Contact classification must be SYNTHETIC or TEST.',
        ));
      }
      if (
        !id
        || !organizationId
        || !externalId
        || typeof classification !== 'string'
        || !VALID_CLASSIFICATIONS.has(classification)
      ) {
        return;
      }
      if (context.contacts.has(id)) {
        context.issues.push(issue(
          'NON_SYNTHETIC_IDENTITY',
          `${path}/id`,
          `Contact ${id} is duplicated.`,
        ));
        return;
      }
      context.contacts.set(id, {
        id,
        classification: classification as 'SYNTHETIC' | 'TEST',
        organizationId,
        externalId,
      });
    });
  }

  const roles = new Set([...context.users.values()].map(user => user.role));
  for (const requiredRole of ['SALES', 'MANAGER', 'ADMIN']) {
    if (!roles.has(requiredRole as 'SALES' | 'MANAGER' | 'ADMIN')) {
      context.issues.push(issue(
        'NON_SYNTHETIC_IDENTITY',
        '/identities/users',
        `Synthetic ${requiredRole} identity is required.`,
      ));
    }
  }
}

function parseChecks(
  value: unknown,
  context: ParseContext,
): void {
  if (!Array.isArray(value)) {
    context.issues.push(issue('MISSING_CHECK', '/checks', 'checks must be an array.'));
    return;
  }
  value.forEach((checkValue, index) => {
    const path = `/checks/${index}`;
    if (!isPlainObject(checkValue)) {
      context.issues.push(issue('INVALID_CHECK', path, 'Check must be an object.'));
      return;
    }
    const id = checkValue.id;
    if (
      typeof id !== 'string'
      || !GLH_PHASE8_PILOT_EVIDENCE_CHECK_IDS.includes(
        id as GlhPhase8PilotEvidenceCheckId,
      )
    ) {
      context.issues.push(issue(
        'UNKNOWN_CHECK',
        `${path}/id`,
        `Unknown Phase 8 evidence check id: ${String(id)}.`,
      ));
      return;
    }
    const checkId = id as GlhPhase8PilotEvidenceCheckId;
    if (context.checks.has(checkId)) {
      context.issues.push(issue(
        'DUPLICATE_CHECK',
        `${path}/id`,
        `Check ${checkId} is duplicated.`,
        checkId,
      ));
      return;
    }
    const status = checkValue.status;
    if (status !== 'PASS' && status !== 'FAIL') {
      context.issues.push(issue(
        'INVALID_CHECK',
        `${path}/status`,
        'Check status must be PASS or FAIL.',
        checkId,
      ));
      return;
    }
    if (status === 'FAIL') {
      context.issues.push(issue(
        'CHECK_REPORTED_FAILURE',
        `${path}/status`,
        `Check ${checkId} reported FAIL.`,
        checkId,
      ));
    }
    const observedAtValue = checkValue.observedAt;
    const observedAt = isIsoTimestamp(observedAtValue) ? observedAtValue : null;
    if (observedAt === null) {
      context.issues.push(issue(
        'INVALID_TIMESTAMP',
        `${path}/observedAt`,
        'Check observedAt must be an ISO-8601 UTC timestamp.',
        checkId,
      ));
    } else if (
      context.generatedAt !== null
      && (
        Date.parse(observedAt) > context.generatedAt
        || (
          context.evidenceNotBefore !== null
          && Date.parse(observedAt) < context.evidenceNotBefore
        )
      )
    ) {
      context.issues.push(issue(
        'INVALID_TIME_RANGE',
        `${path}/observedAt`,
        'Check timestamp must not follow bundle generation or exceed the evidence freshness window.',
        checkId,
      ));
    }
    const sourceRefsValue = checkValue.sourceRefs;
    const sourceRefs = Array.isArray(sourceRefsValue)
      && sourceRefsValue.every(sourceRef => typeof sourceRef === 'string')
      ? sourceRefsValue as string[]
      : null;
    if (!sourceRefs) {
      context.issues.push(issue(
        'MISSING_SOURCE',
        `${path}/sourceRefs`,
        'Check sourceRefs must be an array of strings.',
        checkId,
      ));
    } else {
      validateSourceRefs(sourceRefs, `${path}/sourceRefs`, context, checkId);
    }
    const facts = checkValue.facts;
    if (!isPlainObject(facts)) {
      context.issues.push(issue(
        'MISSING_FACT',
        `${path}/facts`,
        'Check facts must be a non-empty JSON object.',
        checkId,
      ));
      return;
    }
    if (Object.keys(facts).length === 0) {
      context.issues.push(issue(
        'UNSUPPORTED_CLAIM',
        `${path}/facts`,
        'A PASS claim requires supporting facts.',
        checkId,
      ));
      return;
    }
    context.checks.set(checkId, {
      id: checkId,
      status,
      observedAt: observedAt ?? '',
      sourceRefs: sourceRefs ?? [],
      facts,
    });
  });

  for (const requiredId of GLH_PHASE8_PILOT_EVIDENCE_CHECK_IDS) {
    if (!context.checks.has(requiredId)) {
      context.issues.push(issue(
        'MISSING_CHECK',
        `/checks/${requiredId}`,
        `Required Phase 8 evidence check ${requiredId} is missing.`,
        requiredId,
      ));
    }
  }
}

function validateCheckFacts(
  check: ParsedCheck,
  context: ParseContext,
): CheckResult {
  const path = `/checks/${check.id}/facts`;
  switch (check.id) {
    case 'RLS_SALES_ISOLATION':
      return validateRlsCheck(check.facts, path, context);
    case 'MANAGER_ADMIN_ORGANIZATION_SCOPE':
      return validateManagerAdminCheck(check.facts, path, context);
    case 'WEBHOOK_REPLAY_IDEMPOTENCY':
      return validateWebhookReplayCheck(check.facts, path);
    case 'HUMAN_TAKEOVER_STOPS_AUTOSEND':
      return validateTakeoverCheck(check.facts, path);
    case 'AI_PROVIDER_OUTAGE_FALLBACK':
      return validateOutageCheck(check.facts, path);
    case 'DESKTOP_1366X768_USABILITY':
      return validateDesktopCheck(check.facts, path, context);
    case 'ACCEPTANCE_CASES_A_TO_G':
      return validateAcceptanceCheck(check.facts, path, context);
    case 'NO_BROWSER_OR_LOG_SECRET_EXPOSURE':
      return validateSecretCheck(check.facts, path);
    case 'HUMAN_WORK_REMAINS_AVAILABLE_WITHOUT_AI':
      return validateHumanWorkCheck(check.facts, path);
  }
}

function checkIssuesFor(
  id: GlhPhase8PilotEvidenceCheckId,
  issues: readonly GlhPhase8PilotEvidenceIssue[],
): GlhPhase8PilotEvidenceIssue[] {
  return sortIssues(issues.filter(entry => entry.checkId === id));
}

function emptyReport(
  issues: readonly GlhPhase8PilotEvidenceIssue[],
  environment: 'NON_PRODUCTION' | 'REJECTED',
  generatedAt: string | null,
  expiresAt: string | null,
): GlhPhase8PilotEvidenceReport {
  const globalErrors = sortIssues(issues.filter(entry => entry.checkId === undefined));
  const checkReports = GLH_PHASE8_PILOT_EVIDENCE_CHECK_IDS.map((id): GlhPhase8PilotEvidenceCheckReport => {
    const errors = sortIssues([...globalErrors, ...checkIssuesFor(id, issues)]);
    return {
      id,
      status: errors.length === 0 ? 'PASS' : 'FAIL',
      sourceRefs: [],
      errors,
    };
  });
  const failed = checkReports.filter(check => check.status === 'FAIL').length;
  const sortedIssues = sortIssues(issues);
  return {
    reportVersion: GLH_PHASE8_PILOT_EVIDENCE_REPORT_VERSION,
    taskId: GLH_PHASE8_PILOT_EVIDENCE_TASK.taskId,
    environment,
    overallStatus: sortedIssues.length === 0 && failed === 0 ? 'PASS' : 'FAIL',
    accepted: sortedIssues.length === 0 && failed === 0,
    passed: checkReports.length - failed,
    failed,
    evidenceGeneratedAt: generatedAt,
    evidenceExpiresAt: expiresAt,
    checks: checkReports,
    errors: sortedIssues,
  };
}

export function validateGlhPhase8PilotEvidenceBundle(
  evidence: unknown,
  options: GlhPhase8PilotEvidenceValidationOptions = {},
): GlhPhase8PilotEvidenceReport {
  const issues: GlhPhase8PilotEvidenceIssue[] = [];
  if (!assertJsonLike(evidence, '', issues)) {
    return emptyReport(issues, 'REJECTED', null, null);
  }
  if (!isPlainObject(evidence)) {
    issues.push(issue(
      'INVALID_EVIDENCE',
      '',
      'Evidence bundle must be a JSON object.',
    ));
    return emptyReport(issues, 'REJECTED', null, null);
  }

  const bundle = cloneJson(evidence);
  const environment = bundle.environment === 'NON_PRODUCTION'
    ? 'NON_PRODUCTION'
    : 'REJECTED';
  if (bundle.schemaVersion !== GLH_PHASE8_PILOT_EVIDENCE_SCHEMA_VERSION) {
    issues.push(issue(
      'SCHEMA_VERSION_UNSUPPORTED',
      '/schemaVersion',
      `schemaVersion must be ${GLH_PHASE8_PILOT_EVIDENCE_SCHEMA_VERSION}.`,
    ));
  }
  if (bundle.taskId !== GLH_PHASE8_PILOT_EVIDENCE_TASK.taskId) {
    issues.push(issue(
      'TASK_MISMATCH',
      '/taskId',
      `taskId must be ${GLH_PHASE8_PILOT_EVIDENCE_TASK.taskId}.`,
    ));
  }
  if (bundle.environment === 'PRODUCTION') {
    issues.push(issue(
      'PRODUCTION_ENVIRONMENT',
      '/environment',
      'Production evidence is forbidden.',
    ));
  } else if (bundle.environment !== 'NON_PRODUCTION') {
    issues.push(issue(
      'INVALID_ENVIRONMENT',
      '/environment',
      'environment must be explicitly NON_PRODUCTION.',
    ));
  }
  if (bundle.mode !== 'REPOSITORY_ONLY_SYNTHETIC') {
    issues.push(issue(
      'INVALID_EVIDENCE_MODE',
      '/mode',
      'mode must be REPOSITORY_ONLY_SYNTHETIC.',
    ));
  }
  if (bundle.productionAccess !== false) {
    issues.push(issue(
      'PRODUCTION_ACCESS_CLAIMED',
      '/productionAccess',
      'productionAccess must be false.',
    ));
  }
  if (bundle.realProviderCalls !== false) {
    issues.push(issue(
      'PROVIDER_ACCESS_CLAIMED',
      '/realProviderCalls',
      'realProviderCalls must be false.',
    ));
  }

  const generatedAt = isIsoTimestamp(bundle.generatedAt)
    ? Date.parse(bundle.generatedAt)
    : null;
  const expiresAt = isIsoTimestamp(bundle.expiresAt)
    ? Date.parse(bundle.expiresAt)
    : null;
  if (generatedAt === null) {
    issues.push(issue(
      'INVALID_TIMESTAMP',
      '/generatedAt',
      'generatedAt must be an ISO-8601 UTC timestamp.',
    ));
  }
  if (expiresAt === null) {
    issues.push(issue(
      'INVALID_TIMESTAMP',
      '/expiresAt',
      'expiresAt must be an ISO-8601 UTC timestamp.',
    ));
  }
  if (
    generatedAt !== null
    && expiresAt !== null
    && generatedAt >= expiresAt
  ) {
    issues.push(issue(
      'INVALID_TIME_RANGE',
      '/expiresAt',
      'expiresAt must be later than generatedAt.',
    ));
  }
  const evaluatedAt = options.evaluatedAt === undefined
    ? Date.now()
    : isIsoTimestamp(options.evaluatedAt)
      ? Date.parse(options.evaluatedAt)
      : Number.NaN;
  const configuredMaxAgeMs =
    options.maxAgeMs ?? GLH_PHASE8_PILOT_EVIDENCE_MAX_AGE_MS;
  const maxAgeMs =
    Number.isFinite(configuredMaxAgeMs) && configuredMaxAgeMs >= 0
      ? configuredMaxAgeMs
      : GLH_PHASE8_PILOT_EVIDENCE_MAX_AGE_MS;
  if (maxAgeMs !== configuredMaxAgeMs) {
    issues.push(issue(
      'INVALID_TIME_RANGE',
      'maxAgeMs',
      'maxAgeMs must be a finite non-negative number.',
    ));
  }
  if (!Number.isFinite(evaluatedAt)) {
    issues.push(issue(
      'INVALID_TIMESTAMP',
      'evaluatedAt',
      'evaluatedAt must be an ISO-8601 UTC timestamp.',
    ));
  } else if (generatedAt !== null) {
    if (generatedAt > evaluatedAt + 5 * 60 * 1000) {
      issues.push(issue(
        'EVIDENCE_FROM_FUTURE',
        '/generatedAt',
        'Evidence was generated in the future.',
      ));
    }
    if (evaluatedAt - generatedAt > maxAgeMs) {
      issues.push(issue(
        'EVIDENCE_STALE',
        '/generatedAt',
        'Evidence is older than the allowed freshness window.',
      ));
    }
  }
  if (expiresAt !== null && evaluatedAt >= expiresAt) {
    issues.push(issue(
      'EVIDENCE_EXPIRED',
      '/expiresAt',
      'Evidence has expired.',
    ));
  }

  const context: ParseContext = {
    issues,
    sources: new Map(),
    users: new Map(),
    contacts: new Map(),
    checks: new Map(),
    generatedAt,
    expiresAt,
    evidenceNotBefore: Number.isFinite(evaluatedAt)
      ? evaluatedAt - maxAgeMs
      : null,
  };
  parseSources(bundle.sources, context);
  parseIdentities(bundle.identities, context);
  parseChecks(bundle.checks, context);

  const integrity = bundle.integrity;
  if (
    !isPlainObject(integrity)
    || integrity.algorithm !== 'sha256'
    || typeof integrity.digest !== 'string'
    || !/^[a-f0-9]{64}$/.test(integrity.digest)
  ) {
    issues.push(issue(
      'INVALID_INTEGRITY',
      '/integrity',
      'integrity must contain algorithm sha256 and a lowercase SHA-256 digest.',
    ));
  } else {
    let expectedDigest: string;
    try {
      expectedDigest = computeGlhPhase8PilotEvidenceDigest(bundle);
    } catch {
      expectedDigest = '';
      issues.push(issue(
        'INVALID_EVIDENCE',
        '',
        'Evidence cannot be canonicalized for tamper detection.',
      ));
    }
    if (expectedDigest && integrity.digest !== expectedDigest) {
      issues.push(issue(
        'TAMPER_DETECTED',
        '/integrity/digest',
        'The bundle digest does not match the sanitized evidence contents.',
      ));
    }
  }

  scanSensitiveValues(bundle, '', issues);

  for (const check of context.checks.values()) {
    issues.push(...validateCheckFacts(check, context).issues);
  }

  const globalErrors = sortIssues(issues.filter(entry => entry.checkId === undefined));
  const checkReports = GLH_PHASE8_PILOT_EVIDENCE_CHECK_IDS.map((id): GlhPhase8PilotEvidenceCheckReport => {
    const errors = sortIssues([...globalErrors, ...checkIssuesFor(id, issues)]);
    const parsedCheck = context.checks.get(id);
    return {
      id,
      status: errors.length === 0 ? 'PASS' : 'FAIL',
      sourceRefs: parsedCheck ? [...parsedCheck.sourceRefs].sort() : [],
      errors,
    };
  });
  const failed = checkReports.filter(check => check.status === 'FAIL').length;
  const sortedIssues = sortIssues(issues);
  const accepted = sortedIssues.length === 0 && failed === 0;
  return {
    reportVersion: GLH_PHASE8_PILOT_EVIDENCE_REPORT_VERSION,
    taskId: GLH_PHASE8_PILOT_EVIDENCE_TASK.taskId,
    environment,
    overallStatus: accepted ? 'PASS' : 'FAIL',
    accepted,
    passed: checkReports.length - failed,
    failed,
    evidenceGeneratedAt: isIsoTimestamp(bundle.generatedAt)
      ? bundle.generatedAt
      : null,
    evidenceExpiresAt: isIsoTimestamp(bundle.expiresAt)
      ? bundle.expiresAt
      : null,
    checks: checkReports,
    errors: sortedIssues,
  };
}

export function validateGlhPhase8PilotEvidenceBundleJson(
  serializedEvidence: string,
  options: GlhPhase8PilotEvidenceValidationOptions = {},
): GlhPhase8PilotEvidenceReport {
  try {
    return validateGlhPhase8PilotEvidenceBundle(
      JSON.parse(serializedEvidence) as unknown,
      options,
    );
  } catch {
    return emptyReport(
      [issue('INVALID_EVIDENCE', '', 'Evidence must be valid JSON.')],
      'REJECTED',
      null,
      null,
    );
  }
}
