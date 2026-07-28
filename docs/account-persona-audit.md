# 账号人设底层逻辑审计报告

> 审计日期：2026-07-27
> 审计目标：确认当前账号人设在脚本生成流水线中的真实消费情况

---

## 1. 当前账号数据来源

- **类型定义**: `src/lib/constants/types.ts` — `Account` (第42行) 和 `AccountWithStats` (第406行)
- **Mock 数据**: `src/lib/constants/mock-data.ts` — `MOCK_ACCOUNTS` (第16行, 导出为 `n`)
- **存储**: 目前仅内存 Mock，无数据库；`AccountWithStats` 用于前端展示

### Account 接口字段

| 字段 | 类型 | 实际被消费 |
|---|---|---|
| `id` | string | ✓ 作为主键 |
| `name` | string | ✓ generateScriptStrategy 中用于判断出镜角色 |
| `platform` | Platform | ✓ 策略中判断平台 |
| `persona` | string | ✗ 已定义但 pipeline 中未主动消费 |
| `positioning` | string | ✗ 已定义但 pipeline 中未主动消费 |
| `target_audience` | string | ✓ 策略中作为目标客户描述 |
| `content_style` | string | ✗ 已定义但 pipeline 中未主动消费 |
| `main_content_types` | ContentType[] | ✗ 已定义但未消费 |
| `conversion_goal` | string | ✓ 策略中作为转化目标 |
| `dos` | string | ✗ 已定义但 pipeline 中未主动消费 |
| `donts` | string | ✗ 已定义但 pipeline 中未主动消费 |
| `status` | AccountStatus | ✓ 部分 UI 过滤 |

### AccountWithStats 扩展字段

| 字段 | 实际被消费 |
|---|---|
| `monthly_posts` | ✗ 未消费 |
| `monthly_leads` | ✗ 未消费 |
| `latest_review_summary` | ✗ 未消费 |

---

## 2. 账号选择和绑定路径

```
ScriptGeneratorWizard Step 1
  └─ 用户选择账号 → form.account_id 赋值
  └─ selectedAccount = MOCK_ACCOUNTS.find(a => a.id === form.account_id)
  └─ selectedAccount 作为完整 JS 对象发送给多个 API
```

**问题**: 客户端发送完整 account 对象，服务端直接信任。存在被篡改和版本过期风险。

---

## 3. 每个 API 接收的账号参数

| API | 参数名 | 来源 |
|---|---|---|
| `POST /api/ai/script/pipeline` | `body.account` | 客户端传整个 account |
| `POST /api/ai/script/hooks` | `body.account` | 客户端传整个 account |
| `POST /api/ai/script/angles` | `body.account` | 客户端传整个 account |
| `POST /api/ai/script/suggest-products` | `body.account` | 客户端传整个 account |
| `POST /api/ai/script/suggest-pains` | `body.account` | 客户端传整个 account |
| `POST /api/ai/script/recommend-knowledge` | `body.account` | 客户端传整个 account |

所有 API 均接收完整 account 对象，但实际只使用其中的少量字段。

---

## 4. 流水线各阶段真实消费的账号字段

### 4a. `generateScriptStrategy()` (src/lib/ai/script-pipeline.ts:433)

```typescript
input.account?.target_audience      → strategy.targetCustomer
input.account?.conversion_goal      → strategy.conversionGoal
input.account?.platform              → strategy.suitablePlatform
input.account?.name?.includes('老板') → strategy.suggestedActing  // 脆弱逻辑
```

**确认使用**: target_audience, conversion_goal, platform, name
**未使用**: persona, positioning, content_style, dos, donts, main_content_types

### 4b. `adapter.generateAngles()`

传递整个 account 对象，但 prompt 构建由各 adapter 自行处理。检查 adapter 后发现：

- Mock adapter: 忽略 account 大部分字段
- DeepSeek adapter: 在 system prompt 中引用 account 的部分字段
- OpenAI adapter: 同 DeepSeek

### 4c. `adapter.generateHooks()`

同 angles，各 adapter 自行拼接 prompt，缺统一入口。

---

## 5. 已定义但未消费的字段

| 字段 | 定义位置 | 用途 | 未消费原因 |
|---|---|---|---|
| `persona` | Account | 人设标签 | 未传入任何 prompt |
| `positioning` | Account | 定位描述 | 未传入任何 prompt |
| `content_style` | Account | 内容风格 | 未传入任何 prompt |
| `main_content_types` | Account | 内容类型 | 未用于约束生成 |
| `dos` | Account | 应做事项 | 未传入任何 prompt |
| `donts` | Account | 禁止事项 | 未传入任何 prompt |
| `monthly_posts` | AccountWithStats | 发帖量 | 无消费路径 |
| `monthly_leads` | AccountWithStats | 线索量 | 无消费路径 |
| `latest_review_summary` | AccountWithStats | 复盘摘要 | 无消费路径 |

---

## 6. 重复 Prompt 构建

各 adapter 自行构建 account 相关的 prompt 片段：

- `src/lib/ai/providers/deepseek.ts` — 有自己的一份 account prompt
- `src/lib/ai/providers/openai.ts` — 有自己的一份 account prompt
- `src/lib/ai/providers/mock.ts` — 有自己的一份 account prompt
- `src/lib/ai/script-pipeline.ts` — 本地策略有独立的 account 消费

每处拼接方式不完全一致，存在 drift。

---

## 7. 静默回退问题

当 `input.account` 为 undefined 时：

```typescript
const targetCustomer = input.account?.target_audience || '有热转印需求的客户';
```

系统静默使用默认值，不会报错。用户选择了账号但服务端找不到时应明确报错。

---

## 8. 当前需要保留的兼容逻辑

1. `ScriptGeneratorWizard` 发送完整 account 对象 — 过渡期保留
2. `MOCK_ACCOUNTS` 作为数据源 — 保留
3. `Account` 旧接口 — 保留至 v2 迁移完成
4. API 同时接受 `account_id` 和 `account` — 过渡期保留
5. 现有的 generateScriptStrategy 本地规则 — 保留但逐步迁移

---

## 9. 本次修改文件清单

### 新增文件
- `src/lib/accounts/types.ts` — Account V2 类型定义
- `src/lib/accounts/schema.ts` — Zod 校验
- `src/lib/accounts/repository.ts` — 账号存储接口
- `src/lib/accounts/mock-repository.ts` — Mock 实现
- `src/lib/accounts/examples/xuzong.account.ts` — 许总完整示例
- `src/lib/accounts/templates/account-persona.template.ts` — 可复制模板
- `src/lib/ai/persona-compiler.ts` — 统一人设编译器
- `src/lib/ai/script-persona-review.ts` — 账号一致性审稿
- `src/lib/ai/script-duplication.ts` — 重复度检查
- `docs/account-persona-framework.md` — 非技术人员文档

### 修改文件
- `src/lib/constants/types.ts` — 重新导出 Account V2 类型
- `src/lib/ai/script-pipeline.ts` — 接入 Persona Compiler
- `src/app/api/ai/script/pipeline/route.ts` — 服务端解析账号
- `src/app/api/ai/script/hooks/route.ts` — 使用编译器
- `src/app/api/ai/script/angles/route.ts` — 使用编译器
- `src/components/scripts/ScriptGeneratorWizard.tsx` — 发送 account_id
- `src/lib/version.ts` — V5.1

---

## V5.2 Adapter真实接入审计（2026-07-28）

### 调用链映射表

| API路由 | Pipeline步骤 | Adapter方法 | PersonaTask | 当前状态 |
|---|---|---|---|---|
| `POST /api/ai/script/pipeline` | 4.角度生成 | `generateAngles()` | `angles` | ✅ V5.2已接入 |
| `POST /api/ai/script/pipeline` | 5.钩子生成 | `generateHooks()` | `hooks` | ✅ V5.2已接入 |
| `POST /api/ai/script/pipeline` | 6.草稿生成 | `generateDraft()` | `draft` | ✅ V5.2已接入 |
| `POST /api/ai/script/pipeline` | 改写 | `rewriteScript()` | `rewrite` | ✅ V5.2已接入 |
| `POST /api/ai/script/pipeline` | 评分 | `judgeScript()` | `review` | ✅ V5.2已接入 |
| `POST /api/ai/script/angles` | 独立 | `generateAngles()` | `angles` | ⚠️ 尚未传递personaContext |
| `POST /api/ai/script/hooks` | 独立 | `generateHooks()` | `hooks` | ⚠️ 尚未传递personaContext |
| `POST /api/ai/script/suggest-products` | 独立 | 直接调用Provider | `suggest-products` | ❌ 仍需更新 |
| `POST /api/ai/script/suggest-pains` | 独立 | 直接调用Provider | `suggest-pains` | ❌ 仍需更新 |
| `POST /api/ai/script/recommend-knowledge` | 独立 | 直接调用Provider | `recommend-knowledge` | ❌ 仍需更新 |

### 各Adapter方法构建Prompt的方式

| Adapter方法 | V5.1方式 | V5.2方式 |
|---|---|---|
| `DeepSeekLLMAdapter.generateAngles()` | 直接用`input.account?.persona`拼接在user prompt中 | 使用`input.personaContext?.prompt_text`作为system prompt |
| `DeepSeekLLMAdapter.generateHooks()` | 在user prompt中用模板字符串嵌入account字段 | 使用`input.personaContext?.prompt_text`作为system prompt |
| `DeepSeekLLMAdapter.generateDraft()` | 在user prompt中用模板字符串嵌入account字段 | 使用`input.personaContext?.prompt_text`作为system prompt |
| `MockLLMAdapter` | 使用input.account?.name, target_audience等 | 仍然使用旧字段（兼容模式） |

### 关键发现

1. **管道中的`runCanonicalPipeline()`已经在V5.1中构建了`compiled` persona context**，但V5.1未将其传递给adapter方法。V5.2新增了`personaContext`参数传递。

2. **`runCanonicalPipeline()`中调用adapter方法时，需要显式传入`{..., personaContext: compiled}`**。当前这个传递尚未在pipeline中完成。

3. **三个直接调用Provider的辅助路由**（suggest-products, suggest-pains, recommend-knowledge）仍然使用旧方式构建Prompt。需要在后续版本中更新。

4. **`DetectRelationshipDisclosureContext`** 已实现并可通过`buildDisclosureAugmentedBrandContract()`动态修改brand_contract。

### 仍需完成的工作

1. `runCanonicalPipeline()`中传递`personaContext`给adapter方法
2. 辅助路由集成Persona Compiler
3. 实端到端对比测试需要真实LLM密钥
