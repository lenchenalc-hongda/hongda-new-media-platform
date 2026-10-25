# 数码热转印膜报价速算（Preview Only）

位置：登录工作台首页 `/workspace-home`，只向 `admin/manager/sales` 显示。受保护的 POST API：`/api/digital-transfer-quote`。

- 业务员输入实际面积；向上匹配 **最近的既有价格档**，不按整数取整，不插值，不按平方米乘单价。
- 严格边界：小于1.5 m²、超过200 m²或非正数不报价；无效输入不报价；1.5和200包含在内。
- 价格表来自 Vercel Preview 的服务端环境变量 `DIGITAL_TRANSFER_PRICE_TIERS`，不要使用 `NEXT_PUBLIC_`，不要把真实售价写入公开 Git 或前端。
- 配置格式：`1.5:300,2:310,...,200:2400`，按面积升序、无重复档，必须包含固定的63档面积。
- 已确认50 m²为¥1,630，60 m²为¥1,700；64 m²与60 m²同价¥1,700。
- 配置不存在、格式不符、价格下降、特殊档金额冲突即 **fail-closed**（HTTP 503），不会展示错误报价。
- API 拒绝未授权或无效身份，限定 Supabase 模式，禁止 GET 列表，禁缓存；任何错误不回传完整价格表。
- 价格表版本：`HD-DTF-2026-10-25-v1`。售价为**内部参考订单金额**，不是正式报价或财务记录；不写入CPC、GLH、WOS或账款。
- 在 Preview 环境单独验收，不合并 master / 不发布 Production。上线需要老板另行批准。

## 非生产验收
```bash
pnpm exec tsx tests/unit/digital-transfer-pricing.test.ts
pnpm exec tsc --noEmit
```
CI 会运行无机密价格数据的合成63档测试；完整真实价格只用于 Preview 服务端验证。配置必须在发起 Preview 部署**之前**存在：Vercel 不会将后加的环境变量自动注入已创建的部署；添加配置后要新建部署。\n\n在受保护的 Preview 用不同角色测试：sales/admin 可计算，viewer/operator 与未登录不能访问金额。检查浏览器 bundle 和网络响应均不包含完整价格表。
