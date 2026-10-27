# CPC 临时客户“新媒体来源已存在”修复｜2026-10-27

## 故障定位（已核实生产库）

客户新建项目页面 `/customer-projects/projects/new` 允许用户输入“客户名称”和“来源说明”并添加到客户池。原前端把“新媒体/展会”当作 `provisionalSourceReference` 直接传给 `cpc_create_provisional_customer_reference`；DB 原函数把渠道文本原样写入 `provisional_source_reference`。

但是 `uq_cpc_customer_reference_provisional_source` 是 **(org_id, provisional_source_reference)** 的**唯一索引**，历史值“新媒体”已经存在于同组织的一个 **mapped** 记录中。因此再次填“新媒体”时抛出唯一性冲突；原 RPC 将所有冲突捕获为 `DUPLICATE_REFERENCE`，API 显示“该临时客户来源已存在”。“展会”也已经存在，后续同样可能触发冲突。**不是业务员账号权限问题。**

本次截图所涉“丹尼玩具龙川有限公司”已由叶展龙在 2026-10-27 17:50（北京）创建为 pending_review 客户，随后关联 **1 个项目**。在当时未修复的系统中将渠道临时写为“展会”才成功创建。**切勿再次新增同名客户和重复项目**。历史实际来源核对后，应在单独受控、更改有审计记录的操作中，将其展示来源更正为“新媒体”；不得用覆盖唯一外部引用或删除重建客户的方式修复。

## 正确模型

- `cpc_customer_references.id`：唯一主键 UUID，客户/项目/事件的稳定关联键。
- `provisional_source_reference`：**系统生成的内部唯一临时客户引用**（新记录为 `CPC-PROV-<uuid>`），保留原有组织内唯一索引。既有记录中的历史字符值保持原样，不能批量重写/丢失映射。
- `provisional_source_label`：**新增可重复的获客渠道说明**，例如“新媒体”、“展会”、“老客户转介绍”、“WhatsApp”，同一组织任意多个不同客户都可以相同。仅 provisional 允许非空新字段，长度最多300个字符。
- 对老客户，`provisional_source_label IS NULL` 时，列表/搜索/详情仍展示老的 `provisional_source_reference`，保证新功能上线不造成历史来源消失。
- 对 canonical 正式客户，仍展示其原本的 `external_source`，不改变外部客户编号、主人归属及同步契约。

## 变更

1. 新增迁移 `supabase/migrations/20261027175500_cpc_provisional_source_channel_separation.sql`：新增可空字段、约束、列注释，重定义原 RPC（签名不变），真实认证/活跃人员校验和审计日志依旧保留；**不删除旧索引，不批量UPDATE已有客户数据，不改变项目、外部客户映射或销售归属**。
2. `src/app/customer-projects/projects/new/page.tsx`：把“来源说明”调整为“获客渠道 / 来源”，明确允许重复；请求体沿用兼容参数 `provisionalSourceReference`，后端只把其含义视为渠道标签。
3. `src/app/api/customer-projects/customer-references/route.ts`、`customers/route.ts`、`customers/[id]/route.ts`、`src/lib/customer-projects/customer-read-models.ts`、`server-reads.ts`：均优先展示渠道标签，旧客户回退到历史字段。
4. `src/lib/customer-projects/api.ts`：避免继续误报“渠道已经存在”。保留真正内部编号唯一冲突的错误处理。
5. 单元测试、RPC/接口不变性测试及数据库事务 QA。

## Dev 数据库事务演练

Dev 已执行迁移，使用有效 sales 的 JWT profile 模拟创建**一条历史渠道值记录 + 连续两条同一来源的新记录**：
- 三条能共存；新记录内部引用都是 `CPC-PROV-` 加各自 UUID，source_label 完全相同；
- 未改变历史 source reference；
- 两次新增均附有审计日志，获客渠道数据可追踪；
- operator 禁止新增、空值/超长来源拒绝；
- 全部 QA 在 `ROLLBACK` 后结束，开发库客户/项目/审计数量未变；
- anonymous 没有该 RPC 执行权限，authenticated 不能对客户表直接 INSERT/UPDATE。

## 发布门禁与顺序

1. 检查 PR 精确 HEAD、完整 CI 通过及 Vercel Preview READY；
2. 生产数据库只读记录现有客户/项目/映射/审计数量、既有唯一索引与旧版 RPC；
3. 先对 Production 执行本次**新增可空列 + 重定义 RPC**迁移，立即核对原始数据与权限（旧页面此时仍能使用原 RPC 签名）；
4. 迁移确认成功才合并代码，等待 Vercel Production READY 并确认 `www.hongdaprinting.tech` 实际指向正确 HEAD；
5. **不在 Production 创建虚假的客户作为测试**。验证已有真实客户列表、可读性和运行错误；实际人员在工作场景中再新建同渠道客户；
6. 如果要更正截图客户来源，另行针对**已核实客户 UUID、姓名和旧值**仅更新 `provisional_source_label` 与 `updated_at`，并记录 `CUSTOMER_SOURCE_CORRECTED` 审计；**不能改 `provisional_source_reference`、客户 ID、关联项目和 owner**。

这类重复渠道是普遍的业务场景，**不得通过删除唯一索引**或在输入框后拼接随机字符串做展示来掩盖模型问题。
