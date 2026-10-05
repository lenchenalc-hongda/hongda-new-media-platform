import fs from 'node:fs';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Customer Project Center Phase 10 Surface Contract ===');

const api = fs.readFileSync('src/lib/customer-projects/api.ts', 'utf8');
const listApi = fs.readFileSync(
  'src/app/api/customer-projects/customers/route.ts',
  'utf8',
);
const detailApi = fs.readFileSync(
  'src/app/api/customer-projects/customers/[id]/route.ts',
  'utf8',
);
const acceptanceRoute = fs.readFileSync(
  'src/app/api/customer-projects/customers/[id]/relationship-follow-up/route.ts',
  'utf8',
);
const customersPage = fs.readFileSync(
  'src/app/customer-projects/customers/page.tsx',
  'utf8',
);
const detailPage = fs.readFileSync(
  'src/app/customer-projects/customers/[id]/page.tsx',
  'utf8',
);
const newProjectPage = fs.readFileSync(
  'src/app/customer-projects/projects/new/page.tsx',
  'utf8',
);
const teamBoardModel = fs.readFileSync(
  'src/lib/customer-projects/team-board.ts',
  'utf8',
);
const teamBoardPage = fs.readFileSync(
  'src/app/customer-projects/team/page.tsx',
  'utf8',
);
const proactiveModel = fs.readFileSync(
  'src/lib/customer-projects/old-customer-proactive.ts',
  'utf8',
);
const workbenchRoute = fs.readFileSync(
  'src/app/api/customer-projects/workbench/route.ts',
  'utf8',
);
const workbenchPage = fs.readFileSync(
  'src/app/customer-projects/page.tsx',
  'utf8',
);
const teamRoute = fs.readFileSync(
  'src/app/api/customer-projects/team/route.ts',
  'utf8',
);

assert(
  acceptanceRoute.includes(
    "runCpcMutation(req, params, 'CREATE_CUSTOMER_RELATIONSHIP_FOLLOW_UP')",
  )
    && !acceptanceRoute.includes('.from(')
    && !acceptanceRoute.includes('.rpc('),
  'customer recommendation acceptance delegates to the shared controlled mutation layer',
);
assert(
  api.includes("supabase.rpc('cpc_create_work_item'")
    && api.includes("p_work_item_type: 'FOLLOW_UP'")
    && api.includes('p_project_id: null'),
  'acceptance creates a customer-level FOLLOW_UP through cpc_create_work_item',
);
assert(
  api.includes('progressPayloadSchema')
    && api.includes('RELATIONSHIP_CONVERSION_SOURCE_KEY')
    && api.includes('.superRefine('),
  'generic RECORD_PROGRESS rejects the reserved conversion provenance key',
);
assert(
  api.includes("supabase.rpc('cpc_create_project'")
    && api.includes('sourceFollowUpEventId')
    && api.includes('requestId = source.id')
    && api.includes('findExistingTrustedProjectConversion')
    && (api.split("supabase.rpc('cpc_record_progress'").length - 1) === 1,
  'Project promotion persists audit-backed provenance in one create RPC with recovery',
);
assert(
  api.includes('trustedProjectConversionProvenanceFromAudit')
    && teamRoute.includes(".from('cpc_audit_log')")
    && teamRoute.includes('projectCreationAudits'),
  'conversion facts come from trusted Project creation audit provenance',
);
assert(
  api.includes("sourcePayload.relationship_follow_up === true")
    && api.includes("source.project_id === null")
    && api.includes("RELATIONSHIP_EVENT_TYPES.includes(source.event_type)"),
  'server validates conversion source as a confirmed customer-level follow-up event',
);
assert(
  !proactiveModel.includes('updated_at')
    && !proactiveModel.includes('source_synced_at')
    && proactiveModel.includes("'needs_baseline'")
    && proactiveModel.includes("'evidence_unknown'"),
  'recommendation model never uses generic customer timestamps as last-contact truth',
);

assert(
  listApi.includes('relationshipRecommendation')
    || listApi.includes('buildCustomerList'),
  'Customer list read model participates in Phase 10 recommendations',
);
assert(
  detailApi.includes('buildOldCustomerRecommendation')
    && detailApi.includes('relationshipRecommendation')
    && detailApi.includes('latestEvent?.raw_input'),
  'Customer detail exposes recommendation and exact confirmed promotion context',
);
assert(
  detailApi.includes('RELATIONSHIP_FOLLOW_UP_MARKER_KEY')
    && detailApi.includes('event.payload?.[RELATIONSHIP_FOLLOW_UP_MARKER_KEY]'),
  'Customer detail does not offer promotion from unmarked contact/reply facts',
);

assert(
  customersPage.includes('recommendationStateLabel')
    && customersPage.includes('安排回访 →')
    && customersPage.includes("customer.recommendation.state === 'due'"),
  'Customer list exposes recommendation state and a drill-in acceptance affordance',
);
assert(
  detailPage.includes('老客户 proactive建议')
    && detailPage.includes('/relationship-follow-up')
    && detailPage.includes('安排回访')
    && detailPage.includes('仅建议，不计为逾期、任务或人员 KPI'),
  'Customer detail explains recommendation and requires explicit employee acceptance',
);
assert(
  newProjectPage.includes('body.sourceFollowUpEventId = contextEventId'),
  'Project creation carries the exact customer follow-up event when started from Customer context',
);

assert(
  teamBoardModel.includes('buildOldCustomerRecommendations')
    && teamBoardModel.includes('buildPhase10SourceCategoryReport')
    && teamBoardModel.includes('phase10PolicyApplied: true')
    && teamBoardModel.includes('explicitFollowUpToProjectConversionCount'),
  'Team Board uses shared Phase 10 facts without private recommendation logic',
);
assert(
  teamBoardPage.includes('老客户 proactive')
    || teamBoardPage.includes('老客户覆盖 / 转化'),
  'Team Board exposes the Phase 10 old-customer section',
);
assert(
  teamBoardPage.includes('新媒线索')
    && teamBoardPage.includes('主动外呼')
    && teamBoardPage.includes('老客户显式转化')
    && teamBoardPage.includes('建议不是逾期任务'),
  'Team Board keeps source categories separate and recommendations non-overdue',
);

assert(
  !workbenchRoute.includes('old-customer-proactive')
    && !workbenchPage.includes('relationshipRecommendation'),
  'unaccepted recommendations do not enter the Workbench/Today queue',
);

for (const source of [customersPage, detailPage, newProjectPage, teamBoardPage]) {
  for (const forbidden of ['localStorage', 'site_data', '/api/data', 'createAdminSupabaseClient']) {
    assert(!source.includes(forbidden), 'Phase 10 client surface avoids legacy data path: ' + forbidden);
  }
}

console.log('Phase 10 surface tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
