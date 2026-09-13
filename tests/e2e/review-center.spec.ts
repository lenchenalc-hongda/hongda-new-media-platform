// ===== Review Center Route Smoke Tests =====
// Run: npx tsx tests/e2e/review-center.spec.ts
import { testPageRender, report } from '../smoke-runner';

async function main() {
  console.log('\n=== Review Center Routes ===');

  const pages = [
    { path: '/review-center', content: '项目复盘与改善中心' },
    { path: '/review-center/new', content: '新建项目复盘' },
    { path: '/review-center/reviews' },
    { path: '/review-center/reviews/mine' },
    { path: '/review-center/approvals' },
    { path: '/review-center/actions' },
    { path: '/review-center/actions/overdue' },
    { path: '/review-center/actions/verification' },
    { path: '/review-center/analytics' },
    { path: '/review-center/analytics/projects' },
    { path: '/review-center/analytics/people' },
    { path: '/review-center/analytics/issues' },
    { path: '/review-center/analytics/customers' },
    { path: '/review-center/analytics/losses' },
    { path: '/review-center/cases' },
    { path: '/review-center/cases/repeated' },
    { path: '/review-center/knowledge' },
    { path: '/review-center/downloads' },
    { path: '/review-center/settings' },
  ];

  for (const p of pages) {
    await testPageRender(p.path, p.content);
  }

  report();
}

main().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
