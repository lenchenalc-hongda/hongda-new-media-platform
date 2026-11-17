# WOS P2｜真实双账号验收执行与安全回退基线（尚未授权执行）

**状态：PREPARED / NOT INSTALLED / NOT DISPATCHED。** 这是独立受保护 QA 浏览器工作流的交付说明，不能直接用于正式业务。

## 1. 代码与独立技术证据

- 业务：Draft PR [#241](https://github.com/lenchenalc-hongda/hongda-new-media-platform/pull/241) 精确 HEAD `89bb408d13e45458c608db29c47e2803d49b3170`。
- 前序：Draft PR #238 HEAD `6a72b446ccc517a5ff14e531b8a6663b4a70a77e`；原始 P1 提交回执和 Inbox 不得重建、修改、删除。
- 原有 P2 事务 CI：GitHub [Run #44127583534](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/44127583534)，三个 Job SUCCESS，均在隔离 PostgreSQL 17，无 QA 凭据。
- 独立代码安全审计：GitHub [Run #44128682235](https://github.com/lenchenalc-hongda/hongda-new-media-platform/actions/runs/44128682235) SUCCESS，审核代码 SHA `3e526b09195ff34bae70f6c38fe39d0b73e39cb5`，107 项负向测试；不是第二名人工 GitHub APPROVED。
- Vercel Preview `dpl_CvvrgiknRJXmaS7AjqFYeDHeR91c` READY：仅证明构建，不代表浏览器 E2E。
- 唯一批准候选：QA Supabase 项目 `xulmpqaknlwqqculbsek`。禁止任何 Production 项目操作。

## 2. 必须先完成的独立授权

下列门槛不得合并为一次默许：

1. **QA-only SQL 安装审批**：仅允许业务精确 HEAD 的两份 SQL，精确 blob：
   - `docs/workshop-order-system/nonproduction-only/wos_p2_office_revision_resubmit_QA_ONLY_NOT_INSTALLED.sql`，Git blob `7b9e9a8a561f97e283e9d78e25a5380dcb7d2a3c`。
   - `docs/workshop-order-system/nonproduction-only/wos_p2_operator_revision_compat_QA_ONLY_NOT_INSTALLED.sql`，Git blob `8d0c9d4e973aa94a5352c288b12c1c3152cf1b69`。
   - 原 Operator P2 SQL `cea2d46bf743ffbce8adc7363825193ec0cd3460` 已单独授权安装在 QA，Gate 当前 OFF。不可重复安装或执行整个原 SQL。
2. **前置审计**：核验 QA 项目健康、原有 83 订单 / 81 P1 提交回执 / 81 Inbox / 7 P2 Action 回执 / 88 状态历史；核实两个待装表名及新 RPC 均未存在。安装新 Office SQL 后默认 `OFFICE_WRITES=false`，P2 `OPERATOR_WRITES=false`；必须复核函数签名和精确 RLS、REVOKE、GRANT。SQL 文件内有单独事务，不可忽略失败。
3. **受保护 GitHub QA 浏览器入口独立审查**：本分支与其 Draft PR 不可被直接用于带密码的 GitHub workflow，必须先独立审核后纳入受保护 master，且**证明 workflow-only merge 不会触发 Vercel 正式站部署**。未获独立授权不得合并此 PR 或修改 Production。
4. **独立启用授权**：完成 QA 身份与项目核验后，才可对两个数据库写入 Gate 分别开启**最多 15 分钟**的单次合成订单测试。仅同一个白名单 QA 项目，审批引用必须绑定业务 HEAD/工作流 Run，DB Gate 必须自动到期。单独批准预览式本地 App P2 write flags；不得扩大 Vercel 全 Preview 的写权限。
5. **必须具有可证明的失败关闭机制**：若没有能够在失效或测试结束时立即将两个 QA DB Gate 置 OFF 的受限控制器/DBA 同步操作机制，**不得开始真实带凭据 E2E**。数据库到期只是兜底，不代替立即关闭。演练时须保留全部历史、数据回执和审批证据。

## 3. 身份、页面、HTTP 和持久化验收

使用 `hongda-review-dev` GitHub Environment 中现有的 ADMIN、OPERATOR、VIEWER、FOREIGN 合成账号。QA 账号密码在受保护环境运行时加载，仅通过独立主分支脚本使用，不能打印账号、token、cookie 或录制敏感浏览器 trace；业务候选分支只收到公开 QA publishable key。

测试顺序：

1. Office/Admin 在 `/workshop-orders/production/new` 填入合成 QA 订单并上传验证图片，点击真实 HTTP 提交；确认单一订单、回执和同源请求，没有真实开工。
2. Operator 在 `/workshop-orders/inbox` 用个人 QA 账号查看同一原始 Inbox、接单 `ACCEPT`，再 `RETURN_FOR_INFORMATION`，留下 OPEN DOCUMENT blocker 与历史。
3. Office 看到退回原因及当前数据版本，依次修改六项白名单字段：产品名称、材质、订单数量、本批数量、客户验收标准、印刷定位；`SAVE_CORRECTION` 生成完整前后快照、版本递增、新 label，模拟同请求幂等重放与不同请求旧版本冲突。
4. Office 使用新版本 `RESUBMIT_CORRECTION`；保存后允许**空 patch 重新提交**，但必须有该版本的已保存修订；新提交不重建 P1 Inbox。
5. Operator 重新打开订单，执行 `REVIEW_CORRECTION`；原子确认新版本修订和对应资料阻塞，只将被验证的 `P2_DOCUMENTS_INCOMPLETE` blocker 改为 RESOLVED，状态转 `WAITING_MATERIAL`；没有排期/开工权限。
6. 旧签样 / 花膜图片使用旧版本标签，`CONFIRM_MATERIAL VERIFIED` 必须拒绝；缺少新版本图片的状态仍不能进入 READY_TO_START。
7. Viewer 及外组织测试身份均应被拒绝写入或读取本组织订单；若外组织账号不是 Operator，则该结果只能证明**外组织账号拒绝**，不能代表外组织 Operator 的独立验证，须另外核验。
8. 完成后独立读取 QA 数据：P1 原回执与 Inbox ID 不变；订单仅一个，Office 两次修订快照/历史与 Operator Review 回执各一，状态与版本精确对应；审计记录无错误的重复历史；确认 Gate 已 OFF。

## 4. Fail-close / 回滚

测试异常立即停止本地 Next.js Preview 进程，停止浏览器，DBA/受限控制器**立即**对两个 Gate 更新 `enabled=false`, `enabled_until=NULL`, `approval_reference='NOT_AUTHORIZED'`，并再次独立 READ BACK；必要时分别 REVOKE Office Revision 和 Review RPC 的 `authenticated EXECUTE`。**不得清理订单、原始 P1 Inbox、提交回执、修订快照、审计历史或已上传 QA 图片。**

未通过这些要求时，保留 PR Draft，数据库 Gate OFF，继续不带账号、无真实 QA 写入的自动化测试。任何正式环境生产迁移、PR #238/#241 合并、Vercel Production 部署都需要额外正式审批。
