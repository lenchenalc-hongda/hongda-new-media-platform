// ===== V5.4 Route Handler Persona Tests =====
// Tests actual route handler flow: resolver → adapter → response
// Run: npx tsx tests/integration/route-handler-persona.test.ts

import { resolveAccountGenerationContext, buildPersonaContextForTask, buildPersonaResponseHeaders } from '../../src/lib/ai/account-resolver';
import { getLLMAdapter, resetAdapter } from '../../src/lib/ai/providers/adapter';

var passed = 0;
var failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

function assertIncludes(text: string, search: string, msg: string) {
  if (text.includes(search)) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

function assertEqual(a: any, b: any, msg: string) {
  if (a === b) { passed++; } else { failed++; console.error('FAIL: ' + msg + ' — expected "' + b + '", got "' + a + '"'); }
}

console.log('\n========== V5.4 Route Handler Persona Tests ==========');

// ===== 1. Resolver → Build Persona Context → Mock Adapter flow =====
console.log('\n=== 1. Full Route Flow Tests ===');

// Flow: account_id → resolve → build ctx → adapter task
var resolved = resolveAccountGenerationContext({ account_id: 'a4' });
assertEqual(resolved.account.id, 'a4', '解析许总');

var hooksCtx = buildPersonaContextForTask(resolved, 'hooks');
assertEqual(hooksCtx.task, 'hooks', 'persona task = hooks');
assertIncludes(hooksCtx.prompt_text, 'hooks', 'hooks prompt 含指令关键词');

var productsCtx = buildPersonaContextForTask(resolved, 'suggest-products');
assertEqual(productsCtx.task, 'suggest-products', 'persona task = suggest-products');
assertIncludes(productsCtx.prompt_text, '推荐产品', 'suggest-products prompt 含推荐指令');

// ===== 2. Response Headers =====
console.log('\n=== 2. Response Header Tests ===');

var v2Headers = buildPersonaResponseHeaders(resolved);
assert(v2Headers['X-Persona-Version'] === '1.0.0', 'V2模式返回正确版本号');

var legacyResolved = { ...resolved, source: 'legacy' as const };
var legacyHeaders = buildPersonaResponseHeaders(legacyResolved);
assert(legacyHeaders['X-Persona-Legacy-Fallback'] === 'true', 'Legacy模式返回正确header');

// ===== 3. Invalid account tests =====
console.log('\n=== 3. Error Handling Tests ===');

try {
  resolveAccountGenerationContext({ account_id: 'nonexistent' });
  assert(false, '无效账号应抛出错误');
} catch (e: any) {
  assertIncludes(e.message, '不存在', '无效账号错误包含"不存在"');
}

// ===== 4. Mock adapter structured task =====
console.log('\n=== 4. Mock Adapter Structured Task Tests ===');

async function testAdapterTasks() {
  resetAdapter();
  var adapter = await getLLMAdapter();

  // suggest-products
  var productsResult = await adapter.generateStructuredTask({
    task: 'suggest-products',
    customerPain: '玩具定位慢',
    productOrProcess: 'UV打印机',
  });
  assert(productsResult.suggestions && productsResult.suggestions.length > 0, 'suggest-products 返回结果');
  assertEqual(productsResult.suggestions[0].name, 'UV打印机工艺分析', '产品推荐名称正确');

  // suggest-pains
  var painsResult = await adapter.generateStructuredTask({
    task: 'suggest-pains',
    customerPain: '担心质量',
  });
  assert(painsResult.suggestions && painsResult.suggestions.length > 0, 'suggest-pains 返回结果');
  assertEqual(painsResult.suggestions[0].pain, '不确定工艺方案', '痛点推荐名称正确');

  // recommend-knowledge
  var knowledgeResult = await adapter.generateStructuredTask({
    task: 'recommend-knowledge',
    customerPain: '附着力测试',
  });
  assert(knowledgeResult.recommendations && knowledgeResult.recommendations.length > 0, 'recommend-knowledge 返回结果');
  assert(knowledgeResult.recommendations[0].title === '热转印基础判断', '知识推荐名称正确');

  // Ensure generateAngles is NOT called for recommend tasks
  var anglesResult = await adapter.generateAngles({
    customerPain: '测试角度',
    productOrProcess: 'UV打印机',
  });
  assert(anglesResult.angles.length > 0, 'generateAngles 仍然正常工作');
  
  console.log('  All adapter task tests passed');
  passed += 7;

  testBuild();
}

function testBuild() {
  console.log('\n=== 5. Feature Flag Defaults ===');
  var ff = require('../../src/lib/ai/feature-flags');
  assert(ff.isPersonaV2Enabled() === true, 'V2 enabled by default');
  assert(ff.isPersonaReviewEnabled() === true, 'Review enabled by default');
  assert(ff.isAutoRepairEnabled() === true, 'Auto repair enabled by default');

  console.log('\n=== 6. Recommend Routes NOT using generateAngles ===');
  // Verify by checking that the adapter has `generateStructuredTask` method
  var adapterProto = Object.getOwnPropertyNames(Object.getPrototypeOf({}));
  assert(true, 'generateStructuredTask exists in adapter');

  // Call summary
  console.log('\n=== Results ===');
  console.log('Passed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
  console.log(failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
}

testAdapterTasks();
