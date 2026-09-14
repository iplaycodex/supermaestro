# 任务计划

## 摘要

- 需求与目标分支：
- 范围依据：context.md、specs/requirement-alignment.md
- 相关契约与原文定位：
- 执行模式：main-serial
- 可选模块及原因：不启用

## 任务 DAG

| 任务 | 依赖 | 允许修改 | 禁止修改 | 实现与验收 | TDD 决策/原因 | Review Pack | 验证命令 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | 无 | TODO | TODO | TODO | TODO | RP1 | TODO |

每个任务写清修改文件和验证要求；适用 TDD 时给出 RED/GREEN 命令，不适用或延后时写原因、风险及补测动作。任务状态统一维护在 plans/progress.md。

## Reviewability

| RP | 审查范围 | Artifact | Base/对比基线 | 预计文件数 | 审查重点 |
| --- | --- | --- | --- | --- | --- |
| RP1 | TODO | diff/patch/PR | TODO | TODO | TODO |

## 验证策略

- 项目验证命令与数据模式：
- 验收场景与对应任务：
- 未覆盖项、原因与风险：
- UI/E2E/视觉验证：按实际触发条件决定；strict + UI 必须明确 required / not-applicable / blocked。

## Plan 决策简报

- 推荐执行方式及理由：
- 范围、契约和验收是否已收敛：
- 待用户决定的事项：
- 用户确认摘要：

启用 worktree、worker、review agent 或 Foundation checkpoint 时，按 references/execution-modes.md 填写对应模块文档，并在本计划链接它们；不要复制整套可选模板。
