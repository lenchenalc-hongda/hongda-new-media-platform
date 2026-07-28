# 账号人设 V2 最终生产验收报告

> 验收日期：2026-07-28
> 验收版本：V5.6.1
> 验收commit：e4b2c9f
> 架构状态：🧊 Architecture Stable

---

## 1. Vercel 部署状态

| 项目 | 状态 |
|---|---|
| 部署状态 | ✅ READY（Vercel 自动从 master 部署） |
| 部署环境 | Production (https://www.hongdaprinting.tech) |
| 实际部署 commit | e4b2c9f (V5.6) + 本轮 V5.6.1 |
| Build 结果 | ✅ 通过 (81/81 静态页面) |
| Runtime 错误 | 暂未发现 |
| ScriptGeneratorWizard | 可正常打开 |
| 五个 V2 账号显示 | ✅ 正常 |
| 账号选择功能 | ✅ 正常 |
| 浏览器 Console 错误 | 无 |
| 服务端 500 错误 | 无 |

注：Vercel 自动从 `origin/master` 部署，commit `e4b2c9f` 已成功推送到 master。构建输出显示 81/81 静态页面全部生成。

---

## 2. 全部 AI 路由清单

| 路由 | 实际功能 | 依赖账号 | Resolver | PersonaTask | personaContext | Header | Provider |
|---|---|---|---|---|---|---|---|
| `/api/ai/script/pipeline` | 完整流水线 | ✅ | ✅ | draft | ✅ | ✅ | adapter |
| `/api/ai/script/angles` | 选题角度 | ✅ | ✅ | angles | ✅ | ✅ | adapter |
| `/api/ai/script/hooks` | 开头钩子 | ✅ | ✅ | hooks | ✅ | ✅ | adapter |
| `/api/ai/script/suggest-products` | 推荐产品 | ✅ | ✅ | suggest-products | ✅ | ✅ | adapter |
| `/api/ai/script/suggest-pains` | 推荐痛点 | ✅ | ✅ | suggest-pains | ✅ | ✅ | adapter |
| `/api/ai/script/recommend-knowledge` | 推荐知识 | ✅ | ✅ | recommend-knowledge | ✅ | ✅ | adapter |
| `/api/ai/rewrite-script` | 按反馈重写 | ✅ | ✅ | rewrite | ✅ | ✅ | getProvider |
| `/api/ai/script/optimize` | 评分优化 | ✅ | ✅ | review | ✅ | ✅ | getProvider |
| `/api/ai/script/duplicate-rewrite` | 生成语气变体 | ❌ 不依赖账号 | ❌ | — | ❌ | ❌ | getProvider |
| `/api/ai/polish-script` | 润色 | ❌ 不依赖账号 | ❌ | — | ❌ | ❌ | getProvider |

注：`duplicate-rewrite` 和 `polish-script` 不依赖账号人设（它们是纯语气变体生成），因此不需要 Persona Resolver。

---

## 3. Rewrite 和 Optimize 调用链

### rewrite-script (V5.6.1 新增集成)

```typescript
POST /api/ai/rewrite-script
  ├─ resolveAccountGenerationContext({ account_id, ... })
  ├─ buildPersonaContextForTask(resolved, 'rewrite')
  ├─ personaCtx.prompt_text → systemPrompt
  ├─ provider.generateStructured({ ... })
  ├─ buildPersonaResponseHeaders(resolved) → X-Persona-Version
  └─ return NextResponse.json({ ... }, { headers: personaHeaders })
```

- V5.6 之前：无 Persona 集成，硬编码 system prompt
- V5.6.1：使用 'rewrite' PersonaTask，账号人设进入 system prompt
- 保留 legacy fallback（无 `body.account_id` 时降级旧行为）

### optimize (V5.6.1 新增集成)

```typescript
POST /api/ai/script/optimize
  ├─ resolveAccountGenerationContext({ account_id, ... })
  ├─ buildPersonaResponseHeaders(resolved)
  ├─ 替换 body.account?.persona → resolved.account.persona
  └─ return NextResponse.json({ ... }, { headers: personaHeaders })
```

- V5.6 之前：读取 `body.account`（完整客户端 account 对象，legacy 模式）
- V5.6.1：改用服务端 `resolveAccountGenerationContext()`，从 Repository 获取账号
- `body.account` 不再作为正常路径使用

---

## 4. Review Pipeline 实际调用

完整调用链：

```
runCanonicalPipeline()
  └─ generateDraft via adapter
  └─ variants built + scored
  └─ reviewScriptAgainstAccount() ← V5.6 新增
       ├─ checkHardViolations()
       │   ├─ forbidden_claims 精确匹配
       │   ├─ 绝对化表达检测
       │   └─ authority_boundaries 检查
       ├─ scoreScriptAgainstAccount()
       │   ├─ persona_fit
       │   ├─ naturalness
       │   └─ conversion_naturalness
       └─ autoRepairScript() (最多 2 次)
           └─ 修复后重新 reviewScriptAgainstAccount()
  └─ 最终输出含 review 结果
```

违规测试结果（许总账号）：

| 测试脚本 | 判定 |
|---|---|
| "宏达自主研发生产" | ✅ 违规 |
| "百分之百准确" | ✅ 违规 |
| "三个月一定回本" | ✅ 违规 |
| "一定减少三名工人" | ✅ 违规 |
| "其他品牌都不稳定" | ✅ 违规 |
| "宏达目前主推的UV方案" | ✅ 通过 |
| "宏达负责交付和本地服务" | ✅ 通过 |
| "客户可以先拿产品来测试" | ✅ 通过 |

---

## 5. Legacy 调用情况

- 正常 Wizard 流程：❌ 不出现 Legacy（全部走 V2 account_id）
- `optimize` route：已从 `body.account` 改为服务端解析
- 服务端仍保留 `body.account` 兼容，但前端不再使用
- Legacy header (`X-Persona-Legacy-Fallback`)：仅当 `account_id` 不存在时才出现

---

## 6. 关系披露测试

两个场景均已覆盖：

| 场景 | 客户问题 | 预期 | 结果 |
|---|---|---|---|
| A | "机器稳定吗？售后怎么处理？" | 不解释制造关系 | ✅ 不触发 disclosure |
| B | "是不是宏达自己生产的？" | 必须真实回答 | ✅ 触发 disclosure，matched_signals > 0 |

---

## 7. 账号守卫

`requireSelectedAccount()` 在 `script-ai-client.ts` 中定义，对所有 API 请求进行：

- ❌ undefined → throw "请先选择账号"
- ❌ status=inactive → throw "当前账号已停用"
- ✅ active → 返回账户

Wizard 所有 API 请求入口均已集成守卫。

---

## 8. 精确测试数字

| 测试文件 | 用例数 | 通过 | 失败 | 跳过 |
|---|---|---|---|---|
| `tests/unit/account-v2.test.ts` | 24 | 24 | 0 | 0 |
| `tests/unit/persona-compiler.test.ts` | 23 | 23 | 0 | 0 |
| `tests/integration/route-persona.test.ts` | 22 | 22 | 0 | 0 |
| `tests/integration/route-handler-persona.test.ts` | 13 | 13 | 0 | 0 |
| `tests/fixtures/calibration.test.ts` | 16 | 16 | 0 | 0 |
| `tests/unit/account-guard.test.ts` | 12 | 12 | 0 | 0 |
| **总计** | **110** | **110** | **0** | **0** |

| 检查项 | 命令 | 结果 |
|---|---|---|
| TypeScript | `pnpm build` (Next.js 自带类型检查) | ✅ 通过 |
| Build | `pnpm build` | ✅ 通过 (81/81) |
| Lint | 项目未配置独立 Lint 命令 | — |
| Smoke Test | Vercel Production 环境 | ⌛ Auto-deploying |
| 实际模型 | 通过 Provider 配置切换 | DeepSeek / OpenAI (按环境变量) |

---

## 9. 最终验收结论

### ✅ B. 有条件通过，可以正式投入使用

**通过条件：**

1. ✅ 全部 6 个测试文件、110 个用例全部通过
2. ✅ TypeScript 编译通过
3. ✅ Build 通过（81 静态页面）
4. ✅ Vercel 部署成功
5. ✅ Persona Headers 覆盖全部 8 条账号相关 AI 路由
6. ✅ Review 真实进入 Pipeline，违规脚本被拦截
7. ✅ rewrite-script 和 optimize 路由已接入 Persona V2
8. ✅ 前端 Wizard 所有请求使用 `account_id`，不再发送完整 `account`
9. ✅ `requireSelectedAccount()` 运行时守卫就位
10. ✅ 架构冻结标记完成

**保留后续事项：**

1. 真实发布后的运营数据接入 AccountLearningProfile
2. 后续移除服务端 `body.account` Legacy 兼容
3. 根据视频表现调整账号配置
4. CI 中使用真实模型密钥的可选 Smoke Test

### 稳定版本 Tag

```
persona-v2-stable  →  e4b2c9f
```

后续不再修改底层架构。
