# 任务卡：<TASK-ID> <标题>

## 元信息

- 类型：foundation / feature / integration / review
- 状态：planned
- Owner：
- 依赖：
- 解锁任务：
- Foundation Checkpoint：yes / no
- Checkpoint 放行条件：
- Worktree target：
- Branch：
- Base：
- Owned registry：registered / unregistered
- Sync check：`check --action sync-materials --target "<path>"`
- Dispatch check：`check --action dispatch-subagent --target "<path>"`
- Checkpoint check：`check --action checkpoint-commit --target "<path>"` / not-applicable
- Foundation checkpoint commit：none / <commit>
- P-only diff base：target branch / foundation checkpoint commit
- Review Pack：
- Review artifact：worktree diff / patch / PR / explicit local commit
- 自动提交 feature：no
- Foundation human-approved 后 checkpoint commit 授权：
- Worktree 可运行性：每个 worktree install / 完整项目拷贝 / 仅静态验证
- 执行方式：worker agent / 主控串行
- TDD 适用性：required / not-applicable / deferred
- TDD 证据写入：本任务 handoff；主控 fan-in 后再更新 `reports/validation.md`
- Debug 触发：bug / test failure / build failure / integration failure / review finding 时 required
- Review Agent：not-needed / required
- 完成前验证：required

## 允许修改

-

## 禁止修改

-

## 输入上下文

- 共享上下文：context.md
- API 发现：specs/api-spec.md
- API 可执行契约：specs/api-contract.md
- UI 规格：specs/ui-schema-extract.md（Sketch Data 提取）
- 其他：

## UI Schema 映射

| Sketch Data 节点/路径 | 设计值 | 代码文件/组件/样式选择器 | 实现值 | 偏差说明 |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

> UI 任务必须先补齐本表再编码；图片缺失时必须显式按 schema-only 验收。所有视觉值必须来自 Sketch Data，不得自行发挥。

## 实现要求

- Foundation 任务只实现本卡契约面；超过 5-8 个文件、3 个目录或 3 类契约面时，停止并要求主控拆分。
- Feature 任务不得修改已批准 foundation 基线；review artifact 必须能显示 P-only diff。
- worktree 任务只能在本卡已登记的 target/branch/base 中执行；目标未登记、
  已漂移或缺失时立即停止，不得自行收编或更换。
- `TDD 适用性: required` 时，必须先写失败测试并确认失败原因正确，再写最小实现让测试通过；不得先写生产代码再补测试。
- `TDD 适用性: not-applicable` 时，必须说明本任务为何没有可测试行为代码。
- `TDD 适用性: deferred` 时，必须说明阻塞原因、风险和后续补测动作。
- 出现失败或 review finding 时，必须先完成根因调查再修复；handoff 必须记录复现、根因、证据、最小修复和复验结果。
- 声称任务完成前，必须重新运行本卡验证命令并记录输出；不能引用过期结果。
- worker target 的验证只作 handoff；主 Gate 验证由主控 fan-in 后在单一
  integration target 重跑。

## TDD 计划

| 行为/契约 | 测试文件 | RED 命令 | 预期失败原因 | GREEN 命令 | 证据状态 |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  | pending |

跳过或延后原因：

-

## 验证命令

```bash

```

## Review 要求

- Review agent 输入：变更说明、任务卡、base/head 或 diff 命令、验证证据、TDD/调试证据。
- changes-requested 处理：先核实 finding 是否成立，再修复/驳回/请求主控决策。

## 完成标准

-

## Foundation Checkpoint 交接

适用于 `Foundation Checkpoint: yes` 的任务；不适用时写 `不适用`。

- 公共契约：
- 下游任务：
- 典型状态/mock 覆盖：
- 用户 review 重点：
- 放行结果：
- 打回处理：

## Handoff

- 输出路径：workbench/agents/<TASK-ID>/handoff.md
