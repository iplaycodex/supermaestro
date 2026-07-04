# 页面契约矩阵

## 摘要

- 需求：
- 规格来源：PRD / API / UI / mock
- 更新时间：
- 当前状态：pending

## 覆盖矩阵

| 页面/模块 | PRD source_ref | UI 画板 | Schema | 图片基线 | API 契约 | Mock 场景 | Review Pack | 状态 | 阻塞项 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  | schema-only / image | API- |  | RP- | pending |  |

## 公共契约

| 契约 | 类型 | 被哪些页面/模块使用 | 来源 | Owner 任务 | 状态 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
|  | API / mock / route / component / model / utility |  | specs/api-spec.md / specs/ui-schema-extract.md | F1 | pending |  |

## 缺口与冲突

| 类型 | 描述 | 影响页面/模块 | 当前处理 | 是否阻塞 Gate 1 |
| --- | --- | --- | --- | --- |
| missing-api / missing-ui / field-mismatch / page-api-unmapped / ui-api-unmapped / out-of-scope |  |  |  | yes / no |

## 使用规则

- 每个将进入实现的页面/模块必须能追溯到 PRD、UI 和 API/mock；没有 UI 的纯接口任务要说明为什么是非 UI。
- 公共接口、公共 mock、公共模型、路由和共享组件必须标在“公共契约”里，避免后续 feature diff 隐含修改 foundation。
- 如果某个接口是后台、运营、调试或非本需求范围，归为 `out-of-scope`，不要塞进实现任务。
- 若 API 只知道入口地址但未解析到接口清单，Gate 1 应标为 blocked 或 partial，并说明继续规划的风险。
