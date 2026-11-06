# GLH V2-F｜多渠道统一事件与防重放（2026-11-06，非生产）

## 已实现的安全切片
本分支基于真实 master SHA `fb3eafed0517bbe0d90071ef83f0261232c4c944`，只修改 GLH 所属代码和 CI 现有 GLH 测试入口。

- `v2-multichannel-sim.ts`：以已核验的服务端 channel account / organization / inquiry 作为唯一信任边界，将合成 WhatsApp、Facebook Messenger、Instagram DM 入站消息归一化为可审计的只读事件。
- 幂等身份为 `provider + verified channel account + external event ID`；相同 payload 重放返回 `REPLAYED`，不同 payload 复用事件 ID 拒绝；不同事件 ID 复用相同原消息 ID 也拒绝。
- 保留原文、语言与 canonical 媒体 ID，不把文案中的报价/产能/交期承诺变成业务真相；`customerFacingAutoSendAllowed=false`，不论模式是 AI_ACTIVE、HANDOFF_PENDING、HUMAN_ACTIVE 或 PAUSED。
- 明确拒绝伪造组织、询盘、渠道账户、方向、坏日期、重复媒体、假媒体 URL 和损坏历史。
- 新测试由已有 `global-lead-hub-v2-llm-extraction-eval.test.ts` 纳入 CI，不修改共享工作流。

## 尚未完成／明确禁止
本模块 **不是** 三平台真实 webhook/Meta 连接器、不是 DB/RLS 写入、不是客户消息自动回复，也不会替换旧 V1 的归属、A/B/C/D 评级或 CPC 主数据。任何接通真实渠道、AI 实际发送、营销预算/广告账号操作、生产 SQL/RLS/Storage/密钥更改仍受独立授权门槛。

## 下一条 GLH 任务
正式签名 webhook → 统一 event ledger (provider+account+id 唯一约束) → 收消息原文先持久化 → 组织与 Sales RLS → Handoff Pending/Human Active 自动回复禁用 → 三身份非生产 E2E。必须用真实数据库事务与独立渠道 sandbox 验证；合成单测无法证明真实数据完整性。

附带核对：历史 GLH PR #171、#174、#190 均已经合并；Issue #72 早期 `FIX_REQUIRED` 状态文字未随最新合并事实完全刷新，不应误用旧 PR 作为下一任务。
