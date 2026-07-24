---
name: mission-control
description: 用于处理中大型软件需求，适合需要分阶段规划、可恢复工作流状态、人工门禁、审查包、工作树隔离、子智能体协作、严格契约/验证或任务交接的场景。
---

# 任务控制台（Mission Control）

把中大型需求转成可审查、可暂停、可恢复的研发流程。主控负责上下文、任务边界、机器状态、人工门禁、进度、审查和集成；worker 只执行任务卡限定的工作。

## 触发条件

在以下情况使用本 Skill：

- 需求需要 Scope、Plan、Review、Final 人工门禁。
- 涉及多页面、多模块、API/UI 契约、E2E、视觉验证或高风险操作。
- 需要 worktree、子智能体、Review Pack、暂停/恢复或跨会话交接。
- 已有 SuperMaestro workbench，需要通过 `resume` / `next` 继续。

单一、低风险、无需工作台的小修改可直接处理；用户明确要求只分析或只规划时，不进入编码或最终动作。

## 输入

开始前至少确认：

- 需求名称、目标仓库、目标分支和 workbench 路径。
- PRD、API、UI、mock、截图等事实源的位置和可访问状态。
- 工作流模式：`lite`、`standard`、`strict`。
- 用户明确的范围、禁止项、目标平台和验收要求。
- 是否存在会影响鉴权、权限、资金、生产写入、数据库或发布安全的高风险动作。

计划阶段还要确认：

- 任务依赖、预计文件数、公共契约和 Review Pack 数量。
- 执行模式，以及是否授权 worktree、子智能体、checkpoint commit 和物料同步。
- worktree 模式下，每个目标的精确 `target`、`branch` 和 `base`。
- E2E / visual 的 `required`、`not-applicable` 或 `blocked` 决策。

信息不足但不影响安全和范围时，可以带明确假设继续规划；会改变需求、契约、执行模式或最终动作权限时必须停下确认。

## 按需读取

先读取[核心工作流规则](../../profiles/core-workflow.md)。只有目标项目是 Taro 小程序或 H5，且存在蓝湖 schema 物料时，再读取[Taro/H5 蓝湖规则](../../profiles/weapp-taro-lanhu.md)。

根据任务按需读取，不要一次加载全部引用：

- 判断复杂度、执行模式和动态模块：[执行模式与动态模块](references/execution-modes.md)。
- 拆任务 DAG、Foundation checkpoint 和 TDD 边界：[任务拆分策略](references/split-strategy.md)。
- 创建或管理 Git worktree：[Worktree 策略](references/worktree-strategy.md)。
- 派发真实 worker/review agent：[多智能体协作协议](references/multi-agent-protocol.md)和[智能体角色职责](references/agent-roles.md)。
- 进入 Review/Final 或声明完成：[验证清单](references/validation-checklist.md)。

只有确实要生成对应文档时才读取模板：

- 计划：[任务计划模板](assets/plan-template.md)、[进度模板](assets/progress-template.md)、[Review Pack 模板](assets/review-template.md)。
- 多智能体：[任务卡模板](assets/task-card-template.md)、[Agent Brief 模板](assets/agent-brief-template.md)、[Handoff 模板](assets/agent-handoff-template.md)、[Review Agent 模板](assets/review-agent-template.md)。
- worktree 或集成：[Worktree 计划模板](assets/worktree-plan-template.md)、[集成计划模板](assets/integration-plan-template.md)。
- API/UI 对齐：[API 发现模板](assets/api-spec-template.md)、[页面契约矩阵模板](assets/page-contract-matrix-template.md)。

## 状态权威与路径

当前工作台只能由插件根 CLI 写机器状态：

```text
<plugin-root>/scripts/supermaestro.js
```

机器状态主源：

```text
workbench/state.json
workbench/events.jsonl
workbench/mission.state.json
workbench/gates/*.json
workbench/reports/evidence.jsonl
workbench/specs/machine/*.json
```

`state.json` 还保存经 Git 现场验真的 owned worktree registry。Markdown
计划不是 worktree 所有权依据。新工作台状态版本为 `workflowVersion: 3`。

人类审查投影：

```text
workbench/context.md
workbench/specs/*.md
workbench/plans/task-plan.md
workbench/plans/progress.md
workbench/reviews/review-packs.md
workbench/reports/validation.md
```

`skills/mission-control/scripts/harness.js` 只用于旧命令兼容和回归测试，并把调用转发到根 CLI；它不再维护第二套状态。新调用不要经过该适配器。

标准目录：

```text
documents/<需求名>/
├── source/
│   ├── prd/
│   ├── api/
│   └── ui/
└── workbench/
    ├── state.json
    ├── events.jsonl
    ├── mission.state.json
    ├── context.md
    ├── specs/
    ├── plans/
    ├── reviews/
    └── reports/
```

`source/` 保留原始物料，不改写；`workbench/` 保存流程产物。

## 工作流模式

| 模式 | 适用场景 | 门禁 |
| --- | --- | --- |
| `lite` | 小缺陷、短文案、小范围样式或低风险改动 | Scope + Final |
| `standard` | 普通软件需求 | Scope + Plan + Review + Final |
| `strict` | 多页面、多画板、强 UI、API 契约或高风险任务 | Scope + Plan + Review + Final，并严格检查契约和证据 |

默认建议 `standard`。模式在 `init` 时确定，之后不可通过 `scaffold --mode` 修改；Scope 批准后更不能降级绕过 Plan/Review。确需改变模式时，解释原因并新建 workbench。

## 执行模式路由

工作流模式决定 Gate，执行模式决定代码隔离和并发，两者不能混用。

| 执行模式 | 默认开关 | 推荐场景 |
| --- | --- | --- |
| `main-serial` | `worktree=false`、`subagents=false` | 单一功能面、少量文件、低冲突 |
| `single-worktree-serial` | `worktree=true`、`subagents=false` | 需要隔离用户主工作区，但不并行 |
| `multi-worktree-parallel` | `worktree=true`；`subagents` 按需 | 多个边界独立的切片，可并行并能单独 review |

命中以下任意两项时，不推荐 `main-serial`：

- 两个以上页面/模块。
- 预计超过 8 个文件。
- 同时改公共组件、路由、API、mock 或配置。
- 两个以上 UI 画板。
- 新增页面同时改既有页面。
- 需要多个 worker 或多轮 review。

选择 `multi-worktree-parallel` 不代表必须开子智能体；worktree 和执行人力是独立开关。公共依赖会解锁多个下游时，先做 Foundation Review Checkpoint，再启动依赖切片。

## 完整流程

### 1. 恢复或初始化

已有 workbench 先读取状态：

```bash
node <plugin-root>/scripts/supermaestro.js status <workbench>
node <plugin-root>/scripts/supermaestro.js resume <workbench>
node <plugin-root>/scripts/supermaestro.js next <workbench>
```

没有状态时才初始化：

```bash
node <plugin-root>/scripts/supermaestro.js init <workbench> --name "<需求名>" --mode <lite|standard|strict>
```

不要对已有 workbench 重新 `init`，也不要指定不同 `--mode` 覆盖原状态。

例外是 v2 → v3 显式迁移：`status`、`resume` 等命令不会静默升级，必须对
原 workbench 重新运行 `init`。迁移保留原始物料和工作台文档；有效 Scope
确认可保留，但 Plan、Review、Final、执行模式、旧验证快照、最终动作和
worktree registry 会重置。旧状态没有 `sourceRoot` 时，追加
`--source-root "<git-worktree>"`；未知版本不得强制覆盖。

### 2. 按触发条件生成产物

```bash
node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --api true --ui true --ui-coding true --behavior true
```

只生成真实需要的文档。E2E 和 visual 必须显式启用：

```bash
node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --e2e true --visual true
```

一旦启用，后续 `--e2e false` / `--visual false` 不能移除验证义务。Plan/Review/Final 后首次新增验证 trigger 时，CLI 会使下游批准失效并回退到需要重新规划/验证的状态。

worktree、subagents、review-agent 也必须在 Plan 批准前按选定执行模式
scaffold：

```bash
node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --worktree true
node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --worktree true --subagents true --review-agent true
node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --review-agent true
```

第一条用于 worktree-only，第二条用于真实多 agent 且启用只读 review
agent，第三条用于 main-serial 等无编码子智能体、但存在真实 RP/diff 的只读
预审。review-agent 与 subagents 独立。scaffold 只生成模块和记录 trigger，
不创建 worktree 或派发 agent。

### 3. Scope Gate：需求与发现阶段

Scope 只确认目标、范围、非范围、规则、关键假设和验收场景。

存在 API 物料时：

1. Scope 前尝试解析真实 OpenAPI/Swagger/Knife4j/Postman 或文档内容。
2. 把来源、尝试方式、接口清单、分类和缺口记录到 `specs/api-spec.md`。
3. `partial` / `blocked` 且影响范围、鉴权、关键字段或验收时，不批准 Scope。
4. 不把“编码任务 F1 再发现接口”作为默认计划。

同时存在 API + UI 时，维护 `specs/page-contract-matrix.md`，把页面、PRD `source_ref`、画板/schema、API/mock 和 Review Pack 绑定起来。

检查并等待用户明确确认：

```bash
node <plugin-root>/scripts/supermaestro.js check-workbench <workbench>
node <plugin-root>/scripts/supermaestro.js approve-scope <workbench> --confirmed-by user --confirmation "<用户确认原话或摘要>"
```

`approve-scope` 不能由 AI 自行推导确认。

### 4. Plan Gate：契约、计划与执行模式

Scope 通过后：

1. 把本期 API 可执行结论同步到 `specs/api-contract.md` 和 `specs/machine/api-contract.json`。
2. 完成 `plans/task-plan.md`、`plans/progress.md`、`reviews/review-packs.md` 和 `reports/validation.md`。
3. 任务计划不得保留 `pending`、`TODO`、`待补`、`待确认` 等未收敛占位。
4. 根据复杂度选择执行模式和动态模块。
5. worktree 模式为每个目标写明精确 `target`、`branch`、`base`。
6. `strict` 会在 Plan 前 hard-fail 不完整 contract。

常用命令：

```bash
node <plugin-root>/scripts/supermaestro.js approve-plan <workbench> --execution-mode main-serial --worktree false --subagents false --confirmed-by user --confirmation "<用户确认计划和执行模式>"

node <plugin-root>/scripts/supermaestro.js approve-plan <workbench> --execution-mode main-serial --worktree false --subagents false --review-agent true --confirmed-by user --confirmation "<用户确认主控串行与只读预审>"

node <plugin-root>/scripts/supermaestro.js approve-plan <workbench> --execution-mode single-worktree-serial --worktree true --subagents false --confirmed-by user --confirmation "<用户确认使用单 worktree 串行执行>"

node <plugin-root>/scripts/supermaestro.js approve-plan <workbench> --execution-mode multi-worktree-parallel --worktree true --subagents true --review-agent true --confirmed-by user --confirmation "<用户确认多 worktree、子智能体和只读 review agent>"
```

执行模式组合必须一致：

- `main-serial` 不能传 `--worktree true`。
- `single-worktree-serial` 和 `multi-worktree-parallel` 必须启用 worktree。
- `--subagents true` 只能与 `multi-worktree-parallel` 配合。
- worktree/subagents/review-agent 的 true 值都要求对应 scaffold trigger 已
  启用；开启 subagents 时必须显式传 `--review-agent true|false`。

#### `strict + UI` 视觉决策

Plan 必须显式传入一个决定：

```bash
# 需要视觉证据；先 scaffold --visual true 并完成 validation contract
node <plugin-root>/scripts/supermaestro.js approve-plan <workbench> --execution-mode single-worktree-serial --visual-decision required --confirmed-by user --confirmation "<用户确认计划及视觉验证>"

# 确实不适用；原因至少能说明边界和风险
node <plugin-root>/scripts/supermaestro.js approve-plan <workbench> --execution-mode main-serial --visual-decision not-applicable --visual-reason "<不适用原因与剩余风险>" --confirmed-by user --confirmation "<用户确认无需视觉验证>"

# 暂时阻塞：把原因写入任务计划并保持 Plan pending。
# 即使调用 approve-plan --visual-decision blocked，CLI 也会失败关闭，不会批准 Plan。
```

`required` 必须与已启用的 visual trigger 配合；visual trigger 已启用后不能再选择 `not-applicable` 或 `blocked`。

### 5. 编码与受控执行

任何编码动作前先检查授权：

```bash
node <plugin-root>/scripts/supermaestro.js check <workbench> --action code --non-ui true --reason "<明确的非 UI 原因>"
node <plugin-root>/scripts/supermaestro.js check <workbench> --action code --ui true --schema-extract specs/ui-schema-extract.md
```

worktree 采用“记录创建意图 → 调用方创建 → CLI 登记”的闭环。以下三条
命令必须使用 Plan 中同一组精确参数：

```bash
node <plugin-root>/scripts/supermaestro.js check <workbench> --action create-worktree --target "<path>" --branch "<branch>" --base "<ref>"
git -C "<state.sourceRoot>" worktree add -b "<branch>" "<path>" "<ref>"
node <plugin-root>/scripts/supermaestro.js register-worktree <workbench> --target "<path>" --branch "<branch>" --base "<ref>"
```

`register-worktree` 会核对 `git worktree list`、目标路径、branch 和 base；
只有验真成功后，目标才进入 owned worktree registry。登记失败时停止，不得
派发 worker、同步物料、创建 checkpoint commit 或把该目标声明为本流程拥有。

`--target` 可传绝对路径，或相对 `state.sourceRoot` 的路径；相对路径不受
当前 cwd 影响，registry 始终保存 canonical absolute 路径。目标必须位于
`sourceRoot` 外且不能位于系统临时目录；项目内 `.worktrees/` /
`worktrees/` 不受支持。
调用实际 Git 命令时，使用 registry 的 canonical absolute target，或保留
上述 `git -C "<state.sourceRoot>"` 形式，避免 cwd 改变相对路径含义。

worktree 模式下，后续动作都必须携带已登记的精确目标：

```bash
node <plugin-root>/scripts/supermaestro.js check <workbench> --action dispatch-subagent --target "<path>"
node <plugin-root>/scripts/supermaestro.js check <workbench> --action sync-materials --target "<path>"
node <plugin-root>/scripts/supermaestro.js check <workbench> --action checkpoint-commit --target "<path>"
```

CLI 输出 `ALLOW` 只表示前置条件满足。它只校验、登记和授权，不会实际创建
或删除 worktree、派发 worker、同步文件或执行 Git 动作。

每个编码任务写清：

- 允许/禁止修改范围。
- 输入契约和 `source_ref`。
- TDD：`required`、`not-applicable` 或 `deferred`，以及 RED/GREEN 证据或原因。
- Review Pack、实际 diff/patch/branch/PR 和验证命令。
- 失败时的复现、根因、最小修复和复验。

### 6. E2E 与视觉证据

启用对应 trigger 后：

1. 在 `specs/machine/validation-contract.json` 声明 `sourceRoot`、`sourceRevision` 和稳定 case。worktree 模式下，`sourceRoot` 必须等于单一、已登记且 live 的 integration target，并与 `state.sourceRoot` 指向的目标源码属于同一个 Git 仓库（同一 Git common dir；路径无需相同）。用 `source-revision <workbench> --target "<integration-target>"` 计算指纹。
2. 用项目已有运行器执行测试。
3. 用 `evidence` 记录准确的命令、数据模式、计数、退出码、报告和产物。
4. 运行 `verify`，让源码、contract 和产物变化使旧证据失效。

worker 可在各自 target 运行局部验证，但结果只写 handoff。主 validation
contract 不得轮换顶层 `sourceRoot`：Review/Final 前先 fan-in 到单一
integration target，确认其他 registered target clean，且其 HEAD 都是
integration target HEAD 的祖先；否则主 `verify` 失败关闭。主 evidence 与
Gate Review Pack 只绑定该 integration target。

CLI 在 test.command、E2E、visual evidence 和 verification snapshot 中记录
target identity、identity hash 与 fan-in；target、registry 或 fan-in 变化后
旧证据失效。

普通 test、build 或 lint 不接受手工自报 `test.command`。通过无 shell 的内置 runner 真正执行命令并自动记录当前源码指纹、退出码、报告和哈希：

```bash
node <plugin-root>/scripts/supermaestro.js run-verification <workbench> --program npm --args-json '["test"]' --report reports/commands/npm-test.log
```

上例适用于主源码工作区。worktree 模式必须增加已登记目标；多 worktree
必须传 fan-in 后的 integration target：

```bash
node <plugin-root>/scripts/supermaestro.js run-verification <workbench> --target "<path>" --program npm --args-json '["test"]' --report reports/commands/npm-test.log
```

PowerShell 可使用同一 JSON 引号形式；CMD 需要转义双引号：

```powershell
node <plugin-root>/scripts/supermaestro.js run-verification <workbench> --target '..\repo.worktrees\feature' --program npm --args-json '["test"]' --report reports/commands/npm-test.log
```

```bat
node <plugin-root>/scripts/supermaestro.js run-verification <workbench> --target "..\repo.worktrees\feature" --program npm --args-json "[\"test\"]" --report reports/commands/npm-test.log
```

长命令优先保持单行。必须换行时，PowerShell 使用行末反引号，CMD 使用
行末 `^`；不要把 Bash 的 `\` 当成 Windows 续行符。

失败命令同样会写报告和失败 evidence，但不能通过 `verify`。

需要详细执行规则时，读取[微信小程序 E2E Skill](../validate-weapp-e2e/SKILL.md)或[视觉回归 Skill](../validate-visual-regression/SKILL.md)。

`fixture`、`mock-api`、`uat`、`real` 不得互相冒充。`blocked` 只有同时记录原因、`--accepted-skip true` 和用户明确确认时才能按接受风险处理，但仍不能写成真实链路 `passed`。

### 7. Review Gate

每个 Review Pack 必须指向真实且非空的 diff、patch、branch 或 PR，并覆盖未跟踪新文件。空 `git diff`、只有 Markdown 声明、过期验证或 `pending` 状态不能通过。

```bash
node <plugin-root>/scripts/supermaestro.js verify <workbench> --target "<integration-target>" --strict true
node <plugin-root>/scripts/supermaestro.js request-review <workbench> --target "<integration-target>"
node <plugin-root>/scripts/supermaestro.js approve-review <workbench> --target "<integration-target>" --review-accepted true --validation-accepted true --confirmed-by user --confirmation "<用户确认审查包和验证结论>"
```

`request-review` 和 `approve-review` 都会重新 `verify`。Review 批准需要独立人工确认，不能复用 Scope/Plan 的确认。
`main-serial` 可省略 `--target`；如提供，必须等于 `state.sourceRoot`。

### 8. Final Gate 与动作授权

```bash
node <plugin-root>/scripts/supermaestro.js request-final <workbench> --target "<integration-target>"
node <plugin-root>/scripts/supermaestro.js approve-final <workbench> --confirmed-by user --confirmation "<用户确认精确动作组合>" --merge false --commit true --push false --cleanup false
```

`commit`、`merge`、`push`、`cleanup` 是四个独立权限。只授权 `commit` 后：

```bash
node <plugin-root>/scripts/supermaestro.js check <workbench> --action commit
node <plugin-root>/scripts/supermaestro.js check <workbench> --action push
```

前者可 `ALLOW`，后者必须拒绝。四项全为 `false` 表示 keep as-is，不授权
任何最终 Git 动作，此时不得传 `--target`。`request-final` 使用
integration target；`approve-final` 的 target 参数只按所选最终动作契约
提供，不能把验证目标和动作目标混为一谈。

如果 Final 明确授权 cleanup，还要对所选目标绑定授权并检查：

```bash
node <plugin-root>/scripts/supermaestro.js approve-final <workbench> --confirmed-by user --confirmation "<用户确认清理精确目标>" --merge false --commit false --push false --cleanup true --target "<path>"
node <plugin-root>/scripts/supermaestro.js check <workbench> --action cleanup --target "<path>"
git -C "<state.sourceRoot>" worktree remove "<path>"
```

授权与检查必须使用同一个 target。
只有 owned registry 中仍存在，且当前 target、branch、HEAD、源码指纹和
clean 状态与 Final 授权快照一致的目标才能获得 `ALLOW`。CLI 不执行最后一条
Git 命令；未登记、外部管理、已漂移、脏工作区或不存在的 worktree 一律拒绝。

Final Gate 与每个最终动作检查都会重新 `verify`。获得 `ALLOW` 后仍需调用方单独执行实际 Git 命令；插件不代替用户做 `commit`、`merge`、`push` 或清理。

## 严格模式最低要求

`strict` 在 Plan/Review 追加失败关闭检查：

- API：Plan 前存在 `api-contract.md` 与机器 JSON；Scope 的 `api-spec.md` 不能代替可执行 contract。
- UI：存在 UI contract、机器 JSON、物料索引和 `ui-schema-extract.md`；UI 编码前有 Schema 到实现映射。
- API + UI：存在页面契约矩阵。
- 行为：存在 `behavior-contract.md`；无复杂行为时写明确 `no-change` 结论。
- Review：每个 RP 有真实非空 artifact；启用 review agent 时结论已收敛为 `agent-approved` 或明确 `not-needed`。
- E2E/visual：每个必测 case 有与当前源码、contract 和产物 hash 一致的最新 evidence。
- 视觉：Plan 中存在 `required|not-applicable|blocked` 明确决策和必要原因。

## 输出与完成标准

交付时至少报告：

- 当前模式、阶段、Gate 状态和下一步。
- workbench、目标仓库、执行位置和改动范围。
- worktree 模式下，每个目标的 `target`、`branch`、`base`、登记状态和当前 Git 核验结果。
- 每个 Review Pack 的真实 artifact。
- 本轮验证命令、结果、数据模式和证据位置。
- 未执行检查、阻塞项、剩余风险和用户已接受的 skip。
- Final 授权的精确动作组合，以及尚未实际执行的动作。

只有 CLI 状态、文档投影、实际 diff 和新鲜验证一致时，才能声明相应阶段完成。

## 异常与失败关闭

- 状态文件缺失/损坏：停止推进，不凭 Markdown 重建“已批准”状态；报告恢复所需信息。
- v2 状态：只允许通过 `init` 显式迁移到 v3；保留物料并重新批准
  Plan/Review/Final。未知版本失败关闭。
- `init` / `scaffold` 模式不一致：新建 workbench，不覆盖原模式。
- API discovery 或关键契约阻塞：停在 Scope/Plan，不派发编码任务。
- `strict + UI` 没有视觉决策：Plan 失败；不得默认关闭 visual。
- 执行模式与开关冲突：修正计划并重新取得用户确认。
- worktree 创建意图缺失、参数与 Plan 不一致：拒绝创建，先修正计划或参数。
- worktree target 等于/位于 `sourceRoot` 内，或位于系统临时目录：拒绝；
  改用源码仓库旁的持久目录。
- worktree 创建后无法通过路径、branch、base 验真：拒绝登记，停止后续受控动作。
- worktree 模式动作未传 `--target`，或目标未登记、已漂移、不存在：失败关闭。
- 证据过期、产物 hash 变化、JSONL 非法：重新运行验证，不手改结果绕过。
- Review artifact 为空或无法解析：保持 Review pending。
- Final 未授权精确动作：拒绝动作；不能把“批准收尾”解释为所有 Git 权限。

## 边界

- 不修改 `source/` 原始物料，不把 AI 推断写成已确认事实。
- 未获对应 Gate 确认前，不编码、不创建 worktree、不派发 worker、不执行最终动作。
- 不自动安装依赖、写生产数据、支付、删除或执行其他高副作用动作。
- 不泄露 Cookie、令牌、账号、私有 URL、测试凭证或环境变量。
- CLI 不自行执行 `git worktree add/remove`，不创建或删除分支。
- worktree 相对 target 只按 `state.sourceRoot` 解析，机器状态只保存
  canonical absolute；不允许项目内或系统临时目录。
- cleanup 的 Final 授权与动作检查都必须带同一精确 `--target`；不清理
  未登记、外部、来源不明、detached、已漂移或非本流程创建的 worktree。
- 不把 review agent 当成人工批准；不让 worker 修改主控机器状态。
- 不自动 `commit`。Foundation checkpoint 也必须由 Plan 明确授权；worktree
  模式下还要对已登记目标执行 `check --action checkpoint-commit --target "<path>"`。

## 触发示例

- “用 `$mission-control` 处理这个需求，先拆任务，不写代码。”
- “按 `strict` 模式处理这个多页面 UI + API 需求。”
- “恢复这个 workbench，告诉我现在卡在哪道 Gate。”
- “先到 Plan Gate，让我确认执行模式和是否启用子智能体。”
- “检查 Review Pack、E2E 和视觉证据是否足够进入 Review Gate。”
