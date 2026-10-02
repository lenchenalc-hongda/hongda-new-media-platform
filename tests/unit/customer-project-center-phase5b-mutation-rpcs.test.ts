import fs from 'node:fs';

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

const migrationPath =
  'supabase/migrations/20261002024500_customer_project_center_phase5b_mutation_rpcs.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');
const executableSql = sql.replace(/--.*$/gm, '');

function functionBlock(name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.indexOf(marker);
  if (start < 0) return '';
  const bodyStart = sql.indexOf('AS $$', start);
  const end = sql.indexOf('\n$$;', bodyStart);
  if (bodyStart < 0 || end < 0) return '';
  return sql.slice(start, end + 4);
}

console.log('\n=== Customer Project Center Phase 5B Mutation RPC Audit ===');

const publicRpcs = [
  'cpc_create_provisional_customer_reference',
  'cpc_create_project',
  'cpc_record_progress',
  'cpc_set_waiting_state',
  'cpc_transition_work_item',
  'cpc_transition_project',
];

for (const rpc of publicRpcs) {
  const block = functionBlock(rpc);
  assert(block.length > 0, `RPC exists: ${rpc}`);
  assert(block.includes('SECURITY DEFINER'), `${rpc} is SECURITY DEFINER`);
  assert(
    block.includes('SET search_path = pg_catalog, public'),
    `${rpc} pins search_path`,
  );
  assert(
    block.includes('WHERE p.user_id = auth.uid()')
      && block.includes('AND p.is_active = TRUE'),
    `${rpc} derives active actor from auth.uid()`,
  );
  assert(
    sql.includes(`GRANT EXECUTE ON FUNCTION public.${rpc}`),
    `${rpc} explicitly grants authenticated execute`,
  );
  assert(
    sql.includes(`REVOKE ALL ON FUNCTION public.${rpc}`),
    `${rpc} revokes broad execute first`,
  );
}

for (const rpc of [
  'cpc_record_progress',
  'cpc_set_waiting_state',
  'cpc_transition_work_item',
  'cpc_transition_project',
]) {
  const block = functionBlock(rpc);
  assert(
    block.includes('p_expected_version')
      && block.includes('VERSION_CONFLICT'),
    `${rpc} uses optimistic concurrency`,
  );
  assert(
    block.includes('INSERT INTO public.cpc_audit_log'),
    `${rpc} writes strong audit in the same function`,
  );
}

const createProject = functionBlock('cpc_create_project');
assert(
  createProject.includes('NEXT_STEP_REQUIRED')
    && createProject.includes("'NEXT_ACTION'")
    && createProject.includes('p_next_check_at'),
  'project creation requires NEXT_ACTION or waiting/check',
);
assert(
  createProject.includes("v_actor_role = 'sales'")
    && createProject.includes('v_owner_profile_id <> v_actor_profile_id'),
  'sales cannot assign a different Project owner',
);
assert(
  createProject.includes('public.cpc_stage_is_valid'),
  'project creation validates type-specific stage profile',
);

const progress = functionBlock('cpc_record_progress');
assert(
  progress.includes('INVALID_EVENT_PAYLOAD')
    && progress.includes('public.cpc_event_payload_is_valid'),
  'progress mutation validates consequential event evidence',
);
assert(
  progress.includes('STAGE_CHANGED')
    && progress.includes('WAITING_RESOLVED'),
  'progress mutation records derived stage/wait resolution events',
);
assert(
  progress.includes("SET status = 'completed'")
    && progress.includes("'NEXT_ACTION'"),
  'progress mutation can complete/replace the current NEXT_ACTION atomically',
);
assert(
  progress.includes('new_next_action_id')
    && progress.includes('completed_next_action_id'),
  'progress audit links old and new next-action identities',
);

const waiting = functionBlock('cpc_set_waiting_state');
assert(
  waiting.includes("'WAITING_STARTED'")
    && waiting.includes('p_next_check_at')
    && waiting.includes('p_reason'),
  'waiting RPC records reason and check time',
);
assert(
  waiting.includes("SET status = 'completed'"),
  'entering waiting resolves the prior NEXT_ACTION',
);

const workItem = functionBlock('cpc_transition_work_item');
assert(
  workItem.includes('public.cpc_work_item_transition_is_valid'),
  'WorkItem transition uses explicit lifecycle map',
);
assert(
  workItem.includes('NEXT_STEP_REQUIRED')
    && workItem.includes("v_project.status = 'active'")
    && workItem.includes("v_project.waiting_on = 'none'"),
  'standalone completion cannot strand an active Project',
);
assert(
  workItem.includes("p_to_status IN ('blocked', 'cancelled')")
    && workItem.includes('REASON_REQUIRED'),
  'blocked/cancelled WorkItem transitions require reason',
);

const projectTransition = functionBlock('cpc_transition_project');
assert(
  projectTransition.includes('public.cpc_project_transition_is_valid'),
  'Project lifecycle uses explicit transition map',
);
assert(
  projectTransition.includes("v_customer.reference_kind <> 'canonical'")
    && projectTransition.includes("'ORDER_CONFIRMED'"),
  'won requires canonical customer and prior human-confirmed order event',
);
assert(
  projectTransition.includes("'PROJECT_PAUSED'")
    && projectTransition.includes("'PROJECT_REOPENED'")
    && projectTransition.includes("'PROJECT_WON'")
    && projectTransition.includes("'PROJECT_LOST'")
    && projectTransition.includes("'PROJECT_CANCELLED'"),
  'Project lifecycle appends the required event types',
);
assert(
  projectTransition.includes("'pause_reason'")
    && projectTransition.includes("'reopen_reason'"),
  'pause/reopen payloads match the domain event schema',
);
assert(
  projectTransition.includes('NEXT_STEP_REQUIRED')
    && projectTransition.includes('p_reopen_next_action_title')
    && projectTransition.includes('p_reopen_waiting_on'),
  'reactivating a Project re-establishes the active next-step invariant',
);

assert(
  sql.includes('CREATE CONSTRAINT TRIGGER cpc_active_project_invariant_project')
    && sql.includes('DEFERRABLE INITIALLY DEFERRED')
    && sql.includes('CREATE CONSTRAINT TRIGGER cpc_active_project_invariant_work_items'),
  'database-level active Project invariant is deferred across Project/WorkItem transaction',
);
assert(
  sql.includes('active project % requires one open NEXT_ACTION or waiting/check state'),
  'active Project invariant has explicit DB-level rejection',
);

assert(
  sql.includes('CREATE TRIGGER trg_cpc_project_events_append_only')
    && sql.includes('CREATE TRIGGER trg_cpc_audit_log_append_only')
    && sql.includes('cpc_reject_append_only_mutation'),
  'ProjectEvent and audit tables are protected from UPDATE/DELETE',
);

const evidenceHelper = functionBlock('cpc_event_payload_is_valid');
for (const eventType of [
  'QUOTE_SENT',
  'SAMPLE_SENT',
  'CUSTOMER_CONFIRMED',
  'COMMERCIAL_CONFIRMED',
  'ORDER_CONFIRMED',
]) {
  assert(
    evidenceHelper.includes(`'${eventType}'`),
    `evidence validation covers ${eventType}`,
  );
}
assert(
  evidenceHelper.includes("'evidence_reference'")
    && evidenceHelper.includes("jsonb_typeof(p_payload -> 'evidence_reference') = 'string'"),
  'consequential commercial evidence must be an explicit non-empty string',
);

const stageHelper = functionBlock('cpc_stage_is_valid');
for (const stage of [
  'artwork_material_alignment',
  'material_fixture_process_alignment',
  'commercial_confirmation',
  'sample_validation',
  'acceptance_training',
]) {
  assert(stageHelper.includes(`'${stage}'`), `frozen stage profile includes ${stage}`);
}
assert(
  !stageHelper.includes('CREATE TYPE'),
  'stage validation remains text/config logic, not PostgreSQL enum',
);

assert(
  !/GRANT\s+(INSERT|UPDATE|DELETE|ALL).*TO\s+authenticated/i.test(executableSql),
  'Phase 5B does not restore direct authenticated table DML',
);
assert(
  !executableSql.includes('DROP TABLE')
    && !executableSql.includes('TRUNCATE')
    && !executableSql.includes('DELETE FROM public.cpc_')
    && !executableSql.includes('DISABLE ROW LEVEL SECURITY'),
  'Phase 5B contains no destructive migration or RLS bypass',
);
assert(
  !executableSql.includes('UPDATE public.site_data')
    && !executableSql.includes('UPDATE public.leads')
    && !executableSql.includes('UPDATE public.ai_jobs'),
  'Phase 5B does not mutate legacy generic/acquisition tables',
);
assert(
  !executableSql.includes('UPDATE public.cpc_external_profile_mappings')
    && !executableSql.includes('UPDATE public.cpc_customer_references SET external_owner_reference'),
  'Phase 5B does not change external ownership mapping/source truth',
);

console.log(`Phase 5B mutation RPC audit: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
