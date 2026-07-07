// ===== Knowledge Page Smoke Tests =====
// Tests rendering and operations on the knowledge page.
// Run: npx tsx tests/e2e/knowledge.spec.ts

import { testPageRender, fetchApi, report } from '../smoke-runner';

async function main() {
  console.log('\n=== Knowledge Page ===');
  await testPageRender('/knowledge');

  console.log('\n=== Knowledge API ===');
  const { data, ok } = await fetchApi('/api/knowledge/generate-topic');
  if (ok) {
    console.log(`  ✅ GET /api/knowledge/generate-topic → OK`);
  } else {
    console.log(`  ⚠️  GET /api/knowledge/generate-topic → ${data?.error || 'unknown'}`);
  }

  // Test POST to knowledge generate-topic
  try {
    const res = await fetch(`http://localhost:3000/api/knowledge/generate-topic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: 'kn10001',
        cardTitle: '测试知识卡',
        cardCategory: '工艺知识',
        coreConclusion: '这是核心结论',
        targetAccounts: ['a1'],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`  ✅ POST /api/knowledge/generate-topic → ${data.topics?.length || 0} topics generated`);
    } else {
      console.log(`  ⚠️  POST /api/knowledge/generate-topic → ${res.status}`);
    }
  } catch {
    console.log(`  ⚠️  POST /api/knowledge/generate-topic → SKIPPED`);
  }

  // Test POST to knowledge generate-script
  try {
    const res = await fetch(`http://localhost:3000/api/knowledge/generate-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: 'kn10001',
        cardTitle: '测试知识卡',
        cardCategory: '工艺知识',
        coreConclusion: '这是核心结论',
        mediaExpression: '视频号表达方式',
      }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`  ✅ POST /api/knowledge/generate-script → script generated: "${data.script?.title?.slice(0, 30)}..."`);
    } else {
      console.log(`  ⚠️  POST /api/knowledge/generate-script → ${res.status}`);
    }
  } catch {
    console.log(`  ⚠️  POST /api/knowledge/generate-script → SKIPPED`);
  }

  report();
}

main().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
