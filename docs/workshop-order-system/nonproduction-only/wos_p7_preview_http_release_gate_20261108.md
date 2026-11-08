# HongdaOS WOS P7 | Preview HTTP 操作验收与发布审批清单

日期：2026-11-08 · 状态：**NOT READY FOR PRODUCTION — HUMAN/BROWSER GATE OPEN**

## 0. 执行范围与证据

- 业务仓库：\`lenchenalc-hongda/hongda-new-media-platform\`；Draft [PR #213](https://github.com/lenchenalc-hongda/hongda-new-media-platform/pull/213) （WOS P7 QA Preview）。
- 关联真实 JWT E2E：Draft [PR #214](https://github.com/lenchenalc-hongda/hongda-new-media-platform/pull/214)；[Actions #42392031816](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/42392031816) 为 **SUCCESS**，其中 WOS/GLH/CSO 三条真实非生产 Auth + Storage/RPC 验收均 PASS。
- 隔离数据库：Supabase \`hongda-review-dev\`（ref \`xulmpqaknlwqqculbsek\`），测试组织 A、B 独立；正式数据库未触碰。
- 已部署的 QA Preview 只在 \`VERCEL_ENV=preview\`、\`WOS_P5C_NONPROD_API_ENABLED=true\`、\`WOS_P7_NONPROD_SUBMIT_ENABLED=true\` 且 Supabase URL 与上述隔离项目精确匹配时开放。所有正式环境一律 fail-closed。
- Vercel Deployment Protection / SSO 仍启用。不得公开凭据或为了验收关闭保护。

## 1. 后端 / RLS / Storage 验收（已执行）

| 检查项 | 状态 | 证据 |
|---|---|---|
| 12 项 GitHub Environment Secret 非空、Admin/Viewer/Sales/Operator/Foreign 五个独立账号真实登录和组织归属 | PASS | [Actions #42392031816](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/42392031816) |
| CSO 双会话并发、不可变 V1/V2 打印快照、千分位金额 | PASS | 同一 Actions Run，\`CSO_REAL_AUTH=PASS\` |
| GLH 人工线索、幂等、Sales 分配、跨组织拒绝 | PASS | 同一 Actions Run，\`GLH_REAL_AUTH_E2E=PASS\` |
| WOS 非生产 DRAFT → 私有二进制图片 → server RPC 登记 → OFFICE readiness → 原子提交 → durable Inbox | PASS | 同一 Actions Run，\`WOS_REAL_AUTH_PRIVATE_STORAGE_E2E=PASS\` |
| 旧版本重复提交 409 / 幂等重放；PostgREST 避免用业务 40001 引发连接池重试 | PASS | \`PT409\` 已应用隔离数据库；同一 Actions Run |
| 角色 / 跨组织 RLS 复核：Admin、Operator 各可见 7 条，Viewer、Foreign 各可见 0 条 | PASS | 2026-11-08 实际 \`SET LOCAL ROLE authenticated\` JWT 身份模拟（仅非生产 SQL） |
| \`wos_submit_production_order\`、\`wos_register_uploaded_reference_image\`、\`wos_confirm_office_completeness\` 匿名 EXECUTE 授权 | PASS | 匿名不可执行，authenticated 可执行；函数内部使用 \`auth.uid()\` |
| Production 数据库/正式单据没有被 QA 测试改变 | PASS（按本次执行范围） | 所有执行都固定到 QA project，未做生产迁移 |

## 2. WOS Preview 页面接入（已实现代码，需浏览器验收）

- \`/workshop-orders/production/new\`：沿用完整生产单填写与本地校验；受控 QA Preview 另外开放「合成测试资料」→「选择 PNG/JPG/WEBP」→「创建数据库 DRAFT」→「私有 Storage 上传」→「RPC 登记」→「办公室确认」→「同源 POST /api/workshop-orders/production」→「收到持久回执」。
- \`/workshop-orders/inbox\`：受控 QA Preview 以 \`GET /api/workshop-orders/inbox\` 获取当前登录身份可见的真实 SUBMITTED 任务；显式刷新按钮；按订单点击使用当前登录身份读取 \`wos-private\` 中的真实图片字节。
- 非 QA Preview 仍保持纯本地表单和空态，**绝不自动开启生产数据写入**。
- 生产启动、排期、车间签样均未开放。
- 现阶段 QA UI 不提供跨刷新恢复已部分执行的订单事务；中断后应先查看 Inbox，不应以新幂等键盲目重试。这是 Production 的正式上线阻塞项。

## 3. 必须实际点击的完整 HTTP / UI 验收（PENDING）

下述验收必须由可进入受保护 Vercel Preview、并具备 **QA Auth 会话**的浏览器执行；仅仅 GET 未登录页面被重定向到登录页，不算通过：

- [ ] **Office / Sales 会话 A**：打开精确 QA Preview 的 \`/login\`，用测试 Admin 或 Sales 登录，登录后打开 \`/workshop-orders/production/new\`。确认蓝色 QA 专属提交区域出现，正式站没有该区域。
- [ ] 点击「自动填入全套合成 QA 测试资料」；选择一张非客户 PNG/JPG/WEBP；点击「检查资料完整性」，必填字段显示 100%。
- [ ] 点击「上传图片并提交 QA 订单」；浏览器 Network 证明真实 Storage 上传、登记 RPC、readiness RPC，以及 **同源 HTTP POST** 发生；\`POST /api/workshop-orders/production\` 应返回 **200**、\`SUBMISSION_VERIFIED\`、\`persisted:true\`、\`productionStarted:false\`。记录匿名化订单 ID / 响应状态和精确 Preview SHA。
- [ ] **Workshop / Operator 会话 B**：从 A 退出，或新独立浏览器上下文登录 \`operatortest@hongda.cn\`（切勿分享密码），访问 \`/workshop-orders/inbox\`，点击「刷新真实车间任务」；\`GET /api/workshop-orders/inbox\` 返回 **200**、\`source:SUPABASE_RLS\`、包含 A 的同一订单 ID 且状态 \`SUBMITTED\`。
- [ ] 在 B 点击「用当前车间身份读取私有图片」；实际读取非空二进制图片，链接可打开且不是 Public URL。
- [ ] **Viewer（同组织）**：登录后不得看到受限任务、图片或提交按钮；API 拒绝或不返回受限记录。
- [ ] **Foreign Sales（组织 B）**：不能读取组织 A 的订单 / 图片，也不能代组织 A 提交订单。
- [ ] 网络断开、双击、页面中断后不出现重复有效提交；同一幂等键重放返回验证回执，变更请求应 HTTP 409。
- [ ] 浏览器级测试结果另附时间、SHA、截图/Network 状态证据；禁止上传含 JWT、密码、Vercel bypass token 或客户图片的日志/截图。

## 4. 安全与独立审核（待最终签收）

- [x] 测试数据库仅 \`hongda-review-dev\`，URL 精确固定；Production fail-closed。
- [x] SERVER 端 JWT identity 由 Supabase 验证，组织/角色来自 \`public.profiles\`；不能接受客户端自填 organization/owner/status。
- [x] Office 仅 admin/manager/sales，Workshop read 限可用角色；Viewer 与 Foreign 身份隔离已做 SQL 复核。
- [x] \`wos-private\` bucket 为 private；jpeg/png/webp、20MiB 限制；path 与组织、订单、版本绑定，Storage RLS 实测。
- [x] 业务冲突使用 \`PT409\`；无超时重试死循环；正常真实 Auth E2E PASS。
- [ ] 第二名独立 Reviewer 在 PR #213 的**精确 HEAD** 逐项检查代码 diff、注入、RLS permissive/restrictive、Storage 对象访问、授权边界、失败恢复、日志不泄密。
- [ ] UI 浏览器双账号真操作记录与 API HTTP 状态通过（Section 3）。
- [ ] Chrome/Safari 实机浏览器、移动端响应式与异常网络 UI 回归。
- [ ] 生产发布前明确图片恶意文件扫描 / 类型实际字节校验、上传残留清理、业务草稿恢复机制。
- [ ] 生产数据库迁移包、回滚脚本、权限差异审查、正式环境单独审批。
- [ ] 多轮（建议 10 次）连续测试与 PostgREST 连接池压力、失败重试与容量验收。

## 5. 发布决策

**当前不批准合并到 master 或修改生产 Supabase。**

推荐先继续 P7 QA Preview 的实际浏览器操作验收、独立第二审阅、修复失败项，再单独提出精确 HEAD 的代码合并和迁移审批请求。注意：**即使 Draft PR 被合并，当前 QA-only feature gate 也不会在 Production 开启 WOS 下单。** 若要正式对车间开放，还需要另外评审 Production 版业务流程与安全迁移，绝不能简单将 QA 开关复制到 Production。

负责人动作：审阅 Section 3/4 的所有未完成项；只有全 PASS 才允许进入 Production release proposal。
