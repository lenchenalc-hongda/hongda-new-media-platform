# Supabase Development / Preview 接入人工配置清单

> 面向：非专业开发人员 / 部署负责人
> 阶段：1.6C（环境接入准备）
> 前置：阶段1.6A 认证代码已就绪（commit 5efef0a）
> 真实状态：Supabase 环境变量当前 MISSING，本清单用于引导人工完成配置

---

## Step 1：创建/确认 Development Supabase 项目

- [ ] 新建一个独立的 Supabase 项目（不要直接连接未知的 Production 项目）
- [ ] 记录项目信息（不要写入代码）：
  - 项目名称：
  - 环境用途：Development / Preview
  - 是否允许测试：是 / 否
  - 是否允许创建测试账号：是 / 否
  - 是否允许执行 migration：是 / 否
- [ ] 确认该项目不是生产数据库

## Step 2：获取三个环境变量

| 变量 | 用途 | 是否公开 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址，客户端可使用 | 公开 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/public key，受 RLS 限制 | 公开（RLS 保护） |
| `SUPABASE_SERVICE_ROLE_KEY` | 高权限服务端密钥 | 机密，绝不公开 |

**SUPABASE_SERVICE_ROLE_KEY 铁律：**
- [ ] 绝不能进入浏览器
- [ ] 绝不能使用 NEXT_PUBLIC 前缀
- [ ] 绝不能提交 Git
- [ ] 绝不能贴入日志
- [ ] 绝不能发送到客户端

## Step 3：本地环境配置

仓库读取 `.env.local`（已被 .gitignore 排除）。

在 `.env.local` 中追加（真实值由你填写，不写入本文档）：

```text
AUTH_MODE=supabase
NEXT_PUBLIC_FEATURE_PROJECT_REVIEW_CENTER=true
NEXT_PUBLIC_SUPABASE_URL=<value>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<value>
SUPABASE_SERVICE_ROLE_KEY=<value>
```

- [ ] 确认 `.env.local` 在 .gitignore 中（已确认）
- [ ] 重启 `pnpm dev`

## Step 4：Vercel Preview 配置

在 Vercel 项目 Settings → Environment Variables，为 **Preview** 环境配置：

```text
AUTH_MODE=supabase
NEXT_PUBLIC_FEATURE_PROJECT_REVIEW_CENTER=true
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

**Production 保持：**
- [ ] `AUTH_MODE=supabase`（Production REQUIRED）
- [ ] Review Center 开放时配置 `NEXT_PUBLIC_FEATURE_PROJECT_REVIEW_CENTER=true`
- [ ] 不配置 `ALLOW_LIVE_AUTH_TESTS=true`，不配置 `LIVE_TEST_*` 测试凭据
- [ ] Production missing/mock/invalid `AUTH_MODE` 会 fail closed

## Step 5：Migration 执行方式

推荐使用 **Supabase SQL Editor 人工执行**（风险最低，无需安装 CLI）。

如果选择 Supabase CLI（可选，不强制）：
- [ ] 使用 `npx supabase`（无需新增 devDependency）
- [ ] 不要在本阶段向仓库添加 supabase 依赖

## Step 6：执行认证基础 Migration（最小集合）

只执行以下两个 migration（在 SQL Editor 中按顺序粘贴执行）：

1. `supabase/migrations/001_initial_schema.sql`
   - 创建 `profiles`（含 `user_id REFERENCES auth.users(id)`、`role` CHECK、`is_active`）
   - 创建其他业务表（accounts/topics/scripts/posts/leads 等）
2. `supabase/migrations/20260705_rls_policies.sql`
   - 启用 RLS
   - 创建 `auth_has_role()` / `auth_org_id()` / `auth_user_id()`
   - 创建各表 RLS 策略

**不要执行 `20260708_site_data.sql`**：该文件包含 `DROP TABLE IF EXISTS site_data`，会删除 site_data 表数据。除非你确认这是全新项目且不需要保留数据。

## Step 7：验证 Profiles

执行：

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'profiles' ORDER BY ordinal_position;
```

确认字段：`id`、`user_id`、`full_name`、`email`、`role`、`department`、`is_active`、`created_at`、`updated_at`。

确认外键：

```sql
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE table_name = 'profiles' AND constraint_type = 'FOREIGN KEY';
```

## Step 8：创建测试账号（至少 admin + viewer）

1. Supabase Dashboard → Authentication → Users → Add user
2. 创建测试邮箱（例如 `qa-admin@example.test`、`qa-viewer@example.test`）
3. 执行 `docs/project-review-center/test-user-profile-template.sql` 模板创建 profiles
4. 不要提交密码

## Step 9：运行 Doctor

```bash
pnpm review-center:doctor
```

预期输出：

```text
AUTH_MODE: supabase
Review Feature Flag: enabled
NEXT_PUBLIC_SUPABASE_URL: PRESENT
...
Ready for live auth verification: YES
Overall status: READY
```

## Step 10：运行标准测试

```bash
pnpm typecheck
pnpm build
pnpm test:auth
pnpm test:auth:live
pnpm test:review-center
```

## Step 11：浏览器验证

1. 打开 `/login`，确认显示「正式认证模式（Supabase Auth）」
2. admin 登录 → 可访问 `/review-center/settings`
3. viewer 登录 → 拒绝访问 `/review-center/settings`
4. viewer 伪造 `nmc_user` role=admin → 仍拒绝
5. logout → 再访问受保护页面跳回 `/login`

## Step 12：重新执行阶段1.6B 准入

配置完成后，重新运行阶段1.6B 验收，确认 `LIVE_AUTH_VERIFIED = YES` 后再评估阶段2。
