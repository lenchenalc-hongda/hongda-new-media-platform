# 阶段1.6D Development Supabase 落地验证与真实认证准入重验 — 报告

> 日期：2026-08-13
> 前置：阶段1.6C（commit e22153a）
> 结论：**LIVE_SETUP_BLOCKED = YES（Supabase 环境仍未配置，真实验证未执行）**

---

## 1. Development/Preview环境

```
TARGET_ENVIRONMENT = UNKNOWN
```

未提供任何 Supabase 项目引用；按安全原则停止一切写操作与真实认证测试。

## 2. 环境变量状态

| 变量 | 状态 |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | MISSING |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | MISSING |
| SUPABASE_SERVICE_ROLE_KEY | MISSING |
| AUTH_MODE | MISSING（默认 mock） |
| NEXT_PUBLIC_FEATURE_PROJECT_REVIEW_CENTER | PRESENT |
| ALLOW_LIVE_AUTH_TESTS | MISSING |
| SUPABASE_ENVIRONMENT | MISSING |
| LIVE_TEST_ADMIN_EMAIL / PASSWORD | MISSING |
| LIVE_TEST_VIEWER_EMAIL / PASSWORD | MISSING |

（仅输出存在性，未输出任何值。）

## 3. 数据库连接

未执行真实连接测试（环境缺失）。

```
LIVE_DATABASE_CONNECTION = NO
```

## 4. Profile schema

未基于真实数据库验证（环境缺失）。代码 migration `001_initial_schema.sql` 已包含所需字段与 `user_id REFERENCES auth.users(id)`。

```
LIVE_PROFILE_SCHEMA_READY = NO（真实未验证；migration 侧就绪）
```

## 5. Auth用户映射

未验证（环境缺失、未创建测试账号）。

## 6. Viewer登录

未测试（环境缺失）。

## 7. Admin登录

未测试（环境缺失）。

## 8. nmc_user攻击

未执行真实攻击测试。代码侧单元测试已证明 `resolveSupabaseCurrentUser` 不读取 `nmc_user`，伪造 role 无法提权；真实复测待环境就绪。

```
LIVE_NMC_USER_PRIVILEGE_ESCALATION = NOT TESTED（代码侧 BLOCKED）
```

## 9. userId伪造

未执行真实测试；代码侧身份始终来自服务端 session。

```
LIVE_USER_ID_SPOOFING = NOT TESTED（代码侧 BLOCKED）
```

## 10. profile提权

未执行真实 RLS 测试；migration 中 profiles RLS 策略已存在（普通用户无 UPDATE）。

```
PROFILE_PRIVILEGE_FIELDS_PROTECTED = NOT TESTED（代码侧已保护）
```

## 11. inactive

未执行真实测试；代码侧 `is_active=false` 已拒绝。

```
INACTIVE_USER_BLOCKED = NOT TESTED（代码侧 BLOCKED）
```

## 12. missing profile

未执行真实测试；代码侧 profile 缺失已拒绝，不默认 viewer/admin。

```
MISSING_PROFILE_BLOCKED = NOT TESTED（代码侧 BLOCKED）
```

## 13. logout

Mock 模式 `/api/auth/logout` 已实测清除 `nmc_user`；真实 Supabase logout 未测。

```
LIVE_LOGOUT_VERIFIED = NO
```

## 14. mock fallback

代码保证 Supabase session 无效时不会回退 mock 身份。

```
NO_SILENT_MOCK_FALLBACK = YES（代码保证，真实未测）
```

## 15. RLS

未执行真实验证（环境缺失）。

```
LIVE_RLS_VERIFIED = NO
```

## 16. Service Role

代码侧 `createAdminSupabaseClient()` 仅服务端；真实构建泄露扫描未执行。

```
SERVICE_ROLE_SERVER_ONLY = YES（代码保证）
```

## 17. Migration Pipeline

本地 migration 已审计、执行清单已生成、SQL Editor 人工执行方式已明确；真实远端状态未验证。

```
MIGRATION_PIPELINE_READY = YES（本地流程就绪，远端未验证）
```

## 18. Storage

```
STORAGE_READY = PARTIAL
```

## 19. 最终Review权限架构（代码侧确定）

- 普通业务请求：Supabase Auth → `requireUser()` → CurrentUser → 应用层权限 → Server User Client → PostgreSQL RLS（双重防线）。
- Service Role：仅系统后台/管理员级维护，必须 `requireUser → requirePermission → scope check → service role`，不作为普通 CRUD 默认 client。

## 20. Phase 2结论

```
NO-GO
```

---

## 最终准入状态

```text
TARGET_ENVIRONMENT = UNKNOWN
LIVE_AUTH_TEST_EXECUTED = NO
LIVE_AUTH_VERIFIED = NO
AUTH_READY_FOR_AUDIT = NO
LIVE_NMC_USER_PRIVILEGE_ESCALATION = NOT TESTED（代码 BLOCKED）
LIVE_USER_ID_SPOOFING = NOT TESTED（代码 BLOCKED）
PROFILE_PRIVILEGE_FIELDS_PROTECTED = NOT TESTED（代码已保护）
INACTIVE_USER_BLOCKED = NOT TESTED（代码 BLOCKED）
MISSING_PROFILE_BLOCKED = NOT TESTED（代码 BLOCKED）
LIVE_LOGOUT_VERIFIED = NO
NO_SILENT_MOCK_FALLBACK = YES（代码保证）
LIVE_DATABASE_CONNECTION = NO
LIVE_PROFILE_SCHEMA_READY = NO（真实未验证）
LIVE_RLS_VERIFIED = NO
SERVICE_ROLE_SERVER_ONLY = YES（代码保证）
MIGRATION_PIPELINE_READY = YES（本地流程就绪）
DATABASE_READY = NO
STORAGE_READY = PARTIAL
TEST_INFRA_READY = YES
```

```text
PHASE_2 = NO-GO
LIVE_SETUP_BLOCKED = YES
```

## 需要人工确认/完成

1. 提供或确认 Development / Preview Supabase 项目。
2. 配置三个 Supabase 环境变量。
3. 设置 `AUTH_MODE=supabase`、`ALLOW_LIVE_AUTH_TESTS=true`、`SUPABASE_ENVIRONMENT=development`。
4. 创建 QA Admin / QA Viewer 测试账号并写入 profiles。
5. 按 `supabase-live-setup-checklist.md` 完成本地/Vercel Preview 配置与 migration 执行。
6. 完成后重跑阶段1.6D。
