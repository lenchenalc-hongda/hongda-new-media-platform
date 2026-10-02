import {
  parseAiWorkItemProposal,
} from '../../src/lib/customer-projects/ai-drafts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

console.log('\n=== Customer Project Center Phase 6C AI Proposal Parser ===');

const valid = parseAiWorkItemProposal({
  schemaVersion: 1,
  action: 'CREATE_WORK_ITEM',
  workItemType: 'NEXT_ACTION',
  title: '确认客户最终图稿',
  description: '建议明天下午前确认',
  dueAt: '2026-10-03T08:00:00.000Z',
  priority: 'high',
});

assert(valid !== null, 'valid NEXT_ACTION suggestion parses');
assert(valid?.workItemType === 'NEXT_ACTION', 'valid type preserved');
assert(valid?.title === '确认客户最终图稿', 'title preserved');
assert(valid?.priority === 'high', 'priority preserved');

const followUp = parseAiWorkItemProposal({
  schemaVersion: 1,
  action: 'CREATE_WORK_ITEM',
  workItemType: 'FOLLOW_UP',
  title: '下周回访客户新品计划',
  description: null,
  dueAt: null,
  priority: 'medium',
});
assert(followUp !== null, 'valid customer follow-up suggestion parses');

for (const invalid of [
  null,
  [],
  {},
  {
    schemaVersion: 2,
    action: 'CREATE_WORK_ITEM',
    workItemType: 'NEXT_ACTION',
    title: 'x',
    description: null,
    dueAt: null,
    priority: 'medium',
  },
  {
    schemaVersion: 1,
    action: 'UPDATE_PROJECT_OWNER',
    workItemType: 'NEXT_ACTION',
    title: 'x',
    description: null,
    dueAt: null,
    priority: 'medium',
  },
  {
    schemaVersion: 1,
    action: 'CREATE_WORK_ITEM',
    workItemType: 'CUSTOMER_COMMITMENT',
    title: '客户保证下单',
    description: null,
    dueAt: null,
    priority: 'critical',
  },
  {
    schemaVersion: 1,
    action: 'CREATE_WORK_ITEM',
    workItemType: 'NEXT_ACTION',
    title: '',
    description: null,
    dueAt: null,
    priority: 'medium',
  },
  {
    schemaVersion: 1,
    action: 'CREATE_WORK_ITEM',
    workItemType: 'NEXT_ACTION',
    title: 'x',
    description: null,
    dueAt: 'not-a-date',
    priority: 'medium',
  },
  {
    schemaVersion: 1,
    action: 'CREATE_WORK_ITEM',
    workItemType: 'NEXT_ACTION',
    title: 'x',
    description: null,
    dueAt: null,
    priority: 'urgent',
  },
]) {
  assert(parseAiWorkItemProposal(invalid) === null, 'invalid proposal fails closed');
}

console.log('Phase 6C parser tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
