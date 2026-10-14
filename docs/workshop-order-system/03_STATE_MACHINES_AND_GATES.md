# 状态机与 Gate V1

## 1. 生产任务状态机

```text
DRAFT
  ↓ submit
SUBMITTED
  ↓ office completeness pass
WORKSHOP_REVIEW
  ├─ needs info → NEEDS_INFORMATION → SUBMITTED
  ├─ material missing → WAITING_MATERIAL
  └─ accepted → READINESS_CHECK

WAITING_MATERIAL
  ↓ required resources available
READINESS_CHECK
  ├─ version/image mismatch → BLOCKED
  ├─ unresolved technical risk → BLOCKED
  └─ all readiness gates pass → READY_TO_SCHEDULE

READY_TO_SCHEDULE
  ↓ workshop schedules
SCHEDULED
  ↓ pre-start checks pass
READY_TO_START
  ↓ supervisor releases
IN_PRODUCTION
  ├─ pause → PAUSED
  ├─ major exception → BLOCKED
  └─ production complete → PRODUCTION_COMPLETED

PRODUCTION_COMPLETED
  ↓ packaging/shipping handoff
READY_FOR_SHIPMENT
  ↓ final close
CLOSED
```

### 生产异常状态

- NEEDS_INFORMATION：办公室资料不完整
- WAITING_MATERIAL：花膜/夹具/来料/签样未齐
- BLOCKED：版本、技术、品质或安全问题未解决
- PAUSED：生产已开始但被主动暂停
- CANCELLED：经授权取消

## 2. 打烊任务状态机

```text
DRAFT
  ↓ submit
SUBMITTED
  ↓ completeness pass
TECHNICIAN_REVIEW
  ├─ needs info → NEEDS_INFORMATION → SUBMITTED
  ├─ resources missing → WAITING_RESOURCE
  └─ accepted → READY_FOR_SAMPLING

READY_FOR_SAMPLING
  ↓ technician starts
SAMPLING_IN_PROGRESS
  ↓ technical record completed
RESULT_REVIEW
  ├─ PASS
  ├─ FAIL
  └─ CANNOT_SAMPLE

PASS / FAIL / CANNOT_SAMPLE
  ↓ result photos + signatures complete
PROJECT_CONFIRMATION
  ↓ project owner confirms
CLOSED
```

### 打烊结果与状态分离

任务流程状态和技术结论必须分开保存：

- workflow_status：任务走到哪里
- result_decision：PASS / FAIL / CANNOT_SAMPLE

这样即使结果为 FAIL，任务仍可经过项目负责人确认后正常关闭。

## 3. 资源齐套模型

每个资源单独记录状态，不使用单一“已齐/未齐”：

### 花膜

- NOT_REQUIRED
- NOT_ARRIVED
- PARTIALLY_ARRIVED
- ARRIVED
- VERSION_VERIFIED

### 夹具

- NOT_REQUIRED
- NOT_AVAILABLE
- IN_PRODUCTION
- ARRIVED
- FIT_VERIFIED

### 来料/胶件

- NOT_ARRIVED
- PARTIALLY_ARRIVED
- ARRIVED
- QUANTITY_VERIFIED

### 签样/确认样

- NOT_REQUIRED
- MISSING
- UPLOADED
- PHYSICAL_SAMPLE_RECEIVED
- VERIFIED

## 4. 图片与版本 Gate

### 当前生产基准

每个任务有且只有一个 active baseline set：

- order_version
- film_pattern_image_ids
- product_image_ids
- customer_approved_sample_image_ids
- signed_sample_image_ids
- confirmed_by_profile_id
- confirmed_at

### 阻塞条件

以下任一情况自动阻塞：

- 当前订单版本与图片版本不一致
- 花膜图案图片未设置当前基准
- 产品实物图缺失
- 需要客户确认样但未上传/未收到
- 旧版本图片仍被标为当前基准
- 车间尚未完成视觉核对

## 5. 开工 Gate

`canStartProduction = true` 只在以下全部成立时返回：

- workflow_status = READY_TO_START
- film readiness = VERSION_VERIFIED 或 NOT_REQUIRED
- fixture readiness = FIT_VERIFIED 或 NOT_REQUIRED
- incoming material readiness = QUANTITY_VERIFIED
- signed sample readiness = VERIFIED 或 NOT_REQUIRED
- active image baseline exists
- image baseline version = order version
- workshop visual verification complete
- technician confirmation complete
- supervisor confirmation complete
- no unresolved blocker

## 6. 打烊开始 Gate

`canStartSampling = true` 只在以下全部成立时返回：

- workflow_status = READY_FOR_SAMPLING
- product reference image exists
- current version set
- product/coming samples available
- fixture ready or explicitly not required
- film ready when applicable
- technician accepted task
- no unresolved blocker

## 7. Gate 失败反馈

所有 Gate 必须返回结构化结果：

```ts
{
  allowed: false,
  blockingCodes: ['FILM_VERSION_UNVERIFIED', 'SIGNED_SAMPLE_MISSING'],
  blockingMessages: ['花膜版本未核对', '缺少大货签样'],
}
```

禁止只返回 `false`，否则办公室和车间无法知道下一步要补什么。

## 8. 状态变更审计

每次变更记录：

- entity type / entity id
- previous status
- next status
- actor profile id
- actor role
- timestamp
- reason code
- note
- related attachment/image/version

已经关闭或已开工记录不得静默回退；必须走显式更正/重开流程。
