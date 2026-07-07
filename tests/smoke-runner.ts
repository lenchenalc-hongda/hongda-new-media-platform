// ===== Smoke Test Runner =====
// Minimal test framework for route checks.
// Each test registers a name and assertion callback; runner aggregates results.
// Usage: npx tsx tests/smoke-runner.ts

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
let passed = 0;
let failed = 0;
const failures: string[] = [];

export async function fetchPage(path: string): Promise<{ status: number; text: string; ok: boolean }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, { redirect: 'manual' });
    const text = await res.text();
    return { status: res.status, text, ok: res.status === 200 };
  } catch (err: any) {
    return { status: 0, text: err.message, ok: false };
  }
}

export async function fetchApi(path: string): Promise<{ status: number; data: any; ok: boolean }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`);
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { status: res.status, data, ok: res.status >= 200 && res.status < 500 };
  } catch (err: any) {
    return { status: 0, data: { error: err.message }, ok: false };
  }
}

// Each page test: hit the route and check basic rendering
export async function testPageRender(path: string, expectedContent?: string): Promise<boolean> {
  const result = await fetchPage(path);
  if (result.status === 0) {
    fail(`GET ${path} → NETWORK ERROR: ${result.text}`);
    return false;
  }
  if (result.status === 302 || result.status === 307) {
    // Redirect to login — acceptable for protected routes without auth
    const location = result.text.match(/Location: ([^\n]+)/)?.[1] || '';
    if (location?.includes('login')) {
      pass(`GET ${path} → ${result.status} (redirect to login)`);
      return true;
    }
    fail(`GET ${path} → ${result.status} (unexpected redirect)`);
    return false;
  }
  if (result.status === 200) {
    pass(`GET ${path} → 200 OK`);
    if (expectedContent && !result.text.includes(expectedContent)) {
      fail(`GET ${path} → expected "${expectedContent}" in body`);
      return false;
    }
    return true;
  }
  fail(`GET ${path} → ${result.status}`);
  return false;
}

export async function testApiOk(path: string, expectedKeys?: string[]): Promise<boolean> {
  const result = await fetchApi(path);
  if (result.status === 0) {
    fail(`GET ${path} → NETWORK ERROR`);
    return false;
  }
  if (result.status >= 200 && result.status < 500) {
    pass(`GET ${path} → ${result.status} JSON OK`);
    if (expectedKeys && result.data) {
      for (const key of expectedKeys) {
        if (!(key in result.data)) {
          fail(`GET ${path} → missing key "${key}" in response`);
          return false;
        }
      }
    }
    return true;
  }
  fail(`GET ${path} → ${result.status}`);
  return false;
}

function pass(msg: string) { passed++; }
function fail(msg: string) { failed++; failures.push(msg); }

export function report() {
  console.log(`\n===== SMOKE TEST RESULTS =====`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  if (failures.length > 0) {
    console.log(`\nFailures:`);
    failures.forEach(f => console.log(`  ❌ ${f}`));
  }
  console.log(`===============================\n`);
  process.exit(failed > 0 ? 1 : 0);
}
