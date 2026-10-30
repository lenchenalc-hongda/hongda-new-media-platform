# GLH V2 | 离线 LLM 询盘提取验收

STATUS = DRAFT_ONLY / NONPRODUCTION
TASK = GLH-V2-B-LLM-EXTRACTION-EVAL-001
BASE_MASTER_SHA = 3923a4d2747808c407de2a32cec821945d602d8d
SOURCE_HEAD = c5e865dbf322c6952ee85c2c99eb0b4530ba3fae
IMPLEMENTATION = src/lib/global-lead-hub/v2-llm-extraction-eval.ts
TEST = tests/unit/global-lead-hub-v2-llm-extraction-eval.test.ts
EVIDENCE_CONTRACT = src/lib/global-lead-hub/v2-inquiry-evidence.ts
PROVIDER_CALLS_ENABLED = false
AUTO_MERGE = false
AUTO_PRODUCTION = false

## 1. 范围

本切片只定义 GLH V2-B 的纯离线、可注入模型边界。调用方可以传入：

- 一个已经生成的不可信模型值，可以是 JSON 文本或对象；
- 或在测试中传入的 fake inference 函数。

本模块不构造或调用真实 LLM/Meta/WhatsApp/Instagram API，不需要密钥，不发送客户消息，不写
GLH/CPC/WOS 数据，不计算或替换 V1 A/B/C/D 分数，不报价，不自动派单，也不携带图片视觉识别。

真实模型未运行。下面的评测只统计确定性的 synthetic stubs，不能作为真实模型准确率、语言识别
能力、跨语言泛化或商业效果证明。

## 2. 可信边界

服务器调用方必须先通过现有 GLH 鉴权、RLS 或服务端访问边界取得 `sourceMessages` 和
`trustedScope`。模型输出永远只视为候选数据：

1. 模型输出必须是 `GLH-V2-LLM-EXTRACTION-MODEL-001`。
2. `modelId`、`promptVersion`、`knowledgeVersion` 由服务器调用方传入，不采信模型自报标记。
3. 每条 claim 原样交给现有 `validateGlhV2InquiryEvidence`：
   - 来源必须是同一可信组织、同一询盘的真实 INBOUND message；
   - OUTBOUND、捏造 message id、跨组织、跨询盘引用均被拒绝；
   - 文本必须包含精确 excerpt；
   - 媒体 ID 必须等于该 MEDIA message 的 canonical media reference；
   - 重复 claim、坏置信度、非法业务字段由共享合同拒绝。
4. 所有已验证 claim 的 `needsVerification` 固定为 `true`。原文引用只证明来源存在，不证明模型
   对 excerpt 的解释正确，即使模型 confidence 为 1.0 也不能自动成为业务事实。
5. 模型不能设置人工审核、自动发送、自动写入或 V1 grade。即使输出对象包含同名安全字段，也会
   被忽略，最终值只由可信边界生成。
6. 输入消息中的 system-prompt、角色覆盖和工具调用话术始终是客户数据。它们不会改变本模块状态，
   但会被标记为 `UNTRUSTED_INSTRUCTION_CONTENT` 供人工复核。

固化安全输出：

```text
humanReviewRequired = true
customerFacingAutoSendAllowed = false
authoritativeWriteAllowed = false
cpcWriteAllowed = false
pricingAllowed = false
automaticTransferAllowed = false
legacyGradeUntouched = true
providerCallsPerformed = false
```

## 3. 候选结构

候选只使用以下 intent：

```text
FILM
PROCESSING
MACHINE
PROCESS_CONSULT
UNCLEAR
```

语言只使用 `EN`, `ZH`, `AR`, `OTHER`, `UNKNOWN`。模型省略 intent 时归一为 `UNCLEAR`，
省略 language 时归一为 `UNKNOWN`；不支持的取值使整次结果进入人工 fallback，而不是猜测。

候选还包括：

- 服务器配置的 model/prompt/knowledge version；
- intent 和 language 的模型自报 confidence；
- 模型自报 ambiguity，并明确标记为 `MODEL_SELF_REPORT`；
- 边界审查 ambiguity，明确标记为 `BOUNDARY_REVIEW`；
- 最多 3 条缺失信息问题建议，标记为 `MODEL_CANDIDATE` 且 `needsVerification=true`；
- 可信代码推导出的 handoff reason。

模型可以省略不支持的业务字段，或返回 `UNKNOWN`。两者都不会被转换为业务事实。没有有效
excerpt 的字段不能进入 claim。

## 4. 立即人工复核/移交规则

以下情况由可信边界触发，不采信模型自行声明的 handoff 状态：

- conversation mode 为 `HUMAN_ACTIVE`，且在调用 fake inference 前停止；
- `Price?`、价格、报价、正式 quotation；
- RFQ、正式 spec/drawing；
- MACHINE 意图或设备询盘；
- sample/test/测试/打样；
- 客户投诉/质量问题；
- 附着力、工业节流能力、洗碗机测试等风险技术承诺；
- intent/language/claim confidence 缺失或低于 0.6；
- intent 为 `UNCLEAR`，或 intent 与 requirementType claim 冲突；
- 只有 OUTBOUND 历史，没有可作为客户证据的 INBOUND；
- 疑似 prompt injection；
- 模型超时、抛错、非法 JSON、超大输出或非法结构；
- evidence validator 拒绝来源、scope、excerpt、媒体或重复 claim。

这些结果均 `handoffRecommended=true`，并永远 `customerFacingAutoSendAllowed=false`。
非触发场景仍 `humanReviewRequired=true`，因为候选不是业务事实。

## 5. 输入和响应防护

模块在 inference 之前检查可信 scope、version marker、消息数量、单条文本和总文本大小，并调用
共享 evidence validator 预检消息身份/scope。默认上限：

| 项目 | 上限 |
| --- | ---: |
| messages | 200 |
| 单条 message text | 20,000 characters |
| 全部 message text | 120,000 characters |
| 原始模型响应 | 65,536 characters |
| model ambiguities | 8 |
| missing-info suggestions | 3 |
| fake inference timeout 默认值 | 5,000 ms |

JSON 解析、对象序列化、getter、circular object、同步异常和 rejected promise 均转换为结构化人工
fallback。fallback 保留调用时可信 scope 内的 INBOUND 消息；不会保留或执行模型指令。fake
inference 获得的是消息副本，不能修改调用方原始数组。

## 6. 使用方式

直接评估已获得的不可信输出：

```ts
const result = evaluateGlhV2ModelOutput({
  modelOutput,
  sourceMessages,
  trustedScope,
  versions: {
    modelId: 'synthetic-stub-v1',
    promptVersion: 'synthetic-prompt-v1',
    knowledgeVersion: 'synthetic-knowledge-v1',
  },
  conversationMode: 'AI_ACTIVE',
});
```

离线注入 fake model：

```ts
const result = await extractGlhV2InquiryCandidate({
  sourceMessages,
  trustedScope,
  versions,
  conversationMode: 'AI_ACTIVE',
  timeoutMs: 50,
  infer: fakeInference,
});
```

`fakeInference` 收到带固定 policy 的请求。其返回值和直接输入的 model output 经过完全相同的
严格解析和证据验证。请求还携带服务器传入的 `versions` marker；模型不能改写最终结果中的
标记。模块没有真实 provider client，也不接收 API key。

## 7. Synthetic acceptance matrix

专项测试包含 32 个确定性 fixtures：

| 覆盖 | Fixtures |
| --- | --- |
| EN/ZH/AR、PP/ABS、FILM/PROCESSING/MACHINE/PROCESS_CONSULT | 01-05, 26 |
| MEDIA canonical reference | 06 |
| unknown material | 07, 32 |
| `Price?`/RFQ/sample/complaint/risky technology | 08-10, 25-26 |
| HUMAN_ACTIVE / timeout / thrown model | 11, 20, 23 |
| cross-org/cross-inquiry/outbound-only | 12-14 |
| invented source/fabricated media/duplicate | 15-16, 22 |
| confidence 1.0 semantic mismatch | 17 |
| malformed/oversized/invalid output/input | 18-19, 27-29 |
| prompt injection as data | 21 |
| object output and mutation isolation | 24, 30 |
| low confidence | 31 |

测试输出 `summarizeGlhV2SyntheticEvaluation` 的 fixture PASS count、candidate/error-fallback/
handoff counts 以及 synthetic intent/language match counts。它固定声明：

```text
syntheticOnly = true
realModelAccuracy = NOT_MEASURED
realLlmProviderCalls = 0
```

因此这些 match counts 只反映 fixture 与 stub 输出是否一致，不是真实模型 accuracy。

## 8. 本地验证命令

```bash
pnpm exec tsx tests/unit/global-lead-hub-v2-llm-extraction-eval.test.ts
pnpm exec tsc --noEmit
pnpm build
./scripts/audit-bundle-secrets.sh
pnpm next start -p 3000
curl -fsS http://localhost:3000
```

Build/smoke 只允许 synthetic fake environment，不读取或改变 Production 配置。专项任务本身不启动
真实 provider，不执行 SQL/RLS/migration，不发送消息，不做外部发布。

本次本地验收记录：

```text
GLH V2 LLM extraction synthetic fixtures: PASS (32/32)
Existing GLH V2 evidence contract regression: PASS
GLH Phase 4 AI qualification regression: PASS
pnpm exec tsc --noEmit: PASS
Synthetic production Next.js build: PASS
Bundle secret audit: PASS
Server-import check: PASS
Local route smoke: BLOCKED_BY_CODEX_SANDBOX_LISTEN_EPERM
```

Route smoke 已尝试，但当前 Codex filesystem/network sandbox 禁止 Node listen，因此不能在本会话声称
HTTP smoke PASS。wrapper 的独立 check 环境应重新执行 smoke；该环境结果优先。

## 9. 已知限制和 CI 缺口

- 没有运行真实 LLM；无真实模型语言识别、提取准确率、漏筛率、错分率或 hallucination rate。
- 没有人工标注语料，没有图片内容理解，没有跨轮长期记忆和真实 Meta/WhatsApp 通道。
- excerpt provenance 不能证明归一化值或语义解释正确。
- fake inference 由调用方提供，本模块不验证其网络行为；真实 provider 集成、key、日志和供应商审批
  必须另立任务。
- 生产工作台保留原消息、人工接管和失败可见性仍需后续集成与 DEV E2E 验证。
- 新专项测试尚未接入 GitHub CI。不得在本任务修改 `.github/workflows`；需单独申请共享基础设施
  任务，将本 test command 纳入 CI。

## 10. 发布边界

任务只创建 implementation、unit test 和本验收文档。wrapper 负责路径/测试校验和 Git 状态发布；
Codex 不 stage、commit、push、切换 branch 或调用 GitHub write API。独立 PM review 后仍保持
Draft PR、`AUTO_MERGE=false`、`AUTO_PRODUCTION=false`，不启动真实模型或渠道。
