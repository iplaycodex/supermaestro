# Agent Handoff：<TASK-ID>

## 状态

- 任务状态：ready-for-agent-review / blocked / changes-requested
- Owner：
- Worktree：
- Branch：
- Base commit：
- Foundation checkpoint commit：none / <commit>
- Latest diff / patch / PR：
- 自动提交 feature：no
- Worktree 可运行性准备：
- 如需 checkpoint commit 的用户授权：
- 执行方式：SDD worker / 主控串行 / executing-plans fallback
- TDD 适用性：required / not-applicable / deferred

## 完成内容

- 

## 改动文件

- 

## 验证

### TDD 证据

| 行为/契约 | RED 命令 | RED 结果/失败原因 | GREEN 命令 | GREEN 结果 | 备注 |
| --- | --- | --- | --- | --- | --- |
|  |  | pending |  | pending |  |

跳过或延后原因：

-

### 验证命令

| 命令 | 结果 | 备注 |
| --- | --- | --- |
|  | pending |  |

## 未执行检查

| 检查 | 原因 | 风险 | 后续动作 |
| --- | --- | --- | --- |
|  |  |  |  |

## 公共契约

- 是否触碰公共契约：否
- 如是，CCR：

## 需要主控决策

- 

## Fan-in 提醒

- 本文件只代表当前 worktree/agent 的交接结果。
- 主控需读取本 handoff、diff 和验证记录后，回写主工作台的 `plans/progress.md`、`agents/agent-index.md`、`worktrees/plan.md`、`reviews/review-packs.md` 和 `reports/validation.md`。
