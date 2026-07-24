# Agent Handoff：<TASK-ID>

## 状态

- 任务状态：ready-for-agent-review / blocked / changes-requested
- Owner：
- Worktree target：
- Branch：
- Base：
- Owned registry：registered / drifted / missing
- 交接时 Git 核验：target / branch / base match / mismatch
- Foundation checkpoint commit：none / <commit>
- Latest diff / patch / PR：
- 自动提交 feature：no
- Worktree 可运行性准备：
- 如需 checkpoint commit 的用户授权：
- 执行方式：worker agent / 主控串行
- TDD 适用性：required / not-applicable / deferred
- 调试状态：not-needed / investigated / blocked

## 完成内容

- 

## 改动文件

- 

## 验证

本节是 worker target 的局部验证，只用于 handoff。主控 fan-in 后必须在单一
integration target 重跑主 validation contract，不得把本节直接记成 Gate
evidence。

### TDD 证据

| 行为/契约 | RED 命令 | RED 结果/失败原因 | GREEN 命令 | GREEN 结果 | 备注 |
| --- | --- | --- | --- | --- | --- |
|  |  | pending |  | pending |  |

跳过或延后原因：

-

### 调试证据

适用于 bug、测试失败、构建失败、联调异常或 review finding 修复；无则写 `不适用`。

| 项 | 内容 |
| --- | --- |
| 复现方式/失败命令 |  |
| 错误信息/症状 |  |
| 最近改动检查 |  |
| 根因假设 |  |
| 证据 |  |
| 最小修复 |  |
| 复验命令与结果 |  |

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
- 本文件不改变 owned registry；目标漂移或缺失时，主控必须停止后续动作。
- 主控需读取本 handoff、diff 和验证记录后，回写主工作台的 `plans/progress.md`、`agents/agent-index.md`、`worktrees/plan.md`、`reviews/review-packs.md` 和 `reports/validation.md`。
