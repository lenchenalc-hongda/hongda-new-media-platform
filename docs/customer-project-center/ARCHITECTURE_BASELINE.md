# Customer Project Center Architecture Baseline

## A. Purpose

员工：帮助项目负责人每天推进真实客户和项目，减少重复记录。

管理层：从真实工作过程自动获得项目总览、日报、周报和异常。

## B. Core Principle

一次输入，多处使用：

跟进 → 下一步 → 今日任务 → 日报 → 周报 → 团队看板

## C. Lead / Customer / Project

Lead ≠ Customer

- Lead：获客阶段线索。
- Customer：正式客户实体。
- Project：一次具有明确商业目标的客户业务机会。

普通老客户回访是 Customer-level Follow-up，不是 Project。

只有出现明确业务机会后才创建 Project。

## D. Source of Truth

必须复用 profiles 和 organizations。

正式客户、客户归属、回款当前 repository 没有 Source of Truth。

已知宏达存在另外的业务系统，未来需要 integration。

Customer Project Center 不重新创建第二套客户归属真相。

## E. Identity Contract

auth.users.id ≠ profiles.id

正式业务 FK 必须使用 profiles.id，包括：

- project owner
- work item assignee
- created_by
- collaborator
- customer owner reference

## F. Project Ownership

一个 Project 有一个 Project Owner，可有多个 Collaborator。

协作者不会改变客户归属。

## G. Work Item

不要复用 legacy tasks。

未来建立销售领域 work item。预定类型：

- NEXT_ACTION
- CUSTOMER_COMMITMENT
- INTERNAL_COLLABORATION
- FOLLOW_UP
- MANAGEMENT_DECISION

AI suggestion 不自动成为正式逾期任务。

## H. AI Boundary

AI proposal ≠ business fact

AI 可以解析、总结、建议和生成草稿。

AI 不可以未经确认：

- 确认成交
- 修改金额
- 确认客户接受报价
- 修改负责人
- 修改客户归属
- 确认交期
- 正式改变项目状态

第一版 AI write-back 必须人工确认。

## I. Storage Rule

Customer Project Center 正式业务数据禁止使用：

- localStorage as SoT
- site_data as SoT
- /api/data generic JSON storage

正式数据必须使用 PostgreSQL domain table、org_id、profiles.id FK、RLS、
authenticated server API/RPC、resource-level authorization 和必要时的
audit/version。

## J. Legacy Security Backlog

- SEC-LEGACY-001 leads RLS permissive OR issue
- SEC-LEGACY-002 leads missing org isolation
- SEC-LEGACY-003 legacy grants review
- SEC-LEGACY-004 site_data security
- SEC-LEGACY-005 /api/data service role
- SEC-LEGACY-006 leads UI vs DB divergence
- SEC-LEGACY-007 ai_jobs permissions
- SEC-LEGACY-008 regression tests

以上问题不在 Customer Project Center Batch 1 修复。
