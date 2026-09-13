# 项目复盘与改善中心 — 技术架构审计

> 审计日期：2026-08-12
> 审计范围：现有仓库全量只读检查（不包含未跟踪的 data/content-calibration 内容）

---

## 1. 当前真实技术栈

| 类别 | 实际方案 | 关键文件 |
|---|---|---|
| 前端框架 | Next.js 14.2.4 (App Router) + React 18.3.1 | `package.json`, `next.config.mjs` |
| 语言 | TypeScript 5.7 | `tsconfig.json` |
| 样式 | Tailwind CSS 3.4 | `tailwind.config.js`, `src/app/globals.css`（未读，需确认） |
| 后端 | Next.js Route Handlers (`src/app/api/**/route.ts`) | `src/app/api/` |
| 路由 | App Router 文件系统路由 | `src/app/**/page.tsx` |
| 数据库 | Supabase PostgreSQL（可选，未配置时降级） | `supabase/migrations/*.sql`, `src/lib/supabase/` |
| ORM/客户端 | `@supabase/supabase-js` + `@supabase/ssr` | `src/lib/supabase/client.ts`, `server.ts` |
| 认证 | 自定义 Cookie `nmc_user` + Mock 用户（未接入真实 Supabase Auth 登录流） | `middleware.ts`, `src/lib/auth/roles.ts`, `src/app/login/page.tsx` |
| 权限 | 前端 `canAccessPage` / `canPerformAction`；中间件页面级拦截；API 大多未鉴权 | `src/lib/auth/roles.ts`, `middleware.ts` |
| 文件存储 | 无通用附件系统；`/api/data` 使用 Supabase `site_data` 或 `/tmp` JSON 文件 | `src/app/api/data/route.ts`, `supabase/migrations/20260708_site_data.sql` |
| UI 组件库 | 自研轻量组件（无第三方面向库） | `src/components/ui/`, `src/components/layout/` |
| 图表库 | 无（dashboard 使用 StatCard + div 自绘） | `src/app/dashboard/page.tsx` |
| 表单库 | 无（React 受控组件手写） | 各页面 |
| 校验库 | Zod 3.24（已在 AI 模块大量使用） | `src/lib/ai/schemas.ts`, `src/lib/accounts/schema.ts` |
| PDF/导出 | 无 PDF 库；CSV 导入/导出已有 | `src/lib/csv-utils.ts`, `src/app/api/csv/` |
| 测试框架 | 自定义 smoke runner + tsx 脚本（无 Jest/Vitest） | `tests/`, `tests/run-all.ts`, `tests/smoke-runner.ts` |
| 部署 | Vercel（master 自动部署）+ GitHub Actions CI | `.github/workflows/ci.yml` |
| AI | OpenAI/DeepSeek Provider + Account Persona V2 | `src/lib/ai/` |

---

## 2. 新模块应放哪些目录

建议完全遵循现有约定，新增以下目录：

```
src/app/review-center/              # 页面（App Router）
  page.tsx                          # 模块首页
  new/page.tsx                      # 新建复盘
  reviews/page.tsx                  # 全部复盘
  reviews/[id]/page.tsx             # 详情
  reviews/[id]/edit/page.tsx        # 编辑
  approvals/page.tsx                # 待我审核
  actions/page.tsx                  # 改善任务中心
  analytics/page.tsx                # 管理看板
  downloads/page.tsx                # 下载中心
  settings/page.tsx                 # 系统设置

src/components/review-center/       # 模块组件
  ReviewForm.tsx                    # 动态表单
  ReviewTimeline.tsx                # 时间线
  ReviewStatusBadge.tsx             # 状态徽章
  ActionTaskCard.tsx                # 改善任务卡
  AttachmentList.tsx                # 附件列表
  ReviewDetail.tsx                  # 详情
  RatingForm.tsx                    # 评级表单

src/lib/review-center/              # 模块逻辑
  types.ts                          # 类型定义
  schemas.ts                        # Zod 校验
  constants.ts                      # 字典、状态、枚举
  service.ts                        # 业务逻辑
  storage.ts                        # 数据访问层（Supabase + fallback）
  pdf.ts                            # PDF 生成（后续阶段）
  seed.ts                           # 演示数据 seed

src/app/api/review-center/          # API Route
  reviews/route.ts                  # 列表/创建
  reviews/[id]/route.ts             # 详情/更新/状态流转
  approvals/route.ts                # 审核动作
  actions/route.ts                  # 改善任务
  attachments/route.ts              # 附件上传/下载
  download/route.ts                 # 打包下载
  analytics/route.ts                # 看板统计
  settings/route.ts                 # 字典配置
```

---

## 3. 应复用哪些组件和服务

| 现有资产 | 复用方式 |
|---|---|
| `AppLayout` + `Sidebar` | 所有新页面包裹 `AppLayout` |
| `PageHeader` | 页面标题区 |
| `StatCard` | 管理看板/概览统计卡 |
| `StatusBadge` | 复盘状态徽章（需扩展状态映射到 `src/lib/utils/index.ts`） |
| `FilterBar` | 列表筛选 |
| `EmptyState` | 空列表提示 |
| `ConfirmDialog` | 删除/关闭确认 |
| `AiResultCard` | 可选（AI 复盘建议，后续阶段） |
| `src/lib/auth/roles.ts` | 扩展 `PageSlug` / `Action` / 权限矩阵 |
| `src/lib/utils/index.ts` | `getStatusBadgeClass` / `getStatusLabel` 扩展复盘状态 |
| `src/lib/storage.ts` | 可复用 localStorage + `/api/data` 模式 |
| `/api/data` | 可复用通用 key-value 持久化（若不想新建表） |
| Zod | 前后端 schema 校验 |
| `src/lib/oa/` 的 `oa-storage.ts` | 参考其 `loadOAData` / `saveOAData` / `mergeOADataByUpdatedAt` 模式 |
| `src/app/oa/*` | 参考多页面模块的组织方式（page + api + lib + components） |

---

## 4. 数据库迁移位置

现有迁移文件：`supabase/migrations/*.sql`

新迁移建议：

```
supabase/migrations/20260812_review_center.sql
```

包含表：

- `review_cases`：复盘主表（A/B/C 类型、状态、字段、损失、评级）
- `review_timeline`：时间线事件
- `review_audit_log`：审计日志（金额、等级、审核结果变更）
- `review_versions`：已关闭复盘的历史版本快照
- `review_actions`：改善任务
- `review_attachments`：附件元数据（指向 Supabase Storage）
- `review_dict_items`：系统字典（类型、损失类型、原因分类等）

若沿用现有 `site_data` key-value 模式，可将 `review_cases` 等存入 `site_data.data` JSONB，但审计、版本、附件建议使用正式表以支持 RLS 和 SQL 查询。

---

## 5. 权限应如何接入

### 现状

- 页面级：`middleware.ts` 通过 `getPageSlugFromRoute` + `canAccessPage` 判断，未授权重定向 `/dashboard`。
- 角色：`admin` / `manager` / `operator` / `sales` / `viewer`。
- Action 矩阵：`canPerformAction(user, action)`。

### 建议

1. 扩展 `src/lib/auth/roles.ts`：
   - `PageSlug` 增加 `review_center`、`review_center_new`、`review_center_detail`、`review_center_approvals`、`review_center_actions`、`review_center_analytics`、`review_center_downloads`、`review_center_settings`。
   - `Action` 增加 `review_create`、`review_approve`、`review_expert_review`、`review_rate`、`review_close`、`review_download`。
   - `PAGE_ACCESS` 增加对应角色矩阵。
2. 服务端 API 必须从 `nmc_user` Cookie 解析用户并校验：
   - 建议新增 `src/lib/auth/require-user.ts`（服务端辅助函数：读 cookie → `deserializeUser` → 无用户返回 401 / 无权限返回 403）。
   - 现有大多数 API 未鉴权，新模块必须从第一天就鉴权。
3. Supabase RLS：
   - 新表启用 RLS，使用现有 `auth_has_role()` / `auth_org_id()` / `auth_user_id()` helper。
   - 员工只能读/改自己的 `review_cases`（`created_by = auth_user_id()`）。
   - 主管/管理员可读全部。
   - 审核动作（初审/复核/评级/关闭）仅 manager/admin 角色（服务端 + RLS 双重校验）。
4. 如果后续需要“专业复核员”，建议不新增数据库角色，而是复用 `operator` + 部门字段，或新增 `reviewer` 字典标记（不扩 `Role` 枚举），避免破坏现有权限矩阵。

---

## 6. 文件附件应存在哪里

### 现状

- 无通用附件上传系统。
- `public/oa/` 仅存放静态图片（页眉、二维码）。
- `outputs/` 存放导出的静态文件（PDF/模板），不是运行时上传目录。
- Vercel 文件系统只读（`/tmp` 可写但不持久）。

### 建议

- 首选：**Supabase Storage private bucket**（如 `review-attachments`），服务端 `createSignedUrl` 生成临时访问链接，避免公开 URL 暴露。
- 备选（无 Supabase 环境）：存 `/api/data` 的 `site_data`（JSON 元数据 + Base64？不推荐大文件）或 `/tmp` + 服务端下载 API（仅单实例、重启丢失，仅限开发）。
- 附件元数据存 `review_attachments` 表：`id, review_id, file_name, mime_type, size, storage_path, uploaded_by, created_at`。
- 所有下载/预览必须走服务端 API，校验权限后再返回文件流或签名 URL。

---

## 7. PDF 应如何生成

### 现状

- 无 PDF 生成依赖。
- `outputs/` 有静态 PDF，但不是运行时生成。

### 建议（阶段评估）

- 方案A（推荐后续评估）：服务端生成 PDF。
  - 无现有依赖，需新增库（如 `@react-pdf/renderer`、`puppeteer` 或 `pdf-lib`）。
  - 考虑到当前 CI/Vercel 环境，`@react-pdf/renderer` 较轻量。
- 方案B：浏览器打印（`window.print()` + 打印样式）导出 HTML 为 PDF，零新增依赖，但需要用户手动保存。
- 方案C：先提供 HTML 报告预览 + 浏览器打印，后续再评估服务端 PDF。
- **阶段建议**：本模块前期先做 HTML 报告 + 浏览器打印，PDF 服务端生成放到后续阶段，避免引入重依赖导致构建复杂度。

---

## 8. 图表应使用什么现有方案

### 现状

- 无图表库（无 recharts / echarts / chart.js）。
- Dashboard 使用 `StatCard` + 自绘进度条/简单 div。

### 建议

- 管理看板阶段：优先使用现有模式（StatCard 网格 + 简单 CSS 柱状/环形 div + 表格），不引入图表库。
- 如果后续看板需要复杂图表，再评估 `recharts`（轻量、React 生态、与 Tailwind 兼容），但需要新增依赖并过 CI。
- 图表数据从 `/api/review-center/analytics` 获取，前端只负责渲染。

---

## 9. 哪些现有功能可能受影响

| 影响面 | 风险 | 缓解 |
|---|---|---|
| `middleware.ts` | 新路由未被保护或误拦截 | 新增路由在 `getPageSlugFromRoute` 映射 + 测试 |
| `src/lib/auth/roles.ts` | 新增 `PageSlug`/`Action` 影响现有页面权限判断 | 只增不改现有项；回归 `tests/e2e/auth-roles.spec.ts` |
| `src/lib/constants/navigation.ts` | 侧边栏新增 portal/组，影响布局 | 只追加新 group/item，不改现有项 |
| `src/lib/utils/index.ts` | 新增状态徽章映射 | 只追加键值，不改现有键 |
| `src/lib/storage.ts` | 新模块持久化可能复用 `/api/data` | 独立 key 前缀 `review_*`，不与现有 key 冲突 |
| `supabase/migrations/` | 新增迁移影响生产库 | 迁移只建新表，不 alter 现有表；先测试环境验证 |
| `package.json` | 可能新增依赖（PDF/图表） | 尽量复用现有能力；新增依赖需 CI 验证 |
| Vercel 部署 | master 推送自动部署 | 本阶段不自动 push，由人工审核后部署 |

---

## 10. 当前无法确认的问题

1. **真实 Supabase 是否已配置并在生产使用？**
   - `.env.local` 存在，但未读取实际值。`site_data` 迁移存在，但不确定生产表是否已迁移。
   - 需人工确认 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 是否已配置并连接。
2. **`nmc_user` 认证是否为真实登录？**
   - 当前是 Mock 用户 + Cookie，未确认是否接入了真实 Supabase Auth 登录流。
   - 新模块权限若依赖 `nmc_user`，需要确认生产环境用户数据来源。
3. **是否有真实用户/部门/角色数据？**
   - `MOCK_AUTH_USERS` 是内存数据；Supabase `profiles` 表存在，但 seed 仅占位。
   - 新模块的“员工/主管/复核员”需要确认真实用户体系。
4. **是否已有客户/订单/项目数据可关联？**
   - 未发现客户/订单/项目主数据表；`leads` 是最接近的客户数据。
   - 复盘中的“关联客户/订单”字段前期建议自由文本，后续再建主数据关联。
5. **生产附件存储是否可用 Supabase Storage？**
   - 未确认 Supabase Storage bucket 是否已创建、权限策略如何。
6. **现有 OA 模块是否已接入 Supabase？**
   - `oa-storage.ts` 使用 localStorage + `/api/data`；不确定生产是否走 Supabase。
7. **globals.css 的样式 token**（`card`、`btn-primary`、`input-field`、`select-field`、`badge-*`）定义位置未在本次审计中确认（在 `src/app/globals.css`），需在阶段1确认并复用。
8. **测试命令可用性**：`npx tsx` 在当前 shell PATH 不可用，需通过项目脚本或完整路径执行。

---

## 11. Git 状态审计

- 当前分支：`master`
- 未提交修改：无（工作区仅有未跟踪目录 `data/content-calibration/`，是此前内容校准的遗留数据，与本次模块无关，不建议纳入）。
- 存在 `AGENTS.md`：**未发现**（`find` 仅返回 README/.env 等）。
- README：存在，说明 MVP/内存 Mock 模式，与当前实际（已有大量真实功能）不完全一致，需在阶段1更新。

---

## 12. 结论

现有系统完全可承载“项目复盘与改善中心”：

- 复用 Next.js App Router + Tailwind + 自研 UI 组件。
- 复用 `/api/data` 或新建 Supabase 表。
- 复用角色/权限模型（扩展而非重构）。
- 复用 CSV/导出模式；PDF/图表/附件存储为新增能力，建议分阶段引入。

关键前置确认：Supabase 生产配置、真实用户体系、附件存储选择。
