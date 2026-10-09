import fs from 'node:fs';
import type { CurrentUser } from '../../src/lib/auth/types';
import {
  createGlhAuditEvent,
  GLH_AUDIT_EVENT_TYPES,
} from '../../src/lib/global-lead-hub/audit';
import {
  canAssignGlhLead,
  canChangeGlhRole,
  canCorrectGlhGrade,
  canManageGlhChannelSettings,
  canReadGlhAudit,
  canViewGlhLead,
  evaluateGlhAccess,
  mapRootRoleToGlhRole,
  type GlhAccessContext,
} from '../../src/lib/global-lead-hub/access';
import {
  createDisabledGlhChannelAdapter,
  GLH_CHANNEL_PROVIDERS,
  normalizeGlhAttribution,
  toGlhChannelAccountProviderRecord,
} from '../../src/lib/global-lead-hub/channels';
import {
  canAiAdvanceLifecycle,
  gradeForGlhScore,
  GLH_CONVERSATION_MODES,
  GLH_CORE_TABLES,
  GLH_HUMAN_ROLES,
  GLH_LIFECYCLE_STATES,
  GLH_PRIORITY_GRADES,
} from '../../src/lib/global-lead-hub/domain';
import { resolveGlhAccessContext } from '../../src/lib/global-lead-hub/server';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

function source(path: string): string {
  return fs.readFileSync(path, 'utf8');
}

function makeCurrentUser(
  overrides: Partial<CurrentUser> = {},
): CurrentUser {
  return {
    id: 'auth-user-1',
    name: 'Sales User',
    role: 'sales',
    department: null,
    email: 'sales@example.com',
    active: true,
    authSource: 'supabase',
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<GlhAccessContext> = {},
): GlhAccessContext {
  return {
    actorProfileId: 'profile-sales-1',
    organizationId: 'org-1',
    role: 'SALES',
    authSource: 'supabase',
    ...overrides,
  };
}

console.log('\n=== Global Lead Hub Phase 1 Foundation ===');

assert(GLH_LIFECYCLE_STATES.length === 12, 'all 12 lifecycle states are frozen');
assert(
  ['NEW', 'AI_QUALIFYING', 'WAITING_CUSTOMER', 'READY_FOR_HUMAN', 'HUMAN_FOLLOWING',
    'QUOTATION', 'SAMPLE', 'NEGOTIATION', 'WON', 'LOST', 'DORMANT', 'INVALID']
    .every(state => (GLH_LIFECYCLE_STATES as readonly string[]).includes(state)),
  'lifecycle state names match the frozen contract',
);
assert(
  JSON.stringify(GLH_CONVERSATION_MODES)
    === JSON.stringify(['AI_ACTIVE', 'HANDOFF_PENDING', 'HUMAN_ACTIVE', 'PAUSED']),
  'conversation modes remain separate from lifecycle',
);
assert(
  JSON.stringify(GLH_PRIORITY_GRADES) === JSON.stringify(['A', 'B', 'C', 'D']),
  'A/B/C/D grades are explicit',
);
assert(
  JSON.stringify(GLH_HUMAN_ROLES) === JSON.stringify(['ADMIN', 'MANAGER', 'SALES']),
  'human roles are explicit',
);
assert(canAiAdvanceLifecycle('NEW', 'AI_QUALIFYING'), 'AI may start qualification');
assert(canAiAdvanceLifecycle('WAITING_CUSTOMER', 'READY_FOR_HUMAN'), 'AI may mark ready for human');
assert(!canAiAdvanceLifecycle('READY_FOR_HUMAN', 'QUOTATION'), 'AI cannot advance commercial states');
assert(gradeForGlhScore(80) === 'A' && gradeForGlhScore(29) === 'D', 'score bands match frozen model');
assert(gradeForGlhScore(101) === null, 'invalid scores fail closed');

assert(mapRootRoleToGlhRole('admin') === 'ADMIN', 'admin role mapping');
assert(mapRootRoleToGlhRole('manager') === 'MANAGER', 'manager role mapping');
assert(mapRootRoleToGlhRole('sales') === 'SALES', 'sales role mapping');
assert(mapRootRoleToGlhRole('operator') === null, 'operator is not a GLH human role');
assert(mapRootRoleToGlhRole('viewer') === null, 'viewer is not a GLH human role');

const salesUser = makeCurrentUser();
const salesIdentity = {
  authUserId: salesUser.id,
  profileId: 'profile-sales-1',
  organizationId: 'org-1',
  rootRole: 'sales' as const,
  active: true,
};
const allowedSales = evaluateGlhAccess(salesUser, salesIdentity);
assert(allowedSales.ok, 'trusted sales profile resolves to GLH access');
if (allowedSales.ok) {
  assert(allowedSales.context.actorProfileId === 'profile-sales-1', 'profiles.id is the actor identity');
  assert(allowedSales.context.organizationId === 'org-1', 'organization binding is retained');
}

assert(
  !evaluateGlhAccess(null, null).ok,
  'missing authentication fails closed',
);
assert(
  !evaluateGlhAccess(makeCurrentUser({ authSource: 'mock' }), {
    ...salesIdentity,
    authUserId: salesUser.id,
  }).ok,
  'mock identity cannot establish trusted GLH access',
);
assert(
  !evaluateGlhAccess(makeCurrentUser(), {
    ...salesIdentity,
    authUserId: 'different-auth-user',
  }).ok,
  'profile identity must match the authenticated auth user',
);
assert(
  !evaluateGlhAccess(makeCurrentUser({ role: 'operator' }), {
    ...salesIdentity,
    rootRole: 'operator',
  }).ok,
  'unsupported root roles fail closed',
);

const salesContext = makeContext();
assert(
  canViewGlhLead(salesContext, {
    organizationId: 'org-1',
    ownerProfileId: 'profile-sales-1',
  }),
  'sales can view an assigned lead',
);
assert(
  canViewGlhLead(salesContext, {
    organizationId: 'org-1',
    ownerProfileId: null,
    collaboratorProfileIds: ['profile-sales-1'],
  }),
  'sales can view an explicitly shared lead',
);
assert(
  !canViewGlhLead(salesContext, {
    organizationId: 'org-1',
    ownerProfileId: 'profile-sales-2',
  }),
  'sales cannot view another salesperson restricted lead',
);
assert(
  !canViewGlhLead(salesContext, {
    organizationId: 'org-2',
    ownerProfileId: 'profile-sales-1',
  }),
  'sales access is organization-bound',
);
assert(
  !canAssignGlhLead(salesContext, 'org-1')
    && canAssignGlhLead(makeContext({ role: 'MANAGER' }), 'org-1')
    && canAssignGlhLead(makeContext({ role: 'ADMIN' }), 'org-1'),
  'assignment semantics are explicit for Sales, Manager, and Admin',
);
assert(
  !canCorrectGlhGrade(salesContext, 'org-1')
    && canCorrectGlhGrade(makeContext({ role: 'MANAGER' }), 'org-1'),
  'grade correction is management-only',
);
assert(
  !canManageGlhChannelSettings(makeContext({ role: 'MANAGER' }), 'org-1')
    && canManageGlhChannelSettings(makeContext({ role: 'ADMIN' }), 'org-1'),
  'channel settings are admin-only',
);
assert(
  !canChangeGlhRole(makeContext({ role: 'MANAGER' }), 'org-1')
    && canChangeGlhRole(makeContext({ role: 'ADMIN' }), 'org-1'),
  'role changes are admin-only',
);
assert(
  !canReadGlhAudit(salesContext, 'org-1')
    && canReadGlhAudit(makeContext({ role: 'MANAGER' }), 'org-1'),
  'raw audit is management-only',
);

assert(
  JSON.stringify(GLH_CHANNEL_PROVIDERS)
    === JSON.stringify(['WHATSAPP', 'FACEBOOK', 'INSTAGRAM']),
  'channel provider records are limited to Meta channels',
);
const channelRecord = toGlhChannelAccountProviderRecord({
  id: 'channel-1',
  organizationId: 'org-1',
  provider: 'WHATSAPP',
  externalAccountId: 'test-account-1',
  status: 'TEST_READY',
});
assert(channelRecord?.provider === 'WHATSAPP', 'provider record normalizes');
assert(
  toGlhChannelAccountProviderRecord({
    id: 'channel-2',
    organizationId: 'org-1',
    provider: 'UNSUPPORTED',
    externalAccountId: 'x',
  }) === null,
  'unsupported provider records fail closed',
);
assert(
  normalizeGlhAttribution(null).sourcePlatform === 'UNKNOWN',
  'missing attribution is stored as UNKNOWN',
);

async function testDisabledAdapter() {
  const adapter = createDisabledGlhChannelAdapter('WHATSAPP');
  const result = await adapter.sendApprovedMessage({
    organizationId: 'org-1',
    channelAccountId: 'channel-1',
    conversationId: 'conversation-1',
    idempotencyKey: 'key-1',
    body: 'test',
  });
  assert(
    !result.ok
      && result.status === 'PROVIDER_CALLS_DISABLED'
      && result.errorCode === 'PROVIDER_CUTOVER_NOT_AUTHORIZED',
    'channel adapter cannot call a real provider in Phase 1',
  );
}

async function testServerAccessResolver() {
  const noUser = await resolveGlhAccessContext({
    getCurrentUser: async () => null,
    loadTrustedBusinessIdentity: async () => salesIdentity,
  });
  assert(!noUser.ok && noUser.code === 'UNAUTHENTICATED', 'resolver denies missing authentication');

  const trusted = await resolveGlhAccessContext({
    getCurrentUser: async () => salesUser,
    loadTrustedBusinessIdentity: async () => salesIdentity,
  });
  assert(trusted.ok, 'resolver accepts only the matching trusted profile identity');

  const mismatched = await resolveGlhAccessContext({
    getCurrentUser: async () => salesUser,
    loadTrustedBusinessIdentity: async () => ({
      ...salesIdentity,
      organizationId: 'org-2',
    }),
  });
  assert(
    mismatched.ok && mismatched.context.organizationId === 'org-2',
    'resolver binds the access context to the trusted profile organization',
  );

  const missingIdentity = await resolveGlhAccessContext({
    getCurrentUser: async () => salesUser,
    loadTrustedBusinessIdentity: async () => null,
  });
  assert(!missingIdentity.ok, 'resolver fails closed when trusted profile identity is unavailable');
}

assert(
  GLH_AUDIT_EVENT_TYPES.includes('LEAD_ASSIGNED')
    && GLH_AUDIT_EVENT_TYPES.includes('LEAD_GRADE_CHANGED')
    && GLH_AUDIT_EVENT_TYPES.includes('LEAD_STAGE_CHANGED')
    && GLH_AUDIT_EVENT_TYPES.includes('AI_SEND')
    && GLH_AUDIT_EVENT_TYPES.includes('HUMAN_HANDOFF')
    && GLH_AUDIT_EVENT_TYPES.includes('CHANNEL_SETTING_CHANGED')
    && GLH_AUDIT_EVENT_TYPES.includes('ROLE_CHANGED'),
  'required append-oriented audit event types are present',
);
const auditEvent = createGlhAuditEvent({
  organizationId: 'org-1',
  eventType: 'LEAD_STAGE_CHANGED',
  actorKind: 'HUMAN',
  actorProfileId: 'profile-sales-1',
  entityType: 'LEAD',
  entityId: 'lead-1',
  leadId: 'lead-1',
  previousState: 'READY_FOR_HUMAN',
  nextState: 'HUMAN_FOLLOWING',
}, 1, '2026-10-09T00:00:00.000Z');
assert(auditEvent.eventSeq === 1, 'audit events retain sequence numbers');
assert(auditEvent.actorProfileId === 'profile-sales-1', 'audit events retain profile actors');
assert(
  !Object.prototype.hasOwnProperty.call(createDisabledGlhChannelAdapter('FACEBOOK'), 'fetch'),
  'channel adapter has no direct network fetch helper',
);

const routePath = 'src/app/global-lead-hub/page.tsx';
const routeSource = source(routePath);
assert(!routeSource.includes("'use client'"), 'GLH route is a server component');
assert(routeSource.includes('export default async function'), 'GLH route is server-rendered');
assert(
  routeSource.includes('resolveGlhAccessContext') && routeSource.includes("redirect('/login"),
  'GLH route fails closed for unauthenticated access',
);
assert(
  routeSource.includes("redirect('/dashboard?error=global_lead_hub_access_denied')"),
  'GLH route fails closed for unauthorized access',
);
assert(!routeSource.includes("from '@/app/leads"), 'GLH route is independent from legacy leads');

const accessSource = source('src/lib/global-lead-hub/access.ts');
const serverSource = source('src/lib/global-lead-hub/server.ts');
assert(
  serverSource.includes(".from('profiles')")
    && serverSource.includes('profileId: data.id')
    && serverSource.includes('organizationId: data.org_id'),
  'server access resolver reads trusted profiles.id and org_id',
);
assert(
  !accessSource.includes('user' + '_metadata')
    && !serverSource.includes('user' + '_metadata'),
  'authorization never trusts user-editable metadata',
);

const migrationPath =
  'supabase/migrations/20261009181000_global_lead_hub_phase1_foundation.sql';
const sql = source(migrationPath);
const executableSql = sql.replace(/--.*$/gm, '');
const coreTables = Object.values(GLH_CORE_TABLES);

for (const table of coreTables) {
  assert(sql.includes(`CREATE TABLE public.${table}`), `creates core table: ${table}`);
  assert(
    sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`),
    `enables RLS: ${table}`,
  );
  assert(
    sql.includes(`REVOKE ALL ON TABLE public.${table}`),
    `explicitly revokes table access: ${table}`,
  );
  assert(
    sql.includes(`GRANT SELECT ON TABLE public.${table} TO authenticated`),
    `grants authenticated read access: ${table}`,
  );
}

const createdTables = [...sql.matchAll(/CREATE TABLE public\.([a-z0-9_]+)/g)]
  .map(match => match[1]);
assert(createdTables.length === coreTables.length, 'all created GLH tables are accounted for');
assert(createdTables.every(table => table.startsWith('glh_')), 'all created tables use the glh_ prefix');
assert(!sql.includes('auth.users'), 'GLH business identity never references auth.users directly');
assert(
  sql.includes('REFERENCES public.profiles(id, org_id)'),
  'business user FKs use profiles.id with organization scope',
);
assert(
  sql.includes('FROM PUBLIC, anon, authenticated')
    && !/GRANT\s+[^;]*TO\s+anon/i.test(sql),
  'anon cannot access GLH tables',
);
assert(
  !/GRANT\s+(INSERT|UPDATE|DELETE|ALL)[^;]*TO\s+authenticated/i.test(sql),
  'authenticated receives no direct DML grant',
);
assert(
  sql.includes('CREATE OR REPLACE FUNCTION public.glh_can_access_lead')
    && sql.includes('CREATE OR REPLACE FUNCTION public.glh_can_manage_org')
    && sql.includes('SECURITY DEFINER')
    && sql.includes('SET search_path = pg_catalog, public'),
  'RLS uses controlled security-definer helpers with pinned search_path',
);
assert(
  sql.includes('CREATE UNIQUE INDEX uq_glh_webhook_provider_event')
    && sql.includes('(provider, external_event_id)'),
  'webhook idempotency uses provider + external_event_id',
);
assert(
  sql.includes('conversation_mode TEXT NOT NULL')
    && sql.includes('lifecycle_state TEXT NOT NULL')
    && sql.includes('priority_grade TEXT'),
  'lifecycle, conversation mode, and grade are separate fields',
);
assert(
  !executableSql.includes('DROP TABLE')
    && !executableSql.includes('TRUNCATE')
    && !executableSql.includes('DELETE FROM')
    && !executableSql.includes('DISABLE ROW LEVEL SECURITY'),
  'migration contains no destructive or RLS-bypass SQL',
);

const glhSources = [
  routePath,
  'src/lib/global-lead-hub/domain.ts',
  'src/lib/global-lead-hub/access.ts',
  'src/lib/global-lead-hub/channels.ts',
  'src/lib/global-lead-hub/audit.ts',
  'src/lib/global-lead-hub/server.ts',
].map(source).join('\n');

for (const forbidden of [
  'local' + 'Storage',
  'site' + '_data',
  '/api' + '/data',
  'SUPABASE_' + 'SERVICE_ROLE_KEY',
  'service' + '_role',
  'api.' + 'whatsapp.com',
  'graph.' + 'facebook.com',
  'send' + 'WhatsAppMessage',
]) {
  assert(!glhSources.includes(forbidden), `GLH source avoids forbidden token: ${forbidden}`);
}

void Promise.all([testDisabledAdapter(), testServerAccessResolver()]).then(() => {
  console.log(`GLH Phase 1 foundation tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
