# GLH V2 | Agent Control 分阶段 Coding 任务清单

PLAN = docs/global-lead-hub/18_GLH_V2_ACQUISITION_PRODUCT_PLAN.md
STATE = BOUNDED_BACKLOG / NOT_DISPATCHED
CONTROL = Issue #72
CURRENT_ACTIVE = GLH-P4-AI-QUALIFICATION-OFFLINE-001 / PR #171 / PM_REVIEW
ONE_ACTIVE_TASK_PER_PROJECT = true
PROVIDER_CALLS = false
AUTO_MERGE = false; AUTO_PRODUCTION = false

## 0. 调度和文件锁规则

本文件不是 AGENT_CONTROL_PROJECT_TASK_V1，不得被 Watchdog 当作 READY。PR #171 的精准 HEAD CI 和专项测试完成、按旧任务合同审核及正常合并门禁解决后，检查最新 master + Issue #72 machine state，再按顺序提交单个 Task V2-B。不得覆盖 active_pr、verified_head、current_task_id，不重复投递前一个 trigger。

普通 GLH 任务只用 docs/global-lead-hub/、src/lib/global-lead-hub/、src/app/global-lead-hub/、src/components/global-lead-hub/、tests/unit/global-lead-hub-* 的精准白名单。跨 CPC、视频中台、.github/workflows、package、src/lib/supabase 等共享路径必须经独立基础设施或所属模块任务及 shared lock，不可在本 GLH task 偷改。

下列各 task 先独立 Coding + 测试 + draft PR + PM Review；完成后才发下一项。全部 non-production，禁止 provider、真实客户、支付/成交权威和部署变更。

## V2-A | GLH-V2-A-INQUIRY-EVIDENCE-CONTRACT-001

STATUS = PLAN_BRANCH_DRAFT_CODE / NOT_AGENT_DISPATCHED

允许：
- docs/global-lead-hub/18_GLH_V2_ACQUISITION_PRODUCT_PLAN.md
- docs/global-lead-hub/19_GLH_V2_CODING_BACKLOG.md
- docs/global-lead-hub/20_GLH_V2_INQUIRY_EVIDENCE_CONTRACT.md
- src/lib/global-lead-hub/v2-inquiry-evidence.ts
- tests/unit/global-lead-hub-v2-inquiry-evidence.test.ts

目标：先建立 LLM 结构化字段草案的纯函数型证据合同。每个候选值绑定实际入站 message_id 与原文摘录或附件；拒绝凭空造来源、使用 outbound 作为客户证据、错误的媒体类型、坏 schema、越界置信度和重复断言。所有输出都是人工可审草案，不自动评分、派单、客户消息发送、DB 写入。

验收：中、英、阿语合成测试；专项 tsx 和 typecheck PASS；无改变 Phase4 文件、真实 API、任何迁移；独立 draft PR 非自动合并。

## V2-B | GLH-V2-B-LLM-EXTRACTION-EVAL-001

PRIORITY = P0. 精确 allowed paths 由 dispatch 时生成，优先 v2-inquiry-evidence 新文件及 tests/unit/global-lead-hub-*。

任务：真正的 LLM 原始对话→语言/意图/三类工业产品→结构化字段候选设计与离线调用桥，输出严格 schema、引用 message_id、无证据字段留 null、保留 raw、不生成真实回复。独立知识版本和 prompt 版本。合成案例覆盖 PP/ABS、花膜/加工/设备、机器节拍、各语言、短句 Price?、正式 RFQ、报价技术承诺、客户提示词注入、未知来源/错位图像、模型超时。不与现有 Phase4 引擎并发改文件，保留 V1 Grade 与立即转人工规则。真实模型 API 是否启用必须符合独立环境/模型供应商审批，首步可用 mock 适配层，不能冒充真模型通过。

验收：至少 20 个基准样本；漏筛/错分/幻觉定量报告和人工可审证据；失效保持原消息并转人工；禁真实发送；typecheck/test/build/secret audit/smoke。

## V2-C | GLH-V2-C-HUMAN-QUALITY-FEEDBACK-001

PRIORITY = P0.

任务：定义 human-confirmed-qualification (TRUE/FALSE/UNKNOWN + reason + reviewed_by + reviewed_at + source_id)、独立 completeness/fit/intent 草案指标。现有 V1 A-D 规则和 CPC SS-N 不变；确定真实 UI/DB 改动时走 DEV 专项 migrations/RLS 验收并单独生产 Gate。人工能纠错，重要客户不会因为初筛资料少而被自动淘汰。

验收：Sales A/B 隔离、Manager 合理总览、重复确认幂等、误判审计、AI 无权改业务确认结果。

## V2-D | GLH-V2-D-ADS-READONLY-001

PRIORITY = P1.

任务：先用合成广告快照构造国家/广告/素材的数据归因 read-model，计算 CPL、CPQL、合格率、Quote/Sample/Won。没有真实广告 ID 不归因，货币不能混合，分母 0 显示 N/A。Meta Ads API 仅在许可后分开的 read-only 连接器，不写任何预算、开关或广告账户状态。严格读数与 Ads Manager 对账。

## V2-E | GLH-V2-E-CONTENT-BRIDGE-001

PRIORITY = P2.

任务：盘点 HongdaOS 内容中台和 GLH 主键，提出 reviewed video asset→post draft→Meta post status→ad creative id 的只读/模拟桥梁，真实发布额外 Gate。对比 Meta 官方 API 与 Buffer/Metricool/Later 等提供商的授权/价钱/API/导出，不复制剪辑器。共享代码归属由 HongdaOS Chief Architect 协调。

## V2-F | GLH-V2-F-MULTICHANNEL-SIM-001

PRIORITY = P0/P1.

任务：只用合成 Facebook Messenger、Instagram、WhatsApp 消息做统一事件格式与幂等重放、多语言文本/媒体、人工接管、失败保留原文，DEV RLS 验证。任何渠道真实连接、Webhook 收消息或自动发送都要独立批准。不能在一个会话启两个 AI 自主回复。

## V2-G | GLH-V2-G-CPC-CONVERSION-EVENTS-001

PRIORITY = P1.

任务：规划 GLH lead→CPC customer/project→真实报价/样品/成交的可追溯只读链接；权限、幂等、一个客户多项目及多广告归因必须可验证。禁止改 CPC 客户等级/负责人权威。Meta CAPI 正式回传另需明确同意/隐私/owner Gate。

## V2-H/I | 非生产试点与生产 Gate

任务：DEV + 合法测试资产 + 浏览器多角色 E2E、真实节省时间与错漏筛复盘、故障恢复、回滚预案。生产部署/渠道激活/自动消息/官方社媒发布/广告预算写入/CAPI 是五项独立的 owner approval；不可合并为一次笼统授权。

## 待老板确定的两项商业规则

A. GENERAL_PRICE_HANDOFF: 对一句泛询价是否允许 AI 先补 1–3 项信息？在确认前仍按 V1 立即转人工。
B. FIT_INTENT_GRADE: 三维质量指标是否影响 GLH A/B/C/D？在确认前仅作并列参考，不改老评分或自动派单。

## 状态治理约定

GLH Issue #72 是唯一该项目的 Agent Control 状态权威。V2 草案可以并行做不会触发通道、生产或状态流转的只读代码，但**正式下一任务不能在 #171 活动期间 DISPATCH**。待 old task status COMPLETE、owner 合并/生产 gate 独立处理后，按最新 master 生成 task/allowlist/trigger，而非对旧 task 追加未经识别的文字后宣称已执行。
