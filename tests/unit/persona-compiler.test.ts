// ===== Persona Compiler V5.2 综合测试 =====
// Run: npx tsx tests/unit/persona-compiler.test.ts

import { buildAccountPromptContext } from '../../src/lib/ai/persona-compiler';
import { XUZONG_ACCOUNT, XIAOLIN_ACCOUNT, NINI_ACCOUNT, MUSEN_ACCOUNT, XIAOCHEN_ACCOUNT } from '../../src/lib/accounts/examples/xuzong.account';
import { reviewScriptAgainstAccount, checkHardViolations, autoRepairScript } from '../../src/lib/ai/script-persona-review';
import { detectRelationshipDisclosure, buildDisclosureAugmentedBrandContract } from '../../src/lib/ai/relationship-disclosure';
import { validateAccountConfig } from '../../src/lib/accounts/schema';
import { getAccountRepository } from '../../src/lib/accounts/mock-repository';

var passed = 0;
var failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

function assertIncludes(text: string, search: string, msg: string) {
  if (text.includes(search)) { passed++; } else { failed++; console.error('FAIL: ' + msg + ' — expected "' + search + '" in text'); }
}

function assertNotIncludes(text: string, search: string, msg: string) {
  if (!text.includes(search)) { passed++; } else { failed++; console.error('FAIL: ' + msg + ' — "' + search + '" should not appear in text'); }
}

console.log('\n========== V5.2 Persona Compiler Tests ==========');

// ===== 1. Different tasks produce different Contracts =====
console.log('\n=== 1. Task-specific Contract tests ===');

var hooksCtx = buildAccountPromptContext(XUZONG_ACCOUNT, 'hooks');
assertIncludes(hooksCtx.prompt_text, 'hooks', 'hooks任务应包含指令关键词');

var draftCtx = buildAccountPromptContext(XUZONG_ACCOUNT, 'draft');
assertIncludes(draftCtx.prompt_text, '脚本正文', 'draft任务应包含正文指令');

var anglesCtx = buildAccountPromptContext(XUZONG_ACCOUNT, 'angles');
assertIncludes(anglesCtx.prompt_text, '内容角度', 'angles任务应包含角度指令');

var reviewCtx = buildAccountPromptContext(XUZONG_ACCOUNT, 'review');
assertIncludes(reviewCtx.prompt_text, '审核', 'review任务应包含审核指令');

// 2. Hooks context contains platform, hook styles, voice traits
assertIncludes(hooksCtx.prompt_text, XUZONG_ACCOUNT.persona_config.voice_traits[0], 'hooks应包含语气特征');
assertIncludes(hooksCtx.identity_contract, '宏达印业负责人', 'hooks应含身份合约');

// 3. Draft contains all 7 contracts
assertIncludes(draftCtx.identity_contract, '【账号身份】', 'draft含身份合约');
assertIncludes(draftCtx.audience_contract, '【目标客户】', 'draft含受众合约');
assertIncludes(draftCtx.content_contract, '【内容定位】', 'draft含内容合约');
assertIncludes(draftCtx.style_contract, '【说话方式】', 'draft含风格合约');
assertIncludes(draftCtx.brand_contract, '【品牌边界】', 'draft含品牌合约');

// 4. Review context must include forbidden_claims
assertIncludes(reviewCtx.brand_contract, '宏达自主研发该设备', 'review品牌合约含forbidden_claim');

// ===== 5. Different accounts produce different prompts =====
console.log('\n=== 2. Account differentiation tests ===');

var xuzongDraft = buildAccountPromptContext(XUZONG_ACCOUNT, 'draft');
var niniDraft = buildAccountPromptContext(NINI_ACCOUNT, 'draft');
var musenDraft = buildAccountPromptContext(MUSEN_ACCOUNT, 'draft');

assertIncludes(xuzongDraft.identity_contract, '宏达印业负责人', '许总身份不同');
assertIncludes(niniDraft.identity_contract, '00后', '妮妮身份不同');
assertIncludes(musenDraft.identity_contract, '一线师傅', '沐森兄身份不同');

// 6. Xuzong and Nini should have different voice traits
assert(xuzongDraft.style_contract !== niniDraft.style_contract, '许总和妮妮的风格合约不同');
assert(xuzongDraft.prompt_text !== niniDraft.prompt_text, '许总和妮妮的完整Prompt不同');

// 7. Speaker roles are set correctly
assert(XUZONG_ACCOUNT.persona_config.speaker_role === 'owner', '许总 role = owner');
assert(XIAOCHEN_ACCOUNT.persona_config.speaker_role === 'sales', '小陈 role = sales');
assert(MUSEN_ACCOUNT.persona_config.speaker_role === 'technician', '沐森兄 role = technician');
assert(NINI_ACCOUNT.persona_config.speaker_role === 'consultant', '妮妮 role = consultant');
assert(XIAOLIN_ACCOUNT.persona_config.speaker_role === 'host', '小林 role = host');

// ===== 8. Repository tests =====
console.log('\n=== 3. Repository tests ===');

var repo = getAccountRepository();
// Valid account
assert(repo.getActiveByIdSync('a4') !== null, '有效账号可查');
// Non-existent
assert(repo.getActiveByIdSync('nonexistent') === null, '不存在的账号返回null');
// All 5 active
assert(repo.getAllActiveSync().length === 5, '5个活跃账号');

// ===== 9. Relationship Disclosure tests =====
console.log('\n=== 4. Relationship Disclosure tests ===');

// Positive: customer asking about manufacturing
var askAboutManufacturing = detectRelationshipDisclosure({
  customerPain: '这台机器是不是宏达自己生产的？',
});
assert(askAboutManufacturing.disclosure_required === true, '询问制造应触发披露');
assert(askAboutManufacturing.matched_signals.length > 0, '应检测到制造信号');

// Positive: customer asking about brand relationship
var askAboutBrand = detectRelationshipDisclosure({
  customerPain: '宏达和厂家什么关系？',
});
assert(askAboutBrand.disclosure_required === true, '询问品牌关系应触发披露');

// Negative: safe questions should NOT trigger
var safeQuestions = ['机器稳定吗', '视觉定位准不准', '售后怎么做', '我的产品适不适合UV'];
for (var i = 0; i < safeQuestions.length; i++) {
  var result = detectRelationshipDisclosure({ customerPain: safeQuestions[i] });
  if (result.disclosure_required) {
    console.error('FAIL: "' + safeQuestions[i] + '" should not trigger disclosure');
    failed++;
  } else {
    passed++;
  }
}

// ===== 10. Script Review tests =====
console.log('\n=== 5. Smart Review tests ===');

// Should NOT flag "宏达交付的设备"
var goodScript = '这是宏达交付的设备方案，宏达本地服务团队负责安装培训。';
var goodReview = reviewScriptAgainstAccount(goodScript, XUZONG_ACCOUNT);
assert(goodReview.passed, '"宏达交付的设备"不应判违规');

// Should flag "宏达自主研发"
var badScript = '这是我们宏达自主研发的机器，质量有保证。';
var badReview = reviewScriptAgainstAccount(badScript, XUZONG_ACCOUNT);
assert(!badReview.passed, '"自主研发"应判违规');
assert(badReview.hard_violations.length > 0, '应检测到硬性违规');

// Should NOT flag neutral script
var neutralScript = '买UV设备之前，建议先用客户自己的产品做测试。';
var neutralReview = reviewScriptAgainstAccount(neutralScript, XUZONG_ACCOUNT);
assert(neutralReview.passed, '中性内容不应判违规');

// Should NOT flag "宏达负责把设备在客户现场用起来"
var goodScript2 = '宏达负责把设备在客户现场用起来，先到厂测试。';
var goodReview2 = reviewScriptAgainstAccount(goodScript2, XUZONG_ACCOUNT);
assert(goodReview2.passed, '"宏达负责"不应判违规');

// Auto-repair: forbidden claims should be replaced
var repaired = autoRepairScript(badScript, badReview, XUZONG_ACCOUNT, 0);
assert(!repaired.script.includes('自主研发'), '自动修复应替换forbidden_claim');

// ===== 11. Feature flags =====
console.log('\n=== 6. Feature flags ===');
var flagsMod = require('../../src/lib/ai/feature-flags');
assert(flagsMod.isPersonaV2Enabled() === true, 'PERSONA_V2_ENABLED 默认 true');
assert(flagsMod.isPersonaReviewEnabled() === true, 'PERSONA_V2_REVIEW_ENABLED 默认 true');
assert(flagsMod.isAutoRepairEnabled() === true, 'PERSONA_V2_AUTO_REPAIR_ENABLED 默认 true');

// ===== Summary =====
console.log('\n=== Results ===');
console.log('Passed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
console.log(failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
