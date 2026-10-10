import fs from 'node:fs';
import {
  canAssignGlhLead,
  canViewGlhLead,
  type GlhAccessContext,
} from '../../src/lib/global-lead-hub/access';
import {
  GlhMutationError,
  assignGlhLead,
  createGlhTaskOrFollowup,
} from '../../src/lib/global-lead-hub/mutations';
import {
  buildGlhLeadList,
  buildGlhTaskBoard,
  buildGlhTodayDashboard,
  getGlhDueBucket,
  summarizeGlhAuditTimeline,
  type GlhActivityEventRow,
  type GlhAuditEventRow,
  type GlhContactRow,
  type GlhFollowupRow,
  type GlhLeadProfileRow,
  type GlhLeadRow,
  type GlhProfileRow,
  type GlhTaskRow,
} from '../../src/lib/global-lead-hub/read-model';
import {
  evaluateGlhManualCreationGuard,
  glhLeadAssignmentSchema,
  glhManualLeadCreateSchema,
  glhTaskOrFollowupSchema,
  GLH_MANUAL_CREATION_GUARD_VALUE,
} from '../../src/lib/global-lead-hub/validation';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
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

function makeContext(overrides: Partial<GlhAccessContext> = {}): GlhAccessContext {
  return {
    actorProfileId: 'sales-a',
    organizationId: 'org-a',
    role: 'SALES',
    authSource: 'supabase',
    ...overrides,
  };
}

const leadA: GlhLeadRow = {
  id: 'lead-a',
  org_id: 'org-a',
  contact_id: 'contact-a',
  owner_profile_id: 'sales-a',
  lifecycle_state: 'READY_FOR_HUMAN',
  conversation_mode: 'HANDOFF_PENDING',
  priority_grade: 'A',
  score: 88,
  completeness: 90,
  source_platform: 'WHATSAPP',
  campaign_id: 'campaign-a',
  creative_id: 'creative-a',
  referral_identifier: null,
  last_message_at: '2026-10-10T03:00:00.000Z',
  next_follow_up_at: '2026-10-10T04:00:00.000Z',
  version: 3,
  created_at: '2026-10-09T03:00:00.000Z',
  updated_at: '2026-10-09T04:00:00.000Z',
};

const leadB: GlhLeadRow = {
  ...leadA,
  id: 'lead-b',
  contact_id: 'contact-b',
  owner_profile_id: 'sales-b',
  lifecycle_state: 'QUOTATION',
  conversation_mode: 'HUMAN_ACTIVE',
  priority_grade: 'B',
  score: 72,
  source_platform: 'FACEBOOK',
  campaign_id: null,
  creative_id: null,
  referral_identifier: 'referral-b',
  next_follow_up_at: '2026-10-09T04:00:00.000Z',
  updated_at: '2026-10-08T04:00:00.000Z',
};

const contactA: GlhContactRow = {
  id: 'contact-a',
  org_id: 'org-a',
  display_name: 'Alpha Customer',
  company_name: 'Alpha Co',
  country_code: 'NG',
  normalized_whatsapp: '+2341000000001',
  normalized_email: 'alpha@example.com',
  source_platform: 'WHATSAPP',
};

const contactB: GlhContactRow = {
  id: 'contact-b',
  org_id: 'org-a',
  display_name: 'Beta Customer',
  company_name: 'Beta Co',
  country_code: 'KE',
  normalized_whatsapp: null,
  normalized_email: null,
  source_platform: 'FACEBOOK',
};

const profileA: GlhLeadProfileRow = {
  lead_id: 'lead-a',
  org_id: 'org-a',
  customer_company_name: 'Alpha Co',
  country_code: 'NG',
  whatsapp: '+2341000000001',
  email: 'alpha@example.com',
  website: 'https://alpha.example.com',
  social_identifier: '@alpha',
  product: 'Flexible film',
  material: 'BOPP',
  product_media_references: [],
  dimensions: '300mm',
  quantity: '20,000 pcs',
  artwork_reference: 'artwork-a',
  printing_area: '300x400mm',
  requirement_type: 'MACHINE',
  current_printing_process: 'None',
  pain_points: 'Low uptime',
  test_requirements: 'Adhesion test',
  sample_availability: 'Available',
  purchase_timeline: '30 days',
  machine_capacity_requirements: 'High',
  automation_requirements: 'Inline',
  machine_plus_process_solution_required: true,
  extracted_facts: {},
  ai_summary: 'Machine inquiry',
};

const profileB: GlhLeadProfileRow = {
  ...profileA,
  lead_id: 'lead-b',
  customer_company_name: 'Beta Co',
  country_code: 'KE',
  product: 'Printing service',
  requirement_type: 'PROCESSING',
  ai_summary: null,
};

const profileRows: GlhProfileRow[] = [
  { id: 'sales-a', org_id: 'org-a', full_name: 'Sales A', role: 'sales', is_active: true },
  { id: 'sales-b', org_id: 'org-a', full_name: 'Sales B', role: 'sales', is_active: true },
];

const taskA: GlhTaskRow = {
  id: 'task-a',
  org_id: 'org-a',
  lead_id: 'lead-a',
  assignee_profile_id: 'sales-a',
  task_type: 'SAMPLE',
  title: 'Prepare sample',
  due_at: '2026-10-10T04:00:00.000Z',
  status: 'OPEN',
  source: 'HUMAN',
  created_by_profile_id: 'sales-a',
  completed_at: null,
  version: 1,
  created_at: '2026-10-09T04:00:00.000Z',
  updated_at: '2026-10-09T04:00:00.000Z',
};

const followupB: GlhFollowupRow = {
  id: 'followup-b',
  org_id: 'org-a',
  lead_id: 'lead-b',
  assigned_profile_id: 'sales-b',
  followup_type: 'QUOTATION',
  next_action: 'Send quotation',
  due_at: '2026-10-09T04:00:00.000Z',
  status: 'OPEN',
  last_contact_at: null,
  completed_at: null,
  version: 1,
  created_at: '2026-10-08T04:00:00.000Z',
  updated_at: '2026-10-08T04:00:00.000Z',
};

console.log('\n=== Global Lead Hub Phase 2 Core Human UI ===');

assert(
  canViewGlhLead(makeContext(), {
    organizationId: 'org-a',
    ownerProfileId: 'sales-a',
  }),
  'Sales A can view an assigned lead',
);
assert(
  !canViewGlhLead(makeContext(), {
    organizationId: 'org-a',
    ownerProfileId: 'sales-b',
  }),
  'Sales A cannot view restricted Sales B lead',
);
assert(
  !canViewGlhLead(makeContext(), {
    organizationId: 'org-b',
    ownerProfileId: 'sales-a',
  }),
  'cross-organization lead access fails closed',
);
assert(
  !canAssignGlhLead(makeContext(), 'org-a')
    && canAssignGlhLead(makeContext({ role: 'MANAGER' }), 'org-a')
    && canAssignGlhLead(makeContext({ role: 'ADMIN' }), 'org-a'),
  'assignment remains Manager/Admin only and organization-bound',
);

assert(
  getGlhDueBucket('2026-10-10T00:00:00.000Z', new Date('2026-10-10T12:00:00.000Z')) === 'TODAY',
  'due-today bucket is explicit',
);
assert(
  getGlhDueBucket('2026-10-09T00:00:00.000Z', new Date('2026-10-10T12:00:00.000Z')) === 'OVERDUE',
  'overdue bucket is explicit',
);

const list = buildGlhLeadList({
  leads: [leadA, leadB],
  contacts: [contactA, contactB],
  leadProfiles: [profileA, profileB],
  profiles: profileRows,
  tasks: [taskA],
  followups: [followupB],
  filters: { requirement: 'MACHINE', country: 'NG', due: 'TODAY' },
  now: new Date('2026-10-10T12:00:00.000Z'),
});
assert(list.length === 1 && list[0].id === 'lead-a', 'lead library applies frozen requirement/country/due filters');
assert(list[0].ownerName === 'Sales A', 'lead library resolves owner names');
assert(list[0].adCreativeReference === 'creative-a', 'lead library retains ad creative references');

const dashboard = buildGlhTodayDashboard({
  leads: [leadA, leadB],
  contacts: [contactA, contactB],
  leadProfiles: [profileA, profileB],
  profiles: profileRows,
  tasks: [taskA],
  followups: [followupB],
  now: new Date('2026-10-10T12:00:00.000Z'),
});
assert(dashboard.summary.waitingForHuman === 1, 'Today counts waiting-for-human work');
assert(dashboard.summary.dueToday === 1, 'Today counts due-today work');
assert(dashboard.summary.quotationFollowups === 1, 'Today counts quotation follow-up work');
assert(dashboard.summary.sampleFollowups === 1, 'Today counts sample follow-up work');
assert(dashboard.summary.overdue === 1, 'Today counts overdue work');
assert(dashboard.priorityCustomers[0]?.id === 'lead-a', 'Today prioritizes the A-grade handoff lead');

const board = buildGlhTaskBoard({
  tasks: [taskA],
  followups: [followupB],
  leads: [leadA, leadB],
  contacts: [contactA, contactB],
  now: new Date('2026-10-10T12:00:00.000Z'),
});
assert(board.length === 2 && board.some(item => item.kind === 'FOLLOWUP'), 'My Tasks combines tasks and follow-ups');
assert(
  board.find(item => item.id === 'followup-b')?.dueBucket === 'OVERDUE',
  'My Tasks exposes deterministic due buckets',
);

const audit: GlhAuditEventRow = {
  id: 'audit-1',
  audit_seq: 1,
  org_id: 'org-a',
  lead_id: 'lead-a',
  actor_profile_id: 'manager-a',
  actor_kind: 'HUMAN',
  event_type: 'LEAD_ASSIGNED',
  entity_type: 'glh_leads',
  entity_id: 'lead-a',
  previous_state: null,
  next_state: 'sales-a',
  reason: 'Initial assignment',
  context: {},
  created_at: '2026-10-10T05:00:00.000Z',
};
const activity: GlhActivityEventRow = {
  id: 'activity-1',
  event_seq: 1,
  org_id: 'org-a',
  lead_id: 'lead-a',
  actor_profile_id: 'sales-a',
  actor_kind: 'HUMAN',
  activity_type: 'TASK_CREATED',
  entity_type: 'glh_tasks',
  entity_id: 'task-a',
  context: {},
  created_at: '2026-10-10T06:00:00.000Z',
};
assert(
  summarizeGlhAuditTimeline({ auditEvents: [audit], activityEvents: [activity] })[0]?.eventType
    === 'TASK_CREATED',
  'audit presentation preserves both core and activity history',
);

assert(
  !evaluateGlhManualCreationGuard({
    nodeEnv: 'production',
    runtimeEnv: 'test',
    enabled: 'true',
    guard: GLH_MANUAL_CREATION_GUARD_VALUE,
  }).allowed,
  'manual lead creation is disabled in Production',
);
assert(
  !evaluateGlhManualCreationGuard({ nodeEnv: 'development', runtimeEnv: 'test' }).allowed,
  'manual lead creation requires explicit enablement',
);
assert(
  evaluateGlhManualCreationGuard({
    nodeEnv: 'development',
    runtimeEnv: 'test',
    enabled: 'true',
    guard: GLH_MANUAL_CREATION_GUARD_VALUE,
  }).allowed,
  'manual lead creation requires and accepts the explicit non-Production guard',
);

const manualInput = {
  displayName: 'Test Lead',
  companyName: null,
  countryCode: 'NG',
  whatsapp: null,
  email: null,
  sourcePlatform: 'UNKNOWN',
  requirementType: 'MACHINE',
  lifecycleState: 'NEW',
  conversationMode: 'AI_ACTIVE',
  priorityGrade: 'A',
  score: 88,
  completeness: 80,
  product: null,
  material: null,
  quantity: null,
  notes: null,
  ownerProfileId: null,
};
assert(glhManualLeadCreateSchema.safeParse(manualInput).success, 'manual creation validates a valid payload');
assert(
  !glhManualLeadCreateSchema.safeParse({ ...manualInput, priorityGrade: 'B' }).success,
  'manual creation rejects grade/score mismatches',
);
assert(
  !glhLeadAssignmentSchema.safeParse({
    assigneeProfileId: 'not-a-uuid',
    expectedVersion: 1,
  }).success,
  'assignment rejects non-UUID target profiles',
);
assert(
  !glhTaskOrFollowupSchema.safeParse({
    leadId: 'lead-a',
    kind: 'FOLLOWUP',
    type: 'HANDOFF',
    title: 'Invalid follow-up',
    dueAt: null,
  }).success,
  'follow-up validation rejects a task-only type and missing due date',
);

async function testMutationBoundaries() {
  let rpcCalls = 0;
  const client = {
    async rpc() {
      rpcCalls++;
      return { data: { work_id: 'work-1' }, error: null };
    },
  };

  try {
    await assignGlhLead(
      client,
      makeContext(),
      '11111111-1111-4111-8111-111111111111',
      {
        assigneeProfileId: '22222222-2222-4222-8222-222222222222',
        expectedVersion: 1,
        reason: null,
      },
    );
    assert(false, 'Sales cannot bypass the Manager/Admin assignment boundary');
  } catch (error) {
    assert(
      error instanceof GlhMutationError && error.status === 403 && rpcCalls === 0,
      'Sales assignment is rejected before any RPC call',
    );
  }

  const created = await createGlhTaskOrFollowup(
    client,
    {
      leadId: '11111111-1111-4111-8111-111111111111',
      kind: 'TASK',
      type: 'FOLLOW_UP',
      title: 'Call customer',
      dueAt: null,
      assigneeProfileId: null,
    },
  );
  assert(
    created.work_id === 'work-1' && rpcCalls === 1,
    'task creation goes only through the controlled RPC boundary',
  );
}

const pagePaths = [
  'src/app/global-lead-hub/page.tsx',
  'src/app/global-lead-hub/leads/page.tsx',
  'src/app/global-lead-hub/leads/new/page.tsx',
  'src/app/global-lead-hub/leads/[leadId]/page.tsx',
  'src/app/global-lead-hub/tasks/page.tsx',
];
for (const path of pagePaths) {
  assert(fs.existsSync(path), `server-rendered route exists: ${path}`);
}
assert(
  pagePaths.every(path => !source(path).includes("'use client'")),
  'all route shells are server-rendered',
);
assert(
  pagePaths.every(path => source(path).includes('resolveGlhAccessContext')),
  'every GLH page reuses the Phase 1 fail-closed access context',
);

const apiPaths = [
  'src/app/api/global-lead-hub/leads/route.ts',
  'src/app/api/global-lead-hub/leads/[leadId]/assign/route.ts',
  'src/app/api/global-lead-hub/tasks/route.ts',
];
for (const path of apiPaths) {
  assert(fs.existsSync(path), `controlled API route exists: ${path}`);
}

const apiSource = apiPaths.map(source).join('\n');
const mutationBoundarySource = [
  apiSource,
  source('src/lib/global-lead-hub/mutations.ts'),
].join('\n');
assert(mutationBoundarySource.includes("rpc('glh_create_manual_test_lead'"), 'manual creation API calls the guarded RPC');
assert(mutationBoundarySource.includes("rpc('glh_assign_lead'"), 'assignment API calls the controlled RPC');
assert(mutationBoundarySource.includes("rpc('glh_create_task_or_followup'"), 'task API calls the controlled RPC');
assert(
  !apiSource.includes(".from('glh_leads')") && !apiSource.includes('.insert('),
  'API mutations do not perform arbitrary direct table writes',
);

const componentPaths = [
  'src/components/global-lead-hub/LeadTable.tsx',
  'src/components/global-lead-hub/LeadForm.tsx',
  'src/components/global-lead-hub/LeadDetail.tsx',
  'src/components/global-lead-hub/TaskBoard.tsx',
];
for (const path of componentPaths) {
  assert(fs.existsSync(path), `compact GLH component exists: ${path}`);
}
const browserSource = componentPaths.map(source).join('\n');
for (const forbidden of [
  'local' + 'Storage',
  'site' + '_data',
  '/api' + '/data',
  'SUPABASE_' + 'SERVICE_ROLE_KEY',
  'createAdmin' + 'SupabaseClient',
  'api.' + 'whatsapp.com',
  'graph.' + 'facebook.com',
]) {
  assert(!browserSource.includes(forbidden), `browser UI avoids forbidden token: ${forbidden}`);
}
assert(
  browserSource.includes('aria-') && browserSource.includes('role="alert"'),
  'browser UI includes accessible labels and explicit error states',
);

const migrationPath =
  'supabase/migrations/20261010074500_global_lead_hub_phase2_core_human_ui.sql';
const sql = source(migrationPath);
const executableSql = sql.replace(/--.*$/gm, '');
assert(
  executableSql.includes('CREATE OR REPLACE FUNCTION public.glh_create_manual_test_lead')
    && executableSql.includes('CREATE OR REPLACE FUNCTION public.glh_assign_lead')
    && executableSql.includes('CREATE OR REPLACE FUNCTION public.glh_create_task_or_followup'),
  'migration defines the three required controlled RPCs',
);
assert(
  (executableSql.match(/SECURITY DEFINER/g) ?? []).length >= 3
    && (executableSql.match(/SET search_path = pg_catalog, public/g) ?? []).length >= 3,
  'each mutation RPC is security-definer with a pinned search path',
);
assert(
  (executableSql.match(/auth\.uid\(\)/g) ?? []).length >= 3,
  'each mutation RPC derives the current profile from auth.uid()',
);
assert(
  executableSql.includes("v_actor.role NOT IN ('admin', 'manager')")
    && executableSql.includes("v_actor.role NOT IN ('admin', 'manager', 'sales')"),
  'RPCs enforce role boundaries for assignment and lead access',
);
assert(
  executableSql.includes('v_lead.owner_profile_id = v_actor.id')
    && executableSql.includes("a.assignee_profile_id = v_actor.id")
    && executableSql.includes("a.status = 'ACTIVE'"),
  'Sales work creation requires ownership or an active same-lead assignment',
);
assert(
  !executableSql.includes('p_actor_org_id')
    && executableSql.includes('v_actor.org_id')
    && executableSql.includes('org_id = v_actor.org_id'),
  'RPCs derive organization from the authenticated profile and reject cross-org targets',
);
assert(
  executableSql.includes("current_setting('app.environment', true)")
    && executableSql.includes("current_setting('app.glh_manual_creation_guard', true)")
    && executableSql.includes('MANUAL_CREATION_DISABLED'),
  'manual creation fails closed without matching non-Production database guards',
);
assert(
  executableSql.includes('grade') && executableSql.includes('GRADE_SCORE_MISMATCH')
    && executableSql.includes('INVALID_LIFECYCLE_STATE'),
  'manual creation validates lifecycle, grade, and score inputs',
);
assert(
  executableSql.includes('INSERT INTO public.glh_assignments')
    && executableSql.includes("SET status = 'ENDED'")
    && executableSql.includes("'LEAD_ASSIGNED'"),
  'assignment appends history and preserves prior assignment records',
);
assert(
  executableSql.includes('CREATE TABLE public.glh_activity_events')
    && executableSql.includes('ALTER TABLE public.glh_activity_events ENABLE ROW LEVEL SECURITY')
    && executableSql.includes('REVOKE ALL ON TABLE public.glh_activity_events')
    && executableSql.includes('GRANT SELECT ON TABLE public.glh_activity_events TO authenticated'),
  'activity history is exposed through RLS and explicit authenticated read grants only',
);
assert(
  (executableSql.match(/GRANT EXECUTE ON FUNCTION/g) ?? []).length === 3
    && !/GRANT\s+EXECUTE[^;]*TO\s+anon/i.test(executableSql)
    && !/GRANT\s+(INSERT|UPDATE|DELETE|ALL)[^;]*TO\s+authenticated/i.test(executableSql),
  'only authenticated receives exact RPC execute rights and no direct DML grant',
);
assert(
  !executableSql.includes('DROP TABLE')
    && !executableSql.includes('TRUNCATE')
    && !executableSql.includes('DELETE FROM')
    && !executableSql.includes('DISABLE ROW LEVEL SECURITY'),
  'Phase 2 migration contains no destructive or RLS-bypass SQL',
);
assert(
  ['http://', 'https://', 'pg_net', 'net.http_post', 'graph.facebook.com',
    'api.whatsapp.com', 'SUPABASE_' + 'SERVICE_ROLE_KEY', 'service' + '_role']
    .every(token => !executableSql.includes(token)),
  'Phase 2 migration introduces no provider call or service-role path',
);

void Promise.all([testMutationBoundaries()]).then(() => {
  console.log(`GLH Phase 2 Core Human UI tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
