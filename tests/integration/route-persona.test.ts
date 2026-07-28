// ===== V5.3 Route-Level Persona Integration Tests =====
// Tests that each route resolves account, builds persona context, and uses correct task.
// Run: npx tsx tests/integration/route-persona.test.ts

import { resolveAccountGenerationContext, buildPersonaContextForTask } from '../../src/lib/ai/account-resolver';
import { isPersonaV2Enabled, isPersonaReviewEnabled, isAutoRepairEnabled } from '../../src/lib/ai/feature-flags';

var passed = 0;
var failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

function assertIncludes(text: string, search: string, msg: string) {
  if (text.includes(search)) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

function assertNotIncludes(text: string, search: string, msg: string) {
  if (!text.includes(search)) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

console.log('\n========== V5.3 Route Persona Integration Tests ==========');

// ===== 1. Unified account resolver =====
console.log('\n=== 1. Account Resolver tests ===');

// Valid account_id
var resolved = resolveAccountGenerationContext({ account_id: 'a4' });
assert(resolved.account.id === 'a4', '解析许总账号');
assert(resolved.source === 'repository', '来源为 repository');

// Invalid account_id
try {
  resolveAccountGenerationContext({ account_id: 'nonexistent' });
  assert(false, '无效账号应抛出错误');
} catch (e: any) {
  assert(e.message.includes('不存在'), '无效账号错误消息正确');
}

// account_version mismatch
var versioned = resolveAccountGenerationContext({ account_id: 'a4', account_version: '0.0.1' });
assert(versioned.version_mismatch === true, '版本不匹配被检测');

// No account_id
try {
  resolveAccountGenerationContext({});
  assert(false, '无 account_id 应抛出错误');
} catch (e: any) {
  assert(true, '无 account_id 错误正确');
}

// ===== 2. Task-specific persona contexts =====
console.log('\n=== 2. Task-specific Persona Context tests ===');

var resolved2 = resolveAccountGenerationContext({ account_id: 'a4' });

var anglesCtx = buildPersonaContextForTask(resolved2, 'angles');
var hooksCtx = buildPersonaContextForTask(resolved2, 'hooks');
var draftCtx = buildPersonaContextForTask(resolved2, 'draft');
var rewriteCtx = buildPersonaContextForTask(resolved2, 'rewrite');
var reviewCtx = buildPersonaContextForTask(resolved2, 'review');

// Each task context is different
assert(anglesCtx.task === 'angles', 'angles任务正确');
assert(hooksCtx.task === 'hooks', 'hooks任务正确');
assert(draftCtx.task === 'draft', 'draft任务正确');
assert(rewriteCtx.task === 'rewrite', 'rewrite任务正确');
assert(reviewCtx.task === 'review', 'review任务正确');

// Each task produces different prompt_text
assert(anglesCtx.prompt_text !== hooksCtx.prompt_text, 'angles和hooksPrompt不同');
assert(hooksCtx.prompt_text !== draftCtx.prompt_text, 'hooks和draftPrompt不同');
assert(draftCtx.prompt_text !== reviewCtx.prompt_text, 'draft和reviewPrompt不同');

// Hooks should NOT contain full 7 contracts
assertIncludes(hooksCtx.prompt_text, 'hooks', 'hooks含hooks指令');
assertIncludes(hooksCtx.identity_contract, '【账号身份】', 'hooks含身份');
assertIncludes(hooksCtx.style_contract, '【说话方式】', 'hooks含风格');

// Draft should contain all contracts
assertIncludes(draftCtx.identity_contract, '【账号身份】', 'draft含身份');
assertIncludes(draftCtx.brand_contract, '【品牌边界】', 'draft含品牌');
assertIncludes(draftCtx.knowledge_contract, '【知识与合规边界】', 'draft含知识');

// Review must include forbidden_claims
assertIncludes(reviewCtx.brand_contract, '宏达自主研发该设备', 'review含forbidden_claim');

// ===== 3. Feature flags =====
console.log('\n=== 3. Feature Flag tests ===');

assert(isPersonaV2Enabled() === true, 'PERSONA_V2_ENABLED 默认 true');
assert(isPersonaReviewEnabled() === true, 'PERSONA_V2_REVIEW_ENABLED 默认 true');
assert(isAutoRepairEnabled() === true, 'PERSONA_V2_AUTO_REPAIR_ENABLED 默认 true');

// ===== 4. Relationship disclosure — enhanced patterns =====
console.log('\n=== 4. Enhanced Relationship Disclosure tests ===');

var { detectRelationshipDisclosure } = require('../../src/lib/ai/relationship-disclosure');

// New patterns that MUST trigger
var shouldTrigger = [
  '这是不是你们自己做的机器？',
  '这台设备是宏达自产的吗？',
  '你们只是代理还是自己生产？',
  '这是贴牌机吗？',
  '你们和设备厂是什么关系？',
  '宏达在里面有股份吗？',
  '视觉软件是不是你们自己开发的？',
];

shouldTrigger.forEach(function(q) {
  var r = detectRelationshipDisclosure({ customerPain: q });
  if (r.disclosure_required) { passed++; }
  else { failed++; console.error('FAIL: should trigger disclosure: "' + q + '"'); }
});

// Questions that should NOT trigger
var safeQuestions = [
  '机器稳定性怎么样？',
  '这个配置是不是你们推荐的？',
  '你们售后怎么做？',
  '你们能不能上门维修？',
  '这是你们现在主推的设备吗？',
  '这款机器适不适合玩具？',
];

safeQuestions.forEach(function(q) {
  var r = detectRelationshipDisclosure({ customerPain: q });
  if (!r.disclosure_required) { passed++; }
  else { failed++; console.error('FAIL: should NOT trigger disclosure: "' + q + '"'); }
});

// ===== 5. Disclosure augmented brand contract =====
console.log('\n=== 5. Disclosure Augmented Brand Contract ===');

var { buildDisclosureAugmentedBrandContract } = require('../../src/lib/ai/relationship-disclosure');
var xuzongAccount = require('../../src/lib/accounts/examples/xuzong.account').XUZONG_ACCOUNT;

// When disclosure required
var disclosureCtx = { disclosure_required: true, matched_signals: ['你们和设备厂是什么关系？'] };
var brandContract = buildDisclosureAugmentedBrandContract(xuzongAccount.brand_policy, disclosureCtx);
assertIncludes(brandContract, '客户已经明确询问', '披露模式下包含提示');
assertIncludes(brandContract, '不得虚构', '披露模式下包含不得虚构');

// When disclosure NOT required
var noDisclosureCtx = { disclosure_required: false, matched_signals: [] };
var normalContract = buildDisclosureAugmentedBrandContract(xuzongAccount.brand_policy, noDisclosureCtx);
assertNotIncludes(normalContract, '客户已经明确询问', '非披露模式不包含提示');
assertIncludes(normalContract, '客户未询问', '非披露模式包含不主动解释');

// ===== 6. Pipeline route flow =====
console.log('\n=== 6. Pipeline Route Flow ===');

// Test that all task contexts have correct structure
var allTasks = ['angles', 'hooks', 'draft', 'rewrite', 'review'];
allTasks.forEach(function(taskName) {
  var ctx = buildPersonaContextForTask(resolved2, taskName as any);
  assert(typeof ctx.identity_contract === 'string' && ctx.identity_contract.length > 0, taskName + ': identity_contract 非空');
  assert(typeof ctx.task_instructions === 'string' && ctx.task_instructions.length > 0, taskName + ': task_instructions 非空');
  assert(typeof ctx.prompt_text === 'string' && ctx.prompt_text.length > 0, taskName + ': prompt_text 非空');
});

// ===== Summary =====
console.log('\n=== Results ===');
console.log('Passed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
console.log(failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
