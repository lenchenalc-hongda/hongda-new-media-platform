// ===== Current User Bridge Unit Test =====
import { getCurrentUserFromRequest, hasRole } from '../../src/lib/auth/current-user';

process.env.AUTH_MODE = 'mock';

var passed = 0;
var failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

function makeReq(cookieValue?: string): any {
  return {
    cookies: {
      get: (name: string) => name === 'nmc_user' && cookieValue ? { value: cookieValue } : undefined,
    },
  };
}

var admin = encodeURIComponent(JSON.stringify({ id: 'u_admin', full_name: '管理员', email: 'a@h.com', role: 'admin', org_id: 'org_001' }));
var viewer = encodeURIComponent(JSON.stringify({ id: 'u_vwr', full_name: '查看者', email: 'v@h.com', role: 'viewer', org_id: 'org_001' }));

console.log('=== Current User Bridge (mock mode) ===');

async function main() {
  // 1. No cookie -> null
  assert((await getCurrentUserFromRequest(makeReq())) === null, 'no cookie -> null');

  // 2. Valid cookie -> user with authSource=mock
  var u = await getCurrentUserFromRequest(makeReq(admin));
  assert(u !== null && u.role === 'admin', 'valid admin cookie parsed');
  assert(u !== null && u.authSource === 'mock', 'authSource=mock in mock mode');

  // 3. Role check
  var viewerUser = await getCurrentUserFromRequest(makeReq(viewer));
  assert(hasRole(viewerUser, ['admin']) === false, 'viewer not admin');
  assert(hasRole(viewerUser, ['viewer']) === true, 'viewer is viewer');
  assert(hasRole(null, ['admin']) === false, 'null user no role');

  // 4. Malformed cookie -> null
  assert((await getCurrentUserFromRequest(makeReq('not-json'))) === null, 'malformed cookie -> null');

  console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
}

main();
