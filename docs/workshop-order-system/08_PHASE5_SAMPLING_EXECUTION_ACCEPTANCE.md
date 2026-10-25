# Phase 5 打样执行离线领域验收

## 1. 范围

本切片实现纯 TypeScript、非生产打样执行契约：

- 技术尝试只追加，不覆盖历史。
- 参数版本、花膜版本、结果图片均绑定当前申请版本和精确 attempt ID。
- 判定保持 `PASS` / `FAIL` / `CANNOT_SAMPLE` 三态，并与工作流状态分离。
- 技术员和项目负责人必须分别确认最新技术尝试。
- 仅最新且审核通过、判定为 `PASS` 的技术尝试可派生生产单 `DRAFT`。
- 生产单草稿始终重新执行现有开工 Gate，不释放签样、版本或开工权限。

实现仅含离线领域函数，不连接真实数据库、RLS、Storage、API、机台或外部消息。

## 2. 领域契约

### 2.1 追加技术尝试

`appendSamplingAttempt(history, attempt, request)` 返回新历史；失败时返回原历史、
`appended: false` 和结构化阻断代码。历史记录、参数与结果图片均冻结。

以下情况失败关闭：

- attempt ID 重复、顺序跳跃或组织/申请身份不一致。
- 当前申请版本、参数版本或花膜版本缺失或不一致。
- 任一必填技术参数缺失或无效。
- 非 `PASS` 结果缺少失败/无法打样原因。
- 无已就绪结果图，或结果图未绑定本次 attempt。
- 结果图版本不一致、未就绪、失败、隔离、被替代或归档。

### 2.2 结果审阅

`evaluateSamplingResultReview(...)` 只接受历史中最新 attempt，旧 `PASS` 不能越过
后续 `FAIL` / `CANNOT_SAMPLE` 被复用。它要求：

- 当前申请版本仍与该 attempt 的参数、花膜和结果图片一致。
- 执行技术员本人确认。
- 打样申请项目负责人本人确认。
- 同一角色不存在重复或冲突确认。

通过后工作流才到 `CLOSED`；技术确认后、项目确认前保持
`PROJECT_CONFIRMATION`。`FAIL` 和 `CANNOT_SAMPLE` 也可正常确认关闭，但不会派生
生产单草稿。

### 2.3 生产单草稿

`deriveSamplingProductionDraft(...)` 仅在最新 PASS 结果审核通过时返回草稿：

- 草稿状态固定为 `DRAFT`，`canStartProduction` 固定为 `false`。
- 派生时再次核对审核结论、双方确认标志、空阻断列表及 attempt/图片绑定，不能只依赖
  被调用方拼出的 `allowed` 布尔值。
- 复制申请身份快照、当前版本、当前认可参数和本次 attempt 的结果图片。
- 始终调用现有生产开工 Gate；缺失、过期或未确认的生产资源继续形成阻断码。
- 签样要求不因打样 PASS 或调用方传入的 `signedSampleRequired: false` 被豁免。

因此打样通过只生成可继续补充资料的生产草稿，不会直接进入排期、签样、开工或
Production。

## 3. 测试覆盖

`tests/unit/workshop-order-sampling-execution.test.ts` 是确定性契约测试，覆盖：

- 连续 repeat attempts 形成 1、2、3 次追加历史。
- 追加不会修改旧历史或调用方输入，重复 attempt ID 不可覆盖。
- 旧结果、当前订单版本推进、参数版本、结果图版本和图片状态失效。
- 图片或参数绑定到错误 attempt ID。
- 缺少当前版本、参数版本、技术参数、结果图、失败原因、技术确认或项目确认。
- `PASS` 才可派生草稿，`FAIL` 即使可关闭也不能派生。
- 后续 FAIL 不能被旧 PASS 或旧确认绕过，未完成项目确认的审核不能派生草稿。
- 草稿开工 Gate 保留签样、视觉基准版本和 `DRAFT` 状态阻断。
- 相同输入重复计算得到相同结果，领域源码不含持久化、网络或时钟副作用。

## 4. 非目标与 Human Gate

本切片未实现 SQL migration、RLS、Storage bucket 或策略、API 写入、通知、真实图片
上传、真实机器执行、Production 数据或环境变更，也未修改既有业务策略。

后续接线仍须在独立受限任务中完成；Production SQL/RLS/Storage/env/secrets、签样
规则放宽、安全边界调整和真实外部上线继续需要 Human Gate。

## 5. 本地验证记录

- 新增 sampling execution 契约测试：`PASS`。执行环境禁止 `tsx` 创建本地 IPC
  pipe，因此使用仓库内 esbuild 生成 `/private/tmp` 临时 bundle 后由 Node 执行；
  未修改测试语义或仓库文件。
- 既有 Workshop Order System contract suite：`PASS`。
- `tsc --noEmit`：`PASS`。
- `next build`：`PASS`，构建产物列出既有 Workshop Order System 路由。
- bundle secret audit：`PASS`，未发现静态 bundle 密钥泄漏。
- 本地 `next start` smoke：执行环境以 `EPERM` 禁止监听 `0.0.0.0:3000`，因此本
  环境无法完成 HTTP smoke；未降低检查标准，交由 wrapper 在具备本地监听权限的
  执行环境重跑。
