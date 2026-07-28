// ===== V5.6 Account Selection Guard Tests =====
// Tests requireSelectedAccount runtime protection
import { requireSelectedAccount } from '../../src/lib/api/script-ai-client';
import { MOCK_ACCOUNTS_V2 } from '../../src/lib/accounts/examples/xuzong.account';

var passed = 0;
var failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

console.log('\n=== Account Guard Tests ===');

// 1. undefined account throws
try { requireSelectedAccount(undefined); assert(false, 'undefined should throw'); }
catch (e: any) { assert(e.message.includes('选择账号'), 'undefined error: ' + e.message); }

// 2. null account throws
try { requireSelectedAccount(null as any); assert(false, 'null should throw'); }
catch (e: any) { assert(e.message.includes('选择账号'), 'null error: ' + e.message); }

// 3. active account passes
var a4 = MOCK_ACCOUNTS_V2.find(function(a) { return a.id === 'a4'; });
var guarded = requireSelectedAccount(a4);
assert(guarded.id === 'a4', 'active account passes');

// 4. inactive account throws
var inactiveAccount = { ...a4!, status: 'inactive' as const, name: 'test-inactive' };
try { requireSelectedAccount(inactiveAccount as any); assert(false, 'inactive should throw'); }
catch (e: any) { assert(e.message.includes('停用'), 'inactive error: ' + e.message); }

// 5. All 5 V2 accounts pass guard
var ids = ['a1', 'a2', 'a3', 'a4', 'a5'];
for (var i = 0; i < ids.length; i++) {
  var acct = MOCK_ACCOUNTS_V2.find(function(a) { return a.id === ids[i]; });
  var g = requireSelectedAccount(acct);
  assert(g.id === ids[i], ids[i] + ' passes guard');
}

// 6. All 5 have persona_version
for (var j = 0; j < MOCK_ACCOUNTS_V2.length; j++) {
  assert(typeof MOCK_ACCOUNTS_V2[j].persona_version === 'string' && MOCK_ACCOUNTS_V2[j].persona_version.length > 0,
    MOCK_ACCOUNTS_V2[j].id + ' has persona_version');
}

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
