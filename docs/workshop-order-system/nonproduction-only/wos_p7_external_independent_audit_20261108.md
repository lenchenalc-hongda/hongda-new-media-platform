# HongdaOS WOS P7｜一次性外部独立安全审核执行包

状态：**AUDITOR NOT APPOINTED / NO INDEPENDENT APPROVAL / PRODUCTION BLOCKED**

适用仓库：`lenchenalc-hongda/hongda-new-media-platform`，PR [#213](https://github.com/lenchenalc-hongda/hongda-new-media-platform/pull/213)；正式分支 `master`。本文件随 QA 分支开发；**任何新增 commit 都必须重新锁定 HEAD 审核**。不得把文件中的历史 SHA 当成最新签名目标。

## 1. 工作目标与不可越过的边界

交付目标不是“帮忙写代码”，而是由与代码作者不同的真实技术人员对 **WOS P7 的认证、跨组织隔离、Storage 和 RPC 事务、断线恢复、GitHub CI 秘钥治理、迁移风险** 做一次性独立安全评审。顾问只输出可复核证据、风险与签收意见。

**禁止事项：**未经另行批准，不合并 #213、不打开任何 Production WOS 功能开关、不修改 Production Supabase 数据库 / Storage / RLS / Secrets、不复制客户真实图片、不提供数据库管理员密码、不使用生产账户、不向客户或供应商发消息、不代表老板签署上线授权。

审阅对象：
- QA Preview 提交/收件箱页面、`src/lib/workshop-orders/`、`src/middleware.ts`；
- `docs/workshop-order-system/nonproduction-only/` 中 P7 SQL，包括三个 `SECURITY DEFINER` 函数与 `PT409`；
- `storage.objects` 的 Permissive / Restrictive 组合、路径和组织绑定、匿名 EXECUTE；
- `scripts/wos-p7/security-review.mjs` 与 CI 静态门禁，以及此前真实浏览器 / 真实隔离测试数据；
- 未来生产迁移必须从 WOS Foundation 开始；目前不得把 QA 独立 SQL 直接套用正式库。

## 2. 最小权限：先审阅、再决定是否需要正式 GitHub APPROVE

| 阶段 | 给外部顾问的权限 | 允许动作 | 禁止 |
|---|---|---|---|
| A. 阅读与评估（默认） | **无仓库成员权限**。本项目目前是 Public，可直接阅读 GitHub PR / diff / CI 文本 | 本地下载代码、独立静态审阅、提交书面发现 | Vercel/Supabase/Actions Secret 访问；运行 Production 操作 |
| B. 隔离 QA 复现（仅确有需要） | 授权的合成测试账号或由内部人员现场演示；独立 `hongda-review-dev`，最小角色 | 复现已限定的 Auth/RLS/Storage 场景，留脱敏证据 | 真实员工/客户账号、生产 DB 密钥、Service Role、密钥型 CI 修改 |
| C. 正式 GitHub APPROVE（仅需计入保护规则） | **临时 Write**，限 WOS 主仓库并设置结束时间；GitHub 无“只能审批该 PR”的 Write 权限 | 审完 **最终精确 HEAD** 后使用 GitHub Review→Approve/Request changes | Merge、Push、修改工作流、创建生产发布、管理密钥。GitHub 技术上无法仅靠 Write 阻止非受保护分支推送，因此必须先启用分支保护并收紧 secret 环境 |
| D. 交付后 | 立即撤销临时 Write，或彻底移除协作者 | 保留已提交的独立 Review/签名报告 | 长期拥有仓库写权限 |

**必须先完成的 GitHub 管理员设置**（这些属于管理权限，当前助手连接无法设置/验证）：
1. 保护 `master`：Require PR、>=1 审核批准、Dismiss stale approvals、Require last push reviewed、Require status checks（待检查名称稳定）、禁止 force push / 删除、尽可能禁止管理员 bypass。
2. 在顾问临时 Write 窗口内保护 `qa/wos-nonprod-atomic-storage-20261107`：禁止直接推送与强推，任何修改走新 PR 和其他人审核；同时冻结 #213 HEAD 供审计。
3. `Settings → Environments → hongda-review-dev`：限制部署分支为受审查的准确 ref；检查 Required reviewers、Prevent self-review、Prevent bypass；**不满足则继续暂停密钥型浏览器 QA**。不能假定 Environment 已安全配置。
4. 顾问必须具备不同于 `lenchenalc-hongda` 的真实独立 GitHub 账号；AI 评论、机器人账号、同一人副号不得充当“第二名独立 Reviewer”。
5. 正式 PR 批准要计入 GitHub Required reviews 通常需要顾问 Write（或适当授权的 CODEOWNER）。只读公开意见可作为专业报告，但**不等于**满足 GitHub 所需的独立批准。

## 3. 逐项审计验收标准

审计报告至少覆盖以下检查，每项附源码位置 + 负面测试/证据 + 结论：

1. **身份与租户：**使用不同 QA 身份验证 Admin/Manager/Sales/Operator/Viewer/Foreign 访问；Org B 不得读取 Org A 的订单/私有图；客户端自填角色、组织、Owner 不能提升权限；`auth.uid()`、Profiles 权威和 JWT 会话一致性可证实。
2. **SECURITY DEFINER：**逐项审核 `wos_submit_production_order`、`wos_confirm_office_completeness`、`wos_register_uploaded_reference_image` 的 `search_path`、显式的签名人/角色/组织检查、匿名 EXECUTE 撤销、对象所有权和 RLS 绕过风险。Supabase Advisor 的 authenticated-executable WARN 不得直接忽略；须人工解释是否属于有意、必要且有防护的例外。
3. **原子事务与幂等：**并发同单、重复按键、HTTP 成功响应丢失、版本冲突、不同用户重放不能多建有效订单/Inbox 或绕过验收。
4. **图片安全：**Storage private、mime/尺寸限制、magic bytes/哈希校验、路径 Org/Order/Version 绑定、非法对象/跨租户读取拒绝；**magic bytes ≠ 病毒扫描**，需单独评估恶意文件风险。
5. **异常恢复：**刷新、关闭并重开浏览器、上传前断网、上传已成功但响应未达、Token 强制刷新和自然过期要明确区分。已通过前者的真实浏览器样例不代表自然过期验收。
6. **残留清理：**检验 Storage 与登记记录数的对应关系；孤立对象需按保护期自动隔离/报告，删除只能经审查的 Storage API 操作，不能直接 SQL DELETE 元数据。无孤立记录仅证明采样时点干净。
7. **GitHub 供应链与密钥：**`master` 和 QA 分支保护、GitHub Environment 秘钥访问、Actions 工作流触发、checkout token/第三方 Actions 权限；未经审核的 PR/分支代码不得自动获取测试密码。
8. **生产发布边界：**核实正式 Supabase 未被改动；对 Foundation→RLS→Storage→RPC→回滚执行顺序写出差异/缺口；不批准仅凭 QA SQL 提前迁移 Production。

严重度：**BLOCKER / HIGH / MEDIUM / LOW**。BLOCKER/HIGH 任何未修复项或未经验证的密钥暴露面，均判 **REQUEST_CHANGES / NO GO**。MEDIUM 必须给可执行缓解方案与责任人；LOW 可以入后续待办。不能使用“总体没问题”代替逐项结论。

## 4. 固定执行流程（一次性）

1. **选择顾问并确认独立性：**真实姓名及 GitHub 登录名、专业背景与历史项目、利益冲突声明；按固定审计范围约定费用和保密条款。保密承诺不等于提供 Secret 的许可。
2. **冻结审计 SHA：**从 #213 读取实时 head commit，建立 `AUDIT_HEAD`；导出本文件、完整 PR diff、测试日志链接、静态分析结果；不传任何密钥或隐私截图。
3. **第一轮只读审计：**顾问从公共 PR 审阅代码、写 Findings：`SEC-001` 等；每条给复现方式、触发条件、代码行、风险、最低修复标准；团队在原 QA 分支修复，顾问重新审最新 HEAD。
4. **管理员先加保护再授权：**GitHub 设置检查通过才考虑短期授予 Write，以提交可计入保护规则的正式 Review；顾问不应替代 GitHub 管理员。
5. **一次性签收：**最终 Review 必须引用完整 HEAD，所有 BLOCKER/HIGH=0，关键检查证据可复核；提交 GitHub `APPROVED` 或 `REQUEST_CHANGES`，附带以下报告模板；**审批的是代码/QA，不包含生产发布授权**。
6. **关门清场：**立即收回顾问 Write/测试账号，复核 repo collaborators、branch protection、Actions 和 Environment 审计记录，重新核对精确 HEAD / CI 是否一致。Production 迁移评审与正式发布单独申请老板授权。

## 5. 顾问交付报告模板

```text
WOS P7 External Independent Security Review
AUDITOR: <legal name / GitHub account>
INDEPENDENCE: <not the author, no conflict>
REPO / PR: lenchenalc-hongda/hongda-new-media-platform / #213
AUDIT_HEAD: <full 40-character git SHA>
REVIEW_DATE: <YYYY-MM-DD>
SCOPE: Auth / RLS / RPC / Storage / CI secrets / Recovery / Migration
EVIDENCE: <links to exact-head CI, QA test run, redacted queries, review diff>
FINDINGS:
  SEC-001 | BLOCKER/HIGH/MEDIUM/LOW | file:line | risk | proof | remediation | status
  ...
RESULT: APPROVE | REQUEST_CHANGES
REMAINING RISKS: <natural expiry, orphan cleanup, deployment secret governance, etc>
LIMITATION: Code + isolated QA audit ONLY; NOT Production authorization
SIGNED BY: <GitHub account and submitted review link>
```

## 6. 自动审阅与人工审核的区分

- [`scripts/wos-p7/security-review.mjs`](../../../scripts/wos-p7/security-review.mjs) 运行确定性的 **secret-free 代码断言**，遇到违反已知安全契约即让 CI FAIL；这是技术预审，不是 LLM 审核，也不是人工批准。
- 真正独立 AI 第二意见应由 Agent Control V3 采用**不同执行身份和只读权限**读取 GitHub diff，按上述范围输出结构化 `PASS | FINDINGS | BLOCKED`，绝不能写 `APPROVED` 或动 Production。变更后的 PR 必须重新审核。
- 密钥型浏览器测试目前已停用自动 push 触发；只有完成 GitHub Environment 保护且审查正确触发权限后才能恢复自动执行。当前受保护 CI 的历史通过仍可引用，但不代表新改的安全控制已经由独立人员批准。
- Production 上线仍为单独管理员/老板授权门槛：即使 PR 被 APPROVED，也不能自动执行 Production 数据库迁移或切换 WOS 功能开关。

### 追溯证据（历史代码 HEAD，不能冒充最终 HEAD）

- [WOS 10/10 业务连续测试](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/42434952551)；
- [真实登录 / Token 刷新 / 上传前后网络中断 / 新浏览器恢复](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/42436652846)；
- [当次 CI](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/42436658693)；
- [原有 WOS 发布安全门文件](./wos_p7_preview_http_release_gate_20261108.md)。

**审计任务仍未完成：必须等待不同真实人员的正式独立签收 + 其后单独生产授权。**
