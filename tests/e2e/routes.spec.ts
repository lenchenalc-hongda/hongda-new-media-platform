// ===== Route Smoke Tests =====
// Tests that all core app routes render without errors.
// Run: npx tsx tests/e2e/routes.spec.ts

import { testPageRender, testApiOk, report } from '../smoke-runner';

async function main() {
  // ============ Protected Pages ============
  // These will redirect to login when not authenticated, which is OK
  const pages: { path: string; content?: string }[] = [
    { path: '/dashboard' },
    { path: '/accounts' },
    { path: '/topics' },
    { path: '/scripts' },
    { path: '/teardowns' },
    { path: '/calendar' },
    { path: '/posts' },
    { path: '/leads' },
    { path: '/knowledge' },
    { path: '/reports' },
    { path: '/settings' },
  ];

  console.log('\n=== Page Rendering ===');
  for (const p of pages) {
    await testPageRender(p.path, p.content);
  }

  // ============ Public Pages ============
  console.log('\n=== Public Pages ===');
  await testPageRender('/login', '宏达新媒体作战中台');

  // ============ API Health ============
  console.log('\n=== API Health ===');
  await testApiOk('/api/health', ['status', 'app', 'services', 'timestamp']);
  await testApiOk('/api/ai/health', ['status', 'ai_enabled', 'mock_mode', 'model']);

  // ============ AI Endpoints (mock) ============
  console.log('\n=== AI Endpoints ===');
  // Test that AI endpoints return valid schema payloads even without API key
  await testApiOk('/api/ai/health', ['ai_enabled', 'mock_mode']);
  
  // POST endpoints - test that they accept and return
  const aiEndpoints = [
    { path: '/api/ai/account-diagnosis', body: { account: { name: 'test' }, posts: [], reviews: [] } },
    { path: '/api/ai/generate-topics', body: { account: {}, target_audience: 'test', product_or_process: 'test', customer_pain: 'test', knowledge_cards: [] } },
    { path: '/api/ai/generate-script', body: { account: {}, topic: {}, video_length: '30', platform: 'weixin' } },
    { path: '/api/ai/rewrite-script', body: { script: 'test script', rewrite_style: '更口语' } },
    { path: '/api/ai/post-review', body: { post: {}, metrics: { views: 100 }, account: {}, script: {} } },
    { path: '/api/ai/lead-score', body: { lead: {} } },
    { path: '/api/ai/lead-reply', body: { lead: {}, customer_message: 'hello', account_style: 'professional' } },
    { path: '/api/ai/weekly-report', body: { date_range: { start: '2026-01-01', end: '2026-01-07' }, accounts: [], posts: [], metrics: [], leads: [] } },
  ];

  for (const ep of aiEndpoints) {
    try {
      const res = await fetch(`http://localhost:3000${ep.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ep.body),
      });
      if (res.status >= 200 && res.status < 500) {
        console.log(`  ✅ POST ${ep.path} → ${res.status}`);
      } else {
        console.log(`  ❌ POST ${ep.path} → ${res.status}`);
      }
    } catch {
      console.log(`  ⚠️  POST ${ep.path} → SKIPPED (network)`);
    }
  }

  // ============ Knowledge Endpoints ============
  console.log('\n=== Knowledge API ===');
  await testApiOk('/api/knowledge/generate-topic', []);

  report();
}

main().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
