# Supabase Auth 接入配置说明

> 面向：非技术管理员 / 部署负责人
> 阶段：1.6A 认证加固（代码已就绪，等待环境配置）
> 当前状态：AUTH_MODE=mock（未配置 Supabase 时使用开发兼容模式）

---

## 1. 需要准备什么

一个 Supabase 项目（PostgreSQL + Auth + Storage）。

如果还没有：
1. 登录 https://supabase.com
2. 新建项目（选择与你系统相同区域的机房）
3. 项目创建后，在 Dashboard 左侧进入 **Project Settings → API**

---

## 2. 需要取得哪些环境变量

只从这里复制：

| 变量 | 在哪里取得 | 说明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL | 公开，可出现在浏览器 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → anon public key | 公开，可出现在浏览器 |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role secret | 机密，只允许服务端使用，绝不能出现在浏览器或仓库 |

不要把 service_role key 配置为 `NEXT_PUBLIC_*`。

## 3. Vercel 分别在哪里配置

在 Vercel 项目 → Settings → Environment Variables：

- **Development**：建议先配置（本机 `pnpm dev` 可用）
- **Preview**：建议配置（测试环境）
- **Production**：先不要配置，或只配置 URL/anon key 但保持 `AUTH_MODE=mock`，并保持 Review Center Feature Flag 关闭

三个环境分别设置相同变量即可，值来自同一个 Supabase 项目。

## 4. 如何配置 AUTH_MODE

| 环境 | AUTH_MODE | 说明 |
|---|---|---|
| Development | `mock` 或 `supabase` | 开发期建议先 mock，需要测试真实登录再切 supabase |
| Preview | `supabase` | 用于验证真实认证 |
| Production | 暂不切换 | 在 Review Center 正式开放前保持 mock 或关闭 |

切换后必须重新部署。

## 5. 如何创建第一个测试用户

不自动创建任何真实账号。手动步骤：

1. 打开 Supabase Dashboard → **Authentication → Users → Add user**
2. 创建测试邮箱 + 密码
3. 在 SQL Editor 执行一条 INSERT 创建对应 profile（把 `auth_id` 换成真实 auth.users.id）：

```sql
INSERT INTO profiles (user_id, org_id, full_name, email, role, department, is_active)
VALUES ('<auth.users.id>', 'org_001', '测试用户', '<email>', 'viewer', '测试部', true);
```

## 6. Profile 如何对应 auth.users.id

`profiles.user_id` 是唯一外键，指向 `auth.users(id)`。

服务端登录后：

```text
Supabase Auth 返回 session → session.user.id == auth.users.id
→ 服务端用该 id 查 profiles.user_id
→ 取 full_name / role / department / is_active
```

客户端无法指定自己的 user_id 或 role。

## 7. Admin 角色如何安全赋予

不通过前端页面赋予。方式：

1. 在 Supabase SQL Editor 执行（手动、可审计）：

```sql
UPDATE profiles SET role = 'admin' WHERE user_id = '<auth.users.id>';
```

2. 或在未来受保护的管理员功能中执行（服务端校验当前用户为 admin 后才允许）。

## 8. 如何避免普通用户修改自己的 role

现有 RLS 策略只允许：

- admin 管理全部 profiles
- 用户读取自己的 profile
- manager 读取本组织 profiles

普通用户没有 `UPDATE profiles` 策略，因此无法通过客户端修改自己的 role/department/is_active。

正式上线前需在真实环境重新验证一次 RLS。

## 9. 配置完成后如何验证

1. 设置环境变量并部署 Preview。
2. 打开 `/login`，确认页面显示「正式认证模式（Supabase Auth）」。
3. 用测试账号登录，跳转后台。
4. 确认 sidebar 显示你的 full_name。
5. 用 viewer 测试账号访问 `/review-center/settings`，应被拒绝。
6. 退出登录，再访问受保护页面，应跳回 `/login`。
7. 打开浏览器开发者工具，确认 `nmc_user` Cookie 已清除，Supabase Auth session Cookie 由服务端设置。
