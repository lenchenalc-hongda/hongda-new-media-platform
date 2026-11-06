# WOS Phase 6A — 原子提交证据的可信边界

任务：`WOS-P6A-TRUSTED-SUBMISSION-EVIDENCE-001`

## 1. 本切片的安全结论

浏览器或任意调用方可以构造完全自洽的 JSON：声明
`source=TRUSTED_NONPRODUCTION_RPC`、生成看似真实的 receipt / Inbox / audit ID，
让 counts 与数组长度一致、重复 fingerprint 一致，并把
`transactionCommitted` 设为 `true`。纯 TypeScript 函数无法证明这些值来自数据库，
也不能证明大事务已经提交。

因此本切片的新证据函数只验证 **形状和内部一致性**。即使全部检查通过，结果也只能是：

```text
status = UNVERIFIED_PENDING_SERVER_VERIFICATION
persisted = false
databaseCommitVerified = false
productionChanged = false
serverVerification = REQUIRED
```

这不是成功提交，不是数据库 COMMIT 证明，也不是允许进入正式生产的状态。只有后续独立
授权、审查并实现的服务器端 RPC 集成才能产生可验证结果；该集成不在本 PR 中。

任务仅对本 PR 新生成的代码建立可信来源。此前人工 Draft PR #207 不属于本任务的来源，
不得被追溯描述为 bot / Codex Writer 的产物，也不得作为本任务已经验证的事实。

## 2. 失败关闭规则

`evaluateWosAtomicSubmissionEvidence(...)` 在任何结构或一致性错误时返回
`REJECTED / persisted=false`，并给出确定性 blocker：

- 提交事实、人员档案和所有 receipt / Inbox / audit 事实必须属于同一组织；
- 提交人员档案必须启用，且只允许 `admin`、`manager`、`sales`；
- `PRODUCTION_ORDER` 与 `SAMPLING_REQUEST` 是不同入口，任何跨类型事实都拒绝；
- 提交版本必须等于 `expectedVersion`，所有事实必须绑定相同 revision 和 version label；
- submission、receipt 和 replay 的 fingerprint 必须一致；
- 相同幂等键的重放内容发生变化时拒绝；
- counts 必须与事实数组长度一致；
- receipt、Inbox task、audit event ID 分别不得重复；
- 必须恰好有一条 receipt、一条 Inbox 事实和一条 audit 事实；
- 三类事实必须绑定相同 submission、source、版本和幂等键。

`transactionCommitted=true` 只是不可信输入声明。它既不提高状态，也不会被复制成
`persisted=true`；`false` 也同样不能证明“未提交”。`source` 字符串、UUID 形状、
counts 和 fingerprint 都只作为待服务器核验的声明处理。

## 3. 两个独立业务入口

生产单和打样申请继续使用独立 source、状态机、版本和 Inbox 投影事实。统一证据检查
只用于拒绝跨入口污染，不把两类业务合并为一张通用业务主表。合法的生产单或打样申请
JSON 都只能得到 pending，不会因为入口名称不同获得不同信任级别。

## 4. 既有写入门禁与齐套门禁

本切片不启用办公室 `POST`。两个独立 POST 入口仍要求非生产运行环境、已验证登录、
活跃同组织 profile、提交角色、输入大小、严格 envelope 和正式客户端字段隔离；可达后
仍返回 `ATOMIC_SUBMISSION_RPC_REQUIRED / 409`。配置关闭、数据库不可用等边界继续返回
`503`。本模块不调用 `.insert()`、`.upsert()` 或 `.rpc()`，也不引入 service role。

生产单和打样申请的既有 readiness / start gates 全部保留，包括视觉基准、版本对齐、
花膜、治具、来料、签样、技术/主管确认和打样技术员受理等阻断。原子提交证据 pending
不能绕过任何 readiness gate。

## 5. 确定性负向测试

`tests/unit/workshop-order-p6-atomic-submission.test.ts` 已导入现有
`workshop-order-suite.test.ts`，覆盖：

- 经 JSON 序列化再解析的完全自洽伪成功仍为 pending；
- 合法 `PRODUCTION_ORDER` 和 `SAMPLING_REQUEST` 均保持独立且不获持久化证明；
- 错误组织、停用 profile，以及 `workshop` / `technician` 角色拒绝；
- stale version、跨入口类型、伪 fingerprint、变化的重放内容；
- `transactionCommitted` 真/假两值均不能变为 persisted；
- 重复 receipt / Inbox / audit ID、伪造 counts 和缺失原子事实；
- submission 与 audit 事实的 source 不一致；
- 办公室 POST 的 409/503 门禁、无直接写调用；
- readiness 门禁仍在源码和既有聚合测试中。

测试中的 ID 均为合成值，不代表数据库中已经存在对应记录。

## 6. 后续独立授权项

以下工作必须使用新的 bounded task / allowlist，分别评审，不可由 Phase 6A 自动扩权：

1. 在隔离的 reviewed DEV 数据库设计并审查服务器端原子提交 RPC：服务端解析已验证
   Auth identity 和活跃 profile，拒绝客户端组织/负责人/状态字段，在同一事务中完成
   source 精确版本更新、幂等 receipt、唯一 Inbox 事实和不可变 audit 事件。
2. 在隔离 DEV 环境验证 RLS、跨组织拒绝、并发幂等、冲突回滚和重放，并证明两侧都
   不产生部分成功。
3. 对 `PRODUCTION_ORDER` 和 `SAMPLING_REQUEST` 分别执行两账户 Auth / RLS /
   concurrency 测试；不得以管理员或 service role 伪造普通用户权限。
4. 设计并验证 private Storage bucket、对象归属 policy、不可变版本历史和签名字段；
   不在本切片创建 bucket、执行上传或返回签名 URL。
5. 只有在上述 DEV 证据通过独立 PM review 后，才可提出受限 pilot；真实 POST 启用、
   Production SQL/RLS/env/secrets、真实数据迁移和外部 cutover 继续需要明确 Human
   Gate。

本 PR 不新增 SQL RPC、migration、POST 写入、Auth/RLS/Storage/env/secrets 修改，
也不执行 Production 操作。
