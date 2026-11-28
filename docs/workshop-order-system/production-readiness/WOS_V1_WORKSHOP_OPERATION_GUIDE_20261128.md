# WOS V1 车间操作指引

适用页面：`https://www.hongdaprinting.tech`

## 接单与资料退回

1. 登录后进入“车间订单” → “车间收件箱”。
2. 展开当前订单，核对产品、数量、交期和当前版本四图。
3. 资料不完整时选择“退回资料”，填写具体原因。
4. 资料确认后选择“复核当前修订”并提交。

## 物料登记与签认

1. 订单进入 `WAITING_MATERIAL` 后，登记 `FILM`、`FIXTURE`、`INCOMING_MATERIAL`、`SIGNED_SAMPLE`。
2. 未到料时如实选择缺口状态，不能提前确认齐套。
3. 办公室完成 Baseline 和 Office 签认后，打开同一订单、同一版本。
4. 核对四类图片、对象和 Proof，再完成“车间独立签认同一 Baseline”。
5. 到料时间、应到数量和实到数量按实际填写。

## 最终齐套

1. 四类物料、数量、图片 Baseline 和双方签认均完成后，点击“原子确认四类物料并进入 READINESS_CHECK”。
2. 页面显示 `READINESS_CHECK` 后等待独立 Manager 放行。
3. 不要执行实际开工；`READY_TO_START` 也不等于自动开机。

## 常见异常

- 花膜未到：登记 `NOT_ARRIVED` 或 `PARTIALLY_ARRIVED`，不要确认齐套。
- 夹具未完成：登记 `IN_PRODUCTION` 或对应真实状态。
- 来料数量不足：实到数量填写真实值，保留缺口。
- 样品不一致：退回资料并写明图片或实物差异。
- Proof 过期：由有权限的 Office/Manager 重新核验当前四图。
- 重复点击：以数据库回执和最新状态为准，不重复制造回执。
- 手机操作：使用 360px 及以上屏幕，横向溢出时先刷新再截图报障。
