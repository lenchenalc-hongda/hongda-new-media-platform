# 项目复盘与改善中心 — 模块开发规则

> 适用范围：`src/app/review-center/**`、`src/components/review-center/**`、`src/lib/review-center/**`、`src/app/api/review-center/**`

## 必守规则

1. **不复制用户体系**：必须复用现有 `nmc_user` Cookie 登录与 `src/lib/auth/roles.ts` 角色权限，不建立第二套用户系统。
2. **不复制客户体系**：复盘中的客户/订单信息优先复用现有数据或自由文本，不单独建立客户主数据表（除非后续明确业务需求）。
3. **正式数据以 Supabase/PostgreSQL 为持久化来源**：Review 数据正式落地必须使用数据库表 + RLS，不能只依赖 localStorage、本地 JSON 或 site_data JSONB 大对象。
4. **禁止 `/tmp`、localStorage、本地 JSON 保存正式业务数据**：复盘、时间线、问题、损失、审核、改善任务、版本、用户责任记录必须进入 Supabase PostgreSQL（或经正式批准的持久化数据库）。`/tmp`/localStorage/本地 JSON 仅可用于 PDF/ZIP 临时文件、临时导出或本地开发测试。
5. **关闭复盘不可原地覆盖**：已关闭（`closed`/`archived`）复盘只能产生新版本（`review_versions`），不得直接覆盖原记录。
6. **损失金额必须受权限控制**：金额字段的查看、修改、评级都必须有角色校验，并写入审计日志。
7. **附件必须受权限保护**：附件下载/预览必须走服务端鉴权（签名 URL 或受保护下载 API），不得通过公开链接暴露。
8. **动态复盘类型固定为 A/B/C**：A=大货前异常，B=大货生产/品质/交付异常，C=前端问题延伸至大货的综合异常。
9. **每项改善措施必须有责任人**：`review_actions.owner_id` 必填。
10. **每项改善措施必须有截止日期**：`review_actions.due_date` 必填。
11. **每项改善措施必须有验证方式**：`review_actions.verification_method` 必填。
12. **所有状态变化必须可审计**：创建、提交、审核、评级、关闭、归档都必须写入 `review_audit_log`。
13. **不能因为增加 Review Center 破坏原有模块**：新增页面/导航/权限只做增量，不重构现有模块；改动必须通过现有 lint/typecheck/build 回归。

## 技术边界

- 本模块 UI 必须复用现有 `AppLayout`、`PageHeader`、`StatCard`、`StatusBadge`、`FilterBar`、`EmptyState`、`ConfirmDialog` 和 globals.css 设计 token。
- 不引入第二套 UI 组件库、不引入图表库（分析页先使用现有 StatCard/自绘布局）。
- 前端校验使用 Zod；服务端 API 必须二次校验同一 schema。
- 权限由服务端/数据库层真正限制，不能只隐藏前端按钮。
