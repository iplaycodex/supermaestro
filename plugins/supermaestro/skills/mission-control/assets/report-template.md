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

## Superpowers 调用证据

> SuperMaestro 脚本会把这里作为硬闸门证据源之一。只写计划不算调用；必须先实际读取/调用对应 `superpowers:*` skill，再记录证据。

| Skill | 触发场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| `superpowers:writing-plans` | Gate 2 任务计划 | pending / 已读取并吸收 |  |
| `superpowers:test-driven-development` | 编码任务或行为变更 | pending / 已读取并吸收 / not-applicable |  |
| `superpowers:subagent-driven-development` | Gate 2 启用真实子 agent | pending / 已读取并执行 / not-needed |  |
| `superpowers:executing-plans` | 未启用子 agent 的串行执行 | pending / 已读取并执行 / not-needed |  |
| `superpowers:systematic-debugging` | bug、测试失败、构建失败、联调异常或行为 review finding | pending / 已读取并执行 / not-needed |  |
| `superpowers:requesting-code-review` | Review Agent Checkpoint | pending / 已读取并执行 / not-needed |  |
| `superpowers:receiving-code-review` | changes-requested 处理 | pending / 已读取并执行 / not-needed |  |
| `superpowers:verification-before-completion` | Gate 3/Gate 4/完成声明前 | pending / 已读取并执行 |  |
| `superpowers:finishing-a-development-branch` | Gate 4 final action | pending / 已读取并执行 / not-needed |  |

## 完成前验证

| 声明/动作 | 证明命令 | 执行时间 | Exit code | 输出摘要 | 结论 |
| --- | --- | --- | --- | --- | --- |
| Gate 3 ready / Gate 4 ready / merge / commit / push / cleanup |  |  |  |  | pending |

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

- 接口规格：specs/api-spec.md
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
- Gate 3 Review：
- Gate 4 最终动作：
- Gate 4 环境：normal repo / linked worktree / detached HEAD
- Gate 4 选择：merge local / push PR / keep / discard / cleanup
- 进度同步：
- 已提交/未提交状态：
- 是否已 merge：
- 是否已 push：
- Worktree 状态：
- `documents/` 工作台状态：
- source/workbench 分层：
- 发布前动作：

## 下一步

-
