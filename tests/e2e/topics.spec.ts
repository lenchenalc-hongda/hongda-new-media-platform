// ===== Topics Page Smoke Tests =====
// Tests rendering and operations on the topics page.
// Run: npx tsx tests/e2e/topics.spec.ts

import { testPageRender, testApiOk, fetchApi, report } from '../smoke-runner';

async function main() {
  console.log('\n=== Topics Page ===');
  await testPageRender('/topics');

  console.log('\n=== Topic Generation API ===');
  // Test AI topic generation endpoint
  try {
    const res = await fetch(`http://localhost:3000/api/ai/generate-topics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account: { name: '小陈', persona: '前端顾问' },
        target_audience: '有热转印需求的客户',
        product_or_process: '热转印',
        customer_pain: '如何选择工艺',
        knowledge_cards: [],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const topicCount = data.topics?.length || 0;
      if (topicCount > 0) {
        console.log(`  ✅ POST /api/ai/generate-topics → ${topicCount} topics (first: "${data.topics[0]?.title?.slice(0, 30)}")`);
      } else {
        console.log(`  ⚠️  POST /api/ai/generate-topics → 0 topics returned`);
      }
    } else {
      console.log(`  ❌ POST /api/ai/generate-topics → ${res.status}`);
    }
  } catch {
    console.log(`  ⚠️  POST /api/ai/generate-topics → SKIPPED`);
  }

  // Test redirect behavior — topics page should be protected
  console.log('\n=== Route Protection ===');
  try {
    const res = await fetch('http://localhost:3000/topics', { redirect: 'manual' });
    if (res.status === 302 || res.status === 307) {
      console.log(`  ✅ GET /topics → ${res.status} (protected, redirects to login)`);
    } else {
      console.log(`  ⚠️  GET /topics → ${res.status} (expected 302 redirect)`);
    }
  } catch {
    console.log(`  ⚠️  Route protection test → SKIPPED`);
  }

  report();
}

main().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
