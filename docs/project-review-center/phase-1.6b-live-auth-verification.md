# 阶段1.6B 真实 Supabase 认证与数据库连接验收报告

> 日期：2026-08-13
> 前置：阶段1.6A（commit 5efef0a）
> 结论：**LIVE_SETUP_BLOCKED = YES（环境变量缺失，真实验收未执行）**

---

## 1. 测试环境

```
TARGET_ENVIRONMENT = UNKNOWN
```

原因：未提供任何 Supabase 项目引用，无法确认目标环境；按规则停止一切写操作与真实认证测试。

## 2. Supabase环境状态

| 变量 | 状态 |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | MISSING |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | MISSING |
| SUPABASE_SERVICE_ROLE_KEY | MISSING |
| AUTH_MODE | MISSING（默认 mock） |
| NEXT_PUBLIC_FEATURE_PROJECT_REVIEW_CENTER | PRESENT |

（仅输出存在性，不输出任何值。）

## 3. Profile真实schema

未执行真实数据库查询（环境缺失）。代码侧 migration `001_initial_schema.sql` 已包含 profiles 全字段及 `user_id REFERENCES auth.users(id)`，但**真实 schema 未验证**。

## 4. Admin测试

未执行（环境缺失）。

## 5. Viewer测试

未执行（环境缺失）。

## 6. nmc_user提权测试

未执行真实测试。代码侧已通过单元测试证明 Supabase 模式 `resolveSupabaseCurrentUser` 不读取 `nmc_user`；真实环境复测待环境就绪后进行。

## 7. userId伪造测试

未执行真实测试（环境缺失）。

## 8. Profile修改测试

未执行真实测试（环境缺失）。代码侧 profiles RLS 已有策略（普通用户无 UPDATE 权限），待真实环境验证。

## 9. inactive用户测试

未执行（环境缺失）。

## 10. missing profile测试

未执行（环境缺失）。

## 11. logout测试

未执行真实 logout（环境缺失）。Mock 模式 `/api/auth/logout` 已实测清除 `nmc_user`。

## 12. session失效测试

未执行真实 session 测试（环境缺失）。

## 13. RLS

未执行真实验证（环境缺失）。代码侧 helper（auth_has_role / auth_org_id / auth_user_id）已存在于 migration，待真实环境验证。

## 14. service role

代码侧 `createAdminSupabaseClient()` 仅服务端，未发送到客户端；未做真实泄露扫描（环境缺失）。构建产物检查建议在真实环境就绪后补做。

## 15. migration pipeline

未执行（环境缺失、Supabase CLI 未配置）。迁移文件存在于 `supabase/migrations/`，执行方式待环境就绪后确认。

## 16. Storage

未执行真实 Storage 检查（环境缺失）。

## 17. 阶段2推荐权限架构

基于阶段1.6A 代码设计（未真实验证）：

- 普通用户业务查询：可信 Supabase Session + Server User Client + RLS + 应用层业务权限（双重保护）。
- 特殊后台任务：Service Role + `requireUser → requirePermission → 业务范围检查 → service role query`。
- 不允许把 service role 作为普通 Review API 默认 client。

## 18. 阶段2准入结论

```
NO-GO
```

阻塞项：

1. `NEXT_PUBLIC_SUPABASE_URL` MISSING
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY` MISSING
3. `SUPABASE_SERVICE_ROLE_KEY` MISSING
4. TARGET_ENVIRONMENT UNKNOWN

---

## 最终准入状态

```text
LIVE_AUTH_VERIFIED = NO
AUTH_READY_FOR_AUDIT = NO
LIVE_DATABASE_CONNECTION = NO
PROFILE_SCHEMA_READY = NO（真实未验证；代码 schema 就绪）
PROFILE_PRIVILEGE_FIELDS_PROTECTED = NO（真实未验证）
LIVE_RLS_VERIFIED = NO
MIGRATION_PIPELINE_READY = NO
DATABASE_READY = NO
STORAGE_READY = PARTIAL
TEST_INFRA_READY = YES
```

```text
PHASE_2 = NO-GO
LIVE_SETUP_BLOCKED = YES
```

## 需要人工处理的事项

1. 提供或确认一个 Development / Preview Supabase 项目。
2. 配置三个环境变量（Vercel Development / Preview）：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`（仅服务端）
3. Preview 设置 `AUTH_MODE=supabase`，保留 Review Center Feature Flag=true。
4. 手动创建测试账号（至少 admin + viewer），并写入 profiles。
5. 确认后重新执行阶段1.6B。

## 最小修复方案（等待确认，不自动执行）

- 不自行创建 Supabase 项目。
- 不修改 Production。
- 由人工提供环境变量后，重跑本阶段验收。
