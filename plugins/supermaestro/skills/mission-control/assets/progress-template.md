# 进度同步

## 当前状态

- 需求：
- 阶段/Gate：以 state.json 为准
- 当前任务：
- 最近更新：
- 下一步：

## 任务状态

任务状态唯一维护在本表，不另建第二份任务状态 JSON。

| 任务 | 状态 | Owner | 执行位置 | 依赖 | Review Pack | Artifact | 验证/备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | planned | 主控 | 主工作区 | 无 | RP1 |  |  |

状态使用 planned、running、ready-for-human-review、human-approved、blocked；启用 agent 时可使用 ready-for-agent-review、changes-requested、agent-approved。

## 阻塞与决策

| 项 | 状态 | 影响与原因 | 处理人/后续动作 |
| --- | --- | --- | --- |
|  |  |  |  |

## 进度日志

| 时间 | 事件 | 证据/影响 | 下一步 |
| --- | --- | --- | --- |
|  |  |  |  |

验证结果记录在 reports/validation.md；启用可选模块时链接 worktrees/plan.md、agents/agent-index.md、reviews/code-review/ 中实际存在的记录。主控负责汇总 handoff，不重复手写 registry 或 Gate 状态。
