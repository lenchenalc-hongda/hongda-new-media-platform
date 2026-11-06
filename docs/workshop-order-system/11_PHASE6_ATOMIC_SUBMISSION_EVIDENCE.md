# WOS Phase 6｜办公室订单原子提交证据合同（2026-11-06）

## 独立测试库只读检查（未做任何数据库修改）
项目：`hongda-review-dev` / Supabase `xulmpqaknlwqqculbsek`（不是正式 `hongda-new-media`）。
- 已存在 `wos_production_orders`、`wos_sampling_requests`、`wos_status_history`、`wos_reference_images` 以及 Phase 1 基础表。
- 生产订单、打样申请、参考图片、状态历史当前均为 **0 条**；有 20 个活跃 profiles，但尚未证明办公与车间多账户授权访问。
- 所有已检查的 WOS 基础表启用 RLS。现有 authenticated 表级授予包含生产单/打样单 DRAFT INSERT/SELECT，而状态历史只授予 SELECT；这**不能**证明跨用户真实 RLS。
- **不存在** `wos_submission_receipts` 表，**不存在**可审查的 `wos_submit_office_draft` 原子 RPC。本轮未创建它们。
- 生产系统 `POST /api/workshop-orders/production`、`POST /api/workshop-orders/sampling` 仍返回非生产禁用 / 原子 RPC 缺失，且没有被本 PR 修改。

## 本 PR 新增：不接受虚假提交成功
`p6-atomic-submission-evidence.ts` 是仅供未来服务端受信任 RPC 使用的纯合约判定，不是客户可提交的 HTTP route。须同时证明：
1. 活跃、组织内、授权办公室身份，来源与负责人同组织、版本与标签精确匹配；
2. 一次事务真实完成 Source DRAFT→SUBMITTED 更新、幂等提交回执、一条当前 Inbox fact、不可变状态审计，各恰好 **1 行**；
3. 同幂等键重放只能使用原回执，Source 已经 SUBMITTED，**0 个新写入**；重放改变业务摘要则失败；
4. Source、actor、owner、type、版本、请求指纹、三个独立事实 ID 完全一致且 transactionCommitted=true，才可能返回 persisted=true；
5. 无论成功与否，都不能自动解除花膜/夹具/来料/签样及设备开工 Gate，也不开放 Production。

这只是**验收合约**，不是数据库 commit 的充分证据。不能信任浏览器提交的 `TRUSTED_NONPRODUCTION_RPC` 标志。必须由服务端在真实经过核验的事务后返回，而且最终仍需数据库约束/权限审查。

## 后续执行顺序
A. 单独审查非生产 SQL Migration：组织+idempotency 唯一、源版本 CAS、提交回执、Inbox 唯一、不可变审计、两入口状态机、事务回滚及权限。
B. 在 DEV 数据库运行真实并发两会话测试：Sales A/B、车间、管理员、跨组织 403/404、同 key 重放、不同 key 重复版本、事务异常回滚。检查独立的服务端 Auth。
C. 私有 Storage bucket `wos-private` + 上传签名路径、类别和版本锁；先 DEV RLS 及文件访问测试。
D. 接通真实办公室下单 API → 车间 Inbox → 多账户 E2E → 业务人工验收；最后才另行申请 Production schema 与上线权限。

**本 PR 保留原 409/503 保护**，不得把单测通过当成真正可以交单。
