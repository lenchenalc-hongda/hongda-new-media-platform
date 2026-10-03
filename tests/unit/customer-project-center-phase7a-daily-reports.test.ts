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

console.log('\n=== Customer Project Center Phase 7A Daily Report Contract ===');

const path =
  'supabase/migrations/20261003023000_customer_project_center_phase7a_daily_reports.sql';
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

const metrics = functionBlock('cpc_get_daily_report_metrics');
const refresh = functionBlock('cpc_refresh_daily_report_draft');
const submit = functionBlock('cpc_submit_report');

assert(sql.includes('CREATE TABLE public.cpc_reports'), 'cpc_reports table exists');
for (const column of [
  'subject_profile_id UUID NOT NULL',
  'period_type TEXT NOT NULL',
  'period_start DATE NOT NULL',
  'period_end DATE NOT NULL',
  'revision_no INTEGER NOT NULL DEFAULT 1',
  'metrics_schema_version INTEGER NOT NULL DEFAULT 1',
  'deterministic_metrics JSONB NOT NULL',
  'narrative TEXT',
  "unknowns JSONB NOT NULL DEFAULT '[]'::JSONB",
  'source_event_seq BIGINT',
  'source_audit_seq BIGINT',
  'supersedes_report_id UUID',
  'created_by_profile_id UUID NOT NULL',
  'submitted_by_profile_id UUID',
  'submitted_at TIMESTAMPTZ',
  'version INTEGER NOT NULL DEFAULT 1',
]) {
  assert(sql.includes(column), 'report schema contains ' + column);
}

assert(
  sql.includes('CREATE UNIQUE INDEX uq_cpc_reports_active_draft')
    && sql.includes("WHERE status = 'draft'"),
  'only one active draft is allowed per subject/period',
);
assert(
  sql.includes('CREATE UNIQUE INDEX uq_cpc_reports_revision'),
  'report revisions are unique',
);
assert(
  sql.includes('CREATE TRIGGER trg_cpc_reports_immutable_submitted')
    && sql.includes("IF OLD.status = 'submitted'")
    && sql.includes("RAISE EXCEPTION 'submitted CPC report is immutable'"),
  'submitted snapshots are database-immutable',
);
assert(
  sql.includes("IF TG_OP = 'DELETE' THEN")
    && sql.includes("RAISE EXCEPTION 'CPC report deletion is not allowed'"),
  'report snapshots cannot be deleted',
);

assert(
  sql.includes('ALTER TABLE public.cpc_reports ENABLE ROW LEVEL SECURITY')
    && sql.includes('CREATE POLICY "cpc_reports_select"')
    && sql.includes('public.cpc_can_read_report(id, org_id)'),
  'reports are protected by RLS',
);
assert(
  sql.includes('GRANT SELECT ON TABLE public.cpc_reports TO authenticated')
    && !/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE\s+public\.cpc_reports\s+TO\s+authenticated/i.test(executable),
  'authenticated users receive report SELECT only',
);
assert(
  sql.includes("r.subject_profile_id = v_actor_profile_id"),
  'sales report read is restricted to own subject',
);

assert(metrics.length > 0, 'deterministic daily metrics RPC exists');
assert(
  metrics.includes("(NOW() AT TIME ZONE 'Asia/Shanghai')::DATE")
    && metrics.includes("'INVALID_REPORT_PERIOD'")
    && metrics.includes('历史请读取已提交快照'),
  'live metrics are restricted to the current Shanghai business day',
);
assert(
  metrics.includes("'effectiveProgressCount'")
    && metrics.includes("'meaningfulChangeCount'")
    && metrics.includes("'nextActionCompletedCount'")
    && metrics.includes("'customerCommitmentCompletedCount'")
    && metrics.includes("'customerFollowUpCompletedCount'"),
  'daily metrics cover substantive progress and work outcomes',
);
assert(
  metrics.includes("'activeProjectMissingNextStepCount'")
    && metrics.includes("'blockedOpenWorkItemCount'")
    && metrics.includes("'openManagementDecisionCount'"),
  'daily metrics include end-of-day exceptions',
);
assert(
  metrics.includes("'state', 'known'")
    && metrics.includes("'unknowns', '[]'::JSONB"),
  'deterministic metric values use known/unknown semantics',
);
for (const forbidden of ['message_count', 'click_count', 'note_count']) {
  assert(!metrics.includes(forbidden), 'report metrics exclude surveillance KPI: ' + forbidden);
}

assert(refresh.length > 0, 'same-day report draft refresh RPC exists');
assert(
  refresh.includes('v_snapshot := public.cpc_get_daily_report_metrics(p_period_date)')
    && !refresh.includes('p_deterministic_metrics'),
  'client cannot provide report numbers; refresh computes them inside SQL',
);
assert(
  refresh.includes("'REPORT_DRAFT_CREATED'")
    && refresh.includes("'REPORT_DRAFT_REFRESHED'"),
  'draft creation/refresh is audited',
);
assert(
  refresh.includes("r.status = 'submitted'")
    && refresh.includes('日报已提交；Phase 7A 不允许原地重建'),
  'submitted same-day snapshot blocks silent draft recreation until correction flow exists',
);
assert(
  refresh.includes("status = 'draft'")
    && !refresh.includes("status = 'submitted'"),
  'refresh never silently submits report',
);

assert(submit.length > 0, 'report submit RPC exists');
assert(
  submit.includes('v_report.subject_profile_id <> v_actor_profile_id')
    && submit.includes('只能确认提交自己的日报'),
  'only the report subject may submit their report',
);
assert(
  submit.includes('p_expected_version <> v_report.version'),
  'report submit uses optimistic concurrency',
);
assert(
  submit.includes("SET status = 'submitted'")
    && submit.includes("'REPORT_SUBMITTED'"),
  'submit explicitly freezes the snapshot and audits it',
);
assert(
  !submit.includes('deterministic_metrics =')
    && !submit.includes('narrative ='),
  'submit does not rewrite report content while changing state',
);

assert(
  !executable.includes('DISABLE ROW LEVEL SECURITY')
    && !executable.includes('DROP TABLE')
    && !executable.includes('TRUNCATE'),
  'Phase 7A migration is non-destructive and keeps RLS enabled',
);
assert(
  !executable.includes('cpc_orders')
    && !executable.includes('cpc_payments')
    && !executable.includes('cpc_customer_ownership'),
  'Phase 7A does not duplicate external business SoTs',
);

console.log('Phase 7A daily report tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
