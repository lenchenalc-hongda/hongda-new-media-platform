// ===== Current User Bridge Unit Test =====
import { getCurrentUserFromRequest, hasRole } from '../../src/lib/auth/current-user';

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

console.log('=== Current User Bridge ===');

// 1. No cookie -> null
assert(getCurrentUserFromRequest(makeReq()) === null, 'no cookie -> null');

// 2. Valid cookie -> user
var u = getCurrentUserFromRequest(makeReq(admin));
assert(u !== null && u.role === 'admin', 'valid admin cookie parsed');

// 3. Role check
var viewerUser = getCurrentUserFromRequest(makeReq(viewer));
assert(hasRole(viewerUser, ['admin']) === false, 'viewer not admin');
assert(hasRole(viewerUser, ['viewer']) === true, 'viewer is viewer');
assert(hasRole(null, ['admin']) === false, 'null user no role');

// 4. Malformed cookie -> null
assert(getCurrentUserFromRequest(makeReq('not-json')) === null, 'malformed cookie -> null');

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
