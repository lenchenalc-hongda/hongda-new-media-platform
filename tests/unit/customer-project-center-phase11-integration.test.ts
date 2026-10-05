import fs from 'node:fs';
import {
  CPC_INTEGRATION_DOMAIN_IDS,
  CPC_INTEGRATION_REGISTRY,
  PHASE_11_REPOSITORY_READINESS,
  canReadIntegrationStatus,
  getCpcIntegrationRegistryEntry,
  summariseCpcIntegrationStatuses,
} from '../../src/lib/customer-projects/integration-registry';
import {
  createExternalWorkshopReadAdapter,
} from '../../src/lib/customer-projects/external-workshop-contracts';
import {
  getVisiblePortalGroups,
} from '../../src/lib/constants/navigation';
import {
  readCpcIntegrationStatus,
} from '../../src/lib/customer-projects/integration-status-server';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

function read(path: string): string {
  return fs.readFileSync(path, 'utf8');
}

console.log('\n=== Customer Project Center Phase 11 Integration Layer ===');

assert(CPC_INTEGRATION_REGISTRY.length === 10, 'registry covers ten required domains');
assert(
  CPC_INTEGRATION_DOMAIN_IDS.every(
    domain => CPC_INTEGRATION_REGISTRY.filter(entry => entry.domain === domain).length === 1,
  ),
  'each required domain has exactly one registry authority entry',
);
for (const domain of CPC_INTEGRATION_DOMAIN_IDS) {
  const entry = getCpcIntegrationRegistryEntry(domain);
  assert(entry.sourceOfTruthStatement.length > 0, domain + ' states its authority');
  assert(entry.freshness.lastSyncedAt === null, domain + ' does not fabricate sync time');
}

assert(
  getCpcIntegrationRegistryEntry('customer_master').status === 'external_contract_pending',
  'customer master remains pending an approved external read contract',
);
assert(
  getCpcIntegrationRegistryEntry('customer_ownership').status === 'external_contract_pending',
  'customer ownership remains externally authoritative and pending',
);
assert(
  getCpcIntegrationRegistryEntry('receipt_payment').status === 'external_contract_pending',
  'receipt/payment remains externally authoritative and pending',
);
assert(
  getCpcIntegrationRegistryEntry('orders').status === 'current_artifact_only',
  'orders remain current-artifact-only without a unified source of truth',
);
assert(
  getCpcIntegrationRegistryEntry('quotations').status === 'current_artifact_only',
  'quotations remain source-artifact-only',
);
assert(
  getCpcIntegrationRegistryEntry('leads').status === 'unknown',
  'lead authority remains unknown',
);
assert(
  getCpcIntegrationRegistryEntry('review_center').status === 'available_internal'
    && getCpcIntegrationRegistryEntry('knowledge').status === 'available_internal',
  'Review Center and Knowledge are available as internal read-only reuse',
);
assert(
  getCpcIntegrationRegistryEntry('whatsapp').status === 'backlog'
    && getCpcIntegrationRegistryEntry('wecom_customer_conversation').status === 'backlog',
  'WhatsApp and customer WeCom conversation synchronization remain backlog',
);

assert(
  getCpcIntegrationRegistryEntry('customer_master').writeCapability === 'external_authority_only'
    && getCpcIntegrationRegistryEntry('customer_ownership').writeCapability === 'external_authority_only'
    && getCpcIntegrationRegistryEntry('receipt_payment').writeCapability === 'external_authority_only',
  'owned external facts cannot be written through CPC',
);
assert(
  getCpcIntegrationRegistryEntry('review_center').writeCapability === 'internal_read_only'
    && getCpcIntegrationRegistryEntry('knowledge').writeCapability === 'internal_read_only',
  'Review Center and Knowledge remain read-only/advisory reuse',
);
assert(
  getCpcIntegrationRegistryEntry('leads').writeCapability === 'none'
    && getCpcIntegrationRegistryEntry('whatsapp').writeCapability === 'none'
    && getCpcIntegrationRegistryEntry('wecom_customer_conversation').writeCapability === 'none',
  'unknown and backlog domains cannot create a second source of truth',
);

const authorities = new Set(CPC_INTEGRATION_REGISTRY.map(entry => entry.authority));
assert(
  authorities.size === CPC_INTEGRATION_REGISTRY.length,
  'customer, ownership, payment, order, quote, lead, review, knowledge and conversation facts use distinct authorities',
);
const summary = summariseCpcIntegrationStatuses();
assert(
  summary.external_contract_pending === 3
    && summary.available_internal === 2
    && summary.current_artifact_only === 2
    && summary.backlog === 2
    && summary.unknown === 1
    && summary.connected === 0,
  'registry summary reports actual known availability without inventing connected sources',
);

const adapter = createExternalWorkshopReadAdapter();
const customerResult = await adapter.readCustomerByStableId({
  externalCustomerId: 'C-UNVERIFIED',
});
const receiptResult = await adapter.readReceiptByStableId({
  externalReceiptId: 'RCP-UNVERIFIED',
});
assert(
  adapter.contractStatus === 'external_contract_pending'
    && adapter.writeCapability === 'none',
  'workshop adapter is contract-only and read-only',
);
assert(
  !customerResult.ok
    && customerResult.code === 'EXTERNAL_CONTRACT_PENDING'
    && !receiptResult.ok
    && receiptResult.code === 'EXTERNAL_CONTRACT_PENDING',
  'missing external data remains pending/unknown rather than zero or fabricated',
);

assert(canReadIntegrationStatus('admin'), 'admin can read integration status');
for (const role of ['manager', 'sales', 'operator', 'viewer', null, undefined, 'unknown']) {
  assert(!canReadIntegrationStatus(role), 'integration status fails closed for ' + String(role));
}

const deniedStatus = await readCpcIntegrationStatus(
  {},
  { id: 'profile-manager', orgId: 'org-1', role: 'manager' },
);
assert(
  !deniedStatus.ok && deniedStatus.status === 403,
  'integration-status server helper rejects non-admin roles before probing',
);

const tableCalls: Array<{
  table: string;
  column: string;
  value: string;
  selectOptions: unknown;
}> = [];
const mockClient = {
  from(table: string) {
    const query: any = {
      select(_columns: string, options: unknown) {
        query.selectOptions = options;
        return query;
      },
      async eq(column: string, value: string) {
        tableCalls.push({
          table,
          column,
          value,
          selectOptions: query.selectOptions,
        });
        return { error: null, count: 2 };
      },
    };
    return query;
  },
};
const allowedStatus = await readCpcIntegrationStatus(
  mockClient,
  { id: 'profile-admin', orgId: 'org-1', role: 'admin' },
  '2026-10-05T00:00:00.000Z',
);
assert(
  allowedStatus.ok
    && allowedStatus.snapshot.internalReuse.every(item => item.readOnly === true),
  'integration-status server helper returns a read-only status snapshot',
);
assert(
  tableCalls.length === 2
    && tableCalls.every(call => (
      call.column === 'org_id'
      && call.value === 'org-1'
      && (call.selectOptions as any)?.head === true
    )),
  'internal reuse probes are same-organization head-only reads',
);

const settingsGroups = getVisiblePortalGroups({
  projectReviewCenterEnabled: true,
  customerProjectCenterEnabled: true,
  canAccessCustomerProjectCenter: true,
  canAccessCustomerProjectTeam: true,
  canAccessCustomerProjectSettings: true,
});
const settingsItem = settingsGroups
  .find(group => group.id === 'sales')
  ?.items.find(item => item.path === '/customer-projects/settings');
assert(settingsItem?.disabled === false, 'admin CPC settings navigation is enabled only through role visibility');

const defaultGroups = getVisiblePortalGroups({
  projectReviewCenterEnabled: true,
  customerProjectCenterEnabled: true,
  canAccessCustomerProjectCenter: true,
});
assert(
  defaultGroups
    .find(group => group.id === 'sales')
    ?.items.find(item => item.path === '/customer-projects/settings')
    ?.disabled === true,
  'CPC settings navigation stays disabled without explicit admin visibility',
);

const registrySource = read('src/lib/customer-projects/integration-registry.ts');
const adapterSource = read('src/lib/customer-projects/external-workshop-contracts.ts');
const serverSource = read('src/lib/customer-projects/integration-status-server.ts');
const routeSource = read('src/app/api/customer-projects/integration-status/route.ts');
const panelSource = read('src/components/customer-projects/IntegrationStatusPanel.tsx');
const pageSource = read('src/app/customer-projects/settings/page.tsx');

for (const forbidden of ['localStorage', 'site_data', '/api/data']) {
  assert(!registrySource.includes(forbidden), 'registry avoids legacy data path: ' + forbidden);
  assert(!adapterSource.includes(forbidden), 'external contract avoids legacy data path: ' + forbidden);
  assert(!serverSource.includes(forbidden), 'server helper avoids legacy data path: ' + forbidden);
  assert(!routeSource.includes(forbidden), 'route avoids legacy data path: ' + forbidden);
}

for (const forbidden of [
  'fetch(',
  'http://',
  'https://',
  '/api/data',
  'shared-data.json',
  'process.env',
]) {
  assert(!adapterSource.includes(forbidden), 'external contract does not invent transport: ' + forbidden);
}

for (const forbidden of [
  'createAdminSupabaseClient',
  'service_role',
  '.insert(',
  '.update(',
  '.upsert(',
  '.delete(',
]) {
  assert(!serverSource.includes(forbidden), 'server helper is read-only and unprivileged: ' + forbidden);
  assert(!routeSource.includes(forbidden), 'route is read-only and unprivileged: ' + forbidden);
}

assert(
  serverSource.includes(".from(table)")
    && serverSource.includes(".eq('org_id', orgId)")
    && serverSource.includes("'review_cases'")
    && serverSource.includes("'knowledge_cards'"),
  'internal reuse probes are same-organization read checks against existing systems',
);
assert(
  routeSource.includes('resolveCpcProfile')
    && routeSource.includes('readCpcIntegrationStatus')
    && !routeSource.includes('.from('),
  'integration-status route delegates auth and status reads through controlled helpers',
);
assert(
  panelSource.includes('/api/customer-projects/integration-status')
    && !panelSource.includes('createAdminSupabaseClient')
    && !panelSource.includes('service_role'),
  'browser surface uses the server route without privileged Supabase access',
);
assert(
  pageSource.includes('IntegrationStatusPanel')
    && pageSource.includes('客户项目中心设置'),
  'CPC settings surface renders the integration-status panel',
);

assert(
  PHASE_11_REPOSITORY_READINESS.phase12InternalUiQaReady === true
    && PHASE_11_REPOSITORY_READINESS.fullLiveIntegrationReady === false,
  'Phase 12 internal UI/QA readiness is distinct from full live integration',
);
assert(
  PHASE_11_REPOSITORY_READINESS.pendingExternalGates.includes('orders')
    && PHASE_11_REPOSITORY_READINESS.pendingExternalGates.includes('quotations')
    && PHASE_11_REPOSITORY_READINESS.pendingExternalGates.includes('leads')
    && PHASE_11_REPOSITORY_READINESS.pendingExternalGates.includes('whatsapp')
    && PHASE_11_REPOSITORY_READINESS.pendingExternalGates.includes('wecom_customer_conversation'),
  'readiness gates include every external or unresolved integration domain',
);

const readinessDoc = read('docs/customer-project-center/PHASE_11_INTEGRATION_READINESS.md');
for (const text of [
  'Phase 12',
  'internal UI/QA',
  'customer_master',
  'customer_ownership',
  'receipt_payment',
  'orders',
  'quotations',
  'leads',
  'external_contract_pending',
  'backlog',
]) {
  assert(readinessDoc.includes(text), 'readiness report covers: ' + text);
}

const foundationTest = read('tests/unit/customer-project-center-foundation.test.ts');
assert(
  foundationTest.includes("import './customer-project-center-phase11-integration.test'"),
  'Phase 11 tests are wired into the existing CI foundation step',
);

console.log('Phase 11 integration tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
