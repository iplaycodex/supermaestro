# Worktree 计划

## 策略

- Base branch：
- Integration branch：
- Worktree root：../<repo>.worktrees/
- Foundation branch：
- 当前环境：normal repo / linked worktree / detached HEAD
- Worktree owner：SuperMaestro / harness / external / unknown

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

## Gate 3 收尾计划

| 动作 | 适用条件 | 验证要求 | 清理策略 | 用户确认 |
| --- | --- | --- | --- | --- |
| merge local | Gate 2 approved，目标分支明确 | merge 前后都要验证 | merge 成功后才清理本流程创建的 worktree | required |
| push PR | 需要远端 review | push/PR 前验证 | 保留 worktree 和分支 | required |
| keep | 用户暂不收尾 | 记录当前状态 | 不清理 | required |
| discard | 用户放弃本轮工作 | 列出 branch/worktree/commit 范围 | 明确确认后再删除 | exact confirmation |
| cleanup | 已完成合并或明确授权 | `check --action cleanup-worktree` | 只清理本流程创建且记录在案的 worktree | required |
