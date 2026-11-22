# WOS Phase 5C — 非生产 API 只读链路（安全切片）

## 状态与范围
本阶段沿用 Issue #104 的 `WOS-P5C-NONPROD-ORDER-API-001` 原任务。自托管 Mac Runner 的 DeepSeek 提供商在 2026-10-29 返回真实 401 invalid API key，执行三次失败且无代码提交。因此使用 owner-authorized GitHub/manual coding fallback，在单一分支完成部分有界任务；**不得称为 Codex Writer bot attested 或真实业务上线**。

当前端点：
- `GET /api/workshop-orders/inbox`：通过经验证的 Supabase JWT、活跃 `profiles`、精确 QA 项目绑定、服务器组织条件和 RLS，真实查询 `wos_production_orders` 和 `wos_sampling_requests`；无数据时返回已校验空列表，读取失败时返回明确错误，**不允许模拟数据伪装真实**。V1 读取开关与所有写入开关独立，详见下文。
- `POST /api/workshop-orders/production`：独立生产下单入口；验证组织内活跃登录与角色、输入幂等键和期望版本，但**不写入数据库**，返回 `ATOMIC_SUBMISSION_RPC_REQUIRED / 409`。
- `POST /api/workshop-orders/sampling`：独立打样入口；同样返回 409，不写入数据库。

## 默认关闭与生产隔离
额外强制绑定官方测试 Supabase 项目 hongda-review-dev（项目 ref: xulmpqaknlwqqculbsek）。即使 Preview 显式开启，如果 NEXT_PUBLIC_SUPABASE_URL 指向正式项目 hongda-new-media、未知主机、HTTP 或带路径/查询参数的地址，仍返回 503，不能读取正式数据。

`WOS_QA_INBOX_READONLY_ENABLED` 默认未设置。只有它精确为 `true`、`VERCEL_ENV=preview`、`AUTH_MODE=supabase`，且 Supabase URL 精确指向 QA 项目 `xulmpqaknlwqqculbsek` 时，普通 Inbox 的 GET 才允许读取。Production 始终拒绝。该读取开关不依赖也不开启 `WOS_P5C_NONPROD_API_ENABLED` 或 `WOS_P7_NONPROD_SUBMIT_ENABLED`。

`WOS_P5C_NONPROD_API_ENABLED` 继续只用于原有非生产写入/提交路径，不是 Inbox 读取的必要条件。即使任一写入变量意外设为 true，也不能改变读取开关的生产拒绝，且 `WOS_QA_INBOX_READONLY_ENABLED` 不能授予 POST、PATCH、DELETE、RPC 写入、排产或开工权限。

不启用真实设备，不上传图片，不读取真实客户消息，不修改 CPC 客户/项目主数据、不触碰财务数据。

## 数据与访问边界
从服务器 verified JWT identity 查询当前 `profiles(user_id, id, org_id, role, is_active)`，只接受活跃同组织且在读权限白名单的档案。请求体、URL、用户自填 metadata 不得决定组织或身份。数据库查询同时要求 `organization_id=actor.orgId`，使用登录用户的 Supabase SSR client + RLS 而非 service role。读取两表当前非 DRAFT / 非 CLOSED 状态，按 source identity 去重，最多各 200 条；达到 201 即拒绝，避免静默漏单。所有结果二次验证组织、ID、版本、提交时间、状态及有效所属组织内负责人。异常或遗失负责人返回错误，不将任务误归属给管理员。只读合并列表保持生产单和打样单的不同 `entityType`。

## Operator 普通 Inbox V1 — 持久化读取

普通 `/workshop-orders/inbox` 在读取开关通过时使用独立的 `PersistedWorkshopInbox` 纯只读组件。该组件只调用两个 GET 形态：

- `GET /api/workshop-orders/inbox`：返回当前组织可读的持久化生产单和打样申请。
- `GET /api/workshop-orders/inbox?orderId=<uuid>`：返回单一生产订单的当前资料、P1 Inbox/Submission Receipt 证据、四类物料、CURRENT 图片基准、状态历史、确认记录和只读 readiness 结果。

详情参数只能是单个合法 `orderId`；任何其他参数均被拒绝，且 `orderId` 从来不作为组织、角色或负责人授权依据。服务器仍以可信身份、Profile、`organization_id=actor.orgId` 和 RLS 为准。

P1 Inbox 的原始 `SUBMITTED` 状态不会覆盖当前订单状态。当前 `READINESS_CHECK/v11/QA-R6` 只在原始 Inbox、提交回执、源修订或已登记的 QA-R 修订历史、当前订单版本和十条版本绑定状态链全部一致时返回。图片仅按当前订单版本、`READY` 和未 superseded 标记为当前；旧版本或 superseded 图片明确显示为历史。

只读详情本身仍只调用 GET；接单、退回和修订复核由独立的 `OperatorWorkflowActions` 写入组件承载。该组件只在受控客户端 Gate、服务器 Gate、可信身份、组织 RLS、合法状态和当前版本同时通过时提交，且在 Gate 关闭时只显示禁用说明。页面不导入物料确认、签样确认、最终 readiness、排产或开工组件。所有结果固定 `canStart=false`；四类物料或双签记录通过仍不等于人工生产放行。

这并不证明数据库表已部署，也不证明 RLS 实际正确：该阶段不执行 Supabase SQL，Production Migration 与私有 Storage 没有授权。

## 为什么 POST 必须拒绝
仓库现有 Phase 1 schema 允许创建 DRAFT 记录，但没有确保 **一次事务** 同时完成 SUBMITTED 状态、精确版本检查、幂等重放结果、一条车间 Inbox 事实及不可变审计事件。直接 `insert` 会形成“办公室以为下单成功，车间却未收到任务”的虚假一致性。故即使用户输入字段完整，本阶段仍返回 409。绝不把 DRAFT INSERT 当正式下单。

## 测试与后续门槛
现有已接入 CI 的 `tests/unit/workshop-order-suite.test.ts` 导入 `workshop-order-api.test.ts` 和 `workshop-order-persisted-inbox.test.ts`；新增覆盖读取 Flag 关闭、Production/错误认证模式/错误项目拒绝、Viewer 拒绝、Office/Operator 可读、跨组织拒绝、v11 当前状态与十条历史、旧版图片隔离、读取异常不退化为模拟订单，以及 Inbox 页面无写操作调用。以上为合约测试；真实 Supabase RLS/Auth 仍须在专用 QA Preview 中单独验收。

下一阶段仅可在独立隔离 Supabase 测试库验证表、RLS、幂等 RPC、事务和审计；需要新范围锁定的 SQL 变更 PR。待实测证明正确才能允许真实 POST，Production SQL/RLS/数据及 Storage 一律仍需单独 Human Gate。此 PR 不能授权上游自动发起写入。

## Operator 接单与 Office 修订闭环

普通 Inbox 的 `SUBMITTED` 订单提供两个独立动作：

- `ACCEPT`：调用既有 `wos_qa_p2_operator_action`，数据库确认后订单进入 `WORKSHOP_REVIEW`。
- `RETURN_FOR_INFORMATION`：必须提供至少 10 字原因，数据库确认后进入 `NEEDS_INFORMATION`，并保留退回原因和审计历史。

`WORKSHOP_REVIEW` 只有在状态历史中存在与当前 `version`、`versionLabel` 和合法请求 ID 匹配的 `QA_P2_OFFICE_RESUBMIT_CORRECTION` 时，才显示 `REVIEW_CORRECTION`。复核调用既有 `wos_qa_p2_review_correction`，成功目标为 `WAITING_MATERIAL`，不得跳到 readiness 或开工。

操作结果只有在响应中的订单 ID、请求 ID、版本 `expectedVersion + 1` 和目标状态均与数据库合同一致时才被接受。成功后读取组件作废旧详情缓存并重新请求当前列表；断线重试保持相同 request ID，以数据库幂等回执为准。并发使用旧版本请求时由 RPC 返回版本/幂等冲突。

Office 的普通生产下单页通过 `WOS_QA_INBOX_READONLY_ENABLED` 独立读取 `GET /api/workshop-orders/p2/returns`，不依赖 P5C 或 P7 写开关。退回任务显示原因、时间、责任人、当前版本和六项可补充字段；责任人档案若因 RLS 不可见则回退显示 Profile ID，若已停用则明确提示重新指派，不阻断整张待办。保存修订与重新提交由既有 `wos_qa_p2_office_revision` 分别处理：

- `SAVE_CORRECTION`：停留在 `NEEDS_INFORMATION`，生成新的修订版本和历史快照。
- `RESUBMIT_CORRECTION`：进入 `WORKSHOP_REVIEW`；空 patch 仅允许用于数据库已存在当前版本保存修订的情况。

原始 P1 Inbox 和 Submission Receipt 不变。所有写入仍分别受 `WOS_P2_QA_MUTATIONS_ENABLED`、`WOS_P2_QA_OFFICE_REVISION_ENABLED`、服务器返回的写能力、可信身份、组织 RLS 与数据库原子事务约束。409 版本/幂等冲突会作废旧请求标识并重新读取最新版本；断线后未确认结果才保留同一请求 ID 重试。Office 退回列表使用请求代数与 AbortController，旧响应不得覆盖新结果。本轮代码开发不开启任何 Gate，也不执行 QA/Production SQL。

## M4-01 普通 Inbox 物料、现版图片与双签工作台

普通 Inbox 详情在既有 P1/P2 证据之后增加服务器派生的 M4 只读工作台。该工作台继续使用当前登录用户的 Supabase SSR client、同组织 RLS、精确订单范围和最小字段投影，不引入 service role，也不增加表权限。

工作台统一展示：

- 四类物料 `FILM`、`FIXTURE`、`INCOMING_MATERIAL`、`SIGNED_SAMPLE` 的当前状态、版本标签、到位时间、应到/实到数量、缺口、确认人员与待补证据。
- 当前版本图片、`PRODUCT`、`FILM_PATTERN`、`CUSTOMER_APPROVED_SAMPLE`、`SIGNED_SAMPLE` 四类基准项、历史/替代图片和 CURRENT 基准唯一性。
- Office 与 Workshop 的 profile、确认时间、post-order version、proof-set 摘要存在性及双方摘要一致性。
- `QA_M2_BASELINE_SELECT`、`QA_M2_BASELINE_OFFICE_CONFIRM`、`QA_M2_BASELINE_WORKSHOP_CONFIRM`、`QA_M2_FINAL_READINESS_CONFIRM` 的连续事务历史。
- 缺口优先级、下一步只读责任动作、人工 proof 复核需求和固定 `canStart=false`。

数据读取现状必须明确区分：authenticated RLS 可以读取物料、baseline、baseline item、reference image、状态历史和同组织可见 Profile；当前不能读取 `wos_qa_verified_image_proofs` 或 `wos_qa_p2_m2_receipts`，且 M2 proof 检查函数没有 authenticated EXECUTE。因此普通 Inbox 可以识别历史 M2 proof-set 双签与连续状态事务，但不能在当前会话中重新认证私有 proof 或 Storage object 的未过期状态。

该限制按 fail closed 处理：`historicalM2EvidenceComplete` 与 `currentPrivateProofState` 分开显示；历史双签完整不产生 `reviewReady=true`，不恢复旧确认，不把文件存在当成证明有效，也不允许开工。后续若要在普通 Inbox 直接重验 live private proof，必须另行设计最小只读 verifier、独立 SQL/RLS/Storage 审核及 Owner 授权，不得复用本轮代码开发授权。
