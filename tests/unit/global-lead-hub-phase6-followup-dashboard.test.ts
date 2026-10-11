import fs from 'node:fs';
import type { GlhAccessContext } from '../../src/lib/global-lead-hub/access';
import {
  buildGlhFollowupDashboard,
} from '../../src/lib/global-lead-hub/phase6-followup-dashboard';
import type {
  GlhContactRow,
  GlhFollowupRow,
  GlhLeadRow,
  GlhProfileRow,
  GlhTaskRow,
} from '../../src/lib/global-lead-hub/read-model';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

function source(path: string): string {
  return fs.readFileSync(path, 'utf8');
}

const manager: GlhAccessContext = {
  actorProfileId: 'manager-a',
  organizationId: 'org-a',
  role: 'MANAGER',
  authSource: 'supabase',
};

const leadBase: GlhLeadRow = {
  id: 'lead-today',
  org_id: 'org-a',
  contact_id: 'contact-a',
  owner_profile_id: 'sales-a',
  lifecycle_state: 'HUMAN_FOLLOWING',
  conversation_mode: 'HUMAN_ACTIVE',
  priority_grade: 'A',
  score: 88,
  completeness: 90,
  source_platform: 'WHATSAPP',
  campaign_id: null,
  creative_id: null,
  referral_identifier: null,
  last_message_at: '2026-10-10T10:00:00.000Z',
  next_follow_up_at: '2026-10-11T18:00:00.000Z',
  version: 1,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-10T10:00:00.000Z',
};

const leads: GlhLeadRow[] = [
  leadBase,
  { ...leadBase, id: 'lead-overdue', lifecycle_state: 'QUOTATION', priority_grade: 'B' },
  { ...leadBase, id: 'lead-upcoming', lifecycle_state: 'SAMPLE', priority_grade: 'C' },
  { ...leadBase, id: 'lead-dormant', lifecycle_state: 'DORMANT', priority_grade: 'D' },
  { ...leadBase, id: 'lead-won', lifecycle_state: 'WON', priority_grade: null },
  { ...leadBase, id: 'lead-org-b', org_id: 'org-b', lifecycle_state: 'WON' },
];

const contacts: GlhContactRow[] = [
  {
    id: 'contact-a',
    org_id: 'org-a',
    display_name: 'Alpha Customer',
    company_name: 'Alpha Co',
    country_code: 'NG',
    normalized_whatsapp: null,
    normalized_email: null,
    source_platform: 'WHATSAPP',
  },
  {
    id: 'contact-b',
    org_id: 'org-b',
    display_name: 'Other organization',
    company_name: null,
    country_code: null,
    normalized_whatsapp: null,
    normalized_email: null,
    source_platform: 'UNKNOWN',
  },
];

const profiles: GlhProfileRow[] = [
  { id: 'sales-a', org_id: 'org-a', full_name: 'Sales A', role: 'sales', is_active: true },
  { id: 'sales-b', org_id: 'org-b', full_name: 'Sales B', role: 'sales', is_active: true },
];

function task(overrides: Partial<GlhTaskRow>): GlhTaskRow {
  return {
    id: 'task-today',
    org_id: 'org-a',
    lead_id: 'lead-today',
    assignee_profile_id: 'sales-a',
    task_type: 'FOLLOW_UP',
    title: 'Follow up today',
    due_at: '2026-10-11T23:59:59.000Z',
    status: 'OPEN',
    source: 'HUMAN',
    created_by_profile_id: 'manager-a',
    completed_at: null,
    version: 1,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const tasks: GlhTaskRow[] = [
  task({}),
  task({
    id: 'task-overdue',
    lead_id: 'lead-overdue',
    title: 'Overdue quotation',
    due_at: '2026-10-10T23:59:59.000Z',
  }),
  task({
    id: 'task-upcoming',
    lead_id: 'lead-upcoming',
    title: 'Upcoming sample',
    due_at: '2026-10-12T00:00:00.000Z',
  }),
  task({
    id: 'task-done',
    lead_id: 'lead-today',
    due_at: '2026-10-10T00:00:00.000Z',
    status: 'DONE',
  }),
  task({
    id: 'task-org-b',
    org_id: 'org-b',
    lead_id: 'lead-org-b',
    assignee_profile_id: 'sales-b',
  }),
];

const followups: GlhFollowupRow[] = [{
  id: 'followup-dormant',
  org_id: 'org-a',
  lead_id: 'lead-dormant',
  assigned_profile_id: 'sales-a',
  followup_type: 'DORMANT_REVIVAL',
  next_action: 'Revive dormant lead',
  due_at: '2026-10-10T00:00:00.000Z',
  status: 'OPEN',
  last_contact_at: null,
  completed_at: null,
  version: 1,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
}];

console.log('\n=== Global Lead Hub Phase 6 Follow-up + Dashboard ===');

const dashboard = buildGlhFollowupDashboard({
  context: manager,
  leads,
  contacts,
  profiles,
  tasks,
  followups,
  now: new Date('2026-10-11T12:00:00.000Z'),
});

assert(dashboard.managerView && dashboard.scope === 'ORGANIZATION', 'Manager gets organization dashboard scope');
assert(dashboard.summary.totalLeads === 5, 'Cross-organization leads never enter aggregates');
assert(dashboard.work.TODAY[0]?.id === 'task-today', 'UTC day boundary classifies due-today work');
assert(dashboard.work.OVERDUE[0]?.id === 'task-overdue', 'Earlier UTC date classifies overdue work');
assert(dashboard.work.UPCOMING[0]?.id === 'task-upcoming', 'Later UTC date classifies upcoming work');
assert(dashboard.work.DORMANT[0]?.id === 'followup-dormant', 'Dormant lifecycle/revival work has an explicit queue');
assert(!Object.values(dashboard.work).flat().some(item => item.id === 'task-done'), 'Completed work is excluded');
assert(!Object.values(dashboard.work).flat().some(item => item.id === 'task-org-b'), 'Cross-organization work is excluded');
assert(dashboard.conversion.quotation === 3, 'Quotation conversion is monotonic through sample and won');
assert(dashboard.conversion.sample === 2 && dashboard.conversion.won === 1, 'Sample and won conversion counts are stable');
assert(dashboard.grades.A === 1 && dashboard.grades.UNSCORED === 1, 'Grade distribution includes unscored leads');
assert(dashboard.workload[0]?.profileName === 'Sales A' && dashboard.workload[0]?.open === 4, 'Manager workload uses open visible work only');

const salesDashboard = buildGlhFollowupDashboard({
  context: { ...manager, actorProfileId: 'sales-a', role: 'SALES' },
  leads: [leadBase],
  contacts,
  profiles,
  tasks: [tasks[0]],
  followups: [],
  now: new Date('2026-10-11T12:00:00.000Z'),
});
assert(!salesDashboard.managerView && salesDashboard.scope === 'MY_ACCESSIBLE_RECORDS', 'Sales sees only the RLS-scoped personal dashboard mode');

const empty = buildGlhFollowupDashboard({
  context: manager,
  leads: [],
  contacts: [],
  profiles: [],
  tasks: [],
  followups: [],
  now: new Date('2026-10-11T12:00:00.000Z'),
});
assert(empty.summary.totalLeads === 0 && empty.conversion.wonRate === 0, 'Empty state has stable zero counts and rates');

const routePaths = [
  'src/app/global-lead-hub/dashboard/page.tsx',
  'src/app/api/global-lead-hub/dashboard/route.ts',
  'src/components/global-lead-hub/FollowupDashboard.tsx',
];
assert(routePaths.every(path => fs.existsSync(path)), 'Phase 6 page, API, and UI component exist');

const routeSource = routePaths.map(source).join('\n');
const serverSource = source('src/lib/global-lead-hub/server.ts');
assert(routeSource.includes('resolveGlhAccessContext'), 'Dashboard routes use the trusted GLH access context');
assert(serverSource.includes(".eq('org_id', context.organizationId)"), 'Server reads are explicitly organization-scoped');
assert(serverSource.includes('createReadOnlySupabaseClient'), 'Dashboard uses the read-only Supabase boundary');
assert(routeSource.includes('AI is offline'), 'Human dashboard remains explicit when AI is unavailable');

for (const forbidden of [
  'local' + 'Storage',
  'site' + '_data',
  '/api' + '/data',
  'SUPABASE_' + 'SERVICE_ROLE_KEY',
  'createAdmin' + 'SupabaseClient',
  'graph.' + 'facebook.com',
  'api.' + 'whatsapp.com',
]) {
  assert(!routeSource.includes(forbidden), `Phase 6 browser/API surfaces avoid forbidden token: ${forbidden}`);
}

console.log(`GLH Phase 6 Follow-up + Dashboard tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
