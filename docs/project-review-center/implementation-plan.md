# 项目复盘与改善中心 — 实施计划

> 计划版本：v0.1（阶段0）
> 日期：2026-08-12
> 前置：阅读 `product-spec.md` 与 `architecture-audit.md`

---

## 阶段总览

| 阶段 | 名称 | 状态 |
|---|---|---|
| 0 | 仓库审计 | ✅ 本阶段完成 |
| 1 | 模块入口和页面骨架 | 待实施 |
| 2 | 数据模型和迁移 | 待实施 |
| 3 | 权限、字典和服务层 | 待实施 |
| 4 | 公共复盘表单 | 待实施 |
| 5 | 时间线 | 待实施 |
| 6 | A类专项 | 待实施 |
| 7 | B类专项 | 待实施 |
| 8 | C类综合与根因分析 | 待实施 |
| 9 | 损失与改善任务 | 待实施 |
| 10 | 附件管理 | 待实施 |
| 11 | 审核、评级和关闭流程 | 待实施 |
| 12 | 详情、版本和下载 | 待实施 |
| 13 | 列表及任务中心 | 待实施 |
| 14 | 管理看板 | 待实施 |
| 15 | 系统设置与通知 | 待实施 |
| 16 | 测试、加固和上线准备 | 待实施 |

---

## 阶段 0：仓库审计（当前阶段）

**目标**：确认技术栈、目录结构、认证、数据库、可复用资产，输出审计文档。

**产出**：
- `docs/project-review-center/product-spec.md`
- `docs/project-review-center/architecture-audit.md`
- `docs/project-review-center/implementation-plan.md`

**结论**：
- 技术栈：Next.js 14 App Router + TS + Tailwind + Supabase（可选）+ Zod + OpenAI。
- 认证：`nmc_user` Cookie Mock 用户 + middleware 页面级权限。
- 数据库：Supabase PostgreSQL 迁移目录；`site_data` 通用 key-value 存储；RLS 策略已建立模式。
- 新模块目录：`src/app/review-center/`、`src/components/review-center/`、`src/lib/review-center/`、`src/app/api/review-center/`。
- 可复用：`AppLayout`/`PageHeader`/`StatCard`/`StatusBadge`/`FilterBar`/`EmptyState`/`ConfirmDialog`、Zod、`/api/data`、OA 模块的 `oa-storage` 模式、CSV 导入导出。
- 待确认：Supabase 生产配置、真实用户体系、附件存储、globals.css 样式 token。

**验收**：
- ✅ 仓库状态已检查（master，无未提交修改，仅有遗留 `data/content-calibration/` 未跟踪目录）。
- ✅ 三份文档已创建。
- ✅ 未开发正式业务功能。

---

## 阶段 1：模块入口和页面骨架

**目标**：建立 `/review-center` 路由骨架、导航入口、空页面。

**预计修改目录**：
```
src/app/review-center/           # 10 个页面（page.tsx 骨架）
src/lib/constants/navigation.ts  # 新增 portal group（如 id: 'review'）
src/components/layout/Sidebar.tsx# 渲染新 group（自动，无需改）
src/lib/auth/roles.ts            # 新增 PageSlug + PAGE_ACCESS
middleware.ts                    # 无需改（getPageSlugFromRoute 扩展即可）
src/lib/utils/index.ts           # 可选：状态映射预留
src/lib/version.ts               # V5.7.0
```

**依赖**：阶段0 审计结论、globals.css 样式 token 确认。

**验收**：
- 侧边栏出现“项目复盘”入口。
- 未登录访问 `/review-center` 跳转登录。
- 各角色访问权限符合矩阵（viewer 可看首页，operator 可新建等）。
- 页面显示空状态，不报错。

**风险**：新增 PageSlug 未加入 middleware 映射导致路由不识别。
**回滚**：移除新增路由目录 + 还原 navigation.ts / roles.ts 增量。

---

## 阶段 2：数据模型和迁移

**目标**：建立复盘核心数据表。

**预计修改目录**：
```
supabase/migrations/20260812_review_center.sql
src/lib/review-center/types.ts
src/lib/review-center/schemas.ts
src/lib/review-center/constants.ts
```

**表**：
- `review_cases`（主表）
- `review_timeline`
- `review_audit_log`
- `review_versions`
- `review_actions`
- `review_attachments`
- `review_dict_items`

**验收**：
- 迁移 SQL 可执行。
- 表、外键、索引、RLS 策略齐全。
- 前端类型与后端 schema 一致（Zod 双向校验）。
- `review_cases.status` 状态机枚举完整。

**风险**：生产 Supabase 未迁移导致运行时错误；新表与现有 RLS helper 不兼容。
**回滚**：`DROP TABLE IF EXISTS`（新表不依赖现有表），保留迁移文件供回滚。

---

## 阶段 3：权限、字典和服务层

**目标**：完成服务端权限校验、字典配置、业务服务层。

**预计修改目录**：
```
src/lib/auth/require-user.ts    # 新增服务端用户解析辅助
src/lib/review-center/service.ts # 业务逻辑（创建、流转、审核、关闭、版本）
src/lib/review-center/storage.ts # 数据访问层
src/app/api/review-center/*      # API route 骨架
```

**验收**：
- 所有 API 校验 `nmc_user`，未登录返回 401，无权限返回 403。
- 字典数据（复盘类型、损失类型、原因分类、严重等级）可配置。
- 服务层函数有单元测试。
- 创建复盘时生成 `review_timeline` 初始事件 + 审计日志。

**风险**：现有 API 均未鉴权，新模块鉴权规则需独立验证，不能假定 cookie 一定存在。
**回滚**：新 API 目录可整体禁用（`src/app/api/review-center/` 移除）。

---

## 阶段 4：公共复盘表单

**目标**：实现动态公共问题表单（A/B/C 共用）。

**预计修改目录**：
```
src/components/review-center/ReviewForm.tsx
src/app/review-center/new/page.tsx
src/app/review-center/reviews/[id]/edit/page.tsx
```

**验收**：
- 支持创建草稿和保存草稿。
- 必填项校验（Zod 前后端）。
- 复盘编号自动生成。
- 金额、等级输入有校验和审计。

**风险**：表单字段与后续 A/B/C 专项叠加时结构混乱；需先设计好 `form_data JSONB` 结构。
**回滚**：保留草稿页面路由，可单独回退表单组件。

---

## 阶段 5：时间线

**目标**：复盘全过程时间线（创建、提交、审核、评级、关闭、版本）。

**预计修改目录**：
```
src/components/review-center/ReviewTimeline.tsx
src/lib/review-center/service.ts
```

**验收**：
- 时间线显示所有状态变更、关键动作、审核意见。
- 时间线数据持久化到 `review_timeline`。
- 时间线事件不可编辑（只读展示）。

**风险**：时间线与审计日志职责重叠；需明确 timeline 展示事件、audit_log 记录审计字段变更。
**回滚**：新组件不影响旧功能。

---

## 阶段 6：A类专项

**目标**：A类（大货前异常）专项字段与表单。

**预计修改目录**：
```
src/lib/review-center/schemas.ts   # A专项 schema
src/components/review-center/AForm.tsx
```

**验收**：
- 选择 A 类时显示 A 专项字段。
- 字段校验完整。
- 提交后进入 `submitted` → `initial_review`。

**风险**：字段过多导致表单冗长；建议分组折叠。
**回滚**：A 专项组件移除不影响 B/C。

---

## 阶段 7：B类专项

**目标**：B类（大货生产/品质/交付异常）专项字段与表单。

**预计修改目录**：
```
src/lib/review-center/schemas.ts   # B专项 schema
src/components/review-center/BForm.tsx
```

**验收**：
- 选择 B 类时显示 B 专项字段。
- 品质数据（良率、不良项）、交付影响、现场记录可填写。
- 附件上传入口预留。

**风险**：B 类字段多且可能涉及图片；附件上传依赖阶段10。
**回滚**：B 专项组件移除不影响 A/C。

---

## 阶段 8：C类综合与根因分析

**目标**：C类综合表单（公共 + A + B + 综合分析）。

**预计修改目录**：
```
src/lib/review-center/schemas.ts   # C schema（复合）
src/components/review-center/CForm.tsx
src/components/review-center/RootCauseAnalysis.tsx
```

**验收**：
- C 类显示完整动态表单。
- 根因分析支持结构化（鱼骨图/分类原因 + 描述）。
- 综合建议可填写。

**风险**：C 类页面较长，需良好分组和导航。
**回滚**：C 表单组件独立，可单独回退。

---

## 阶段 9：损失与改善任务

**目标**：损失记录、改善任务创建与执行。

**预计修改目录**：
```
src/lib/review-center/schemas.ts   # review_actions schema
src/components/review-center/ActionTaskCard.tsx
src/app/review-center/actions/page.tsx
```

**验收**：
- 评级后自动创建改善任务或手动创建。
- 任务有负责人、截止日期、状态（待执行/执行中/验证中/已完成）。
- 金额/损失字段变更写入审计日志。

**风险**：任务状态与复盘状态联动复杂；建议任务独立状态机，复盘关闭时校验任务完成。
**回滚**：任务表独立，不影响主流程。

---

## 阶段 10：附件管理

**目标**：附件上传、预览、下载、打包。

**预计修改目录**：
```
src/app/api/review-center/attachments/route.ts
src/components/review-center/AttachmentList.tsx
src/lib/review-center/storage.ts
supabase/migrations/...（若需 bucket 初始化，另建 SQL/说明）
```

**验收**：
- 上传走服务端鉴权。
- 下载走服务端签名/流式返回，不暴露公开 URL。
- 附件元数据入 `review_attachments`。
- 支持 ZIP 打包（阶段12实现）。

**风险**：Supabase Storage 未配置时需降级（本地 /tmp + 服务端下载，开发可用）。
**回滚**：附件功能可单独禁用，不影响复盘文本。

---

## 阶段 11：审核、评级和关闭流程

**目标**：完整状态机流转（初审、复核、评级、关闭、版本）。

**预计修改目录**：
```
src/app/api/review-center/approvals/route.ts
src/lib/review-center/service.ts
src/components/review-center/RatingForm.tsx
```

**验收**：
- 主管初审、专业复核、主管评级、关闭均走 API + 审计日志。
- 已关闭复盘不可直接修改，只能创建新版本。
- 关闭时生成正式报告所需数据完整（损失、根因、改善结果）。

**风险**：状态机并发（多人同时审核）——用 `status` 条件更新（`UPDATE ... WHERE status = ?`）。
**回滚**：状态机逻辑在 service 层，可加 feature flag 开关。

---

## 阶段 12：详情、版本和下载

**目标**：详情页、历史版本、PDF/附件下载。

**预计修改目录**：
```
src/app/review-center/reviews/[id]/page.tsx
src/app/review-center/downloads/page.tsx
src/app/api/review-center/download/route.ts
src/lib/review-center/pdf.ts
```

**验收**：
- 详情页展示完整信息 + 时间线 + 版本切换。
- 正式 PDF（HTML 打印版或服务端生成，按阶段7结论）。
- 附件 ZIP 下载。
- 完整资料包下载。

**风险**：PDF 依赖引入；若引入新增依赖需 CI 验证。
**回滚**：下载功能独立路由，可先禁用 PDF，保留 HTML 预览。

---

## 阶段 13：列表及任务中心

**目标**：全部复盘列表、我的复盘、待我审核、任务中心。

**预计修改目录**：
```
src/app/review-center/reviews/page.tsx
src/app/review-center/approvals/page.tsx
src/app/review-center/actions/page.tsx
src/components/review-center/ReviewListTable.tsx
src/components/review-center/ApprovalQueue.tsx
```

**验收**：
- 列表支持筛选（类型、状态、严重等级、日期、关键词）。
- 分页/加载更多（前端分页或服务端分页，按数据量决定）。
- 待我审核按当前用户角色动态显示。

**风险**：数据量增长后前端分页压力；建议服务端分页 + 索引。
**回滚**：列表页独立，可回退。

---

## 阶段 14：管理看板

**目标**：统计、趋势、KPI。

**预计修改目录**：
```
src/app/review-center/analytics/page.tsx
src/app/api/review-center/analytics/route.ts
```

**验收**：
- 按类型/状态/严重等级/部门统计。
- 改善任务完成率、平均关闭时长。
- 使用现有 StatCard + 自绘图表（不新增依赖）。

**风险**：统计口径需人工确认（损失金额、改善率）。
**回滚**：看板页独立。

---

## 阶段 15：系统设置与通知

**目标**：字典配置、通知（站内消息）。

**预计修改目录**：
```
src/app/review-center/settings/page.tsx
src/app/api/review-center/settings/route.ts
src/lib/review-center/constants.ts
src/components/review-center/NotificationCenter.tsx（可选）
```

**验收**：
- 管理员可维护字典（类型、损失类型、原因、等级）。
- 待审核/待复核/待评级事件通知到对应角色（站内消息，后续可扩展）。
- 通知不引入外部推送依赖。

**风险**：通知功能可能超出本阶段最小范围；先做站内消息列表，不做实时推送。
**回滚**：设置/通知独立。

---

## 阶段 16：测试、加固和上线准备

**目标**：全量测试、权限加固、文档、上线检查。

**预计修改目录**：
```
tests/unit/review-center-*.test.ts
tests/e2e/review-center.spec.ts
tests/integration/review-center-api.test.ts
docs/project-review-center/
```

**验收**：
- 单元测试覆盖：schema、状态机、权限、审计、版本。
- 集成测试覆盖：API 创建/流转/审核/关闭/下载。
- E2E 覆盖：新建 → 提交 → 审核 → 评级 → 任务 → 关闭 → 报告。
- TypeScript、Build 通过。
- 不自动 push；人工审核后部署。

**风险**：测试依赖真实 Supabase/Storage；默认 mock/fixture。
**回滚**：测试文件独立，不影响生产。

---

## 推荐路由（最终形态）

| 路由 | 页面 |
|---|---|
| `/review-center` | 模块首页 |
| `/review-center/new` | 新建复盘 |
| `/review-center/reviews` | 全部复盘 |
| `/review-center/reviews/[id]` | 详情 |
| `/review-center/reviews/[id]/edit` | 编辑 |
| `/review-center/approvals` | 待我审核 |
| `/review-center/actions` | 改善任务中心 |
| `/review-center/analytics` | 管理看板 |
| `/review-center/downloads` | 下载中心 |
| `/review-center/settings` | 系统设置 |

路由映射到 `PageSlug` 时建议使用 `review_center` 前缀 + 子资源，middleware 的 `getPageSlugFromRoute` 增加前缀匹配。

---

## 总体风险与回滚策略

| 风险 | 应对 |
|---|---|
| Supabase 未配置/未迁移 | 阶段2先做可降级存储（`/api/data` JSON），正式表后续切换 |
| 认证为 Mock | 新模块 API 先基于 `nmc_user` cookie；后续接真实 Auth 时替换 `require-user.ts` 实现 |
| 附件存储未定 | 阶段10先做服务端 `/tmp` 降级，生产启用 Supabase Storage |
| 图表/PDF 依赖 | 默认不新增依赖；HTML 报告 + 浏览器打印优先 |
| 状态机并发 | `UPDATE ... WHERE status = ?` 条件更新 + 审计日志 |
| 数据量增长 | 服务端分页 + 索引 |
| 部署风险 | 每个阶段独立提交、人工 review、不回滚现有模块 |

---

## 后续需要人工确认的事项

1. 生产 Supabase 是否可用、`site_data` 是否已迁移。
2. 真实用户/角色/部门数据来源。
3. 是否有客户/订单/项目主数据可关联。
4. 附件存储方案（Supabase Storage bucket 是否可创建）。
5. `src/app/globals.css` 中的样式 token 定义（阶段1读取）。
6. 本模块是否需要“专业复核员”独立角色（建议复用 operator + 字典标记）。
