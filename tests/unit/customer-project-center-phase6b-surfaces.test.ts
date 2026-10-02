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

console.log('\n=== Customer Project Center Phase 6B Surface Contract ===');

const readModels = fs.readFileSync('src/lib/customer-projects/read-models.ts', 'utf8');
const workbench = fs.readFileSync('src/app/customer-projects/page.tsx', 'utf8');
const tasks = fs.readFileSync('src/app/customer-projects/tasks/page.tsx', 'utf8');
const rescheduleRoute = fs.readFileSync(
  'src/app/api/customer-projects/work-items/[id]/reschedule/route.ts',
  'utf8',
);
const api = fs.readFileSync('src/lib/customer-projects/api.ts', 'utf8');

assert(
  readModels.includes('export interface WorkbenchReminderItem')
    && readModels.includes("source: 'work_item' | 'waiting_check'")
    && readModels.includes("state: 'overdue' | 'due_now'"),
  'Workbench snapshot exposes formal reminder projection types',
);
assert(
  readModels.includes("const occurrenceKey = 'work_item:' + item.id + ':' + item.due_at")
    && readModels.includes("const occurrenceKey = 'waiting_check:' + project.id + ':' + project.next_check_at")
    && readModels.includes('reminderKeys.has(occurrenceKey)'),
  'reminder occurrence identity derives from source + effective time and is deduplicated',
);
assert(
  readModels.includes('effectiveMs <= nowMs')
    && readModels.includes("state: effectiveMs < startMs ? 'overdue' : 'due_now'"),
  'formal reminders do not use an unapproved due-soon window',
);
assert(
  readModels.includes("if (item.work_item_type === 'INTERNAL_COLLABORATION') return 'P1'")
    && readModels.includes("item.work_item_type === 'FOLLOW_UP' && item.project_id === null"),
  'approved formal reminder source types include collaboration and customer-level follow-up',
);
assert(
  !readModels.includes("item.work_item_type === 'PROJECT_EXCEPTION'"),
  'project hygiene exception is not fabricated as a formal obligation type',
);

assert(
  workbench.includes('title="正式提醒"')
    && workbench.includes('AI 建议不会在这里被算成逾期')
    && workbench.includes('snapshot.summary.formalReminderCount'),
  'Workbench clearly separates formal reminder counts from AI suggestions',
);
assert(
  workbench.includes('snapshot.reminders.find')
    && !workbench.includes('snapshot.reminders.map'),
  'Workbench tags existing Today rows instead of rendering a duplicate reminder task list',
);
assert(
  workbench.includes("reminder.state === 'overdue' ? '已逾期' : '已到时间'")
    && workbench.includes('受阻但未自动延期'),
  'Today rows distinguish overdue/due-now and blocked does not imply deadline waiver',
);

assert(
  rescheduleRoute.includes("runCpcMutation(req, params, 'RESCHEDULE_WORK_ITEM')")
    && !rescheduleRoute.includes('.from(')
    && !rescheduleRoute.includes('.rpc('),
  'reschedule HTTP route delegates only to shared controlled mutation layer',
);
assert(
  api.includes("| 'RESCHEDULE_WORK_ITEM'")
    && api.includes("supabase.rpc('cpc_reschedule_work_item'")
    && api.includes('p_expected_version: body.expectedVersion')
    && api.includes('p_reason: body.reason'),
  'shared API layer validates/maps controlled reschedule RPC',
);

assert(
  tasks.includes("'/reschedule'")
    && tasks.includes('toIsoFromShanghaiDateTime(rescheduleDueAt)')
    && tasks.includes('改期必须填写原因')
    && tasks.includes('旧时间和原因会保留在审计历史中'),
  'My Tasks exposes explicit reasoned reschedule instead of silent due-date overwrite',
);
assert(
  tasks.includes('受阻状态不会因为改期自动清除'),
  'reschedule UI preserves blocked-vs-deadline distinction',
);

for (const source of [workbench, tasks]) {
  for (const forbidden of ['localStorage', 'site_data', '/api/data', '.from(', '.rpc(']) {
    assert(!source.includes(forbidden), 'Phase 6B client avoids direct/legacy data path: ' + forbidden);
  }
}

console.log('Phase 6B surface tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
