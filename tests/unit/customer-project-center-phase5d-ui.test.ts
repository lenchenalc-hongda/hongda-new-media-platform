import fs from 'node:fs';
import {
  formatBusinessDateTime,
  toIsoFromShanghaiDateTime,
} from '../../src/lib/customer-projects/presentation';

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

console.log('\n=== Customer Project Center Phase 5D UI Contract ===');

const workbench = fs.readFileSync('src/app/customer-projects/page.tsx', 'utf8');
const projectDetail = fs.readFileSync(
  'src/app/customer-projects/projects/[id]/page.tsx',
  'utf8',
);
const presentation = fs.readFileSync(
  'src/lib/customer-projects/presentation.ts',
  'utf8',
);

assert(
  workbench.includes("fetch('/api/customer-projects/workbench'")
    && workbench.includes("cache: 'no-store'"),
  'Workbench reads the Phase 5C workbench API without browser cache',
);
assert(
  workbench.includes('我的工作台')
    && workbench.includes('今日工作')
    && workbench.includes('快速记录')
    && workbench.includes('需要关注')
    && workbench.includes('等待 / 检查')
    && workbench.includes('今天的业务摘要'),
  'Workbench renders all approved first-screen sections',
);

const queueIndex = workbench.indexOf('title="今日工作"');
const quickIndex = workbench.indexOf('title="快速记录"');
const attentionIndex = workbench.indexOf('title="需要关注"');
const waitingIndex = workbench.indexOf('title="等待 / 检查"');
const summaryIndex = workbench.indexOf('title="今天的业务摘要"');
assert(
  queueIndex >= 0
    && queueIndex < quickIndex
    && quickIndex < attentionIndex
    && attentionIndex < waitingIndex
    && waitingIndex < summaryIndex,
  'Workbench section order matches Phase 3 composition contract',
);

assert(
  workbench.includes('item.priorityClass')
    && workbench.includes('WORKBENCH_PRIORITY_LABELS')
    && workbench.includes('WORKBENCH_REASON_LABELS'),
  'Workbench displays derived P0-P3 and reason labels',
);
assert(
  workbench.includes('href={"/customer-projects/projects/" + item.projectId}'),
  'Workbench routes Project work into Project Detail',
);
assert(
  !workbench.includes('当前尚未接入项目任务数据。')
    && !workbench.includes('即将开放'),
  'Workbench no longer renders the Phase 1 shell placeholders',
);
assert(
  !/(成交20万|今天8个客户|3个逾期)/.test(workbench),
  'Workbench contains no mock business metrics',
);
for (const forbidden of ['localStorage', 'site_data', '/api/data']) {
  assert(!workbench.includes(forbidden), 'Workbench avoids forbidden source: ' + forbidden);
}

assert(
  projectDetail.includes("fetch(\n        '/api/customer-projects/projects/'")
    && projectDetail.includes("{ cache: 'no-store' }"),
  'Project Detail reads authoritative Project Detail API',
);
assert(
  projectDetail.includes("'/progress'")
    && projectDetail.includes("method: 'POST'"),
  'Project Detail writes progress only through controlled progress API',
);
assert(
  projectDetail.includes('确认并记录进展')
    && projectDetail.includes('只有你点击确认后，才会写入正式项目事实。'),
  'Project progress remains an explicit human confirmation action',
);
assert(
  projectDetail.includes('CONSEQUENTIAL_PROGRESS_EVENTS.has(eventType)')
    && projectDetail.includes('payload.evidence_reference = evidence'),
  'consequential commercial events require evidence in the UI flow',
);
assert(
  projectDetail.includes("'keep' | 'new_action' | 'waiting'")
    && projectDetail.includes('保留当前下一步')
    && projectDetail.includes('设置新下一步')
    && projectDetail.includes('进入等待'),
  'one progress confirmation supports keep/new-action/waiting next-step flow',
);
assert(
  projectDetail.includes('requestBody.nextActionTitle')
    && projectDetail.includes('requestBody.waitingOn')
    && projectDetail.includes('requestBody.nextCheckAt'),
  'progress submit can carry next action or waiting/check in the same command',
);
assert(
  projectDetail.includes('本批 UI 不允许自由输入阶段')
    && !projectDetail.includes('setNewStage'),
  'Phase 5D does not introduce a free-form stage editor',
);
assert(
  projectDetail.includes('项目任务')
    && projectDetail.includes('已确认的项目历史')
    && projectDetail.includes('evidenceReference'),
  'Project Detail exposes current work and meaningful confirmed history',
);
for (const forbidden of ['localStorage', 'site_data', '/api/data', '.from(', '.rpc(']) {
  assert(!projectDetail.includes(forbidden), 'Project Detail avoids direct/legacy data access: ' + forbidden);
}
assert(
  projectDetail.includes('grid-cols-1')
    && projectDetail.includes('sm:flex-row')
    && workbench.includes('grid-cols-1'),
  'Phase 5D uses responsive/mobile-first layout primitives',
);

assert(
  presentation.includes("timeZone: 'Asia/Shanghai'"),
  'business display time uses Asia/Shanghai',
);
assert(
  toIsoFromShanghaiDateTime('2026-10-02T10:30') === '2026-10-02T02:30:00.000Z',
  'datetime-local input is interpreted as Dongguan/Shanghai time',
);
assert(
  toIsoFromShanghaiDateTime('invalid') === null,
  'invalid datetime-local input rejected',
);
assert(
  formatBusinessDateTime('2026-10-02T02:30:00.000Z').includes('10:30'),
  'UTC business timestamp displays in Shanghai time',
);

console.log('Phase 5D UI tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
