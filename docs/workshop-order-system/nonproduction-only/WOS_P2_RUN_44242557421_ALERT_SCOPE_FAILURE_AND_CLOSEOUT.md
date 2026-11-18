# WOS P2｜第二次受保护浏览器 Run #44242557421 的失败终态与非生产修复

## 已独立证实的事实

- 受保护 QA GitHub Actions [Run #44242557421](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/44242557421)；master `e9108d830b0c1109cce66dafdd1b0f0411484e98`，业务 PR #241 精确 HEAD `89bb408d13e45458c608db29c47e2803d49b3170`。
- `protected-source-gate` **PASS**，四位真实 QA 测试账号（Admin / Operator / Viewer / Foreign Sales）登录、`profiles` RLS 自身读取和组织隔离预检 **PASS**；本地 Next.js QA Preview Build **PASS**。
- 真实浏览器在 `OFFICE_QA_SUBMIT_OR_ERROR` 阶段 **FAIL**。日志 `WOS_P2_QA_SUBMIT_UI_ERROR_CODE=UNCLASSIFIED`，无成功的 `POST /api/workshop-orders/production` 回执，尚未到 Operator 接单/退回或 Office 修订。
- 此 Run 在 Owner 准备进行单次 QA Gate CAS 开启前已失败、并经独立检查确认为 `completed/failure`，所以**本轮没有激活数据库写入 Gate**。不得在结束后开启 Gate；不重复运行本 Run。

## 安全闭环实际回读（2026-11-18 05:17:44 UTC）

- `wos_qa_safety.p2_gate_close_receipts` 留存 Run ID `44242557421`、`reason=FAIL`、关闭时间 `05:17:05 UTC`，两项 `was_enabled=false`。GitHub `always()` 关闭步骤 **SUCCESS**。
- 两个 Gate：`enabled=false`、`enabled_until=NULL`、`approval_reference=NOT_AUTHORIZED`；30 秒 `pg_cron` Watchdog 最近 `succeeded`。
- P1/P2 数据计数未变：83 个 QA 订单、81 Inbox、81 P1 提交回执、7 P2 Operator 回执、88 状态历史；Office 新修订 0、Operator 新 Review 0。
- 正式业务 Supabase、RLS、Storage、Secrets、Vercel Production、PR #238/#241 均没有因本次真实 E2E 修改。

## 静态源码确认的 UI 误判风险

- 旧受保护脚本使用 `office.page.getByRole('alert').first()` 作为提交失败信号，选择范围为整张办公室页面。
- 实际 Office 页面还包含独立的“办公室退回补资料任务”组件（有 `role="alert"`）以及表单校验错误块（有 `role="alert"`）。脚本可能首先匹配**与下单提交无关**的提示，产生 `UNCLASSIFIED` 并在任何 HTTP 提交之前误报。
- 日志不包含触发该信号的 DOM 文字，因此无法证明究竟是哪一个非提交提示发生；这里是充分的源码缺陷与高度吻合的根因定位，不能伪称有浏览器 DOM 截图证据。

## 本 Draft PR QA-only 修复

1. 将监听区域限制到 `section[aria-label="隔离数据库真实下单验收"] [role="alert"]`，确保办公室其他组件的提示不会抢先判定下单失败；存在提交前旧错误时直接 Fail-Closed。
2. 加入真正的**无凭据 Chromium** DOM 回归测试：先显示其他组件的 `role="alert"`，证明旧的全局选择器会匹配错误对象；验证新的局部选择器不触发，再模拟本组件发生错误可被正确捕获。**没有连接 QA Auth、数据库、Storage、Business API，也不打开任何 Gate**。
3. 在受保护 GitHub 工作流中增加构建成功后的 `QA Preview ready, bounded Owner CAS handoff`，产生 `WOS_P2_QA_PREVIEW_READY_FOR_SINGLE_OWNER_GATE_CAS=YES` 日志，并保留固定 90 秒的安全协调间隔；Runner 自身**没有数据库写入凭据、不能自行打开 Gate**。在此期间只能由经过单次 Owner 授权的独立数据库执行者 CAS 开启，且最长 15 分钟。本等待步骤不表示 Gate 已打开，也不构成再次授权。
4. 保留原 `if: always()` QA Admin Close-only RPC、到期 Watchdog、受保护环境审批及准确业务 HEAD 校验，禁止自动重跑 E2E。

**合并门槛：** QA-only PR 精确 HEAD 的无凭据 Chromium、完整仓库 CI、独立源代码安全审计全部通过后，仍需新的 Owner 精确 SHA 合并授权。另一次真实双账号 E2E **需要新的单次独立 Owner 授权**；此次发生失败的 Run 不允许 rerun/replay。任何正式业务库、RLS、Storage、Secrets、生产部署或业务 PR #238/#241 合并不在范围内。