# 验证报告

## 摘要

- 当前状态：
- 已完成范围：
- 阻塞项：
- 剩余风险：

## 验证记录

| 检查/命令 | 范围 | 结果 | 证据/备注 |
| --- | --- | --- | --- |
|  |  | pending |  |

## 完成前验证

| 声明/动作 | 证明命令 | 执行时间 | Exit code | 输出摘要 | 结论 |
| --- | --- | --- | --- | --- | --- |
| Review ready / Final ready / merge / commit / push / cleanup |  |  |  |  | pending |

## Worktree 与源码绑定

worker 局部验证只作 handoff；主 contract/evidence/Gate Review Pack 只绑定
fan-in 后的单一 integration target。

- Integration target：
- 主 `sourceRoot` / Git common dir：
- 主 `source-revision --target`：
- 主 `run-verification --target`：
- 验证与 Gate target：`verify` / `request-review` / `approve-review` /
  `request-final` 使用 integration target；`approve-final` 按动作契约填写
- Target identity / identity hash：
- Fan-in snapshot：

| Worker target | Branch / Base | Registry/Git | Clean | HEAD 是 integration HEAD 祖先 | Handoff 局部证据 | Review Pack |
| --- | --- | --- | --- | --- | --- | --- |
|  |  | pending | pending | pending |  |  |

## TDD 证据汇总

| RP/任务 | TDD 适用性 | RED 证据 | GREEN 证据 | 跳过/延后原因 | 结论 |
| --- | --- | --- | --- | --- | --- |
|  | required / not-applicable / deferred |  |  |  | pending |

TDD 风险：

-

## 调试证据汇总

| RP/任务 | 触发原因 | 根因 | 修复 | 复验证据 | 结论 |
| --- | --- | --- | --- | --- | --- |
|  | bug / test failure / build failure / review finding |  |  |  | pending |

## 未执行检查

| 检查 | 未执行原因 | 风险 | 后续动作 |
| --- | --- | --- | --- |
|  |  |  |  |

## API/Mock 验证

- API 发现：specs/api-spec.md
- API 可执行契约：specs/api-contract.md
- 接口契约：
- Mock 挂载：
- 调用方切换：
- 异常/空态：

## UI/视觉验证

| 任务/画板 | Sketch Data schema | Sketch Data 提取结果 | Schema 到实现映射 | expected | actual | diff | 设备/DPR/mock/滚动 | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  | 可选/schema-only |  |  |  | pending |

schema-only 验证：

- 图片基线缺失原因：
- 已核对的 Sketch Data 节点：
- 已核对的代码组件/选择器：
- 已接受偏差：

## 交接说明

- 改动范围：
- Review Pack：
- Review 结论：
- Final 最终动作：
- Final 环境：normal repo / linked worktree / detached HEAD
- Final 选择：merge local / push PR / keep / discard / cleanup
- 进度同步：
- 已提交/未提交状态：
- 是否已 merge：
- 是否已 push：
- Worktree 状态：
- Cleanup target：
- Cleanup 授权与检查：`approve-final --cleanup true --target "<path>"` /
  `check --action cleanup --target "<path>"`；same target；
  target/branch/HEAD/source fingerprint/clean match / rejected
- CLI 未执行 `git worktree remove`：yes
- `documents/` 工作台状态：
- source/workbench 分层：
- 发布前动作：

## 下一步

-
