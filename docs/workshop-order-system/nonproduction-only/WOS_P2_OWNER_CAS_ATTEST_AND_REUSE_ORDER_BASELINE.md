# WOS P2｜Owner CAS 有效证明与既有 QA 订单复用｜非生产开发基线

**状态：仅源代码开发和无凭据 CI；未批准安装 QA RPC、未批准开启任何 Gate、未批准新一轮真实浏览器 E2E、未批准合并。**

## 1. 业务验收从原有订单开始

原先已通过真实浏览器 Run [#44255738492](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/44255738492) 建立：

| 项目 | 精确值 |
|---|---|
| Supabase QA Project | `xulmpqaknlwqqculbsek` |
| 受审业务 PR #241 HEAD | `89bb408d13e45458c608db29c47e2803d49b3170` |
| 已有 QA order ID | `953d2204-3e65-4b75-b10e-c6e97f1bbb56` |
| 已有 QA order number | `QA-NONPROD-d2f91453-fe42-42e9-98d4-a6a902645ded` |
| QA organization | `0ff53d93-2b9e-48b9-8113-a4768c39cdd2` |
| 已核实状态/版本 | `SUBMITTED` / 2 |
| 已核实 P1 证据 | 1 个原始 Inbox + 1 条提交回执 |
| 该订单现有 P2 Operator 动作 | 0 |

新一轮测试 **不得**再次提交办公室新生产订单，不得再次上传 P1 测试图片，不得生成第二条 Inbox、第二条 P1 提交回执。必须在任何 Operator 写入前由数据库只读证明重新核验这一既有订单确实仍是 SUBMITTED/2、只有原始一条回执、无已执行 P2 动作；若此基线变化，拒绝而不是私自修复或替换订单。

浏览器从 `OPERATOR_LOGIN → OPERATOR_EXISTING_ORDER_INBOX → OPERATOR_ACCEPT` 开始，再接 `OPERATOR_RETURN → OFFICE_LOGIN_AFTER_RETURN → OFFICE_SIX_FIELD_REVISION → RESUBMIT → OPERATOR_REVIEW`。保留版本冲突、幂等、签样失效、Viewer 和外组织 Sales 拒绝等负向用例。外组织 Sales 拒绝不能冒充外组织 Operator 的独立拒绝。

## 2. Gate 交接不再靠固定 sleep

受保护 master 的 `wos-p2-pr241-protected-qa.yml` 保持严格顺序：

1. `workflow_dispatch` 从受保护 master 派发，`GITHUB_RUN_ATTEMPT=1`。核对 GitHub master SHA、精确 #241/#238 SHA、原独立审计与三项 PG17 CI；手工批准 `hongda-review-dev` 环境。
2. 用既有四个受保护 QA 账号进行真实 Auth + RLS Profile 只读预检。
3. Build QA-only Preview，并验证本地 localhost 正常响应。
4. **只读 Owner CAS 证明关卡**：用 QA Admin 的普通登录 JWT（非 Service Role、非管理数据库密码）调用新的 `public.wos_qa_p2_owner_cas_attest`。单次探测每 5 秒，最多 10 分钟；`WAITING` 不代表授权，`READY` 只有当数据库实际核验匹配的两项 Gate、Run ID、已有订单、版本、到期和组织之后才能出现。不认 GitHub 评论、页面文本、手填 `PASS`、自动 sleep 或未经签名的本地文件。
5. **读取到 READY 才启动 Playwright**；Playwright 在启动前再次调用真实 QA RPC 验证当前状态，防止只是拿过一个过期的准备信号。每个既有业务 SQL Mutation RPC 仍必须自己核验真实 Gate 与 TTL，关停时无法继续写入。
6. 无论失败、成功、取消，都执行已有 QA Admin close-only `if: always()` RPC 并保留回执，30 秒独立 Watchdog 兜底。Run 一旦关闭不能继续证明或重试。

固定 90 秒等待已移除。10 分钟仅是 **等待证明的失败截止时间**，不是强制等待时间；一旦数据库证明 READY 就立即继续。若没有正式 QA SQL 安装或 Owner CAS，测试失败关闭且**没有业务写入**。

## 3. 拟议的最小权限 QA-only SQL（尚未安装）

参见 `wos_p2_owner_cas_attest_PROPOSED_QA_ONLY.sql`。

- 仅设计一个 QA 私有安全回执表 `wos_qa_safety.p2_gate_open_receipts`（Run ID 唯一，拒绝 anon/authenticated 的 SELECT/INSERT/UPDATE，启用 RLS）和一个只读的 `public.wos_qa_p2_owner_cas_attest(text,uuid,text,integer)`；不修改任何原 Gate 表权限。**两者都尚未安装到真实 QA。**
- 函数在只读查询中使用经过 Supabase JWT 确认的 `auth.uid()` 和权威 `profiles`，限定本组织有效 Admin，拒绝 anon/Operator/其他组织 Admin。
- 函数内置固定 QA 项目和固定订单/业务 SHA/版本，核验原始 Inbox/回执与无 P2 动作，并拒绝同 Run 的历史 Close Receipt。
- **必须存在真实私有开闸回执**：同一 Owner DBA 原子事务内成功更新两个 Gate，随后插入唯一 `p2_gate_open_receipts`。证明函数核对私有回执的 Run ID、原订单、业务 SHA、精确批准引用、`opened_at` 和 `expires_at`，并要求它们与两条 Gate 的值完全相同才返回 `READY`。只靠两个 Gate 都 ON、时间戳接近、GitHub 评论或客户端环境变量均不足以放行。
- 严格核验双 Gate `enabled=true`、`approval_reference=OWNER_RUN_<runId>_PR241_89bb408d`、<=15 分钟 TTL 及回执一致性。仅双 Gate 都关闭且**无开闸回执**时可回 `WAITING`；任何部分开启、缺失回执、过期或引用不符均拒绝。
- `SECURITY DEFINER` 是为了精确读取已经受控的 Gate 表；设置固定 `search_path`，`REVOKE EXECUTE FROM PUBLIC,anon`，`GRANT EXECUTE TO authenticated` 且函数内部检查有效 QA Admin。**不得**给 authenticated/anon 任何 Gate 表的 SELECT/UPDATE 权限。
- 不访问正式业务 Supabase，不使用 Service Role 客户端密钥，不修改生产数据库、RLS、Storage、Secrets 或 Vercel Production。

**安装前置门槛**：单独的精确 SQL 技术安全审计与 Owner 对 QA 项目 `xulmpqaknlwqqculbsek` 的明确迁移授权。此 PR 不执行该 SQL 到真实 QA。

## 4. 独立 Owner CAS 激活要求（此文件不是授权）

未来在新一条、精确 HEAD 且唯一一次的 Owner 批准下：

- 对接精确 GitHub Run ID（不可复用失败 Run #44255738492 或其他已关闭 Run）。
- 使用 `wos_p2_owner_cas_ACTIVATION_TEMPLATE_NOT_AUTHORIZED.sql` 的经审核版本作为唯一 Owner DBA 原子事务框架；未替换 `REPLACE_WITH_NEW_APPROVED_GITHUB_RUN_ID` 的模板明确不能成功运行。在同一事务中检查旧 Gate OFF/TTL NULL、无旧开闸/关闭回执、固定订单 SUBMITTED/2，CAS 写入两个 Gate **完全相同**的开启时刻和至多 15 分钟 TTL，原子插入唯一私有开闸回执；任何失败整个事务回滚。
- 两个 Gate 必须和唯一私有开闸回执在**同一个 DB Commit** 成立；单独打开 Gate 或在另一事务补插回执不符合 Owner 事务审计要求。只读证明函数同时核验三者的原始精确字段。
- 激活后受保护 GitHub Runner 仅能读取新证明函数，不能执行任何 DBA 写入；若 Owner 未执行 CAS，则到了等待截止时间直接失败。
- 证据至少包括 GitHub Run ID、Owner CAS 原子成功回执、只读 Gate 证明的 READY、真实浏览器各步骤、`always()` close-only 回执、Watcher 记录及事务后数据库状态。

## 5. 非生产测试与验收

- `tests/unit/wos-p2-owner-cas-attest.test.cjs`：纯 mock，无 Supabase 网络调用，覆盖等待、即时 READY、固定 Run 重放拒绝、过期、错误头、错误 QA 项目、单边 Gate、失败关闭。
- `tests/sql/wos-p2-owner-cas-pg17-setup.sql`、`tests/sql/wos-p2-owner-cas-pg17-tests.sql`：GitHub-hosted **临时 PostgreSQL 17** 中执行真实拟议函数；明确禁止连接 Hosted Supabase。
- `tests/e2e/wos-p2-qa-alert-isolation-secretless.cjs`：无凭据 Chromium 测试只选已存在订单，不做新增 P1。
- `.github/workflows/wos-p2-owner-cas-reuse-secretless-ci.yml`：隔离无密钥 CI；不使用 QA Admin 密码、PG Service Role 或真实 QA Gate。

**任何 CI PASS 都不等于实际 P2 车间闭环 PASS。** 只有在下一次独立批准后，实际 Owner Gate、Operator 接单、退回、Office 六字段修订、重新提交、Operator 复核、幂等/冲突/越权/签样失效与最终关闭证据均 PASS，才能将 P2 E2E 标记成功。

## QA Gate 写入范围的数据库强制保护（新增 / 尚未安装）

只读检查发现：同一 QA 组织有 84 张订单，83 张不是此次获批的目标订单；现有 Operator/Office/复核 SECURITY DEFINER RPC 校验角色、组织、Gate 和版本，但不绑定本次唯一订单或 Run。故本 PR 的 QA-only 安装方案增加 `wos_qa_safety.p2_single_order_write_guard()` 与 `wos_qa_p2_single_order_gate_guard`。

当任意 QA Gate 为 ON 时，数据库触发器只允许对原订单 `953d2204-3e65-4b75-b10e-c6e97f1bbb56` 进行 UPDATE，拒绝其他订单 UPDATE、所有新 INSERT、所有 DELETE 和篡改原订单 ID/组织/订单号；同一 RPC 内已写的阻塞项/回执等随事务回滚。**两 Gate 都 OFF 时不改变既有 QA 写入行为。** Owner CAS 只读证明还必须验证该触发器已启用，否则无论 Gate 状态如何均不能返回 READY。

此触发器只针对未来经过单独审核授权的 Supabase QA 安装；代码开发没有修改真实 QA 或正式数据库。临时 PG17 CI 验证 Gate OFF 普通 DML、Gate ON 正确订单更新和其他订单 INSERT/UPDATE/DELETE 拒绝、Owner CAS 后的相同范围保护。
