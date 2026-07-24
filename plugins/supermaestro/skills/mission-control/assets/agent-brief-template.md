# Agent Brief：<TASK-ID>

## 必读

- 任务卡：workbench/tasks/<TASK-ID>.md
- 共享上下文：workbench/context.md
- 主控进度：workbench/plans/progress.md（只读；不得修改）
- 规格：
- 执行纪律：编码任务按任务卡记录 TDD 决策；遇到失败先记录复现和根因再做最小修复；本 agent 只处理任务卡边界内工作。

## 执行环境

- Worktree target：
- Branch：
- Base：
- Owned registry：registered；主控核验时间：
- Dispatch check：`check --action dispatch-subagent --target "<path>"` 已通过
- Foundation checkpoint commit：none / <commit>
- 自动提交 feature：no
- Foundation human-approved 后 checkpoint commit 授权：
- Worktree 可运行性准备：每个 worktree install / 完整项目拷贝 / 仅静态验证
- 执行方式：worker agent / 主控串行
- TDD 适用性：required / not-applicable / deferred
- 调试纪律：bug / test failure / build failure / integration failure / review finding 时必须先根因调查

## 边界

允许修改：

- 

禁止修改：

- 

## 输出

- Handoff：workbench/agents/<TASK-ID>/handoff.md
- Review artifact：
- 局部验证证据：只写 handoff；不写主 validation contract/evidence
- TDD 证据：RED 命令与失败原因、GREEN 命令与通过结果；如跳过或延后，写明原因、风险和补测动作。
- 调试证据：复现步骤、错误信息、最近改动检查、根因假设、验证证据、最小修复和复验结果。
- 不要修改主控工作台的 `plans/progress.md`、`agents/agent-index.md`、`worktrees/plan.md`、`reviews/review-packs.md` 或 `reports/validation.md`；这些由主控根据 handoff fan-in。
- 不得自行登记、替换、收编或清理 worktree；target/branch/base 与 Git 不一致
  时立即停止并通知主控。

## TDD 纪律

- `TDD 适用性: required` 时，不得先写生产代码；先写失败测试，确认失败原因正确，再实现最小代码并确认通过。
- `TDD 适用性: not-applicable` 时，只能完成任务卡内非行为工作，并在 handoff 写明跳过原因。
- `TDD 适用性: deferred` 时，先写可补测计划和风险，不得把缺失测试包装成已验证。

## 阻塞处理

遇到公共契约变化、权限问题、物料缺失、跨任务冲突，或连续多次修复失败时，停止扩大改动，写 handoff 并通知主控。不得在未确认根因时继续叠加猜测性修改。
