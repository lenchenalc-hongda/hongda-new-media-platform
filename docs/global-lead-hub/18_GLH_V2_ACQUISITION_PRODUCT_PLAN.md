# GLH V2 | 外贸 AI 营销与精准获客产品计划

PRODUCT_SCOPE = HongdaOS / Global Lead Hub V2
STATUS = DEVELOPMENT_PROPOSAL / INCREMENTAL
SOURCE = owner strategy discussion 2026-10-26
CONTROL_ISSUE = #72
EXISTING_V1 = docs/global-lead-hub/00_项目总纲.md through 08_IMPLEMENTATION_CHECKLIST.md
PRODUCTION_EXECUTION_AUTHORIZED = NO
GLH_PROVIDER_CALLS_ENABLED = false
AUTO_MERGE = false
AUTO_PRODUCTION = false

## 1. 业务目标与核心定位

宏达外贸业务员现有链路：视频剪辑、Facebook/Instagram 同步发布、按国家/地区投流、Facebook 与 WhatsApp 初筛客服、精准客户承接、报价打样、订单、跟单、生产及发货。

GLH V2 的目标是减少前四步的重复劳动，将经 AI 收集、有证据、经业务员确认的有效 B2B 工业商机交给销售；并让内容和广告优化依据真实商机质量，而非单看播放量与低价询盘数。现有 V1 多人线索库、原始消息、权限、RLS、人工交接继续使用，不能推倒重建。

北极星指标：单位广告消耗产生的人类确认有效商机数 (human-confirmed qualified leads)；同时衡量重要线索漏筛率、首次响应时延、人工初筛耗时和后续订单转化。没有历史基线前，不承诺虚假的节省比例。

优先级：P0 AI 询盘理解与精准交接；P1 广告质量归因及 CPC 结果反馈；P2 视频发布协同；P3 自动修改广告/真实客户自动回复（需另行授权，当前不开发生产操作）。

## 2. 参与者及渠道

- Admin / Manager：审核渠道授权、规则、异常、团队有效商机和投流建议。
- 内容/投放负责人：维护视频、广告计划和发布/预算人工审批。
- Sales：承接被分配线索、确认商机是否有效、报价打样、反馈结果。
- AI：给出来源可溯的字段候选、内容/回复草稿、缺失问题和转人工建议，不具有真实发送、报价、预算操作权。
- Official provider adapter：唯一的服务端渠道读写出口，需要各自人类授权。

初期渠道：Facebook Pages 视频/Reels、Instagram 专业账号视频/Reels、WhatsApp Business Platform、Facebook Messenger；Instagram 专业私信视官方权限再启用。口语的 in 暂按 Instagram/Ins 设计。LinkedIn 是否要纳入，需要独立账号/API 资格确认，不能沿用 Instagram 的权限结论。

## 3. 系统权威与复用边界

| 功能 | 正确的权威系统 | GLH V2 职责 | 禁止重复建设 |
| --- | --- | --- | --- |
| 视频原片、选题脚本、版本及批准 | HongdaOS 新媒体中台 | 链接 post ID、素材分类、投放活动 | 不自建 CapCut |
| 发布状态 | Meta 官方平台或经评估的授权 SaaS | 只读关联回执、dry-run 发布排程；发布需人工批准 | 不模拟浏览器点击 |
| 广告消耗、广告组和预算 | Meta Ads Manager | 先只读接收消耗/国家/素材数据并做解释 | 不复制 Meta 投放算法 |
| 消息、原始联系人、初筛、交接 | GLH | 官方 webhook、结构化 AI、证据和审计 | 不丢失原始消息 |
| 正式客户/项目/负责人 | CPC | 有授权的客户/项目引用、转化反馈 | 不创建第二套客户权威 |
| 报价/打样/商务 | 报价系统 / WOS | 引用已确认的项目状态和凭证 | 不自动报价/承诺产能 |
| 成交事实/金额 | 真实业务系统 | 仅在获授权后做转化归因/回传 | 不用 AI 猜测成交 |

数据映射：素材 id / channel post id / campaign id / adset id / ad id / creative id / ctwa_clid（存在才记录）/ raw message id / GLH lead id / CPC customer/project id。未知字段保留 UNKNOWN/null，不伪造广告或国家来源；一个联系人可以有多个机会项目，不能无证据合并。广告花费需记录币种、日期窗口、账号及快照来源，不能跨币种直接累加。

## 4. 功能链路

### 4.1 内容制作与发布

视频素材 → 已验证工艺知识 → 英文/多语脚本文案/字幕候选 → 人工工艺与品牌审查 → 排期 → 使用官方发布能力或已审核 SaaS → 回收平台 post ID 与状态 → 如用于广告，关联 creative/ad ID → 分析后续商机质量。

优先整合现有宏达新媒体内容工具和团队日常编辑软件；采购平台或官方 API 必须先验证多账号授权、可导出、Webhooks、费用、失败重试，不自建视频编辑器。任何真实发布必须有额外授权。

### 4.2 国家投流与广告质量

先做 Meta 数据只读看板：按国家、时间窗、campaign/adset/ad/素材识别 spend/impressions/clicks/message lead。按广告来源与人类确认有效线索计算：
- CPL = 可归因广告花费 / 去重入站询盘量；
- CPQL = 可归因广告花费 / 经业务员确认的有效线索量；
- 转化率 = Qualified/Lead，Quote/Qualified，Sample/Quote，Won/Qualified；
- 归因覆盖率、UNKNOWN、错配、多触点归因影响。

分母为 0 展示不可计算，币种不同时禁止汇总；AI 可说明「哪个国家/素材值得进一步测试」及证据，但不得自行启动/停止活动、修改预算或向 Meta 写回转化。真实 CAPI 回传需隐私/资质/审计/业务值独立批准。

### 4.3 多语言 AI 工业询盘

官方消息事件先验签、幂等并持久保存原始消息，AI 把对话作为不可信数据，而不是指令。分类为：FILM 花膜耗材；PROCESSING 加工；MACHINE 设备；PROCESS_CONSULT 工艺咨询；UNCLEAR 未知。

- 花膜：产品材质 PP/PE/ABS 等、印刷位置、花膜要求、数量、现有设备、耐磨/附着力/酒精/水温等测试场景。
- 加工：客户提供什么产品、规格、数量、图稿、加工区域、打样和验收标准、使用环境。
- 机器：产品形态与尺寸、产能/节拍、自动化级别、前后工序、设备/花膜/工艺整体方案。
- 其它与不确定情况必须转人工或要求审核，不能擅自承诺可印、附着力、测试、返工、价格、付款/交期、正式设备速度。

AI 每轮最多建议 1–3 个关键缺失问题。结构化字段必须记录 message_id、原文摘录/附件依据、置信度、版本，未知或低置信度保持 UNKNOWN；任何注入企图不得改写系统规则。AI 失败后原消息依然保留，业务员仍能处理。

### 4.4 客户评分与人工接管

在 V1 之外建议区分：
- completeness：资料完整度；
- fit：商业/行业/产品匹配候选；
- intent：采购紧迫度与行为信号；
- human_confirmed_qualified：业务员人工 TRUE/FALSE/UNKNOWN、原因、时间、身份。

这些新维度当前仅为产品方向与离线草案，不能擅自修改 V1 的 100 分 A/B/C/D 评分，也不等同 CPC 的 SS/S/A/B/C/D/N 客户等级。V1 的「询价立即转人工」仍然生效；未来“普通 Price? 能否先由 AI 补问基础资料”需要老板单独确认。高价值客户资料少也不能静默过滤掉。

正式商机交接卡应带：联系渠道/国家/语言、产品线、材质/数量/尺寸/图案、原始会话消息链接、证据出处、缺失项、建议业务动作、来源广告素材信息（确知时）、交接与负责人时间戳。人工 HUMAN_ACTIVE 后必须阻止任何自动发送，AI 只提供草稿与摘要。

### 4.5 销售和广告的闭环

平台 Post → Ad/Creative → Inbound → AI 标注建议 → Human-confirmed Qualified → CPC Customer/Project → Quote/Sample/Won/Lost → 人工确认的广告质量反馈。每个事件需要外部 ID、业务权威 ID、发生时间、入库时间、唯一键与审核信息；不能把 AI 高分回传为真实成交。Meta CAPI 的用户数据、同意、地区适用和可允许事件类型必须专项审核。

## 5. 买/整合/自建的策略

视频剪辑用 CapCut/Meta Edits/Descript 等既有编辑工具；发布与内容排期优先审查 Meta 官方 API、Buffer/Metricool/Later；多渠道 Inbox 可试评 Meta Business Agent、respond.io、SleekFlow、Manychat、WATI、Kommo、Chatwoot+n8n 等，但必须核实官方通道授权、API 消息导出、人工接管、角色权限、价格、数据驻留及与 GLH 的双写/重复回复风险。广告仍以 Ads Manager 与 Advantage+ 为执行权威，GLH 只自建工业商机质量层。第三方平台不得在同一会话与 GLH AI 同时自动回复。

## 6. 迭代路线与验收

| 次序 | V2 阶段 | 产物 | 证明/门禁 |
| --- | --- | --- | --- |
| 0 | A 业务合同及证据模型 | V2 规格、任务白名单、纯离线证据类型/测试 | 无真实模型/数据库/渠道变更 |
| 1 | B AI 对话理解 | 多语言、三种业务、真实模型候选接口及离线评测 | 有证据、错分/漏筛、安全回退 |
| 2 | C 商机质量反馈 | 人工确认及三维候选指标，不改 V1 Grade | 重要商机无静默淘汰，业务员能纠正 |
| 3 | D 广告只读分析 | 国家/广告/素材 spend 与有效率 | 对账 Meta、按币种与时间窗解释 |
| 4 | E 内容发布桥 | 内容中台关联、发布草稿/dry-run | 工艺审核、权限、状态与重试 |
| 5 | F 多渠道消息模拟 | Messenger/IG/WA 多消息协议与收件箱 | 验签、幂等、HUMAN_ACTIVE 关闭发送、DEV RLS |
| 6 | G CPC 商机反馈 | 客户项目 ID 链接与只读转化链 | 不双写权威、只回真实确认事件 |
| 7 | H 非生产试点 | 合法测试资产/合成消息、多角色浏览器 E2E | 业务成本、漏筛误判、权限、故障/回滚 |
| 8 | I 各生产开关独立审批 | 发布、真实通道、AI 自动发送、预算、CAPI 专项 Runbook | 每项必须取得单独授权 |

阶段 B/C 为 P0，D/G 为 P1，E 为 P2。A 可以在当前 P4 审核期间以独立非 Agent-Control planning 分支准备，但不能覆盖活动任务。阶段并非一次性交给单个 Codex。

## 7. 上线质量定义

必须证明：原始事件无丢失；webhook replay 无重复消息与商机；跨组织/销售 RLS 无越权；工艺及报价等禁止承诺有效；模型文本不能越权调用工具；证据缺失不能冒充事实；人工接管后自动发消息被阻止；人工纠错可审计；广告货币、时间、归因正确；AI 不可用时人工工作台依然可用。

基线由项目负责人测量近 2–4 周的数据；未取得真实标注样本时不能宣称 AI 准确率、可减少人头、投流 ROI。验收标准在 DEV 非生产 Pilot 后量化冻结。

## 8. 明确安全和决策 Gate

- KEEP GLH_PROVIDER_CALLS_ENABLED=false；不启真实 Meta/WhatsApp；不自动发真实客户消息、不改广告预算；
- KEEP Phase4 PR #171 current machine-state/active_pr/verified_head；不可并发派第二个 GLH Agent-Control 任务；
- KEEP 无 Production SQL/RLS/storage/env/secret/正式部署变更，不默认授权 PR merge；
- 老板待确认：一般询价先补问的权限；拟合/意向指标如何影响 Grade；每项真实发布/渠道开关/预算写入/CAPI；
- 共享 .github、基础设施、CPC 权威与内容中台代码必须通过各自项目负责人及共享锁；
- 本文件是 V2 增量规格，不替换 V1 冻结规则。实现任务详见 19_GLH_V2_CODING_BACKLOG.md。
