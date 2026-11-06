# WOS Phase 6B — 私有图片版本与权限离线契约

任务：`WOS-P6B-PRIVATE-IMAGE-VERSION-GATE-001`

## 1. 交付边界

本切片新增一个纯 TypeScript 离线契约和确定性负向测试，用于审查未来私有图片上传
所需的身份绑定、对象键、图片状态、版本替代和视觉基准门禁。该实现没有连接
Auth、数据库、Supabase Storage 或任何网络服务，也没有执行上传、创建 bucket、
颁发签名 URL、写入数据库或修改 Production。

P6A 的 PR #208 已并入当前基线。此前人工 Draft PR #207 不能作为本任务的可信来源，
也不能被描述成 Codex Writer 产物或已经验证的 Storage 事实。

即使调用方构造一份完全自洽的 JSON，声明 `wos-private` bucket、合法对象键、签名 URL、
`persisted=true` 或 `storageAuthorizationVerified=true`，纯 TypeScript 也无法证明
这些声明来自受信服务器。新契约每一条成功路径固定返回：

```text
status = UNVERIFIED_PENDING_SERVER_STORAGE
persisted = false
uploadOccurred = false
storagePolicyVerified = false
storageAuthorizationVerified = false
signedUrlIssued = false
publicUrlIssued = false
serverVerification = REQUIRED
```

这只表示离线输入没有发现内部矛盾，等待未来受认证服务器 RPC/Storage 集成核验；它
不是上传成功、不是持久化证明、不是 Storage policy 已存在、不是签名 URL 已颁发，
也不是允许开工。

## 2. 受信绑定与调用方声明

`trustedBinding` 表示未来由服务器从已验证 Auth、profile 和源记录派生的绑定：

- `organizationId`、`entityType`、`entityId` 和当前 `versionLabel`；
- 活跃 profile 的 `profiles.id`、所属组织和角色；
- profile 组织必须与源记录组织一致；
- 仅允许现有 WOS 的 `admin`、`manager`、`sales`、`workshop`、`technician` 角色。

候选图片中的组织、入口、实体、上传人和版本是调用方声明，必须逐项匹配受信绑定。
客户端声明不能替换服务器派生值。`PRODUCTION_ORDER` 与 `SAMPLING_REQUEST` 继续是
两个独立入口，基准、图片、source 或版本跨类型均失败关闭。

## 3. 私有对象键

规范对象键由受信组织、入口、实体、图片类别、当前版本、图片 ID 和安全文件名共同
生成：

```text
organizations/<organization_id>/wos/<entity>/<entity_id>/images/<category>/
  versions/<version_label>/<image_id>/<safe_file_name>
```

以下情况拒绝：

- bucket 不是 `wos-private`；
- 绝对路径、空段、`.` 或 `..`、反斜杠、query、fragment、URL 编码或分段穿越；
- storage path 与规范键不完全一致，包括任意路径替换；
- storage path 或图片字段包含公开 URL；
- 文件名与 MIME 不匹配、MIME 不在 JPEG/PNG/WebP 白名单、字节数为零或超过 20 MiB；
- `upsert` 或 `overwrite` 不是显式 `false`，包括真值、字符串、数字、`null` 等
  非布尔值及大小写或空白变体；`mode` 的 upsert/覆盖变体同样拒绝。

纯契约不会返回可复用公开链接或已颁发的签名 URL。`signedUrl` 只能被当作不可信输入
声明，不进入结果证明，结果始终为 `signedUrlIssued=false`。本切片不生成任何 URL。

## 4. 图片与版本的追加规则

图片 ID 是不可变身份。新图片只能追加，不能覆盖已有记录或对象键。重复图片 ID、重复
对象键、复用旧对象路径均失败关闭。离线契约没有受认证数据库或不可变服务端行可供核验，
因此调用方 `replay` 声明本身永远不能自证为服务端已保存事实，即使候选身份、对象键、
fingerprint 与重放声明完全自洽也不行；缺失服务端证据、或声明中夹带 `trusted`、
`trustedStoredFact`、`serverVerified` 等伪信任标志，都返回 `REPLAY_MISMATCH`。

可信重放必须走一条独立于客户端 JSON 的通道：调用方注入由未来受认证服务器上下文提供的
`replayVerifier` 校验函数，该函数返回服务端派生、不可变且带 canonical 键和已存 fingerprint
的图片事实。离线契约随后把该事实逐项绑定到当前受信组织、入口、实体、版本和 profile、
精确图片 ID、规范对象键、已存 fingerprint 与 `READY` 状态，任一字段不一致、外来组织或
版本、事实格式错误、校验函数缺失或抛错都返回 `REPLAY_MISMATCH`。缺少服务端派生事实时
不虚构其存在。

通过绑定后的可信重放只作为只读幂等观察：返回同一张既有图片投影，不追加、不覆盖、不替代，
也绝不把 `persisted`、`uploadOccurred`、`storageAuthorizationVerified` 或
`signedUrlIssued` 置为 true。该纯契约本身不证明服务器权威，也不执行或证明任何数据库写入；
`replayVerifier` 只是未来受认证服务器集成预留的注入点，不引入任何可由客户端 JSON 声明为
`serverVerified=true` 的宽松来源。

新图片必须是 `READY`。`UPLOADING`、`FAILED`、`QUARANTINED`、`SUPERSEDED` 或
`ARCHIVED` 都不能成为新的当前版本图片。

若新图片声明替代旧图片：

- 旧图片必须存在，属于相同组织、入口、实体和类别；
- 旧图片必须为 `READY`，且同版本不能被“替代”；
- 旧图片不能已经由另一新图片替代；
- 版本标签必须是规范的 `V<正整数>`，且旧版本严格小于候选版本；相等、倒退、格式错误
  或无法比较的版本返回 `SUPERSEDE_VERSION_MISMATCH`；
- 通过校验的离线建议会把旧图片投影为 `SUPERSEDED`，同时保留其记录并追加新图片。

这只是待服务器核验的追加建议，并不代表旧记录已经更新或新记录已经持久化。

## 5. 视觉基准、签样与开工门禁

当前 baseline 必须存在、状态为 `CURRENT`，且组织、入口、实体和版本与受信绑定完全
一致。当前基准引用的图片必须全部为 `READY`；引用 `SUPERSEDED` 图片时返回
`BASELINE_IMAGE_SUPERSEDED`。需要签样时，必须至少存在一张 `READY` 的
`SIGNED_SAMPLE` 图片。

baseline 替换直接复用领域函数 `replaceCurrentBaseline(...)` 的既有语义：

- 原 baseline 保留并变为 `SUPERSEDED`；
- 新 baseline 必须是不同记录并变为 `CURRENT`；
- 新 baseline 的车间视觉确认被清空为 `null`。

`evaluateWosPrivateImageGate(...)` 分别支持 `PREVIEW` 和 `START`。两者都在基准缺失、
非当前、版本错配或任一基准图片非 `READY` 时返回 `BLOCKED`。通过离线检查也只表示
`gateSatisfied=true` 且等待服务器核验，`serverReadinessVerified` 仍为 `false`。

现有生产单和打样申请的 readiness/start gates 没有被放宽。两个办公室 POST 入口的
既有 409/503、环境、登录、profile、角色、输入和原子 RPC 门禁保持原样。视觉图片
pending 不能绕过菲林、治具、来料、签样、技术/主管确认、技术员受理或其他阻断。

## 6. 负向测试证据

`tests/unit/workshop-order-p6-private-image-contract.test.ts` 已由现有
`tests/unit/workshop-order-suite.test.ts` 导入，覆盖：

- 生产单和打样申请两个独立入口；
- JSON 序列化后的完全自洽伪 bucket、签名 URL 和伪持久化声明仍全部为 false；
- 错误组织、入口、上传 profile、版本、停用 profile 和未授权角色；
- `UPLOADING`、`FAILED`、`QUARANTINED` 图片不能成为基准；
- 非 `CURRENT`、跨入口和旧版本的 baseline；
- 当前 baseline 引用 `SUPERSEDED` 图片；
- 路径穿越、公开 URL、任意 bucket、MIME/字节阈值，以及 upsert/overwrite 的真值、
  非布尔值、大小写/空白/mode 变体；
- 重复图片 ID、重复对象键、自洽客户端重放、fingerprint 不一致且没有受信存储事实；
- 缺失 `replayVerifier` 的合法重放声明、夹带 `trustedStoredFact`/`trusted` 伪信任标志的
  完全序列化伪造对、外来组织与外来版本的校验事实、以及 fingerprint 不一致的校验事实；
- 注入服务端不可变校验结果后的只读幂等可信重放：返回同一图片投影且不追加、不覆盖、
  不替代，所有持久化/上传/存储授权/签名 URL 证据仍为 false；
- 旧图片替代后的 `SUPERSEDED` 投影和新版本追加；
- 严格前进的 `V1 -> V2`，以及 `V3 -> V2`、`V2 -> V1`、相等、格式错误和无法比较版本；
- baseline 替换后车间确认清空；
- `PREVIEW` 与 `START` 均拒绝非 `READY` 基准图片；
- 规范对象键构造器拒绝危险组织和版本段。

测试中的 ID、对象键和签名 URL 均为合成值，不代表真实账号、对象或 Storage policy
已经存在。

## 7. 后续独立授权项

真实图片能力必须由新的 bounded task 分别实现和评审，不能扩大本 PR 的权限：

1. 在隔离的 reviewed DEV 环境实现受认证服务器 RPC，从 Auth 派生组织和 profile，
   原子追加不可变图片元数据和 supersession 事实。
2. 独立设计并应用 private Storage bucket、对象归属 policy、append-only 约束和短时
   签名访问，验证同组织、跨组织、过期链接、覆盖和并发冲突。
3. 执行真实 Auth/RLS/Storage 负向测试，禁止使用 service-role 伪造普通用户权限。
4. 在任何 pilot 前再次验证两个入口的 readiness/start gates 和 Production Human Gate。

本 PR 不新增 SQL/migration、Auth/RLS/Storage policy、上传 route、真实签名 URL、
Production 环境或 secret 变更，也不执行外部供应商/客户消息、自动合并或部署。
