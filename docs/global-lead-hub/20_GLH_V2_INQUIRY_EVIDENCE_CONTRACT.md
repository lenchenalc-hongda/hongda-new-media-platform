# GLH V2 | 入站询盘字段证据合同（离线）

STATUS = DRAFT_ONLY / NONPRODUCTION
TASK = GLH-V2-A-INQUIRY-EVIDENCE-CONTRACT-001
IMPL = src/lib/global-lead-hub/v2-inquiry-evidence.ts
TEST = tests/unit/global-lead-hub-v2-inquiry-evidence.test.ts
PROVIDER_CALLS_ENABLED = false

## 背景

现有 Phase4 评分引擎评估已整理好的客户资料，不等同于 AI 真正阅读聊天。接下来加入大模型提取时，必须阻止把「模型猜测」直接变成公司正式客户事实、报价承诺、准确广告归因或客户分级。

本模块只验证一个可审阅的证据草案，**不接入任何 LLM 服务，不生成客户回复、不发送、不持久化、不更改评分和客户主数据**。

## 数据接口

输入 A：调用方已经通过授权渠道持久保存且确认可访问的原始消息清单，包含 message id、方向 INBOUND/OUTBOUND、TEXT/MEDIA、原始 text、附件存在标记。此处不负责鉴权、数据库读写或 webhook 验签；实际集成者必须使用 GLH 的可信 server/access/RLS 边界获取。

输入 B：完全不可信的模型草案，schemaVersion 必须等于 GLH-V2-INQUIRY-EVIDENCE-001；inquiryId 与 claims，每项 claim 为 field、value、sourceMessageId、文本 excerpt（仅 text）、confidence 0..1。只支持 GLH 原有业务资料字段名称；额外字段如 approved price 一律拒绝。

接受条件：
- 只能引用输入 A 真实存在的 INBOUND message ID；不能使用客服 OUTBOUND、未知 id、重复的消息 id；
- text 证据必须精确包含于该条原文；可给出规范化 value，但每项都需附来源摘录；
- imageReferences 必须对应真实 MEDIA 附件消息，但仅证明“客户发了附件”，不证明图片确实是什么产品；
- confidence 必须 0..1 有限数，小于 0.6 会在草案上提示需复核（不是生产评分阈值）；
- 不接受超长、空白、非法字段、重复的同一 claim、超数量草案；
- 无有效 claim 仍可以返回空草案，但不能据此自动将客户评为 D 或直接拒绝。

## 固定输出安全标记

humanReviewRequired = true
customerFacingAutoSendAllowed = false
authoritativeWriteAllowed = false
legacyGradeUntouched = true

即便完全有效，结果也只能交给后续人工或经过授权的服务端校验；不能自行写入 GLH/CPC、改变 A/B/C/D、发送广告转化事件、发消息、重新分配业务员。

## 回归样本和边界

单元测试包含英文 PP 和数量/国家、阿语机器、中文 ABS、合成图片、源消息被捏造/挟持、机器人把客服的 OUTBOUND 当客户证据、摘录不一致、无效字段、坏置信度、重复 claim、空草案、客户消息内 prompt-injection。

这只证明类型/证据验证器，**不是**模型语言识别准确率、图片视觉识别、真实 Meta 接入、真实 Supabase 事务或 Webhook 幂等性。

## 本地精确验证

pnpm exec tsx tests/unit/global-lead-hub-v2-inquiry-evidence.test.ts
pnpm typecheck

完整发布测试还需 CI Build / Secret Audit / Smoke 以及新增测试进入 CI；如需改 .github/workflows/ci.yml，必须按共享基础设施独立任务处理。本草案不修改 CI 或任何生产配置。

后续 V2-B 使用实际模型前，还需：人工标注样本、供应商/密钥审查、模型 version/prompt version、输出 JSON 严格解析、人工质量反馈、跨组织来源权限和详细评测门禁。
