# GLH Stage 1 — 正式手工录入业务操作与权限边界

> 用户已确认：第一道 GLH 内部工作台上线支持**手工录入真实外贸线索**。
>
> 当前状态：PR #138 开发与验收中；不等于正式发布授权。
>
> 不接入真实 WhatsApp、Meta、自动客户回复；客户池/财务权威数据保持原样。

## 如何使用

进入 **Global Lead Hub → Lead Library → 新增线索**，填写：

- **客户称呼**（必填）、公司、国家/地区；
- **WhatsApp 国际号码或邮箱**：至少一个可联系字段必填；
- 来源（展会、网站询盘、转介绍、主动开发、社交媒体、其他），以及业务类型（花膜、加工、机器、工艺咨询等）；
- 产品、材质、预计数量、业务备注；
- 负责人：销售员默认是自己；管理员/经理可选本组织启用的其他负责人。

保存成功后直接进入该客户的 GLH 线索详情页。线索初始状态为 `NEW`，会话模式为 `PAUSED`；不创建虚假的 WhatsApp 会话、不自动回复、不代替人工开展业务。用户可在详情页按现有权限新增任务、跟进及由管理者重新分配。

## 重复检查与追踪

- 同一个组织内已有相同规范化邮箱/WhatsApp 时，系统拒绝再次建档；不会替换原负责人，员工需联系管理员查重。
- 客户姓名相同但完全没有共用联系方式的记录无法自动判定为同一客户。正式投入使用时员工仍应主动搜索客户名/公司名；之后可以增加显式的去重与合并审核流程。
- 页面同一次提交使用 UUID 请求键；失败重试沿用同一请求键，服务端保留只读的私有幂等记录；相同请求安全返回原线索，变更内容与旧键冲突会被拒绝。
- 创建时原子写入 GLH contact、lead、lead profile、primary assignment、activity `LEAD_CREATED`、audit `LEAD_STAGE_CHANGED` / `LEAD_ASSIGNED` 以及私有幂等键记录；任何一步失败全部回滚。
- 来源 `MANUAL_PRODUCTION` 和细分渠道被写入 `extracted_facts` / 审计表，而 `source_platform` 保留 `UNKNOWN`；不得虚构为已验证的 Meta/WhatsApp 来源。备注是销售录入记录，不是 AI 摘要。

## 严格权限与安全

- 仅有**有效 Supabase 登录 + active profiles + admin/manager/sales**的员工可以调用正式录入接口。
- 授权组织、操作者与角色一律由数据库内 `auth.uid()` 反查，不接收浏览器提供的 org_id 或 actor_id。
- 销售员不能替其他员工建档或跨组织指派；管理员/经理也只能选择本组织启用的人员。
- 用户没有直接写入 GLH 表的权限；操作通过受限制的 PostgreSQL SECURITY DEFINER RPC；幂等键记录表没有向浏览器开放 SELECT/INSERT。
- 原有 `glh_create_manual_test_lead`、原有 `/api/global-lead-hub/leads` POST **继续仅限 test/dev**；没有放开其 Production 环境开关。
- 针对手工录入的数据库迁移文件是 `20261021120000_global_lead_hub_stage1_manual_production_intake.sql`，属于第五份 GLH 迁移，必须在前四份成功后执行。

## 上线验收表

- [x] GitHub CI 中一次性 PostgreSQL 17 容器实际执行五份迁移，验证当前基本角色与 SQL 安全性（以最新 exact HEAD CI 为最终依据）
- [x] 合成组织 Sales A / Sales B / Manager 的跨组织隔离、重复邮箱、重复国际号码、幂等重放与冲突、审计、无外部副作用测试（同上）
- [ ] 在真实 Supabase 隔离测试项目复验第 1–5 份 SQL、RPC 和 Auth/RLS；其 `hongda-review-dev` 数据库连接此前超时
- [ ] 在可登录的 GLH Vercel Preview 环境完成管理员和业务员浏览器验收，包括原始录入、连续点击、断网重试、同组织跨人归属权限、客户详情、任务/跟进
- [ ] 冻结准确 app release SHA 和五份 SQL 校验值
- [ ] 获得老板对第一道 Production schema/RLS/部署的单项明确批准
- [ ] 变更后再检查 RLS、安全、CPC/报价页回归与 WhatsApp GET/POST 全部禁用

不得把本文件中测试用模拟手机号/邮箱写入真实客户库，也不得直接以本文件作为正式 Production 执行授权。
