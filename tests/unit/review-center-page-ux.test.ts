// ===== Review Center page UX regression tests =====
import fs from 'node:fs';
import { PORTAL_GROUPS } from '../../src/lib/constants/navigation';

var passed = 0;
var failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

console.log('=== Review Center Page UX ===');

const newPage = fs.readFileSync('src/app/review-center/new/page.tsx', 'utf8');
assert(!newPage.includes("useState('A')"), 'new review does not default review type to A');
assert(newPage.includes('请选择复盘类型'), 'new review asks user to choose type');
assert(newPage.includes('保存草稿需填写复盘类型和标题'), 'draft requirement helper visible');

const actionsPage = fs.readFileSync('src/app/review-center/actions/page.tsx', 'utf8');
assert(actionsPage.includes('查看全部复盘'), 'actions empty CTA points to all reviews');
assert(actionsPage.includes('改善任务需在具体复盘中创建'), 'actions empty description accurate');

const mineWorkspace = fs.readFileSync('src/components/review-center/ReviewListWorkspace.tsx', 'utf8');
assert(mineWorkspace.includes('你创建、负责或参与的项目复盘将在这里集中管理。'), 'mine empty description matches page scope');

const approvalsPage = fs.readFileSync('src/app/review-center/approvals/page.tsx', 'utf8');
assert(approvalsPage.includes('当前没有需要你处理的审核事项。'), 'approvals empty description is not misleading');

const reviewItems = PORTAL_GROUPS.find(g => g.id === 'review')!.items;
const settingsItem = reviewItems.find(item => item.path === '/review-center/settings');
assert(settingsItem?.disabled === true, 'settings nav is disabled placeholder');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
