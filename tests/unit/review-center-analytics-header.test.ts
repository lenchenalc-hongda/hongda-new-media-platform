// ===== Review Center analytics duplicate header regression test =====
import fs from 'node:fs';

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

console.log('=== Review Center Analytics Header ===');

const page = fs.readFileSync('src/app/review-center/analytics/page.tsx', 'utf8');
const section = fs.readFileSync('src/app/review-center/analytics/analytics-section.tsx', 'utf8');
const combined = page + '\n' + section;

const matches = combined.match(/查看复盘流转、改善行动和验证周期的历史变化/g) || [];
assert(matches.length === 1, 'analytics subtitle rendered exactly once');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
