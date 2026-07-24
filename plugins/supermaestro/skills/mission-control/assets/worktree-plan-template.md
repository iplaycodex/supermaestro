# Worktree 计划

## 策略

- Base branch：
- Integration branch：
- Worktree root：../<repo>.worktrees/
- Foundation branch：
- 当前环境：normal repo / linked worktree / detached HEAD
- Worktree owner：以 `state.json` owned registry 为准

默认使用主仓库同级目录 `<repo>.worktrees/<task-id>`；不得使用 `/tmp`、`/private/tmp` 或系统临时目录。
相对 target 固定以 `state.sourceRoot` 解析，registry 只保存 canonical
absolute 路径；target 必须位于 `sourceRoot` 外，项目内 `.worktrees/` /
`worktrees/` 禁止使用。

## Worktree 列表

| 任务 | Target | Branch | Base | 创建意图 | Git 创建 | Registry | Owner | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  | pending | pending | unregistered |  | planned |

## 创建与登记

每行必须使用同一组 `target/branch/base`：

```bash
node <plugin-root>/scripts/supermaestro.js check <workbench> --action create-worktree --target "<path>" --branch "<branch>" --base "<ref>"
git -C "<state.sourceRoot>" worktree add -b "<branch>" "<path>" "<ref>"
node <plugin-root>/scripts/supermaestro.js register-worktree <workbench> --target "<path>" --branch "<branch>" --base "<ref>"
```

CLI 只记录意图、核对 Git 状态并登记，不执行 `git worktree add/remove`。
登记失败时，不得派发、同步物料或创建 checkpoint commit。

## 同步规则

- 需求工作台是否入 git：
- 未入 git 时的物料同步方式：
- Worker worktree 内的 `workbench` 文件只作为本任务上下文和 handoff 承载，不是全局状态源。
- 主控必须从 worker handoff / review 输出 fan-in 回主工作台，更新本计划和 `plans/progress.md`。
- 同步物料、派发 worker、checkpoint commit 前均使用已登记的精确 `--target`。
- 禁止清理项：
- 编码完成默认状态：保留未提交改动供 review，不自动 commit。

## 合并顺序

1. Foundation
2. Feature tasks
3. Integration validation

- Integration target：
- Fan-in 放行：其他 registered target clean，且 HEAD 均为 integration
  target HEAD 的祖先。
- Worker 局部验证：只进 handoff
- 主 validation contract `sourceRoot`：等于 integration target
- 主验证与 Gate：`source-revision`、`run-verification`、`verify`、
  `request-review`、`approve-review`、`request-final` 均使用同一
  integration `--target`；`approve-final` 按最终动作契约提供 target
- 主 evidence / verification snapshot / Gate Review Pack：只绑定
  integration target，并记录 target identity、identity hash 与 fan-in
  snapshot

## Final 收尾计划

| 动作 | 适用条件 | 验证要求 | 清理策略 | 用户确认 |
| --- | --- | --- | --- | --- |
| merge local | Plan approved，目标分支明确 | merge 前后都要验证 | merge 成功后才清理本流程创建的 worktree | required |
| push PR | 需要远端 review | push/PR 前验证 | 保留 worktree 和分支 | required |
| keep | 用户暂不收尾 | 记录当前状态 | 不清理 | required |
| discard | 用户放弃本轮工作 | 列出 branch/worktree/commit 范围 | 明确确认后再删除 | exact confirmation |
| cleanup | 已完成合并或明确授权 | `approve-final --cleanup true --target "<path>"` 与 `check --action cleanup --target "<path>"` 同目标，target/branch/HEAD/source fingerprint/clean 仍与授权快照一致 | `ALLOW` 后由调用方清理；CLI 不执行 remove | exact target |
