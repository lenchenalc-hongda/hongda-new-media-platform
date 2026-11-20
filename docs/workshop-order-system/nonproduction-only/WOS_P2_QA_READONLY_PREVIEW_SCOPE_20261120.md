# WOS P2 — 独立只读 QA 订单交接页面（新功能默认关闭）

**源任务**：Issue #262。**原始基线**：现有 Draft PR #261 精确 HEAD `2f76c6781bfa4451ed2749eef050218f0c2304d2`。

## 原因

现有 `/workshop-orders/inbox` 在 Vercel Preview 中只有以下条件全部符合才挂载真实 QA Inbox：

- `WOS_P5C_NONPROD_API_ENABLED=true`
- `WOS_P7_NONPROD_SUBMIT_ENABLED=true`
- `VERCEL_ENV=preview` 和 QA Supabase URL 白名单

2026-11-20 的隔离 Vercel 项目 `hongda-wos-p00202-qa-preview` **没有配置上述两项旧开关**；且 P7 开关与提交功能有关，不能为只读验收扩大操作权限。当前 PR #261 已有 READY Preview（Deployment `dpl_3Ecr4tt8SnojxezMoqA4MqFRB3iz`），但登录页之后的 QA 真实 Inbox 不会加载，导致角色浏览器验收无法完成。现有 Preview 已恢复 `exit 0` 构建抑制，并通过取消部署探针 `dpl_B7bA7XMgorxKuzyrtqB7QJ6p9bZW` 独立证明。

## 本次解决方案

创建新 URL `/workshop-orders/qa-handoff-readonly`，**不启用** P7 提交开关，不导入带有操作按钮的 `LiveQaWorkshopActions`，不调用任何写入 API。

开启条件同时必须满足：

1. Vercel 环境精确为 `preview`，正式环境不允许。
2. `AUTH_MODE=supabase`，必须使用真实 Supabase 当前账号 `auth.getUser()`。
3. **新的专属开关** `WOS_P2_QA_HANDOFF_READONLY_ENABLED=true`，默认为未设置/false，直接失败关闭。
4. `NEXT_PUBLIC_SUPABASE_URL` 必须精确匹配已批准 QA 项目 `https://xulmpqaknlwqqculbsek.supabase.co`。

开关开启以后，还需要当前账号提供真实的 Supabase Auth 登录，且 `profiles` 表中的用户、激活状态、角色和组织一致；`viewer`、其他组织的订单、缺少订单、损坏或被拒绝的 RLS 查询一律拒绝，不返回是否存在该订单的信息。只查询固定合成订单 `953d2204-3e65-4b75-b10e-c6e97f1bbb56` 的当前 `WAITING_MATERIAL/v7` 及同一组织、同一实体下的状态历史、物料、阻断和视觉基准。显示六步真实状态历史与四类物料缺口。

严格沿用 `evaluateWosP2HandoffTimeline` 和 `evaluateWosP2Readiness` 的失败关闭判断；即使全部记录通过，也**永不授权生产开工**。

## 文件白名单

- `src/lib/workshop-orders/p2-qa-readonly-preview.ts`
- `src/app/workshop-orders/qa-handoff-readonly/page.tsx`
- `src/components/workshop-orders/LiveQaHandoffReadOnly.tsx`
- `tests/unit/workshop-order-p2-qa-readonly-preview.test.ts`
- `tests/unit/workshop-order-suite.test.ts`
- `docs/workshop-order-system/nonproduction-only/WOS_P2_QA_READONLY_PREVIEW_SCOPE_20261120.md`

## 本次未授权的行为

新代码不得更改 GitHub 共享 `.github/workflows/**`、正式数据库 / RLS / Secrets、Vercel 正式项目或 QA 数据、QA Operator / Office 写入 Gate。不得自动部署新的 SHA，不得激活新的只读环境开关，不得自动合并 PR。PR #202 原共享锁仍由 Issue #160 保持 BLOCKED。不得把 Owner-only 技术验收冒充独立 Reviewer PASS。

## 验收等级

新分支的静态 / 单元测试及独立 GitHub-hosted 精确 SHA 构建通过时，可标记 `NEW_READONLY_CODE_VERIFIED`。真正的办公室/车间/Viewer/跨组织浏览器验收需要另行批准该新分支精确 SHA 的 Preview 和**仅一个新增只读开关**，而不是批准 P7 提交功能。未获得不同 QA 账号测试证据前 `REAL_ROLE_BROWSER_QA=NOT_VERIFIED`。
