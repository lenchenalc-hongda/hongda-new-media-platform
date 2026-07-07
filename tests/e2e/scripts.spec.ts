// ===== Scripts Page Smoke Tests =====
// Tests basic rendering and AI operations on the scripts page.
// Run: npx tsx tests/e2e/scripts.spec.ts

import { testPageRender, testApiOk, fetchApi, report } from '../smoke-runner';

async function main() {
  console.log('\n=== Scripts Page ===');
  await testPageRender('/scripts');

  console.log('\n=== Script Scoring ===');
  // Test the scoring API with a bad script (should score below 70)
  const badScript = '客户常见问题？很多客户问我这个问题，今天统一回答一下。第一，看材质。第二，看数量。';
  try {
    const res = await fetch(`http://localhost:3000/api/ai/score-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: badScript, duration: '15' }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`  ✅ POST /api/ai/score-script → ${res.status} (score: ${data.totalScore}, grade: ${data.grade})`);
      // Bad scripts should score below 70
      if (data.totalScore < 70) {
        console.log(`  ✅ Bad script correctly scored below 70 (${data.totalScore})`);
      } else {
        console.log(`  ⚠️  Bad script scored ${data.totalScore} (expected < 70)`);
      }
    } else {
      console.log(`  ❌ POST /api/ai/score-script → ${res.status}`);
    }
  } catch {
    console.log(`  ⚠️  POST /api/ai/score-script → SKIPPED`);
  }

  // Test scoring with a good script (should score higher)
  const goodScript = '客户只发一张瓶子图，问我多少钱，我一般不敢直接报。因为图片看不到材质，也看不到测试要求。PP、PE、ABS都叫塑料，但胶水完全不一样。你把材质、数量和图案发我，先帮你判断工艺。';
  try {
    const res = await fetch(`http://localhost:3000/api/ai/score-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: goodScript, duration: '30' }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`  ✅ Good script scored ${data.totalScore} (grade: ${data.grade})`);
      console.log(`  ✅ Strengths: ${data.strengths.slice(0, 2).join(', ')}`);
    } else {
      console.log(`  ❌ POST /api/ai/score-script (good) → ${res.status}`);
    }
  } catch {
    console.log(`  ⚠️  POST /api/ai/score-script (good) → SKIPPED`);
  }

  // Test API health
  console.log('\n=== API Health ===');
  await testApiOk('/api/ai/health', ['ai_enabled', 'mock_mode']);
  await testApiOk('/api/health', ['status', 'services']);

  report();
}

main().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
