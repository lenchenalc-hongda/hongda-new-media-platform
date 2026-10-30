# GLH V2-C 人工确认商机质量反馈｜离线验收（非生产）

## 身份与阶段
- 任务：`GLH-V2-C-HUMAN-FEEDBACK-OFFLINE-001`，属于 Issue #72 的单一活动项目车道。
- 交付：纯 TypeScript `v2-human-feedback.ts`、确定性单元测试、本文档。
- 本次无 API/UI、SQL migration、RLS/Storage、Production 数据、环境或密钥变更；无真实客户消息、模型服务调用、广告操作、消息发送或 CPC 写入。
- `AUTO_MERGE=false`、`AUTO_PRODUCTION=false`；完成精确 HEAD 验证后仍需 PM 审核。

## 单条候选 Claim 的人工复核合同
每次追加只允许绑定一个已验证的 V2 extraction candidate claim。调用方必须提供：
- 已认证服务端生成的 `actor`、`scope` 和真实原始会话 `sourceMessages`；
- 一个 `GlhV2ExtractionCandidate`、目标 claim 的索引/字段/候选值/ message ID；
- `candidateVersion`、`baselineVersion`、`modelId`、`modelVersion`、`promptVersion`、`knowledgeVersion`；
- 明确 `actorConfirmed=true`、服务端可信 `trustedReviewedAt`、原因和幂等键。

模块会使用共享 evidence validator 重新核验 candidate evidence 与原始消息。claim 必须引用同组织、同询盘的真实 INBOUND message，并保留精确原文摘录；MEDIA claim 只能引用该消息已有的 canonical media reference。伪造来源、出站消息、跨组织/询盘证据、错误的 claim 索引/字段/值、版本不一致和 malformed candidate 全部失败关闭。

最终 classification 只能是：
- `ACCEPTED`
- `CORRECTED`
- `REJECTED`
- `NEEDS_FOLLOW_UP`

`TRUE`、`FALSE`、`UNKNOWN` 不再是最终人工复核枚举。`ACCEPTED` 的 after value 等于 candidate before value；`CORRECTED` 必须提供与 candidate value 不同的修正值；`REJECTED` 与 `NEEDS_FOLLOW_UP` 的 after value 为 `null`。

## 追加审计记录
每条记录包含：
- 组织、询盘、已分配 Sales profile、事实/幂等 ID；
- claim ID、索引、字段、候选 before value；
- 人工 after value、classification、reason；
- candidate/baseline/model/model-version/prompt/knowledge 版本；
- `reviewedByProfileId`、角色、明确确认和可信时间；
- `supersedesFactId`、`APPEND_ONLY_IMMUTABLE` 审计标记、`reviewOnly=true` 和 `authoritativeBusinessFact=false`。

已有历史必须是从首条开始、引用有效原始 INBOUND 证据且通过 `supersedesFactId` 串联的不可变记录。重复事实 ID、重复幂等键、坏 scope/classification、缺失确认/时间/版本或伪造历史全部拒绝。任何幂等键复用都失败关闭，即使 payload 完全相同；调用方不能把重复提交伪装成安全重放。

人工接受或修正只产出可审阅草案，不把模型候选提升为权威业务事实，不创建客户/项目，不改 GLH V1 A/B/C/D、CPC SS-N、负责人、价格或客户状态，也不自动淘汰、移交或发送消息。

## 三个参考维度
- **Completeness**：先验证 trusted corpus 与完整 evidence，再统计六项参考资料（product/material/quantity/country/requirementType/purchaseTimeline）中的候选字段数，固定 `needsVerification=true`。
- **Fit / Intent**：均返回 `REVIEW_REQUIRED`；没有真实工业适配或采购意图评分，不造分。
- 输出固定 `providerCalls=0`、`realModelAccuracy=NOT_MEASURED`、`useForGrade=false`、`authoritativeWriteAllowed=false`。

字段数和合成测试只验证数据合同及确定性行为，不代表真实模型准确率、语义解释准确率或漏筛率。

## 确定性回归
`tests/unit/global-lead-hub-v2-human-feedback.test.ts` 覆盖：
- Sales A/B 隔离、同组织 manager 复核、停用/跨组织/角色伪造拒绝；
- 候选 claim 与版本/candidate/原始 INBOUND 证据精确绑定；
- 伪造、出站、跨组织/询盘、重复消息和错误摘录拒绝；
- `ACCEPTED/CORRECTED/REJECTED/NEEDS_FOLLOW_UP` 的值语义；
- 相同 payload 的幂等键复用、重复 fact ID、旧更正、历史污染和坏历史链拒绝；
- 缺失 actor confirmation、坏时间、坏 reason、旧枚举与 malformed input 拒绝；
- trusted corpus 先行验证、只读 advisory completeness 和禁止权威写入。

该专项测试已由 `tests/unit/global-lead-hub-v2-llm-extraction-eval.test.ts` 调用。共享评测仍固定 `realModelAccuracy=NOT_MEASURED` 与 provider calls `0`；合成通过数不是真实 accuracy。

## 本地验证与残余边界
本地或 wrapper 应运行：

```bash
node node_modules/tsx/dist/cli.mjs tests/unit/global-lead-hub-v2-human-feedback.test.ts
node node_modules/tsx/dist/cli.mjs tests/unit/global-lead-hub-v2-llm-extraction-eval.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

这不是数据库认证、RLS、事务或并发 E2E。未来 UI/真实事件落库必须另立 DEV migration/RLS 任务，验证 Sales A/B/Manager 隔离、原子追加审计、幂等唯一约束与并发更正。Production SQL/RLS/env/secrets、真实渠道和模型供应商激活仍是独立人工 Gate。
