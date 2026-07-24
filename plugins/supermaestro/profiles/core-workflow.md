# 核心工作流 Profile

SuperMaestro 核心层只负责研发流程机制：

- 需求身份与 `source/`、`workbench/` 分层；
- 工作流模式、状态转换与恢复投影；
- Scope、Plan、Review、Final 四道人工门禁；
- 按触发条件生成产物；
- 契约、Review Pack 与验证证据检查；
- worktree、子智能体和最终动作授权。

项目框架、UI 与业务领域规则放在专用 Profile，例如
[`weapp-taro-lanhu.md`](./weapp-taro-lanhu.md)。

## 工作流模式

| 模式 | 适用场景 | 门禁 |
| --- | --- | --- |
| `lite` | 小缺陷、小文案、小范围样式、低风险改动 | Scope + Final |
| `standard` | 普通软件需求 | Scope + Plan + Review + Final |
| `strict` | 多页面、多画板、强 UI、API 契约或高风险任务 | 四道门禁，并启用严格契约、Review 与证据检查 |

模式在 `init` 时确定。已有工作台不得通过 `init` 或 `scaffold` 改成
`lite` 绕过下游门禁；需要更换模式时重新初始化工作台并保留迁移说明。

新工作台使用 `workflowVersion: 3`。v2 状态只能通过 `init` 显式迁移；
迁移保留原物料和工作台文档，保留仍有效的 Scope 确认，并重置
Plan/Review/Final、执行模式、旧验证快照、最终动作和 worktree registry。
未知状态版本失败关闭。

Plan Gate 还要选择独立的执行模式：

- `main-serial`
- `single-worktree-serial`
- `multi-worktree-parallel`

执行模式必须与 `worktree`、`subagents`、`checkpoint` 授权一致。

## 唯一机器状态

```text
workbench/state.json              # 当前状态与 owned worktree registry
workbench/events.jsonl            # 追加式事件日志
workbench/mission.state.json      # resume / next 人工可读投影
workbench/gates/*.json            # 人工门禁决策投影
workbench/reports/evidence.jsonl  # 结构化验证证据
```

旧 `harness.js` 只作为命令兼容适配器转发到根 CLI，不再创建或更新
`harness.json`、`harness.state.json`。

Markdown 是人工审查材料，不替代机器状态：

```text
workbench/context.md
workbench/specs/*.md
workbench/plans/task-plan.md
workbench/plans/progress.md
workbench/reviews/review-packs.md
workbench/reports/validation.md
```

机器 contract JSON 统一放在 `workbench/specs/machine/`。

## 四道门禁

### Scope

- 确认目标、范围、非范围、规则、假设和验收场景。
- 要求 `--confirmed-by user --confirmation "<用户确认>"`。
- 有 API 物料时，Scope 阶段允许用 `specs/api-spec.md` 记录 discovery
  清单和缺口；它不能冒充 Plan 前的可执行 API contract。

### Plan

- 确认任务 DAG、执行模式、Review Pack、TDD 决策和验证策略。
- 批准前先 scaffold 所选执行 trigger：worktree、subagents、review-agent；
  启用 subagents 时，`approve-plan` 必须显式决定
  `--review-agent true|false`。
- review-agent 与 subagents 独立；`main-serial` 的真实 RP/diff 也可启用
  只读预审。
- 有 API 需求时，批准前必须完成 `specs/api-contract.md` 与对应机器
  contract。
- `strict + UI` 必须记录 `required / not-applicable / blocked` 视觉决策。
  `required` 必须启用 visual contract；`not-applicable` 必须有原因和用户
  确认；`blocked` 保持门禁未批准。
- 要求独立用户确认。

### Review

- 每个 Review Pack 必须绑定真实且非空的 diff、patch、branch 或编号 PR。
- 空 `git diff`、只有 Markdown 摘要或过期验证不能放行。
- `request-review` 与 `approve-review` 都现场运行 `verify`。
- worktree 模式下，`verify`、`request-review` 与 `approve-review` 必须始终
  传入同一个已登记的 integration `--target`。
- 批准 Review 必须显式接受 review 与 validation，并记录独立用户确认。

### Final

- `request-final` 与 `approve-final` 都现场运行 `verify`。
- worktree 模式下，`request-final` 必须继续传入 Review 阶段使用的同一个
  integration `--target`；`approve-final` 的 target 参数只按所选最终动作
  契约提供，keep 不传 target。
- `commit`、`merge`、`push`、`cleanup` 是四个独立授权位。
- `check --action <动作>` 必须同时满足 Final Gate 和对应动作授权，并再次
  验证当前源码及证据。
- `approve-final --cleanup true` 与 `check --action cleanup` 都必须提供同一
  `--target`，且只能面向 owned registry 中仍存在并与当前 Git 路径、
  branch、HEAD、源码指纹及 clean 状态一致的 worktree。

CLI 拒绝时立即停止；Prompt 或 Markdown 中的“已通过”不能覆盖 CLI 结果。

## 产物与契约

`scaffold` 只按真实 trigger 生成产物：

- UI：`ui-contract.md`、机器 UI contract、物料索引；
- API：Scope discovery 使用 `api-spec.md`，Plan 使用 `api-contract.md`；
- UI + API：`page-contract-matrix.md`；
- UI 编码：`ui-schema-extract.md`；
- E2E / visual：`validation-contract.json`；
- worktree / 子智能体：对应计划、任务卡、brief、handoff 与审查记录。

E2E 和 visual trigger 一旦启用不得降级。Plan、Review 或 Final 后新增验证
义务时，必须使受影响的下游批准失效。

当前 v3 工作台是 SuperMaestro 自有状态与契约格式，不声明 OpenSpec 兼容。

## 验证证据

普通测试、构建、lint、E2E 和视觉验证都必须绑定当前 Git working tree：

- 记录实际命令、退出码、执行时间和数据模式；
- 由 CLI 计算 `sourceRevision`，不接受手工伪造 revision；
- 报告与产物必须存在、非空并记录 SHA-256；
- `verify` 现场重算源码指纹和产物 hash；
- 源码、contract、报告或产物变化后旧证据失效；
- `reports/evidence.jsonl` 存在坏 JSON 时失败关闭。
- worktree 模式的 `sourceRoot` 必须等于 owned registry 中选定的单一、
  live integration target，并与工作台目标源码属于同一个 Git 仓库（同一
  Git common dir；路径无需与初始化位置相同）。
- 多 worktree 的 worker 局部验证只进入 handoff。Review/Final 前必须 fan-in：
  其他 registered target clean，且 HEAD 都是 integration target HEAD 的
  祖先；主 evidence 和 Gate Review Pack 只绑定 integration target。
- 主 evidence 与 verification snapshot 记录 integration target 的身份、
  identity hash 和 fan-in 快照；target、registry 或 fan-in 关系变化后，
  旧证据失效。

Mock、静态检查或 HTTP 200 不能冒充真实业务链路。blocked 用例需要具体原因；
只有明确允许跳过的契约才可记录用户接受的剩余风险。

## Review 与并行执行

- 每个编码任务必须有可独立审查的 artifact。
- 创建 worktree 前，用 `check --action create-worktree --target <path>
  --branch <branch> --base <ref>` 记录精确意图；CLI 不执行 Git 创建。
- 相对 target 固定以 `state.sourceRoot` 解析，registry 只保存 canonical
  absolute 路径。target 必须位于 `sourceRoot` 外和系统临时目录外；不允许
  项目内 `.worktrees/` / `worktrees/`。
- 调用方实际执行 `git worktree add` 后，运行 `register-worktree` 并使用
  同一组 `target/branch/base`。只有 CLI 通过 `git worktree list` 和实际
  branch/base 验真后，目标才进入 owned registry。
- worktree 模式下，物料同步、checkpoint commit 和子智能体派发都必须带
  已登记的 `--target`；未登记或已漂移的目标失败关闭。
- 编码 worker 只写自己的 handoff；主控负责把状态 fan-in 到
  `plans/progress.md`、`agents/agent-index.md`、`worktrees/plan.md`、
  `reviews/review-packs.md` 和 `reports/validation.md`。
- 未完成、`changes-requested` 或未 fan-in 的 worker/review 状态会阻塞
  Review readiness。
- Review agent 只是辅助证据，不替代人工 Review Gate。

SuperMaestro 只校验、登记和授权，不自行执行 `git worktree add/remove`、
创建/删除分支或清理目录。

## 跨平台命令参数

`run-verification --args-json` 接收 JSON 字符串数组。macOS/Linux shell 和
PowerShell 可写 `'["test"]'`；CMD 写 `"[\"test\"]"`。长命令应优先保持
单行；需要续行时分别使用 PowerShell 反引号或 CMD `^`，不能把 Bash `\`
作为 Windows 的续行符。

worktree 模式的 `run-verification` 必须携带已登记 `--target`；多 worktree
使用 fan-in 后的 integration target：

```powershell
node <plugin-root>/scripts/supermaestro.js run-verification <workbench> --target '..\repo.worktrees\feature' --program npm --args-json '["test"]' --report reports/commands/npm-test.log
```

```bat
node <plugin-root>/scripts/supermaestro.js run-verification <workbench> --target "..\repo.worktrees\feature" --program npm --args-json "[\"test\"]" --report reports/commands/npm-test.log
```

旧命令名只作为迁移期别名：

```text
approve-gate1 -> approve-scope
approve-gate2 -> approve-plan
request-gate3 -> request-review
approve-gate3 -> approve-review
request-gate4 -> request-final
approve-gate4 -> approve-final
```
