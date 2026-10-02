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

console.log('\n=== Customer Project Center Phase 6C AI Draft Contract ===');

const path =
  'supabase/migrations/20261002073000_customer_project_center_phase6c_ai_drafts.sql';
const sql = fs.readFileSync(path, 'utf8');
const executable = sql.replace(/--.*$/gm, '');

function functionBlock(name: string): string {
  const marker = 'CREATE OR REPLACE FUNCTION public.' + name;
  const start = sql.indexOf(marker);
  if (start < 0) return '';
  const bodyStart = sql.indexOf('AS $$', start);
  const end = sql.indexOf('\n$$;', bodyStart);
  if (bodyStart < 0 || end < 0) return '';
  return sql.slice(start, end + 4);
}

const createWorkItem = functionBlock('cpc_create_work_item');
const createDraft = functionBlock('cpc_create_ai_work_item_draft');
const acceptDraft = functionBlock('cpc_accept_ai_draft');
const rejectDraft = functionBlock('cpc_reject_ai_draft');

assert(
  sql.includes('CREATE TABLE public.cpc_ai_drafts'),
  'approved Phase 4 AI Draft table is materialized',
);
for (const column of [
  'proposal_type TEXT NOT NULL',
  'raw_input TEXT NOT NULL',
  'structured_proposal JSONB NOT NULL',
  'proposal_schema_version INTEGER NOT NULL',
  'created_by_profile_id UUID NOT NULL',
  'accepted_by_profile_id UUID',
  'rejected_by_profile_id UUID',
  'expires_at TIMESTAMPTZ',
  'version INTEGER NOT NULL DEFAULT 1',
]) {
  assert(sql.includes(column), 'AI Draft schema contains ' + column);
}
assert(
  sql.includes("status TEXT NOT NULL DEFAULT 'draft'")
    && sql.includes("CHECK (status IN ('draft', 'accepted', 'rejected', 'expired'))"),
  'AI Draft status set matches approved domain',
);
assert(
  sql.includes('chk_cpc_ai_draft_terminal_metadata')
    && sql.includes("status = 'accepted'")
    && sql.includes("status = 'rejected'")
    && sql.includes("status = 'expired'"),
  'terminal metadata is state-consistent',
);

assert(
  sql.includes('ALTER TABLE public.cpc_ai_drafts ENABLE ROW LEVEL SECURITY')
    && sql.includes('CREATE POLICY "cpc_ai_drafts_select"')
    && sql.includes('public.cpc_can_read_ai_draft(id, org_id)'),
  'AI Draft table is RLS protected',
);
assert(
  sql.includes('REVOKE ALL ON TABLE public.cpc_ai_drafts')
    && sql.includes('GRANT SELECT ON TABLE public.cpc_ai_drafts TO authenticated'),
  'authenticated clients receive read-only table access',
);
assert(
  !/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE\s+public\.cpc_ai_drafts\s+TO\s+authenticated/i.test(executable),
  'direct authenticated AI Draft DML is not granted',
);

assert(createWorkItem.length > 0, 'controlled WorkItem creation RPC exists');
assert(
  createWorkItem.includes("p_work_item_type NOT IN ('NEXT_ACTION', 'FOLLOW_UP')"),
  'Phase 6C formalization is limited to NEXT_ACTION/FOLLOW_UP',
);
assert(
  createWorkItem.includes("v_project.status <> 'active' OR v_project.waiting_on <> 'none'")
    && createWorkItem.includes("wi.work_item_type = 'NEXT_ACTION'")
    && createWorkItem.includes("wi.status IN ('pending', 'in_progress', 'blocked')"),
  'NEXT_ACTION creation preserves active/no-wait/one-open-next-action invariants',
);
assert(
  createWorkItem.includes('public.cpc_can_follow_customer')
    && createWorkItem.includes("wi.work_item_type = 'FOLLOW_UP'"),
  'customer-level FOLLOW_UP creation reuses relationship authority and dedup',
);
assert(
  createWorkItem.includes("'WORK_ITEM_CREATED'"),
  'formal WorkItem creation is strongly audited',
);

assert(createDraft.length > 0, 'AI work-item draft staging RPC exists');
assert(
  createDraft.includes("p_work_item_type NOT IN ('NEXT_ACTION', 'FOLLOW_UP')")
    && createDraft.includes("'WORK_ITEM'")
    && createDraft.includes("'CREATE_WORK_ITEM'"),
  'staging RPC creates only approved non-authoritative work-item proposal schema',
);
assert(
  !createDraft.includes('INSERT INTO public.cpc_work_items'),
  'staging AI suggestion does not create formal work',
);
assert(
  createDraft.includes("'AI_DRAFT_CREATED'"),
  'AI draft creation is auditable',
);

assert(acceptDraft.length > 0, 'AI draft acceptance RPC exists');
assert(
  acceptDraft.includes("v_draft.status <> 'draft'")
    && acceptDraft.includes('p_expected_version <> v_draft.version'),
  'acceptance is draft-only and optimistic-concurrency protected',
);
assert(
  acceptDraft.includes('v_result := public.cpc_create_work_item('),
  'acceptance calls the same controlled WorkItem mutation',
);
assert(
  !acceptDraft.includes('INSERT INTO public.cpc_work_items'),
  'acceptance does not bypass the shared WorkItem mutation',
);
assert(
  acceptDraft.includes("SET status = 'accepted'")
    && acceptDraft.includes("'AI_DRAFT_ACCEPTED'")
    && acceptDraft.includes('created_work_item_id'),
  'accepted state and created formal task are linked in audit',
);
for (const dangerous of [
  'ORDER_CONFIRMED',
  'CUSTOMER_CONFIRMED',
  'expected_amount_minor',
  'owner_profile_id =',
  'external_owner_reference =',
]) {
  assert(
    !acceptDraft.includes(dangerous),
    'AI acceptance does not directly mutate consequential fact: ' + dangerous,
  );
}

assert(rejectDraft.length > 0, 'AI draft rejection RPC exists');
assert(
  rejectDraft.includes("SET status = 'rejected'")
    && rejectDraft.includes("'AI_DRAFT_REJECTED'"),
  'rejection only closes/audits the suggestion',
);
assert(
  !rejectDraft.includes('INSERT INTO public.cpc_work_items')
    && !rejectDraft.includes('UPDATE public.cpc_projects')
    && !rejectDraft.includes('UPDATE public.cpc_customer_references'),
  'rejection does not mutate formal business state',
);

assert(
  acceptDraft.includes("SET status = 'expired'")
    && acceptDraft.includes("'AI_DRAFT_EXPIRED'")
    && acceptDraft.includes("RETURN public.cpc_rpc_error('DRAFT_EXPIRED'"),
  'expired suggestion is closed without formalization',
);

assert(
  !executable.includes('DISABLE ROW LEVEL SECURITY')
    && !executable.includes('DROP TABLE')
    && !executable.includes('TRUNCATE'),
  'Phase 6C migration is non-destructive and does not weaken RLS',
);
assert(
  !executable.includes('cpc_orders')
    && !executable.includes('cpc_payments')
    && !executable.includes('cpc_customer_ownership'),
  'Phase 6C does not create duplicate external SoT domains',
);

console.log('Phase 6C AI Draft tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
