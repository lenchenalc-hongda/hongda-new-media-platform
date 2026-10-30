# CPC｜指定项目从日常界面安全移除（2026-10-30）

## 业务授权与精确目标

用户明确要求从 Len Chen 账号移除「海绵宝宝和派大星牙刷生产」。Production 只读核查：
- 只有 **1 条**同时匹配项目标题和 Len Chen 负责人的记录。
- 目标项目 ID 为 `c92f2906-c785-48fe-977d-81bfc46c3af7`。
- 所属客户为「东莞英伍电子有限公司」，其客户池 ID 与其他项目均不可更改。
- 项目状态已经是 `cancelled`、版本为 2；附属记录仅有1条已取消任务（「1111」）和1条取消生命周期事件；无项目成员或 AI 草稿。
- 以前的2条创建和取消审计记录应保持完整。

## 不采用硬删除的原因

`cpc_project_events` 和 `cpc_audit_log` 都带有 BEFORE DELETE/UPDATE 拒绝变更的 append-only 触发器，事件与项目有非级联外键。直接物理删除必须破坏不可篡改历史或调整核心外键，这是不合理的单项目删除方案。

因此针对当前明确的删除需求，采用**受控归档隐藏（soft delete）**：用户界面、全部/已结束项目列表、项目详情及经理看板的 Supabase 登录态 SELECT 不返回归档项目，数据库历史关系和审计仍然保留。

## 实现与范围

迁移 `supabase/migrations/20261030135500_cpc_project_archived_visibility.sql`：
- 给 `cpc_projects` 添加一个默认 NULL 的 `archived_at` 时间字段；
- 把原有 `cpc_projects_select` RLS 策略从 `cpc_can_read_project(id,org_id)` 收紧为 `archived_at IS NULL AND cpc_can_read_project(id,org_id)`；
- 所有历史项目的 `archived_at` 为 NULL，保持原有列表权限与显示不变；
- 不增加前端隐藏特例，不修改业务状态，不扩宽权限，不更改数据库不可变审计事件；
- 原项目详情、项目列表、个人工作台及团队看板均通过普通 Supabase 登录态读取 `cpc_projects`，受同一策略影响。

该通用结构不为业务员开放随意删除的 API 或按钮，仅用来安全满足本次明确授权的单条归档。

## 单条 Production 执行门槛

在 Migration 审核通过后，针对完整 ID、公司 org、项目标题、实际 owner profile、创建人、客户 ID、状态 `cancelled`、版本 2，使用事务执行：

1. 行锁 + 精确核对全部关键属性；要求同一负责人和标题只命中一条。
2. 要求项目附属历史仍仅为1条已取消任务和1条 `PROJECT_CANCELLED` 事件，且没有 AI 草稿或成员。
3. 只把本项目 `archived_at` 设置为 `now()`，保留整个项目及关系。
4. 给 append-only `cpc_audit_log` 增加 `PROJECT_ARCHIVED_BY_OWNER_REQUEST` 记录，写明负责人授权、原项目完整快照和事件/任务数量；不能伪装为用户自行点击删除。
5. 验证登录业务员看不到它、其他项目不受影响、数据库仍能核查保存的项目及历史。

若实际行已被其他人修改、客户/owner变更或关系记录增加，自动中止，不盲目执行。

## 验证

已在隔离的 Dev 数据库完成新 schema 及真实 `authenticated` 角色 RLS 演练：归档前本人可见，归档后本人不可见，其他项目仍可见；该测试事务 ROLLBACK，开发库无项目被实际归档。

**此功能不是不可逆的永久清除。** 如需恢复该项目，应由有权限的维护操作将 `archived_at` 设回 NULL，并附加审计记录。客户池、报价、WOS 车间订单、薪资财务一概不做改动。
