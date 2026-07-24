# 集成计划

## 输入

| 任务 | Target | Branch / Base | Registry/Git | Patch / Commit | Review 状态 | 验证状态 |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  | pending |  | pending | pending |

## 合并顺序

1. 

## 冲突风险

| 文件/模块 | 风险 | 处理策略 |
| --- | --- | --- |
|  |  |  |

## 集成验证

```bash

```

- Integration target：
- 主 validation contract `sourceRoot`：
- 主 `source-revision --target`：
- 主 `run-verification --target`：
- 主 Gate target：`verify` / `request-review` / `approve-review` /
  `request-final` 使用同一 integration target；`approve-final` 按动作契约
  提供 target，keep 不传。
- Target identity / identity hash / fan-in snapshot：
- Fan-in 条件：其他 registered target clean，且 HEAD 均为 integration
  target HEAD 的祖先。
- Worker 局部证据只进 handoff；主 evidence 和 Gate Review Pack 只绑定
  integration target。
- Final cleanup 对所选目标用
  `approve-final --cleanup true --target "<path>"` 授权，并以同一目标运行
  `check --action cleanup --target "<path>"`；检查
  target/branch/HEAD/source fingerprint/clean 仍与授权快照一致。CLI 不执行
  `git worktree remove`。
