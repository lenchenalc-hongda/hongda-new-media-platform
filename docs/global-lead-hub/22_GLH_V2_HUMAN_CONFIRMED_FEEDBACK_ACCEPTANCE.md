# GLH V2-C 人工确认商机质量反馈｜离线验收（非生产）

## 身份与阶段
- 任务：`GLH-V2-C-HUMAN-FEEDBACK-OFFLINE-001`，使用现有 Issue #72 的唯一活动任务，未创建第二个业务系统。
- 交付：纯 TypeScript `v2-human-feedback.ts`，合成场景测试，本文档。
- 来源：因 Mac 编码工具 DeepSeek 401 阻塞，本次是人工授权的 GitHub 手工编码切片，**不能伪称 Codex bot Completion Contract**。需要独立审核和 CI 精确 HEAD 验证。
- 本次无新 API/UI、SQL migration、RLS/Storage/Production 数据/环境/密钥变更，无真实客户消息、模型服务调用、广告操作和 CPC 写入。

## 人工确认权威
Sales 必须是已分配询盘的负责人；Manager/Admin 仅限本组织。调用方需要由已经认证的服务端提供 `actor`、可信 `scope`、真实 INBOUND 原消息和 `trustedReviewedAt`，本纯模块不是服务端鉴权替代品。
只有人工动作能产生一条 `TRUE/FALSE/UNKNOWN` 确认事实，记录 `reviewedByProfileId`、`reviewedAt`、`reason`、`sourceMessageId`、`idempotencyKey` 和被更正的上条事实 ID。原始审阅历史不可变，重复同一命令幂等重放，不同内容复用键必须冲突。更正只能针对现有最新事实，旧事实留存供审计。

保留 V1 的 100 分 A/B/C/D 评分和 CPC SS-N 客户等级；没有项目负责人或评分的双写；没有自动移交、自动淘汰高价值线索、自动报价、给客户发消息或投流。即使人手确认 TRUE，本功能也**不能**单独触发客户或项目创建。

## 三个参考维度
- **Completeness**：统计六项参考资料（product/material/quantity/country/requirementType/purchaseTimeline）中有多少*候选*字段，返回 `needsVerification=true`。字段来自 AI 证据草稿，不证明解释正确。
- **Fit / Intent**：均返回 `REVIEW_REQUIRED`，尚未制定真实工业适配和采购意图评分，不得造分。
- 所有结果仅供业务员审阅，不改 V1 Grade、不自动筛掉资料少但可能有价值的客户。

## 拒绝与测试
已加入 `tests/unit/global-lead-hub-v2-human-feedback.test.ts` 并通过已接入共享 CI 的 `global-lead-hub-v2-llm-extraction-eval.test.ts` 调用。合成回归覆盖：
- Sales A/B 的负责人隔离、同组织 manager 覆盖、跨组织拒绝、停用人拒绝
- 原始 INBOUND 来源、错组织/询盘/出站消息/重复消息失败关闭
- 同幂等键安全重放、冲突拒绝、追记更正、旧更正/历史污染拒绝
- 禁止无效时间、缺失原因、坏 ID、自动审批；历史不可变
- 三维只读建议、不修改 GLH V1 Grade/CPC、禁止自动淘汰/发送

这不是数据库认证与 RLS E2E。未来 UI/真实事件落库必须先在隔离 DEV 数据库通过 Sales A/B/Manager RLS、原子审计、幂等及并发更正测试；Production 数据迁移、真实对客/模型供应商激活要单独审批。
