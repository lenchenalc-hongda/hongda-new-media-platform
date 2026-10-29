# WOS Phase 5C — 非生产 API 只读链路（安全切片）

## 状态与范围
本阶段沿用 Issue #104 的 `WOS-P5C-NONPROD-ORDER-API-001` 原任务。自托管 Mac Runner 的 DeepSeek 提供商在 2026-10-29 返回真实 401 invalid API key，执行三次失败且无代码提交。因此使用 owner-authorized GitHub/manual coding fallback，在单一分支完成部分有界任务；**不得称为 Codex Writer bot attested 或真实业务上线**。

本 PR 的三个端点：
- `GET /api/workshop-orders/inbox`：仅在明示启用的非生产环境，通过经验证的 Supabase JWT + 活跃 `profiles` + 组织 RLS，真实查询 `wos_production_orders` 和 `wos_sampling_requests`；无 DB 数据时返回真实空列表，DB 不可读时明确返回 503，**不允许模拟数据伪装真实**。
- `POST /api/workshop-orders/production`：独立生产下单入口；验证组织内活跃登录与角色、输入幂等键和期望版本，但**不写入数据库**，返回 `ATOMIC_SUBMISSION_RPC_REQUIRED / 409`。
- `POST /api/workshop-orders/sampling`：独立打样入口；同样返回 409，不写入数据库。

## 默认关闭与生产隔离
`WOS_P5C_NONPROD_API_ENABLED` 默认未设置。只有设置成 `true` **并且**运行环境为 Vercel Preview 或本地 development 时 API 才允许读取。即使变量意外设为 true，`VERCEL_ENV=production` 必须拒绝所有三个入口。此次 PR 不修改任何环境变量。对于生产用户这些路由均返回 `NONPRODUCTION_ONLY_DISABLED / 503`。

不启用真实设备，不上传图片，不读取真实客户消息，不修改 CPC 客户/项目主数据、不触碰财务数据。

## 数据与访问边界
从服务器 verified JWT identity 查询当前 `profiles(user_id, id, org_id, role, is_active)`，只接受活跃同组织且在读权限白名单的档案。请求体、URL、用户自填 metadata 不得决定组织或身份。数据库查询同时要求 `organization_id=actor.orgId`，使用登录用户的 Supabase SSR client + RLS 而非 service role。读取两表当前非 DRAFT / 非 CLOSED 状态，按 source identity 去重，最多各 200 条；达到 201 即拒绝，避免静默漏单。所有结果二次验证组织、ID、版本、提交时间、状态及有效所属组织内负责人。异常或遗失负责人返回错误，不将任务误归属给管理员。只读合并列表保持生产单和打样单的不同 `entityType`。

这并不证明数据库表已部署，也不证明 RLS 实际正确：该阶段不执行 Supabase SQL，Production Migration 与私有 Storage 没有授权。

## 为什么 POST 必须拒绝
仓库现有 Phase 1 schema 允许创建 DRAFT 记录，但没有确保 **一次事务** 同时完成 SUBMITTED 状态、精确版本检查、幂等重放结果、一条车间 Inbox 事实及不可变审计事件。直接 `insert` 会形成“办公室以为下单成功，车间却未收到任务”的虚假一致性。故即使用户输入字段完整，本阶段仍返回 409。绝不把 DRAFT INSERT 当正式下单。

## 测试与后续门槛
现有已接入 CI 的 `tests/unit/workshop-order-suite.test.ts` 导入新 `workshop-order-api.test.ts`；覆盖未登录、停用/错误角色/错误组织、重复订单、版本冲突、无日期、跨组织映射、负责人不可见、幂等键无效及生产禁用。以上为合约/静态入口测试，不是已连接真实数据库的 Auth/RLS E2E。

下一阶段仅可在独立隔离 Supabase 测试库验证表、RLS、幂等 RPC、事务和审计；需要新范围锁定的 SQL 变更 PR。待实测证明正确才能允许真实 POST，Production SQL/RLS/数据及 Storage 一律仍需单独 Human Gate。此 PR 不能授权上游自动发起写入。
