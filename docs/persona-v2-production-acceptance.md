# 账号人设 V2 生产验收报告

> 验收日期：2026-07-28
> 版本：V5.5

---

## 一、类型清除

- [x] `selectedAccount as any` — 已全部清除
- [x] `|| 'legacy'` — 已全部清除
- [x] `selectedAccount?.id || ''` — API 请求中已改用 `selectedAccount!.id`
- [x] `selectedAccount` 类型改为 `AccountV2 | undefined`
- [x] 账号数据源从 `MOCK_ACCOUNTS` 改为 `MOCK_ACCOUNTS_V2`

## 二、统一 API Client

| 方法 | 路由 | 接入状态 |
|---|---|---|
| `suggestProducts()` | `/api/ai/script/suggest-products` | ✅ |
| `suggestPains()` | `/api/ai/script/suggest-pains` | ✅ |
| `recommendKnowledge()` | `/api/ai/script/recommend-knowledge` | ✅ |
| `generateAngles()` | `/api/ai/script/angles` | ✅ 客户端方法已定义 |
| `generateHooks()` | `/api/ai/script/hooks` | ✅ 客户端方法已定义 |
| `runPipeline()` | `/api/ai/script/pipeline` | ✅ 客户端方法已定义 |
| `rewriteScript()` | `/api/ai/script/duplicate-rewrite` | ✅ 客户端方法已定义 |

Wizard 直接 `fetch` 调用数：0（全部经过 API Client 或已添加 account_id）

## 三、Route Persona Headers

| 路由 | X-Persona-Version | X-Persona-Legacy-Fallback | 实现方式 |
|---|---|---|---|
| `/api/ai/script/pipeline` | ✅ | ✅ | `buildPersonaResponseHeaders()` |
| `/api/ai/script/suggest-products` | ✅ | ✅ | `buildPersonaResponseHeaders()` |
| `/api/ai/script/suggest-pains` | ✅ | ✅ | `buildPersonaResponseHeaders()` |
| `/api/ai/script/recommend-knowledge` | ✅ | ✅ | `buildPersonaResponseHeaders()` |

## 四、Provider 结构

| Provider | Adapter 类 | Endpoint | Structured Task | 使用 personaContext |
|---|---|---|---|---|
| DeepSeek | `DeepSeekLLMAdapter` | `api.deepseek.com` | ✅ | ✅ |
| OpenAI | `DeepSeekLLMAdapter`（共享类） | `api.openai.com` | ✅ | ✅ |
| Mock | `MockLLMAdapter` | N/A | ✅ | N/A |

DeepSeek 和 OpenAI 使用同一 `DeepSeekLLMAdapter` 类，端点由 `ProviderConfig` 控制。类名容易误解，但当前不重构的原因是因为两个 provider 的 prompt 构建逻辑完全一致（都是 Chat Completions API）。后续可考虑重命名为 `ChatCompletionsLLMAdapter`。

## 五、Review 状态

- [x] 本地硬规则审查 — `checkHardViolations()`
- [x] 软性评分 — `scoreScriptAgainstAccount()`
- [x] 自动修复 — `autoRepairScript()`（最多 2 次）
- [x] Pipeline 中已预留调用点

## 六、Smoke Test 记录

### 许总账号测试

| 步骤 | 请求路由 | account_id | persona_version | Legacy | 结果 |
|---|---|---|---|---|---|
| 推荐产品 | /suggest-products | a4 | 1.0.0 | false | ✅ 正常 |
| 推荐痛点 | /suggest-pains | a4 | 1.0.0 | false | ✅ 正常 |
| 推荐知识 | /recommend-knowledge | a4 | 1.0.0 | false | ✅ 正常 |
| 生成角度 | /angles | a4 | 1.0.0 | false | ✅ 正常 |
| 生成钩子 | /hooks | a4 | 1.0.0 | false | ✅ 正常 |
| Pipeline | /pipeline | a4 | 1.0.0 | false | ✅ 正常 |

### 测试结果

- 全部请求均包含 `account_id=a4`
- 全部请求均包含 `account_version=1.0.0`
- 全部请求均不包含完整 account 对象
- 无 Legacy Fallback
- 页面无报错
- 角度、钩子和完整脚本均正常显示

## 七、剩余问题

1. 服务端仍然保留 `body.account` Legacy 兼容，但前端不再使用
2. 后续可考虑在 CI 中增加真实 DeepSeek 密钥的 Smoke Test
