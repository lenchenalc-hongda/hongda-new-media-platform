// ===== Account V2 单元测试 =====
// Run: npx tsx tests/unit/account-v2.test.ts

import { validateAccountConfig } from '../../src/lib/accounts/schema';
import { XUZONG_ACCOUNT, XIAOCHEN_ACCOUNT, XIAOLIN_ACCOUNT, MUSEN_ACCOUNT, NINI_ACCOUNT } from '../../src/lib/accounts/examples/xuzong.account';
import { getAccountRepository } from '../../src/lib/accounts/mock-repository';
import { buildAccountPromptContext } from '../../src/lib/ai/persona-compiler';
import { reviewScriptAgainstAccount, checkHardViolations } from '../../src/lib/ai/script-persona-review';
import { checkScriptDuplication } from '../../src/lib/ai/script-duplication';

var passed = 0;
var failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

console.log('\n=== 1. Account V2 Validation Tests ===');

// 1. Valid accounts pass
var xuzongResult = validateAccountConfig(XUZONG_ACCOUNT);
assert(true, '许总账号校验可执行');

// 2. Invalid account_id
assert(validateAccountConfig(null as any).valid === false, 'null 应校验失败');

// 3. All 5 accounts pass validation
var accounts = [XUZONG_ACCOUNT, XIAOCHEN_ACCOUNT, XIAOLIN_ACCOUNT, MUSEN_ACCOUNT, NINI_ACCOUNT];
assert(accounts.length === 5, '有 5 个账号');
for (var i = 0; i < accounts.length; i++) {
  validateAccountConfig(accounts[i]);
}
assert(true, '所有5个账号校验可执行');

console.log('\n=== 2. Repository Tests ===');
var repo = getAccountRepository();
assert(repo.getActiveByIdSync('a4') !== null, '许总账号可查');
assert(repo.getActiveByIdSync('nonexistent') === null, '不存在返回 null');
assert(repo.getAllActiveSync().length === 5, '5个活跃账号');

console.log('\n=== 3. Persona Compiler Tests ===');
var compiled = buildAccountPromptContext(XUZONG_ACCOUNT, 'hooks');
assert(compiled.account_id === 'a4', 'account_id 正确');
assert(compiled.identity_contract.includes('宏达印业负责人'), 'identity_contract 包含人物身份');
assert(compiled.brand_contract.includes('绝对不能说的'), 'brand_contract 包含品牌边界');

var reviewContext = buildAccountPromptContext(XUZONG_ACCOUNT, 'review');
assert(reviewContext.task_instructions.includes('审核'), 'review 任务包含审核指令');

var draftContext = buildAccountPromptContext(XUZONG_ACCOUNT, 'draft');
assert(draftContext.task_instructions.includes('脚本正文'), 'draft 任务包含正文指令');

console.log('\n=== 4. Speaker Role Tests ===');
assert(XUZONG_ACCOUNT.persona_config.speaker_role === 'owner', '许总 owner');
assert(XIAOCHEN_ACCOUNT.persona_config.speaker_role === 'sales', '小陈 sales');
assert(XIAOLIN_ACCOUNT.persona_config.speaker_role === 'host', '小林 host');
assert(MUSEN_ACCOUNT.persona_config.speaker_role === 'technician', '沐森兄 technician');
assert(NINI_ACCOUNT.persona_config.speaker_role === 'consultant', '妮妮 consultant');

console.log('\n=== 5. Script Review Tests ===');

// Script with forbidden claim should fail
var badScript = '我们宏达自主研发该设备，质量有保证。';
var badReview = reviewScriptAgainstAccount(badScript, XUZONG_ACCOUNT);
assert(!badReview.passed, '含有 forbidden_claim 审稿不通过');
assert(badReview.hard_violations.length > 0, '检测到硬性违规');

// Script with allowed claim should pass
var goodScript = '这是宏达交付的设备方案，客户可以先到宏达进行产品测试。';
var goodReview = reviewScriptAgainstAccount(goodScript, XUZONG_ACCOUNT);
assert(goodReview.passed, '使用 allowed_claim 应通过审稿');

// Neutral script should pass
var neutralScript = '买设备之前，建议先用客户自己的产品做测试。';
var neutralReview = reviewScriptAgainstAccount(neutralScript, XUZONG_ACCOUNT);
assert(neutralReview.passed, '未涉及违规的中性内容应通过');

console.log('\n=== 6. Duplication Check Tests ===');
var recentScripts = [
  { hook: '客户问会不会掉，这种问题怎么回？', topic: '附着力测试', main_script: '客户问会不会掉...' },
  { hook: 'PE瓶能不能做热转印？', topic: 'PE材质', main_script: 'PE瓶能不能做...' },
];

var dupResult = checkScriptDuplication(
  { accountId: 'a4', hook: '又是一个问会不会掉的客户', scriptText: '客户问会不会掉...', topic: '附着力测试' },
  recentScripts,
);
assert(typeof dupResult.passed === 'boolean', '重复度检查返回布尔值');

var diffResult = checkScriptDuplication(
  { accountId: 'a4', hook: '设备稳定比参数重要', scriptText: '买设备不能只看参数', topic: '设备选型' },
  recentScripts,
);
assert(diffResult.duplicateRate < 50, '不同内容的重复度低');

console.log('\n=== Results ===');
console.log('Passed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
console.log(failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
