# 旧 nmc_user 迁移策略

> 阶段：1.6A
> 目标：在不破坏现有工具的前提下，把身份从可伪造的 Mock Cookie 迁移到 Supabase Auth。

---

## 当前（Mock 阶段）

- 登录：`src/app/login/LoginForm.tsx`（客户端选择 Mock 用户）
- 身份：`nmc_user` Cookie（客户端创建，无签名/加密，可伪造）
- 权限：middleware 基于 Cookie 内容判断
- 结论：仅开发兼容，**不是审计身份**

## 过渡期（AUTH_MODE 控制）

- `AUTH_MODE=mock`：保留现有 Mock 登录，页面明确标注「开发兼容模式」
- `AUTH_MODE=supabase`：使用 Supabase Auth + profiles，middleware/API/Server Component 全部从 `current-user.ts` 获取可信身份
- 不允许：Supabase 登录失败自动 fallback 到 Mock

## 正式期（Supabase Auth）

- 登录：`/api/auth/login`（服务端创建 session）
- 身份：`auth.users.id` + `profiles`（role/department/active）
- 权限：服务端基于可信 CurrentUser 判断
- `nmc_user` 不再参与任何安全判断

## 正式上线后

- `nmc_user` Cookie 在 logout 时始终清除，避免残留
- 计划在 Review Center 正式业务开放后，逐步删除 `nmc_user` 相关 Mock 登录代码
- 删除时机：所有内部工具确认使用 Supabase Auth 登录后，再移除 `MOCK_AUTH_USERS` / `serializeUser` / `getMockUserFromCookie`

## 迁移步骤（后续人工执行）

1. 配置 Supabase 环境变量（见 `supabase-auth-setup.md`）
2. 执行已有 migration，确认 profiles 表存在
3. 创建测试用户 + profile
4. Preview 环境 `AUTH_MODE=supabase` 验证登录/权限/logout
5. Production 切换 `AUTH_MODE=supabase` 并开启 Review Center
6. 确认无遗留依赖后移除 Mock 登录代码

## 安全边界

- 客户端不能声明 role / user_id / department
- `user_metadata` 不能作为可信角色来源
- role 唯一来源：`profiles.role`
- service role 只能服务端使用，且必须完成应用层权限检查
