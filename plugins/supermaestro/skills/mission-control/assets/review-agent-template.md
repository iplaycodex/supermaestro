# Review Agent：<RP-ID>

## 输入

- RP：
- Worktree：
- Branch：
- Artifact：worktree diff / patch / PR / explicit local commit
- Base / 对比基线：
- Diff 命令：
- 主控完成性检查：passed / blocked；handoff 路径：
- 上下文：
- 验证记录：

## 只读边界

- 不修改源码。
- 不暂存、不 commit、不 merge、不 push。
- 不清理 worktree。
- 不扩大到本 RP 之外的需求范围。
- 不替实现 Agent 收尾；发现未完成项只输出 findings。
- 不修改主控工作台的 `plans/progress.md`、`reviews/review-packs.md`、`agents/agent-index.md`、`worktrees/plan.md` 或 `reports/validation.md`；这些由主控根据本 review 输出 fan-in。

## Findings

按严重级别排序；无问题写 `未发现阻塞问题`。

| 严重级别 | 文件/位置 | 问题 | 行为风险 | 建议 |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 测试缺口

-

## 结论

- 状态：changes-requested / agent-approved
- unresolved 数量：
- 是否可进入 human review：
