# Worktree 计划

## 策略

- Base branch：
- Integration branch：
- Worktree root：../<repo>.worktrees/
- Foundation branch：

默认使用主仓库同级目录 `<repo>.worktrees/<task-id>`；不得默认使用 `/tmp`、`/private/tmp` 或系统临时目录。

## Worktree 列表

| 任务 | Worktree | Branch | Base | 状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  | planned |  |

## 同步规则

- 需求工作台是否入 git：
- 未入 git 时的物料同步方式：
- Worker worktree 内的 `workbench` 文件只作为本任务上下文和 handoff 承载，不是全局状态源。
- 主控必须从 worker handoff / review 输出 fan-in 回主工作台，更新本计划和 `plans/progress.md`。
- 禁止清理项：
- 编码完成默认状态：保留未提交改动供 review，不自动 commit。

## 合并顺序

1. Foundation
2. Feature tasks
3. Integration validation
