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

console.log('\n=== Customer Project Center Phase 6C Surface Contract ===');

const api = fs.readFileSync('src/lib/customer-projects/api.ts', 'utf8');
const parser = fs.readFileSync('src/lib/customer-projects/ai-drafts.ts', 'utf8');
const listRoute = fs.readFileSync(
  'src/app/api/customer-projects/ai-drafts/route.ts',
  'utf8',
);
const acceptRoute = fs.readFileSync(
  'src/app/api/customer-projects/ai-drafts/[id]/accept/route.ts',
  'utf8',
);
const rejectRoute = fs.readFileSync(
  'src/app/api/customer-projects/ai-drafts/[id]/reject/route.ts',
  'utf8',
);
const workbench = fs.readFileSync(
  'src/app/customer-projects/page.tsx',
  'utf8',
);
const domain = fs.readFileSync(
  'src/lib/customer-projects/domain.ts',
  'utf8',
);

assert(
  parser.includes("proposal.action !== 'CREATE_WORK_ITEM'")
    && parser.includes("proposal.workItemType !== 'NEXT_ACTION'")
    && parser.includes("proposal.workItemType !== 'FOLLOW_UP'"),
  'client-facing proposal parser fails closed to approved work-item suggestions only',
);
assert(
  parser.includes('schemaVersion !== 1')
    && parser.includes('optionalIso')
    && parser.includes('PRIORITIES.has'),
  'proposal schema version, time and priority are validated before display',
);

assert(
  listRoute.includes(".from('cpc_ai_drafts')")
    && listRoute.includes(".eq('status', 'draft')")
    && listRoute.includes('parseAiWorkItemProposal(row.structured_proposal)'),
  'AI suggestion read route returns only open drafts that pass strict proposal parsing',
);
assert(
  listRoute.includes('canReview')
    && listRoute.includes("profile.role === 'admin'")
    && listRoute.includes("profile.role === 'manager'")
    && listRoute.includes('project?.owner_profile_id === profile.id'),
  'AI suggestion DTO separates read visibility from review authority',
);
assert(
  !listRoute.includes('accepted_by_profile_id')
    && !listRoute.includes('rejected_by_profile_id')
    && !listRoute.includes('org_id,'),
  'AI suggestion read DTO does not expose terminal actor/internal org fields',
);

assert(
  acceptRoute.includes("runCpcMutation(req, params, 'ACCEPT_AI_DRAFT')")
    && rejectRoute.includes("runCpcMutation(req, params, 'REJECT_AI_DRAFT')"),
  'AI review routes use shared controlled mutation layer',
);
for (const source of [acceptRoute, rejectRoute]) {
  assert(!source.includes('.from('), 'AI review route has no direct table mutation');
  assert(!source.includes('.rpc('), 'AI review route has no duplicate RPC mapping');
}

assert(
  api.includes("| 'CREATE_AI_WORK_ITEM_DRAFT'")
    && api.includes("| 'ACCEPT_AI_DRAFT'")
    && api.includes("| 'REJECT_AI_DRAFT'"),
  'shared mutation command layer recognizes AI Draft workflow',
);
assert(
  api.includes("supabase.rpc('cpc_create_ai_work_item_draft'")
    && api.includes("supabase.rpc('cpc_accept_ai_draft'")
    && api.includes("supabase.rpc('cpc_reject_ai_draft'"),
  'shared mutation layer maps AI Draft operations to narrow RPCs',
);
assert(
  api.includes("DRAFT_EXPIRED: 'AI 建议已过期")
    && api.includes("code === 'DRAFT_EXPIRED'"),
  'expired AI Draft maps to controlled conflict response',
);

assert(
  workbench.includes('title="正式提醒"')
    && workbench.includes('title="AI建议（待确认）"'),
  'Workbench keeps formal reminders and AI suggestions as separate sections',
);
assert(
  workbench.includes('AI 只提出建议；只有你明确接受后')
    && workbench.includes('接受为正式任务')
    && workbench.includes('忽略建议'),
  'Workbench requires explicit human accept/reject action',
);
assert(
  workbench.includes('AI 建议本身不算逾期、不算未履约，也不进入员工绩效'),
  'Workbench explicitly prevents AI suggestion from being treated as overdue/KPI truth',
);
assert(
  workbench.includes("'/api/customer-projects/ai-drafts'")
    && workbench.includes("decision: 'accept' | 'reject'"),
  'Workbench loads and reviews AI Drafts through approved API only',
);
assert(
  workbench.includes("if (decision === 'accept')") 
    && workbench.includes('setWorkbenchRefreshKey(value => value + 1)'),
  'formal workbench refresh happens only after accepted AI suggestion becomes formal task',
);
assert(
  !workbench.includes('localStorage')
    && !workbench.includes('site_data')
    && !workbench.includes('/api/data')
    && !workbench.includes('.from(')
    && !workbench.includes('.rpc('),
  'AI suggestion client surface avoids legacy/direct data paths',
);

assert(
  domain.includes('proposal_schema_version: number;')
    && domain.includes('created_by_profile_id: string;')
    && domain.includes('expires_at: string | null;')
    && domain.includes('version: number;')
    && !domain.includes('confidence: number | null;')
    && !domain.includes('source_model: string | null;')
    && !domain.includes('source_run_id: string | null;'),
  'AIDraft domain interface matches the approved Phase 4 persistence contract',
);

console.log('Phase 6C surface tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
