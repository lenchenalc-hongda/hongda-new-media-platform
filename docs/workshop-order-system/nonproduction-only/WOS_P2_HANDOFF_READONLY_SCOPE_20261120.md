# WOS P2 — 已验证办公室→车间交接状态历史可视化（仅 QA 只读）

> **Task**: #260 `WOS-P2-READONLY-HANDOFF-TIMELINE-20261120`
>
> **Base**: WOS P2 Draft PR #241 exact HEAD `89bb408d13e45458c608db29c47e2803d49b3170`
>
> **Status**: CODE REVIEW / NONPRODUCTION ONLY, not a real user-browser acceptance nor production permission.

## 为什么补这项

2026-11-20 直接以只读 SQL 检查 Supabase QA 项目 `xulmpqaknlwqqculbsek`，合成订单 `953d2204-3e65-4b75-b10e-c6e97f1bbb56` 已为 `WAITING_MATERIAL` **version=7**，而不是 Issue #104 中部分历史文本仍描述的 `SUBMITTED/v2`。

已存在的真实 QA 事务回执数量（仅列结构化事实，无账号或凭据）：

| 回执 | 数量 |
|---|---:|
| 办公室原始提交 | 1 |
| Operator 接单 / 资料退回 | 2 |
| Office 保存六字段修订 / 重交 | 2 |
| Operator 复核修订 | 1 |

原有 Inbox 仍保留首次 `SUBMITTED` 的不可变提交来源记录，当前订单状态必须以 `wos_production_orders` 的真实版本为准；不能把不可变 Inbox 旧状态误判为本次流程未执行。状态历史按真实时间先后记录六条：提交→车间接单→退回→Office 保存→重新提交→Operator 复核。QA 双 Gate `OPERATOR_WRITES` 和 `OFFICE_WRITES` 均为 OFF。

本订单在 `wos_resource_readiness` **尚无登记记录**，所以生产前的花膜、夹具、来料、签样四项应继续显示“未齐套”。图案/签样视觉基准也必须由现有 Readiness 模块独立核实，不以“交接六步已匹配”替代。

## 本次只读补丁

- 新建 `src/lib/workshop-orders/p2-handoff-timeline.ts`：纯函数，严格核验六项 `wos_status_history` 中的时间顺序、前后状态、reason_code 和角色；对缺漏、重复、乱序、格式不合格、当前状态与订单版本不匹配一律失败关闭。
- 修改 `src/components/workshop-orders/LiveQaWorkshopReadiness.tsx`：继续使用已有当前会话的组织+订单+实体类型 RLS 只读过滤，展示六步历史及下一操作建议，明确“历史匹配不代表物料齐套/可以开工”。
- 新建 `tests/unit/workshop-order-p2-handoff-timeline.test.ts`：包含 20 组拒绝/失败关闭用例，验证没有写入 API / RPC，不允许静默制造已完成进度。
- 修改 `tests/unit/workshop-order-suite.test.ts`：用已有 WOS 单元测试入口自动执行新用例。

## 严格边界

- 限定 Issue #260 中五个项目自有文件。
- 新分支从 PR #241 HEAD 派生，**叠加 Draft PR 以 PR #241 分支为 base**，不可直接合并 master。
- 不修改 `.github/workflows/**`、`tools/wos/**`、SQL、Supabase、生产环境或 Agent Control V3。
- 不读取/记录真实客户数据、不复制私有图片、不输出 QA 登录信息。
- 不打开 QA Gate、不重新提交合成订单、不重复产生任何回执。
- Issue #160 原共享基础设施锁仍由 PR #202 持有并保持 BLOCKED。
- CI 的 PASS 只表示源码安全测试通过；真实双账号浏览器验收和 Vercel Preview 必须另行取得确切 Run/部署证据。

## 后续下一业务阶段

1. 在 QA Preview 使用两个不同角色账号重新查看同一订单 v7 的业务时间线；必须只读，双 Gate 继续 OFF。
2. 车间在另行授权的限时 QA 写入验收中，核对四项物料真实到位、数量与当前版本，以及当前参考图和确认样。
3. 物料齐套仅进入人工放行审核，绝不可自动开始生产。
