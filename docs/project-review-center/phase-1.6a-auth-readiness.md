# 阶段1.6A 认证加固与 Supabase Auth 接入准备 — 报告

> 日期：2026-08-13
> 前置：阶段1.5（commit 62b6941）
> 结论：代码就绪，真实环境未验证

---

## 1. 当前认证架构

- 统一入口：`src/lib/auth/current-user.ts`
  - `getCurrentUserFromRequest(req)`（middleware / route handler）
  - `getCurrentUser()`（Server Component / API）
  - `requireUser()` / `requireRole()` / `requirePermission()`
  - `hasRole()`
- 业务代码只依赖 `CurrentUser`，不知道 Cookie 名 / JWT 结构 / profiles 查询方式

## 2. Mock 模式（AUTH_MODE=mock）

- 登录：`LoginForm.tsx` 客户端选择 Mock 用户
- 身份：`nmc_user` Cookie → `getMockUserFromCookie` → `CurrentUser(authSource='mock')`
- 页面明确标注「开发兼容模式（Mock，非审计身份）」
- 仅用于本地开发与现有系统兼容

## 3. Supabase 模式（AUTH_MODE=supabase）

- 登录：`POST /api/auth/login` 服务端 `signInWithPassword`，服务端设置 session
- 身份：`resolveSupabaseCurrentUser`
  - 服务端验证 session（`auth.getUser()`）
  - 用真实 `auth.users.id` 查 `profiles`
  - profile 不存在 / `is_active=false` / role 非法 → 拒绝
- role/department 来自 profiles，客户端无法覆盖
- 退出：`POST /api/auth/logout` 清除 Supabase session + `nmc_user`

## 4. current-user 统一接口

已提供：`getCurrentUserFromRequest` / `getCurrentUser` / `requireUser` / `requireRole` / `requirePermission` / `hasRole`。统一输出 `CurrentUser { id, name, role, department, email, active, authSource }`。

## 5. 登录流程

- mock：客户端选择用户 → 写 nmc_user → 跳转
- supabase：邮箱+密码 → `/api/auth/login` → 服务端 session → 跳转 redirect

## 6. Logout 流程

- 始终清除 `nmc_user`
- supabase 模式额外调用 `supabase.auth.signOut()`
- Sidebar 提供「退出」按钮

## 7. Profiles 要求

`PROFILE_SCHEMA_READY = YES`（见下）—— profiles 已具备 id/user_id/full_name/email/role/department/is_active/created_at/updated_at，且 `user_id` 外键指向 `auth.users(id)`。

## 8. Role 来源

- 唯一可信来源：`profiles.role`
- 不使用 `user_metadata`
- `app_metadata` 后续如使用需明确维护方式，现阶段不采用

## 9. Middleware

- 已改为 async，通过 `getCurrentUserFromRequest` 获取可信用户
- Supabase 配置缺失时跳转 `/login?error=auth_config_missing`（不静默回退 mock）
- 保留：登录重定向、角色权限、Feature Flag、settings 仅 admin

## 10. API 权限原则

- 未来 Review API：`requireUser` → `requireRole`/`requirePermission` → 数据库操作
- 禁止信任客户端传 userId/role

## 11. Service Role 原则

- `createAdminSupabaseClient()` 仅服务端
- 不进入 `NEXT_PUBLIC_*`
- 使用 service role 的 API 必须先完成应用层权限检查

## 12. Cookie/Session 安全

- Supabase 模式：session 由服务端创建，`auth.getUser()` 服务端验证
- `nmc_user` 不再作为安全依据
- logout 清除 session + nmc_user
- 生产 HTTPS 下 Secure 由浏览器环境保证；@supabase/ssr 按官方模式管理 refresh
- 详细安全模型见 `supabase-auth-setup.md`

## 13. 自动化测试

新增 `tests/unit/auth-service.test.ts`（18 用例）+ 更新 `tests/unit/current-user.test.ts`（7 用例）。覆盖：

- mock 解析、authSource
- 无 session / invalid token / profile 缺失 / inactive / 非法 role → 拒绝
- viewer 无 admin 权限；admin 有 admin 权限
- **客户端伪造 nmc_user role=admin 不能提权（仍为 profile 的 viewer）**
- 伪造 userId 不能覆盖真实 auth id

## 14. 尚未完成的真实环境配置

- Supabase 环境变量（URL / anon key / service role）均为 MISSING
- 未执行任何真实登录 / profile 查询 / RLS 验证
- 未创建真实测试用户（按指示不自动创建）

## 15. 用户需要人工完成的步骤

1. 按 `supabase-auth-setup.md` 配置 Supabase 项目 + Vercel 环境变量
2. 创建测试用户 + profiles 记录
3. Preview 环境 `AUTH_MODE=supabase` 验证
4. 验证后再决定 Production 切换

## 16. 阶段1.6B 验收计划

- 在真实 Supabase 环境完成：
  - 登录成功/失败
  - viewer/admin 权限
  - 伪造 nmc_user 不能提权（真实环境复测）
  - logout 后不可访问受保护页面
  - RLS 验证（用户不能改自己 profile 的 role）
- 通过后才允许 `AUTH_READY_FOR_AUDIT = YES`
- 阶段1.6B 不进入阶段2

---

## 结论

```text
CODE_AUTH_IMPLEMENTATION_READY = YES
LIVE_AUTH_VERIFIED             = NO
AUTH_READY_FOR_AUDIT           = CONDITIONAL
```
