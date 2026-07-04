# Agent Brief：<TASK-ID>

## 必读

- 任务卡：workbench/tasks/<TASK-ID>.md
- 共享上下文：workbench/context.md
- 主控进度：workbench/plans/progress.md（只读；不得修改）
- 规格：
- 执行技能：编码任务按任务卡使用 `superpowers:test-driven-development`；本 agent 只处理任务卡边界内工作。

## 执行环境

- Worktree：
- Branch：
- Base commit：
- Foundation checkpoint commit：none / <commit>
- 自动提交 feature：no
- Foundation human-approved 后 checkpoint commit 授权：
- Worktree 可运行性准备：每个 worktree install / 完整项目拷贝 / 仅静态验证
- 执行方式：SDD worker / 主控串行 / executing-plans fallback
- TDD 适用性：required / not-applicable / deferred

## 边界

允许修改：

- 

禁止修改：

- 

## 输出

- Handoff：workbench/agents/<TASK-ID>/handoff.md
- Review artifact：
- 验证证据：
- TDD 证据：RED 命令与失败原因、GREEN 命令与通过结果；如跳过或延后，写明原因、风险和补测动作。
- 不要修改主控工作台的 `plans/progress.md`、`agents/agent-index.md`、`worktrees/plan.md`、`reviews/review-packs.md` 或 `reports/validation.md`；这些由主控根据 handoff fan-in。

## TDD 纪律

- `TDD 适用性: required` 时，不得先写生产代码；先写失败测试，确认失败原因正确，再实现最小代码并确认通过。
- `TDD 适用性: not-applicable` 时，只能完成任务卡内非行为工作，并在 handoff 写明跳过原因。
- `TDD 适用性: deferred` 时，先写可补测计划和风险，不得把缺失测试包装成已验证。

## 阻塞处理

遇到公共契约变化、权限问题、物料缺失或跨任务冲突时，停止扩大改动，写 handoff 并通知主控。
