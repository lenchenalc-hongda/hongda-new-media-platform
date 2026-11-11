# CPC P2-A — 企业微信自建应用接入清单（非生产）

Decision: Owner confirmed on 2026-11-11 that the company already uses 企业微信 and the Owner has enterprise administrator access. Use a **self-built internal WeCom app** for CPC notification. No external customer outreach and no auto-send authorization.

## 1. 管理员操作（现在即可做，无生产改动）

1. 企业微信管理员打开 https://work.weixin.qq.com/wework_admin/ → 应用管理 → 自建 → 创建应用。
2. 名称建议「宏达项目提醒」；介绍「HongdaOS 客户项目跟进与关键节点提醒」。应用可见范围先仅添加管理员本人及一位授权测试销售，**不要先开放全员**。
3. 「我的企业」中读取 CorpID；新自建应用详情读取 AgentID。建议由管理员记录在企业私有配置台，避免公开 Issue 描述中写入任何真实员工 UserID。
4. 应用 Secret 需在企业微信管理员手机端按提示确认查看；**只允许通过后续受保护的服务端 Secret 管理器录入**。不粘贴聊天、GitHub、PR、测试日志或前端配置。
5. 暂不配置企业可信 IP：先确定未来企业自有固定公网出口与运营成本。不要把任意动态 Vercel/Supabase Edge IP 当成固定出口。企业微信会校验可信 IP 和部分域名所有权；任何绑定仅用实际部署并经验证的出口。
6. 第一轮不要求接收消息、外部联系人、客户联系权限或通讯录同步 Secret；只做自建应用向指定员工发消息。成员绑定采用受控的 profiles.id ↔ 企业微信 UserID 管理员确认步骤，**不按重名/手机号猜测关联**。
7. 建立一对一测试列表并检查企业微信应用的可见范围；待安全审核及可信 IP 验证通过才进行真实沙盒消息。

参考接口：
- 企业微信 API 发送应用消息：https://developer.work.weixin.qq.com/document/path/90236
- 获取 access_token：https://qiyeweixin.apifox.cn/api-10061194
- 企业微信发送应用消息：https://qiyeweixin.apifox.cn/api-10061348

## 2. 已提交 P2-A 纯离线模型

- src/lib/customer-projects/wecom-notification-contract.ts 仅计算通知意图，不调用企业微信 API、不读取数据库、不处理 Secret。
- 工作项分配给 WorkItem assignee；等待/推进/项目开发建议归到 Project Owner。
- 强制组织匹配、CorpID 匹配、经过确认的 UserID/在职/应用可见范围、单一绑定；禁止多用户、群发及 @all。
- 默认工作日北京时间 09:00–09:15 个人摘要时间窗；建议真实调度错开高峰在 09:07，老板汇总另设单独窗口（初始建议 09:17）；没有到期信息或目标身份则 fail closed。
- 同一提醒以组织、个人、源对象、事件有效时间、渠道、策略版本、北京时间日期形成确定性的 occurrence key。相同计划再次计算同一 key；重排/换负责人形成新 key，旧 key 的确认规则会判失效。
- 推送正文为通用提示，不包含客户名、金额或私人资料；点开 URL 后仍由 CPC 登录与 RLS 控制页面可见。
- 特别说明：这个模块只证明可以生成一个 **planned intent**，并不代表已完成可靠 Outbox、调度、收件人数据库绑定、可信固定出口或任何真实发送。

## 3. 后续任务与授权门槛

P2-B：隔离数据库建立组织范围下的绑定、投递队列、日志、租约、幂等与重试；审计 RLS、跨组织拒绝、重复提交、部分成功、未知结果、超过配额、改期取消、并发抢占、模拟时钟、补偿策略。先做至少 10 次不触达实际员工的演练。不要跳过独立代码安全审核。

P2-C：由企业自有符合要求的固定公网出口访问企业微信 gettoken 与 message/send；使用仅服务端读取的应用密钥，缓存并刷新 access_token，精确记录企业微信 errcode/invaliduser/unlicenseduser（禁止记录 Secret/Token）。首轮仅发送给管理员确认的测试账号，明确审核应用可见范围、登录后跳转、消息去重。HTTP 超时如不能判定发送结果，必须标记 UNKNOWN 并人工核对，不能无限重复发送。

P2-D：P2-C 证据齐全后，另行获取 Owner 对 **Production database migration / RLS / secrets / fixed egress fee / scheduled sends to employees** 的明确批准。具备紧急关闭开关、隔离/撤销用户绑定及回滚。

## 明确边界

- 不修改报价、客户归属、工资提成、工作考核规则、任务生命周期。
- 不影响 P1 Draft PR #231 的独立上线门槛。
- 不新建第二套客户、项目或业务事实系统。
- 与 Agent Control Coding Runner 解耦；企业提醒不能依赖个人 Mac 开机。
