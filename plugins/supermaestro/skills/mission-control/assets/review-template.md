# 审查包

## 说明

按 review pack 分组查看 diff。每个 pack 对应一个功能面，并绑定实际可审查产物：worktree 未提交 diff、patch、PR，或用户明确授权后的 local commit。Feature RP 必须能基于已批准 foundation checkpoint commit 查看 P-only diff。

worker RP 可用于 fan-in 前审查，但进入 Gate 时所有已接受改动必须已进入单一
integration target；主 evidence 与 Gate Review Pack 不跨 target 轮换
`sourceRoot`。

## 排除项

这些文件不属于需求实现，默认不要纳入 review 或提交：

-

## 审查顺序

| 顺序 | RP | 审查目标 | Artifact | Base / 对比基线 | Diff 命令 | Agent Review | 重点关注 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | RP-F1a |  |  | target branch / foundation checkpoint commit |  | not-needed / pending / changes-requested / agent-approved |  | pending |

## RP 详情

### RP-F1a：<名称>

- 目的：
- Worktree target / branch / base：
- Owned registry / Git 核验：
- 文件：
- Artifact：
- Base / 对比基线：
- Diff 命令：
- 验证证据：
- TDD 证据：
- 调试证据：
- 未验证风险：
- UI 证据：
- Review Agent：not-needed / pending / changes-requested / agent-approved
- Review Agent findings：
- Review feedback 处理：not-needed / pending / verified / pushed-back / fixed
- Foundation Checkpoint：yes / no
- 用户结论：pending / approved / changes-requested

## Review Gate 结论

- Review Pack 是否完整：
- Artifact 是否覆盖每个 RP 和 untracked 新文件：
- Review Agent 是否已通过或明确不需要：
- Review findings 是否已核实并处理：
- 验证记录是否可接受：
- Integration target、identity hash 与 fan-in snapshot 是否和主 evidence
  一致：
- `verify`、`request-review` 与 `approve-review` 是否使用同一 integration
  `--target`：
- 是否有本轮新鲜验证证据：
- 未执行检查是否已说明风险：
- 是否允许批准 Review Gate：
