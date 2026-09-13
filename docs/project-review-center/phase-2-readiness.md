# 项目复盘与改善中心 — 阶段2准入报告

> 报告日期：2026-08-13
> 阶段：1.5（阶段1固化 + 阶段2准入检查）
> 阶段1 commit：08f61af
> 结论：**PHASE_2 = NO-GO**

---

## 1. 阶段1最终验收

```
PASS
```

- 阶段1 已提交（commit `08f61af`，未 push）。
- 19 个 Review Center 路由生成并通过构建。
- 中间件迁移到 `src/middleware.ts` 后真实生效，登录与角色权限已实测。
- 唯一修正：阶段1报告中的 E2E 未执行问题，已在阶段1.5实际运行（19/19 通过）。

## 2. Middleware回归

| 路由 | 未登录 | admin | manager | operator | sales | viewer |
|---|---:|---:|---:|---:|---:|---:|
| /login | 200 | 200 | 200 | 200 | 200 | 200 |
| /workspace-home | 307 | 200 | 200 | 200 | 200 | 200 |
| /dashboard | 307 | 200 | 200 | 200 | 200 | 200 |
| /scripts | 307 | 200 | 200 | 200 | 307 | 200 |
| /settings | 307 | 200 | 307 | 307 | 307 | 307 |
| /review-center | 307 | 200 | 200 | 200 | 200 | 200 |
| /review-center/new | 307 | 200 | 200 | 200 | 200 | 200 |
| /review-center/settings | 307 | 200 | 307 | 307 | 307 | 307 |

- 未登录访问受保护页面 → `/login?redirect=...`（307）✅
- admin 可访问 review-center / new / settings ✅
- 非 admin 可访问 review-center / new，不可访问 settings（307 → /dashboard 无权限提示）✅
- 原有模块行为符合既有权限矩阵 ✅
- 公开路由、静态资源、/api/ai 排除逻辑保持 ✅
- `/login` 无重定向循环 ✅

## 3. Feature Flag

- 环境变量：`NEXT_PUBLIC_FEATURE_PROJECT_REVIEW_CENTER`
- Flag 关闭（阶段1已验证）：Sidebar/工作台隐藏入口；`/review-center` 被 middleware 拦截（307 → `/dashboard?error=项目复盘与改善中心尚未开放`）。
- Flag 开启（本阶段实测）：导航显示、19 路由可访问、角色权限仍生效。
- 结论：Feature Flag 只控制功能开放，不替代登录/角色/数据库权限。

## 4. 自动化测试实际执行情况

测试 runner 确定为 **tsx**（项目 CI 已使用），已加入 `devDependencies`，并新增脚本 `pnpm test:review-center`。

| 文件 | 用例 | 通过 | 失败 |
|---|---:|---:|---:|
| tests/unit/account-v2.test.ts | 23 | 23 | 0 |
| tests/unit/persona-compiler.test.ts | 41 | 41 | 0 |
| tests/unit/account-guard.test.ts | 14 | 14 | 0 |
| tests/fixtures/calibration.test.ts | 39 | 39 | 0 |
| tests/integration/route-persona.test.ts | 55 | 55 | 0 |
| tests/integration/route-handler-persona.test.ts | 26 | 26 | 0 |
| tests/unit/current-user.test.ts | 6 | 6 | 0 |
| tests/e2e/review-center.spec.ts | 19 | 19 | 0 |
| **合计（8 个文件）** | **223** | **223** | **0** |

修复的测试基础设施问题：

- `tests/smoke-runner.ts`：`fetchPage` 未读取 `Location` header，导致 307→/login 被误判为失败；已改为从 `res.headers.get('location')` 读取。
- 多个历史测试文件在 ESM 下使用 `require()` 崩溃；改为静态 import。
- 历史测试断言与冻结实现不一致（如 hooks 关键词、品牌关系披露输入、forbidden claim 精确匹配）；按冻结实现修正断言。

## 5. 当前认证机制

- 登录：`src/app/login/page.tsx` 客户端选择 Mock 用户。
- Cookie：`nmc_user` 由**浏览器客户端**通过 `document.cookie` 写入（`login/page.tsx`）。
- 中间件：`src/middleware.ts` 通过 `getCurrentUserFromRequest()`（新增统一桥接 `src/lib/auth/current-user.ts`）解析 Cookie 并校验页面权限。
- 角色：admin / manager / operator / sales / viewer。
- 无 Server Action、无登录 API、无服务端签名。

## 6. nmc_user 伪造风险（已实测确认）

**结论：可以伪造。**

实测（本地生产模式服务器，未攻击生产）：

| 场景 | 结果 |
|---|---|
| viewer 合法 Cookie 访问 /review-center/settings | 307 拒绝 ✅ |
| viewer Cookie 手工改为 role=admin 后访问 /review-center/settings | **200 放行 ❌** |
| 伪造 admin 访问 /settings | **200 放行 ❌** |
| 伪造 manager 访问 /scripts | **200 放行 ❌** |

原因：

- Cookie 为客户端 JSON（`encodeURIComponent(JSON.stringify(user))`），无 HttpOnly、无签名、无加密、无服务端来源校验。
- `SameSite=Lax` 存在，但只防 CSRF，不防用户自改。
- middleware 完全信任 Cookie 内容。

## 7. 用户唯一ID情况

- `AuthUser` 有：id / full_name / email / role / org_id / department。
- 当前 ID 为 Mock 静态 ID（u_admin / u1 / ...），不关联 Supabase `profiles` / `auth.users`。
- 稳定性：在同一代码库、同一部署内稳定；但**不跨真实部署/真实用户体系稳定**，不能作为审计身份。
- Review Center 需要的 created_by / owner_id / reviewer_id / approved_by / verified_by / closed_by 目前**无法获得可信身份**。

## 8. Supabase环境

| 变量 | 状态 |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | MISSING |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | MISSING |
| SUPABASE_SERVICE_ROLE_KEY | MISSING |

（仅输出存在性，不输出值。）

## 9. Database连接状态

- 未连接：环境变量为空，未执行任何只读连接测试。
- 无法验证生产数据库是否已迁移。

## 10. Migration体系

- 目录：`supabase/migrations/`，命名 `YYYYMMDD_描述.sql`（另有旧 `001_initial_schema.sql`）。
- 本机：未确认 Supabase CLI 已安装/配置（package.json 无 supabase CLI 依赖）。
- Preview/Production：无自动迁移流程文档；Vercel 部署不执行 migration。
- rollback：无系统化 rollback；手动 DROP/逆 SQL。
- schema diff：无工具配置。
- 防误执行：无保护机制；需人工确认。

## 11. RLS现状

- 已有 helper：`auth_has_role()`、`auth_org_id()`、`auth_user_id()`（基于 Supabase Auth JWT）。
- `nmc_user` Cookie 与 Supabase Auth **无关联**。
- 现有 API 使用 service_role（如 `/api/data`），service role **绕过 RLS**。
- 结论：若 Review API 使用 service role，必须由**应用层**基于可信用户身份做行级/字段级授权；RLS 在 service role 下不生效。真正权限控制应落在“可信身份 + 应用层授权（必要时配合 RLS）”。

## 12. Storage现状

- 当前无 Supabase Storage 使用代码。
- 可行性：可建 private bucket + 服务端短期 signed URL + 服务端权限校验，符合附件保护要求。
- 结论：**STORAGE_READY = PARTIAL**（方案可行，但无配置、无 bucket、无可信身份）。

## 13. 客户/订单/项目主数据

| 主数据 | 是否存在 |
|---|---|
| customers | 无（仅有 leads 线索表，非 CRM 主数据） |
| orders | 无 |
| projects | 无 |
| employees | 无（profiles 为用户档案，非员工主数据） |
| departments | 无（profiles.department 为文本字段） |

建议（阶段2适用）：Review Center V1 使用正式文本字段 `customer_name` / `order_no` / `project_name`，并预留可空外键 `customer_id / order_id / project_id`，未来关联 CRM，不在阶段2重建完整 CRM。

## 14. 阶段2推荐数据库架构

- 使用规范化 PostgreSQL 关系模型，禁止把完整复盘对象塞进单个 JSONB。
- 建议表：`review_cases`（主表）、`review_timeline`、`review_actions`、`review_versions`、`review_audit_log`、`review_attachments`、`review_dict_items`。
- 类型 A/B/C 的专项字段建议使用结构化列或受约束 JSONB 子对象（仅在专项区块内），核心审计字段必须为列。
- `site_data` JSONB 仅适合配置/页面内容/小型模块数据，不适合整个 Review Center。

## 15. 当前阻塞项

1. **认证/身份不可审计（主阻塞）**：nmc_user Cookie 可伪造，无 HttpOnly/签名/服务端验证；无法为 created_by / reviewer_id 等提供可信身份。
2. **数据库不可用（主阻塞）**：Supabase 环境变量 MISSING，无法建表/迁移/RLS。
3. Storage 为 PARTIAL（依赖前两项）。

## 16. 阶段2准入结论

```
NO-GO
```

---

## 四项核心结论

```text
AUTH_READY_FOR_AUDIT = NO
DATABASE_READY       = NO
STORAGE_READY        = PARTIAL
TEST_INFRA_READY     = YES
```

```text
PHASE_2 = NO-GO
```

## 下一阶段建议（仅方案，不执行）

主要阻塞原因：

- **A. 认证/身份审计**（首要）
- **B. Supabase 数据库**（其次）

建议阶段：

```
阶段1.6：真实认证与审计身份加固
```

最小改造方向（供讨论，不在本阶段执行）：

1. 服务端登录会话：登录改为服务端 API 写入 HttpOnly + Secure + SameSite=Lax + 签名/会话令牌；用户身份从 `profiles`（或受控用户表）解析，而不是客户端 JSON。
2. 统一认证接口：业务层只依赖 `src/lib/auth/current-user.ts`（已建立桥接，替换实现即可）。
3. Supabase 准入：确认/配置 Supabase 环境变量、执行已有 migration、确认 Preview/Production 迁移与回滚流程。
4. 之后重新执行本准入检查，再进入阶段2。

## 生产环境 Feature Flag 指引

- Production：`NEXT_PUBLIC_FEATURE_PROJECT_REVIEW_CENTER=false` 或**不配置**（默认关闭）。
- Development / Preview：`NEXT_PUBLIC_FEATURE_PROJECT_REVIEW_CENTER=true`。
- 本阶段不建议向全体员工开放该模块。

## 本阶段文件变化

- 新增：`src/lib/auth/current-user.ts`、`tests/unit/current-user.test.ts`、`docs/project-review-center/phase-2-readiness.md`、`pnpm-workspace.yaml`（allowBuilds）、`package.json`（test:review-center、tsx devDependency）
- 修改：`src/middleware.ts`（使用统一用户桥接，行为不变）、`tests/smoke-runner.ts`（Location header 修复）、多个历史测试断言对齐、`src/app/review-center/AGENTS.md`（正式数据禁止 /tmp/localStorage/本地 JSON）
- 数据库：无变化
