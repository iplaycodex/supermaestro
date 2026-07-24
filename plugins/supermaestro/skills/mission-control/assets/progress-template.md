# 进度同步

## 当前状态

- 需求：
- 阶段：Scope pending
- Scope 需求对齐：pending
- Plan 计划确认：not-requested
- Foundation Checkpoint：not-needed / pending / approved / changes-requested
- Review：not-requested
- Final：not-requested
- 当前任务：
- 最近更新：
- 下一步：

## 任务状态

任务状态唯一维护在本表；不要再创建或手写第二份任务状态 JSON/索引。

| 任务 | 状态 | Owner | 执行位置 | 依赖/Base | Review Pack | Artifact | 验证 | Debug | Review Agent | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  | planned |  |  |  |  |  |  | not-needed / investigating / resolved | pending / not-needed |  |

状态建议：`planned`、`running`、`ready-for-agent-review`、`changes-requested`、`agent-approved`、`ready-for-human-review`、`human-approved`、`blocked`。

## Worktree 登记投影

本表仅便于人工审查，所有权以 `state.json` 的 owned registry 为准。

| 任务 | Target | Branch | Base | Registry | 当前 Git 核验 | 最近检查 |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  | unregistered / owned / drifted / missing | pending |  |

## Checkpoints

| Checkpoint | 状态 | 公共依赖 | 阻塞任务 | Review Pack | Checkpoint commit | 最近结论 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  | not-needed / pending / approved / changes-requested |  |  |  | none / <commit> |  |  |

## Review Agent

仅启用只读 review agent 时填写；review agent 不修改代码，只输出 findings。

| RP | Review agent | 状态 | Findings | 输出 | 下一步 |
| --- | --- | --- | --- | --- | --- |
|  |  | not-needed / pending / changes-requested / agent-approved |  | reviews/code-review/<RP>.md |  |

## Review Feedback 处理

| RP | Finding | 核实结论 | 处理方式 | 复验证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
|  |  | valid / invalid / out-of-scope / needs-user-decision | fixed / pushed-back / deferred |  | pending |

## 进度日志

| 时间 | 事件 | 影响 | 下一步 |
| --- | --- | --- | --- |
|  |  |  |  |

## 阻塞与决策

| 项 | 状态 | 说明 | 处理人 |
| --- | --- | --- | --- |
|  | pending |  |  |

## 验证进度

区分静态检查、行为验证、构建验证和人工 UI 对比；不要用 parser/formatter 代替行为验证。
worker target 结果标为 handoff；主 Gate 结果只记录单一 integration target。

| 验证项 | Target / Git root | Target identity / hash | Fan-in snapshot | 层级 | 类型 | 状态 | 证据/备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  | worker handoff / integration Gate | static / behavior / build / ui-review | pending |  |

## Final 收尾状态

| 项 | 状态 | 证据/备注 |
| --- | --- | --- |
| 环境判断 | normal repo / linked worktree / detached HEAD |  |
| 最新验证 | pending / passed / failed |  |
| 最终动作 | merge / PR / keep / discard / cleanup |  |
| 清理目标 | pending / not-needed / safe / blocked | 精确 `--target`；target/branch/HEAD/source fingerprint/clean 是否与授权快照匹配 |
