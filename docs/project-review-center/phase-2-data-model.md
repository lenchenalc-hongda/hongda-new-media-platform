# Phase 2 数据模型（Migration 1）

> 状态：静态设计，未执行数据库迁移

## 身份模型

```text
auth.users.id
  -> profiles.user_id
  -> profiles.id
```

- 业务 `created_by / owner_id / pmo_id / closed_by` 一律使用 `profiles.id`。
- 禁止把 `auth.users.id` 直接写入业务 owner/creator 字段。
- `profiles` 增加 `UNIQUE(id, org_id)`，为跨组织组合外键提供数据库层保障。

## 多租户策略

- 所有 Review Center 正式业务表都带 `org_id UUID NOT NULL`。
- RLS 统一使用 `org_id::text = auth_org_id()`。
- `review_cases` 使用 `UNIQUE(id, org_id)`。
- 子表通过 `(review_id, org_id) -> review_cases(id, org_id)` 组合外键保证与父表同 org。
- 人员关系通过 `(profile_id, org_id) -> profiles(id, org_id)` 组合外键保证同 org。
- `review_dict_items` 是唯一 `org_id NULL` 的例外，仅用于 system dictionary。

## Migration 1 表

- `review_dict_items`：系统/组织字典
- `review_cases`：复盘主表
- `review_type_details`：A/B/C 类型专项字段
- `review_members`：协作成员

### organizations RLS

- SELECT：`organizations.id::text = auth_org_id()`
- UPDATE：仅 admin，且只能更新自己的 organization
- 不开放 authenticated INSERT / DELETE

## 产品决策（已确认）

1. 专业复核员使用 `review_members.EXPERT_REVIEWER`，不新增 auth role。
2. 金额统一进入未来 `review_impact_amounts`，使用 `NUMERIC(14,2)` + `CHAR(3)`。
3. 特殊关闭：正常关闭 manager/admin；存在未验证 CAPA 的强制关闭仅 admin，且必须 reason + audit。
4. sales 当前可读本 org 非财务复盘信息。
5. viewer 当前可只读本 org 非财务复盘信息。
6. 案例库人工发布，不自动沉淀。
7. Gate checks 按项目阶段决定 required / not_applicable，Migration 2 设计默认映射。
8. 复盘编号 `REV-YYYY-NNNNNN`，org 内唯一，类型不进入编号。
9. Review hard delete 不对 authenticated 开放。

## Migration 1 direct writes

- `review_cases`：INSERT allowed，UPDATE blocked，DELETE blocked
- `review_type_details`：INSERT allowed，UPDATE blocked，DELETE limited to draft
- `review_members`：INSERT allowed，UPDATE blocked，DELETE limited to draft
- `review_dict_items`：org admin INSERT allowed，UPDATE blocked，DELETE blocked
- `review_dict_items` SELECT：仅 active authenticated profile 可读取 global/system items 与当前 org items；无 profile、inactive profile、anon 均不可读

未来 Draft Edit Mutation Layer 负责白名单 UPDATE，不通过直接表 UPDATE 暴露系统字段。

## 外键行为

- `review_members.profile_id` composite FK 使用 `ON DELETE NO ACTION`，profile 删除不会静默清除历史成员记录。
- `review_members.review_id` composite FK 使用 `ON DELETE CASCADE`，仅服务端受控删除复盘时级联成员。
- `review_members.created_by` composite FK 使用 NO ACTION。

## Migration 2+ 范围

- Migration 2：`review_approvals`、`review_gate_checks`、`review_timeline_events`、`review_audit_logs`
- Migration 3：`review_issues`、`review_root_causes`、`review_actions`、`review_action_updates`
- Migration 4：`review_impacts`、`review_impact_amounts`、`review_attachments`、`review_versions`、`review_case_library`
- Migration 5：seed、统计视图、hardening

Migration 2+ 记录但暂不实现：
1. controlled draft mutation / RPC
2. status transition transaction
3. approval / audit / timeline atomic write
4. CAPA close rules
5. `created_at` 等系统字段进一步通过 mutation 控制
6. dict update / disable mutation

## Migration 2 设计修正

`review_approvals` 不使用 `UNIQUE(review_id, approval_stage, round_no)`，因为同一轮可能有多名专业复核人。唯一性应至少包含 `reviewer_id`，例如 `UNIQUE(review_id, approval_stage, round_no, reviewer_id)`。
