# Agent Brief：<TASK-ID>

## 必读

- 任务卡：workbench/tasks/<TASK-ID>.md
- 共享上下文：workbench/context.md
- 主控进度：workbench/plans/progress.md（只读；不得修改）
- 规格：

## 执行环境

- Worktree：
- Branch：
- Base commit：
- Foundation checkpoint commit：none / <commit>
- 自动提交 feature：no
- Foundation human-approved 后 checkpoint commit 授权：
- Worktree 可运行性准备：每个 worktree install / 完整项目拷贝 / 仅静态验证

## 边界

允许修改：

- 

禁止修改：

- 

## 输出

- Handoff：workbench/agents/<TASK-ID>/handoff.md
- Review artifact：
- 验证证据：
- 不要修改主控工作台的 `plans/progress.md`、`agents/agent-index.md`、`worktrees/plan.md`、`reviews/review-packs.md` 或 `reports/validation.md`；这些由主控根据 handoff fan-in。

## 阻塞处理

遇到公共契约变化、权限问题、物料缺失或跨任务冲突时，停止扩大改动，写 handoff 并通知主控。
