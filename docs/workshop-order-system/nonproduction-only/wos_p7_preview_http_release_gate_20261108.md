# HongdaOS WOS P7 | Preview HTTP 操作验收与发布审批清单

日期：2026-11-08 · 状态：**NOT READY FOR PRODUCTION — HUMAN/BROWSER GATE OPEN**


## 2026-11-08 Owner sign-off: real Vercel Preview Office → Workshop → Private Image

- **User explicitly confirms** the SSO-protected Vercel Preview human flow **Admin office order submission → Workshop Inbox receipt → opening the private reference image** is PASS. This is an **owner-reported acceptance**, not an independently captured browser video/Network trace.
- Grounded record: QA production order `QA-NONPROD-4477d824-f1ce-4364-a12a-1bd9fdacd5b9`, database ID `0198528d-05e2-4cc5-b40e-304ad5ef73bb`, status `SUBMITTED`, 1 receipt, 1 Inbox row, 1 READY image registry row as verified with read-only SQL; user screenshot had matching Inbox row.
- Protected Vercel QA Preview branch was READY; initial user-supplied screenshot alone demonstrated the Inbox, then the user explicitly confirmed the image-viewing step.
- **This approval is limited to QA UX acceptance**, not PR merge, a second-person independent code review, 10-cycle reliability pass, Production DB migration, Production feature flags or manufacturing authorization.

## 0. 执行范围与证据

- 业务仓库：`lenchenalc-hongda/hongda-new-media-platform`；Draft [PR #213](https://github.com/lenchenalc-hongda/hongda-new-media-platform/pull/213) （WOS P7 QA Preview）。
- 关联真实 JWT E2E：Draft [PR #214](https://github.com/lenchenalc-hongda/hongda-new-media-platform/pull/214)；[Actions #42392031816](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/42392031816) 为 **SUCCESS**，其中 WOS/GLH/CSO 三条真实非生产 Auth + Storage/RPC 验收均 PASS。
- 隔离数据库：Supabase `hongda-review-dev`（ref `xulmpqaknlwqqculbsek`），测试组织 A、B 独立；正式数据库未触碰。
- 已部署的 QA Preview 只在 `VERCEL_ENV=preview`、`WOS_P5C_NONPROD_API_ENABLED=true`、`WOS_P7_NONPROD_SUBMIT_ENABLED=true` 且 Supabase URL 与上述隔离项目精确匹配时开放。所有正式环境一律 fail-closed。
- Vercel Deployment Protection / SSO 仍启用。不得公开凭据或为了验收关闭保护。
- 当前精确 QA WOS 代码基线：`b1ab5e388c89f88c0c8eb08f67e225ad536312e1`。对应 [GitHub CI #42431799076](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/42431799076) **SUCCESS**。
- 当前同代码真实 Playwright 浏览器验收：[Actions #42431794228](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/42431794228) **SUCCESS**；测试在 GitHub Runner 启动的 Next Preview-mode 本地实例上操作网页，数据和真实 Auth/Storage 访问独立 Supabase，而不是越过 Vercel SSO。
- 精确代码部署 [Vercel Preview b1ab5e38](https://hongda-new-media-platform-6m9039vye-lens-projects-3fc386bd.vercel.app/login) 已 READY，受 Vercel SSO 保护；**线上该域名的真实登录后点击验收仍单独 PENDING**。


## 1. 后端 / RLS / Storage 验收（已执行）

| 检查项 | 状态 | 证据 |
|---|---|---|
| 12 项 GitHub Environment Secret 非空、Admin/Viewer/Sales/Operator/Foreign 五个独立账号真实登录和组织归属 | PASS | [Actions #42392031816](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/42392031816) |
| CSO 双会话并发、不可变 V1/V2 打印快照、千分位金额 | PASS | 同一 Actions Run，`CSO_REAL_AUTH=PASS` |
| GLH 人工线索、幂等、Sales 分配、跨组织拒绝 | PASS | 同一 Actions Run，`GLH_REAL_AUTH_E2E=PASS` |
| WOS 非生产 DRAFT → 私有二进制图片 → server RPC 登记 → OFFICE readiness → 原子提交 → durable Inbox | PASS | 同一 Actions Run，`WOS_REAL_AUTH_PRIVATE_STORAGE_E2E=PASS` |
| 旧版本重复提交 409 / 幂等重放；PostgREST 避免用业务 40001 引发连接池重试 | PASS | `PT409` 已应用隔离数据库；同一 Actions Run |
| 角色 / 跨组织 RLS 复核：Admin、Operator 各可见 7 条，Viewer、Foreign 各可见 0 条 | PASS | 2026-11-08 实际 `SET LOCAL ROLE authenticated` JWT 身份模拟（仅非生产 SQL） |
| `wos_submit_production_order`、`wos_register_uploaded_reference_image`、`wos_confirm_office_completeness` 匿名 EXECUTE 授权 | PASS | 匿名不可执行，authenticated 可执行；函数内部使用 `auth.uid()` |
| Production 数据库/正式单据没有被 QA 测试改变 | PASS（按本次执行范围） | 所有执行都固定到 QA project，未做生产迁移 |

## 2. WOS Preview 页面接入（代码完成；本地 Preview-mode 浏览器 PASS）

- `/workshop-orders/production/new`：沿用完整生产单填写与本地校验；受控 QA Preview 另外开放「合成测试资料」→「选择 PNG/JPG/WEBP」→「创建数据库 DRAFT」→「私有 Storage 上传」→「RPC 登记」→「办公室确认」→「同源 POST /api/workshop-orders/production」→「收到持久回执」。
- `/workshop-orders/inbox`：受控 QA Preview 以 `GET /api/workshop-orders/inbox` 获取当前登录身份可见的真实 SUBMITTED 任务；显式刷新按钮；按订单点击使用当前登录身份读取 `wos-private` 中的真实图片字节。
- 非 QA Preview 仍保持纯本地表单和空态，**绝不自动开启生产数据写入**。
- 生产启动、排期、车间签样均未开放。
- 现阶段 QA UI 不提供跨刷新恢复已部分执行的订单事务；中断后应先查看 Inbox，不应以新幂等键盲目重试。这是 Production 的正式上线阻塞项。

## 3. 浏览器点击验收：已通过与仍待通过的明确边界

### 3A. 已完成——真实浏览器、真实 Auth/Storage/RPC、实际 HTTP 操作

证据：[GitHub Actions #42431794228](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/42431794228)，精确 QA 代码 `b1ab5e388c89f88c0c8eb08f67e225ad536312e1`，状态 SUCCESS。Playwright 使用独立 Admin/Operator/Viewer/Foreign QA 密码登录会话、Chromium 实际点击和浏览器 Network 请求，对接 `hongda-review-dev` 的真实 Supabase Auth、Storage 以及 WOS 事务 RPC；该浏览器运行在 Runner 上的 Preview-mode 本地 Next 服务，不是 Vercel 受保护部署。

- [x] Admin 打开 `production/new`，点击合成资料、选择非客户 PNG、验证完整性，再点击私有上传与 HTTP 提交。
- [x] Storage 实际上传字节、服务器登记、办公室齐套确认、POST `/api/workshop-orders/production` HTTP 200，`SUBMISSION_VERIFIED` 及 persisted=true、productionStarted=false。
- [x] Operator 第二浏览器上下文登录，进入 `/workshop-orders/inbox`，点击刷新并得到 GET HTTP 200；含同一订单 ID 和 SUBMITTED 状态。
- [x] Operator 点击受保护的私有图片读取，实际取得非空 PNG bytes；并验证 Operator POST 提交被 403 拒绝。
- [x] Viewer 查看 Inbox 被 403 拒绝，页面也不显示办公室 QA 提交按钮。
- [x] Foreign Sales 组织 B 无法读取组织 A 的订单；后端独立 SQL/JWT RLS 检查再次确认。
- [x] QA 用户密码只在 Playwright 进程中可用，启动 Next 测试服务器时显式剥离各测试账号 EMAIL/PASSWORD 环境变量。
- [x] 自动化测试不外发客户消息，不启动实际生产，不上传真实客户图片，不在日志输出密码、JWT、对象路径或截图。

### 3B. 尚未完成——精确 Vercel SSO 部署的有人值守/受保护浏览器验收

- [x] Owner confirmed SSO-protected Vercel QA Preview flow after browsing; original fixed code-URL preserved for traceability: 使用有权进入 Vercel SSO 的浏览器，打开固定部署 [b1ab5e38 QA Preview](https://hongda-new-media-platform-6m9039vye-lens-projects-3fc386bd.vercel.app/login)，登入真实 QA Admin。
- [ ] 在该 Vercel 域名完成一次同样的办公室点击提交；网络请求必须留在同源 Preview，实际 Storage 项目必须仍为 `hongda-review-dev`，POST 回执需与订单一致。
- [ ] 在独立浏览器上下文切换 QA Operator，刷新相同 Vercel Preview Inbox，找到相同订单并下载私有图片。
- [ ] 按实际环境核验 Viewer/Foreign 角色拒绝访问；保留 **不含密码/Token/Cookie** 的 HTTP 状态证据、浏览器版本和精确部署 SHA。
- [ ] 模拟网络中断、页面刷新、双击，确保不会误建重复有效提交；跨刷新恢复、草稿恢复方案仍需独立设计和验证。
- [ ] Safari/Chrome/移动端布局和异常网络场景复测。

Vercel Deployment Protection 不能为方便测试而关闭；当前工具只能以身份受限方式读取公开/授权 URL，不能替代已登录 Vercel SSO 的真实浏览器交互。

## 4. 安全与独立审核（待最终签收）

- [x] 测试数据库仅 `hongda-review-dev`，URL 精确固定；Production fail-closed。
- [x] SERVER 端 JWT identity 由 Supabase 验证，组织/角色来自 `public.profiles`；不能接受客户端自填 organization/owner/status。
- [x] Office 仅 admin/manager/sales，Workshop read 限可用角色；Viewer 与 Foreign 身份隔离已做 SQL 复核。
- [x] `wos-private` bucket 为 private；jpeg/png/webp、20MiB 限制；path 与组织、订单、版本绑定，Storage RLS 实测。
- [x] 业务冲突使用 `PT409`；无超时重试死循环；正常真实 Auth E2E PASS。
- [ ] 第二名独立 Reviewer 在 PR #213 的**精确 HEAD** 逐项检查代码 diff、注入、RLS permissive/restrictive、Storage 对象访问、授权边界、失败恢复、日志不泄密；当前 GitHub PR 尚无独立批准 review。
- [ ] 明确审核 GitHub `hongda-review-dev` Environment 的 branch allowlist、required reviewers 与 secret 执行权限，避免未审核代码获得测试账号密码。
- [x] GitHub Runner 本地 Preview-mode 双账号浏览器真操作与 HTTP 状态通过（Section 3A），[Actions #42431794228](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/42431794228)。
- [ ] 精确 Vercel SSO 线上域名的人工浏览器点击签收（Section 3B）。
- [ ] Chrome/Safari 实机浏览器、移动端响应式与异常网络 UI 回归。
- [ ] 生产发布前明确图片恶意文件扫描 / 类型实际字节校验、上传残留清理、业务草稿恢复机制。
- [ ] 生产数据库迁移包、回滚脚本、权限差异审查、正式环境单独审批。
- [ ] 多轮（建议 10 次）连续测试与 PostgREST 连接池压力、失败重试与容量验收。

## 5. 发布决策

**当前不批准合并到 master 或修改生产 Supabase。**

推荐按 **3B Vercel SSO 实机验收 → 独立 Reviewer 精确 HEAD 审核 → 草稿恢复及图片安全与清理 → 10 轮串行连续复测与连接池稳定性 → 迁移/回滚演练 → 单独 Production 授权** 的次序推进，然后提出精确 HEAD 代码合并及生产数据库迁移的分离式审批请求。注意：**即使 Draft PR 被合并，当前 QA-only feature gate 也不会在 Production 开启 WOS 下单。** 若要正式对车间开放，还需要另外评审 Production 版业务流程与安全迁移，绝不能简单将 QA 开关复制到 Production。

负责人动作：审阅 Section 3/4 的所有未完成项；只有全 PASS 才允许进入 Production release proposal。
