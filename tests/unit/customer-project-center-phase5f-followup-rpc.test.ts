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

console.log('\n=== Customer Project Center Phase 5F Follow-up RPC Contract ===');

const migrationPath =
  'supabase/migrations/20261002050000_customer_project_center_phase5f_customer_followup.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');
const executableSql = sql.replace(/--.*$/gm, '');

function functionBlock(name: string): string {
  const marker = 'CREATE OR REPLACE FUNCTION public.' + name;
  const start = sql.indexOf(marker);
  if (start < 0) return '';
  const bodyStart = sql.indexOf('AS $$', start);
  const end = sql.indexOf('\n$$;', bodyStart);
  if (bodyStart < 0 || end < 0) return '';
  return sql.slice(start, end + 4);
}

const authHelper = functionBlock('cpc_can_follow_customer');
const followUpRpc = functionBlock('cpc_record_customer_follow_up');

assert(authHelper.length > 0, 'customer follow-up authorization helper exists');
assert(
  authHelper.includes('SECURITY DEFINER')
    && authHelper.includes('SET search_path = pg_catalog, public'),
  'authorization helper is pinned SECURITY DEFINER',
);
assert(
  authHelper.includes("public.auth_has_role('admin')")
    && authHelper.includes("public.auth_has_role('manager')")
    && authHelper.includes("public.auth_has_role('sales')"),
  'authorization helper fails closed by approved CPC roles',
);
assert(
  authHelper.includes("cr.reference_kind = 'provisional'")
    && authHelper.includes('cr.created_by_profile_id = v_actor_profile_id'),
  'provisional creator can maintain relationship follow-up',
);
assert(
  authHelper.includes("cr.reference_kind = 'canonical'")
    && authHelper.includes('cpc_external_profile_mappings')
    && authHelper.includes('cr.external_owner_reference')
    && authHelper.includes('epm.profile_id = v_actor_profile_id'),
  'canonical follow-up authority derives from verified external owner mapping',
);
assert(
  authHelper.includes("wi.work_item_type = 'FOLLOW_UP'")
    && authHelper.includes('wi.assignee_profile_id = v_actor_profile_id'),
  'explicit customer-level FOLLOW_UP assignment grants follow-up authority',
);
assert(
  !authHelper.includes('cpc_can_read_customer_reference'),
  'customer read visibility alone is not customer follow-up write authority',
);

assert(followUpRpc.length > 0, 'customer follow-up RPC exists');
assert(
  followUpRpc.includes('SECURITY DEFINER')
    && followUpRpc.includes('SET search_path = pg_catalog, public'),
  'follow-up mutation is pinned SECURITY DEFINER',
);
assert(
  followUpRpc.includes('public.cpc_can_follow_customer'),
  'follow-up mutation uses stricter relationship authority helper',
);
assert(
  followUpRpc.includes("'CONTACT_LOGGED'")
    && followUpRpc.includes("'CUSTOMER_RESPONSE_RECEIVED'")
    && !followUpRpc.includes("'ORDER_CONFIRMED'"),
  'customer follow-up only records light customer-level contact/response events',
);
assert(
  followUpRpc.includes('project_id,')
    && followUpRpc.includes("'CONTACT'")
    && followUpRpc.includes('NULL,\n    p_event_type'),
  'relationship event is customer-level with project_id null',
);
assert(
  followUpRpc.includes("wi.work_item_type = 'FOLLOW_UP'")
    && followUpRpc.includes("SET status = 'completed'"),
  'current customer follow-up can be completed atomically',
);
assert(
  followUpRpc.includes("'DUPLICATE_FOLLOW_UP'")
    && followUpRpc.includes("wi.status IN ('pending', 'in_progress', 'blocked')"),
  'RPC prevents duplicate open follow-up for the same actor/customer',
);
assert(
  followUpRpc.includes("'FOLLOW_UP'")
    && followUpRpc.includes('p_next_follow_up_due_at')
    && followUpRpc.includes('v_actor_profile_id'),
  'next relationship action is a customer-level FOLLOW_UP assigned to actor',
);
assert(
  followUpRpc.includes("'CUSTOMER_FOLLOW_UP_RECORDED'")
    && followUpRpc.includes('completed_follow_up_id')
    && followUpRpc.includes('next_follow_up_id'),
  'one audit row links confirmed event and old/new follow-up tasks',
);
assert(
  !followUpRpc.includes('INSERT INTO public.cpc_projects'),
  'routine customer follow-up never auto-creates a Project',
);
assert(
  !followUpRpc.includes('UPDATE public.cpc_customer_references')
    && !followUpRpc.includes('UPDATE public.cpc_external_profile_mappings'),
  'customer follow-up never rewrites customer or ownership authority',
);

assert(
  sql.includes('GRANT EXECUTE ON FUNCTION public.cpc_record_customer_follow_up')
    && sql.includes('TO authenticated'),
  'only authenticated users receive explicit follow-up RPC execute',
);
assert(
  !/GRANT\s+(INSERT|UPDATE|DELETE|ALL).*TO\s+authenticated/i.test(executableSql),
  'Phase 5F does not restore direct authenticated table DML',
);
assert(
  !executableSql.includes('DROP TABLE')
    && !executableSql.includes('TRUNCATE')
    && !executableSql.includes('DISABLE ROW LEVEL SECURITY'),
  'Phase 5F migration is non-destructive and does not weaken RLS',
);
assert(
  !executableSql.includes('UPDATE public.site_data')
    && !executableSql.includes('UPDATE public.leads')
    && !executableSql.includes('UPDATE public.ai_jobs'),
  'Phase 5F does not touch legacy generic/acquisition stores',
);

console.log('Phase 5F follow-up RPC tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
