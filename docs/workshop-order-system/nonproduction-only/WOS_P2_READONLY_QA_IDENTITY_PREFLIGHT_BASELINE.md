# WOS P2 QA｜第二轮真实 E2E 前的只读身份预检

**状态：提案 / 非生产 / 尚未集成 master / 不授权启动第二轮 E2E。**

## 基线

- 已合并 PR #243 的受保护 master：`fb94a4f7a0e263fbddf5c588d2782802ebf02157`，合并后完整 CI [#44240227341](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/44240227341) SUCCESS。
- WOS P2 业务 PR #241 精确 HEAD `89bb408d13e45458c608db29c47e2803d49b3170`、P1 PR #238 精确 HEAD `6a72b446ccc517a5ff14e531b8a6663b4a70a77e`，均仍 Draft / 未合并。
- 首次有授权真实浏览器 E2E [#44232596314](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/44232596314) 因 QA `127.0.0.1` 与页面 `localhost` 防护不一致而失败，未写入业务订单；已验证 GitHub `always()` 关闭 QA 两个 Gate。
- Supabase QA 项目严格限定 `xulmpqaknlwqqculbsek`；Office / Operator Gates 均 OFF、TTL NULL、审批引用 NOT_AUTHORIZED，30 秒独立 Watchdog 最近 succeeded。禁止改动正式业务 Supabase。

## 本 PR 新增的预检

新的 `tests/e2e/wos-p2-qa-identity-readonly-preflight.cjs` 只在受保护 `master` workflow 的 `hongda-review-dev` 环境下调用，使用 GitHub 受保护 QA 账号的短期登录会话；不读取或打印任何账号、口令、JWT、组织 UUID、响应正文。

验证以下角色及组织关系：

| QA 账号 | 预期可信角色 | 组织关系 |
|---|---|---|
| Admin | `admin` | QA 办公室组织 |
| Operator | `operator` | 与 Admin 同一组织 |
| Viewer | `viewer` | 与 Admin 同一组织 |
| Foreign | `sales` | 必须与 Admin 所属组织不同 |

数据仅来自固定 Supabase QA `/auth/v1/token`、`/rest/v1/profiles`，后者利用该账号 JWT 和实际 RLS 读取自身一条有效 Profile，不接受客户端自报的组织与权限。禁止使用 Service Role、SQL 管理员密码或生产 API Key。

**注意**：Foreign 为其他组织 Sales 而非其他组织 Operator。这个预检只能证明实际跨组织 Sales 身份；未来若要声称“外组织 Operator 浏览器拒绝”通过，需再准备独立的合成 Operator 账号并单独验收。

## 调度顺序与授权

1. 受保护 `protected-source-gate` 先核验 master、PR #241/#238 精确 SHA、独立安全审计、PG17 CI。
2. `Secretless source and browser setup` 在无密钥步骤中运行纯模拟身份与跨组织测试。
3. **新增：真实 QA Auth+RLS Profile 只读预检**，先验证全部四个账号映射、组织边界、账号唯一性和权限。此阶段不用打开 Office/Operator 数据库 Gate。
4. 成功后才构建 QA 本地 Preview，接续真实浏览器测试；真实写入只能在**全新 Owner 单次 15 分钟授权**、受保护环境审批和数据库双 Gate CAS 开启后运行。
5. 测试结束或失败 `if: always()` 使用受限 Close-only QA Admin RPC 关停两 Gate，Watchdog 兜底，独立读取订单及回执。

**本分支不得自动合并或使用受保护 GitHub Secrets 执行，直到取得新 HEAD 绑定的独立技术审计及 Owner 合并授权。不得重跑此前已耗尽授权的 Run #44232596314。**

## 不涉及的范围

不修改 P1/P2 业务代码、不新增数据库表或 RLS/Storage 迁移、不访问正式业务 Supabase、不触发 Vercel 生产上线、不合并 #238/#241、不启动 V3。

纯模拟、不带账号的本分支 CI [#44240994452](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/44240994452) SUCCESS。该结果证明预检逻辑的正确性，不代表四个真实 QA 账号已登录成功。
