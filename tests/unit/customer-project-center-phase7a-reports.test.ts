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

console.log('\n=== Customer Project Center Phase 7A Report Persistence Contract ===');

const path =
  'supabase/migrations/20261002090000_customer_project_center_phase7a_reports.sql';
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

const buildMetrics = functionBlock('cpc_build_daily_report_metrics');
const generateDraft = functionBlock('cpc_generate_daily_report_draft');
const submitReport = functionBlock('cpc_submit_report');
const createCorrection = functionBlock('cpc_create_report_correction');

assert(sql.includes('CREATE TABLE public.cpc_reports'), 'cpc_reports table exists');
for (const column of [
  'subject_profile_id UUID NOT NULL',
  'period_type TEXT NOT NULL',
  'period_start DATE NOT NULL',
  'period_end DATE NOT NULL',
  'revision_no INTEGER NOT NULL',
  'metrics_schema_version INTEGER NOT NULL',
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
  sql.includes('CREATE UNIQUE INDEX uq_cpc_report_revision'),
  'report revisions are unique per subject/period',
);
assert(
  sql.includes('CREATE UNIQUE INDEX uq_cpc_report_active_draft')
    && sql.includes("WHERE status = 'draft'"),
  'only one active draft exists per subject/period',
);
assert(
  sql.includes('trg_cpc_reports_submitted_immutable')
    && sql.includes("IF OLD.status = 'submitted'")
    && sql.includes('submitted CPC report snapshots are immutable'),
  'submitted report rows are strongly immutable',
);

assert(
  sql.includes('ALTER TABLE public.cpc_reports ENABLE ROW LEVEL SECURITY')
    && sql.includes('CREATE POLICY "cpc_reports_select"')
    && sql.includes('public.cpc_can_read_report(id, org_id)'),
  'cpc_reports is protected by RLS',
);
assert(
  sql.includes("public.auth_has_role('admin')")
    && sql.includes("public.auth_has_role('manager')")
    && sql.includes('r.subject_profile_id = v_actor_profile_id'),
  'report read policy supports management read and personal sales read',
);
assert(
  sql.includes('REVOKE ALL ON TABLE public.cpc_reports')
    && sql.includes('GRANT SELECT ON TABLE public.cpc_reports TO authenticated'),
  'authenticated clients receive report SELECT only',
);
assert(
  !/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE\s+public\.cpc_reports\s+TO\s+authenticated/i.test(executable),
  'direct authenticated report DML is not granted',
);

assert(buildMetrics.length > 0, 'deterministic daily metric builder exists');
assert(
  buildMetrics.includes("AT TIME ZONE 'Asia/Shanghai'"),
  'daily metric window uses Asia/Shanghai business date',
);
for (const metric of [
  'meaningfulProgressCount',
  'stageLifecycleWaitingChangeCount',
  'projectCreatedCount',
  'projectWonCount',
  'projectLostCount',
  'nextActionCreatedCount',
  'nextActionCompletedCount',
  'nextActionRescheduledCount',
  'customerCommitmentDueCount',
  'customerCommitmentCompletedCount',
  'customerCommitmentOverdueEndCount',
  'internalCollaborationCompletedCount',
  'managementDecisionCompletedCount',
  'oldCustomerFollowUpCount',
  'quoteSentCount',
  'sampleSentCount',
  'customerCommercialConfirmedCount',
  'orderConfirmedCount',
]) {
  assert(buildMetrics.includes("'" + metric + "'"), 'metric builder includes ' + metric);
}
assert(
  buildMetrics.includes("e.payload -> 'relationship_follow_up' = 'true'::JSONB"),
  'old-customer follow-up metric uses safe boolean JSON matching',
);
assert(
  buildMetrics.includes("a.action = 'WORK_ITEM_RESCHEDULED'")
    && buildMetrics.includes("a.metadata ->> 'work_item_type' = 'NEXT_ACTION'"),
  'next-action reschedule metric derives from audited reschedule facts',
);
assert(
  buildMetrics.includes('wi.due_at < v_end')
    && buildMetrics.includes('wi.completed_at IS NULL OR wi.completed_at >= v_end')
    && buildMetrics.includes('wi.cancelled_at IS NULL OR wi.cancelled_at >= v_end'),
  'commitment overdue-at-day-end is reconstructable from due/terminal timestamps',
);

for (const forbiddenSource of [
  'cpc_orders',
  'cpc_payments',
  'cpc_receipts',
  'cpc_quotes',
  'expected_amount_minor',
]) {
  assert(
    !buildMetrics.includes(forbiddenSource),
    'missing external/non-confirmed source is not fabricated into report metric: ' + forbiddenSource,
  );
}

assert(generateDraft.length > 0, 'daily draft generation RPC exists');
assert(
  generateDraft.includes("p_business_date > v_today")
    && generateDraft.includes("cpc_rpc_error('INVALID_INPUT'"),
  'future daily reports are rejected',
);
assert(
  generateDraft.includes('public.cpc_build_daily_report_metrics(')
    && generateDraft.includes('MAX(e.event_seq)')
    && generateDraft.includes('MAX(a.audit_seq)'),
  'daily draft freezes deterministic metrics and source cursors',
);
assert(
  generateDraft.includes("r.status = 'draft'")
    && generateDraft.includes('SET deterministic_metrics = v_metrics')
    && generateDraft.includes('version = r.version + 1'),
  'existing draft refreshes in place with version increment',
);
assert(
  generateDraft.includes("'REPORT_ALREADY_SUBMITTED'")
    && !generateDraft.includes("SET status = 'draft'"),
  'submitted daily report cannot be silently reopened by generation',
);
assert(
  generateDraft.includes("'REPORT_DRAFT_GENERATED'")
    && generateDraft.includes("'REPORT_DRAFT_REFRESHED'"),
  'draft generation/refresh is auditable',
);
assert(
  generateDraft.includes('FROM public.profiles p')
    && generateDraft.includes('FOR UPDATE'),
  'personal report generation serializes per subject to prevent duplicate drafts',
);

assert(submitReport.length > 0, 'report submit RPC exists');
assert(
  submitReport.includes('r.subject_profile_id = v_actor_profile_id')
    && submitReport.includes("v_report.status <> 'draft'")
    && submitReport.includes('p_expected_version <> v_report.version'),
  'only report subject can submit a current draft version',
);
assert(
  submitReport.includes("SET status = 'submitted'")
    && submitReport.includes('submitted_by_profile_id = v_actor_profile_id')
    && submitReport.includes("'REPORT_SUBMITTED'"),
  'submission creates immutable submitted state with strong audit',
);

assert(createCorrection.length > 0, 'report correction RPC exists');
assert(
  createCorrection.includes("v_report.status <> 'submitted'")
    && createCorrection.includes('p_expected_version <> v_report.version')
    && createCorrection.includes("'REASON_REQUIRED'"),
  'correction requires submitted source, current version and human reason',
);
assert(
  createCorrection.includes('r.revision_no > v_report.revision_no')
    && createCorrection.includes('只能从最新提交版本创建更正版'),
  'correction cannot branch from an older submitted revision',
);
assert(
  createCorrection.includes('supersedes_report_id')
    && createCorrection.includes('v_report.id')
    && createCorrection.includes("'REPORT_CORRECTION_CREATED'"),
  'correction creates new draft revision linked to submitted snapshot',
);
assert(
  !createCorrection.includes('UPDATE public.cpc_reports r\n    SET deterministic_metrics'),
  'correction never rewrites submitted source snapshot',
);

for (const fn of [
  'cpc_generate_daily_report_draft(DATE, UUID)',
  'cpc_submit_report(UUID, INTEGER, UUID)',
  'cpc_create_report_correction(UUID, INTEGER, TEXT, UUID)',
]) {
  assert(
    sql.includes('GRANT EXECUTE ON FUNCTION public.' + fn)
      && sql.includes('TO authenticated'),
    'narrow report RPC is explicitly granted: ' + fn,
  );
}
assert(
  sql.includes('REVOKE ALL ON FUNCTION public.cpc_build_daily_report_metrics')
    && !sql.includes('GRANT EXECUTE ON FUNCTION public.cpc_build_daily_report_metrics'),
  'internal metric builder is not callable directly by authenticated clients',
);

assert(
  !executable.includes('DISABLE ROW LEVEL SECURITY')
    && !executable.includes('DROP TABLE')
    && !executable.includes('TRUNCATE'),
  'Phase 7A migration is non-destructive and does not weaken RLS',
);

console.log('Phase 7A report persistence tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
