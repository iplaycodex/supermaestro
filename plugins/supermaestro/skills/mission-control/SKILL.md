---
name: mission-control
description: 用于处理中大型软件需求，适合需要分阶段规划、可恢复的工作流状态、人工门禁、审查包、工作树隔离、子智能体协作、源材料与工作台产物、严格验证或任务交接的场景。
---

# 任务控制台（Mission Control）

把一个中大型需求转成可审查、可暂停、可恢复的研发流程。主控负责上下文、任务边界、门禁决策、进度和集成；子智能体只执行任务卡限定的工作。

## 先读规则

- 先读取插件内 `profiles/core-workflow.md`，它是工作流模式、状态、门禁、契约和验证的核心规则。
- 当目标项目是 Taro 小程序或 H5，且存在蓝湖 schema 物料时，再读取 `profiles/weapp-taro-lanhu.md`。
- 关键动作优先通过 `plugins/supermaestro/scripts/supermaestro.js` 检查；脚本拒绝时停止并报告原因。

## 工作流模式

| 模式 | 适用场景 | 门禁 |
| --- | --- | --- |
| `lite` | 小型缺陷、短文案、小范围样式或低风险改动 | 范围门禁 + 最终门禁 |
| `standard` | 普通前端需求 | 范围门禁 + 计划门禁 + 审查门禁 + 最终门禁 |
| `strict` | 多页面、多画板、强 UI、接口契约或高风险任务 | 范围门禁 + 计划门禁 + 审查门禁 + 最终门禁，并启用更严格的证据和契约约束 |

默认使用 `standard`。小需求可用 `lite`；高风险前端需求，或对 UI、API、行为契约要求较高的需求使用 `strict`。

## 状态与证据

机器状态优先由命令行工具（CLI）维护：

```text
workbench/state.json              # 当前工作流状态
workbench/events.jsonl            # 仅追加的事件日志
workbench/mission.state.json      # resume/next 状态投影
workbench/gates/*.json            # 门禁决策
workbench/reports/evidence.jsonl  # 机器证据主源
workbench/specs/machine/*.json    # 机器契约 JSON
```

Markdown 文档是面向人的投影和审查材料，不是机器证据主源：

```text
workbench/context.md
workbench/specs/*.md
workbench/plans/task-plan.md
workbench/plans/progress.md
workbench/reviews/review-packs.md
workbench/reports/validation.md
```

`specs/` 顶层放面向人的主文档，`specs/machine/` 放机器契约 JSON。`specs/ui-schema-extract.md` 同时是 UI schema 节点提取和 Schema 到实现映射的主文档；`reviews/review-packs.md` 是审查契约的主入口；启用 E2E 或视觉验证触发器时，`specs/machine/validation-contract.json` 是必测用例的主源。

## 标准工作台

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

原始物料放 `source/`，过程产物放 `workbench/`。不要修改原始物料内容。

## 命令行流程

初始化：

```bash
node <plugin-root>/scripts/supermaestro.js init <workbench> --name "<需求名>" --mode <lite|standard|strict>
```

按触发器生成产物：

```bash
node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --api true --ui true --ui-coding true --behavior true
```

`scaffold` 只按实际触发条件生成文档和目录，不为了完整性生成空目录或无用文档。需要 E2E 或视觉验证时，在同一命令中显式追加 `--e2e true` / `--visual true`。

E2E 和视觉验证都只在显式传入 `true` 时启用；即使 `strict` 模式包含 UI 物料，也不会自动开启。一旦启用，重复执行 `scaffold` 会永久保留对应触发器，后续传入 `--e2e false` / `--visual false` 也不会降级。

如果在计划、审查或最终门禁之后首次新增 E2E 或视觉验证触发器，`standard` / `strict` 会把计划门禁回退到 `pending`，并锁定审查和最终门禁；`lite` 会撤销已请求或已批准的最终门禁，重新锁回最终验证流程。

检查工作台与契约：

```bash
node <plugin-root>/scripts/supermaestro.js check-workbench <workbench>
node <plugin-root>/scripts/supermaestro.js check-contracts <workbench>
node <plugin-root>/scripts/supermaestro.js check-contracts <workbench> --strict true
node <plugin-root>/scripts/supermaestro.js source-revision <workbench> [--source-root <git-worktree>]
```

门禁命令：

```bash
node <plugin-root>/scripts/supermaestro.js approve-scope <workbench> --confirmed-by user --confirmation "<用户确认原话或摘要>"
node <plugin-root>/scripts/supermaestro.js approve-plan <workbench> --mode main-serial --confirmed-by user --confirmation "<用户确认原话或摘要>"
node <plugin-root>/scripts/supermaestro.js request-review <workbench>
node <plugin-root>/scripts/supermaestro.js approve-review <workbench> --review true --validation true
node <plugin-root>/scripts/supermaestro.js request-final <workbench>
node <plugin-root>/scripts/supermaestro.js approve-final <workbench> --confirmed-by user --confirmation "<用户确认最终动作>" --merge false --commit false --push false --cleanup false
```

旧命令继续可用，但仅作为兼容别名：

```text
approve-gate1 -> approve-scope
approve-gate2 -> approve-plan
request-gate3 -> request-review
approve-gate3 -> approve-review
request-gate4 -> request-final
approve-gate4 -> approve-final
```

编码和最终动作检查：

```bash
node <plugin-root>/scripts/supermaestro.js check <workbench> --action code --non-ui true --reason "只改接口或非视觉逻辑"
node <plugin-root>/scripts/supermaestro.js check <workbench> --action code --ui true --schema-extract specs/ui-schema-extract.md
node <plugin-root>/scripts/supermaestro.js check <workbench> --action dispatch-subagent
node <plugin-root>/scripts/supermaestro.js verify <workbench> --strict true
node <plugin-root>/scripts/supermaestro.js check <workbench> --action commit
node <plugin-root>/scripts/supermaestro.js check <workbench> --action push
```

结构化 E2E 与视觉验证：

1. 在 `specs/machine/validation-contract.json` 顶层声明 `sourceRoot`（相对于工作台或指向 Git 工作树的绝对路径），运行 `source-revision` 得到 `git-working-tree:<sha256>` 后写入 `sourceRevision`，再逐项声明必测用例。E2E 用例需要 `id`、`platform`、`dataMode`、`command`、`expected`；视觉用例还需要 `sourceRef`、`target`、`purpose`、`baseline`、`baselineHash` 和 `maxDiffRatio`。
2. 使用项目已有的测试运行器执行测试，不由核心工作流安装或绑定特定浏览器、微信开发者工具或像素差异引擎。
3. 用 `evidence` 命令记录 `test.e2e` / `test.visual`。数据模式只允许 `fixture`、`mock-api`、`uat`、`real`，不得混写验证结论。
4. 每条视觉证据（包括 `blocked`）只覆盖一个用例；非 `blocked` 证据记录基线清单、`expected`、`actual`、`diff`、用途、哈希值、差异比例、阈值和遮罩信息，且 `expected` 必须指向契约中的 `baseline` 并匹配 `baselineHash`。
5. `source-revision` 会按 Git 工作树中已跟踪和未忽略的未跟踪内容计算，并排除工作台；`verify` 会现场重算，因此源码变化会使旧证据失效。非 `blocked` 证据的 `--source-revision` 必须匹配契约。CLI 还会绑定 `contractHash` 和产物的 SHA-256；契约、源码或产物变化后必须重新运行验证。
6. `blocked` 证据必须写明原因，并同时传入 `--accepted-skip true --confirmed-by user --confirmation "<用户确认>"` 才能通过 `verify`；`reports/evidence.jsonl` 存在格式错误的 JSON 行时，必须采用失败关闭策略。

```bash
node <plugin-root>/scripts/supermaestro.js evidence <workbench> --type test.e2e --platform weapp --data-mode uat --command "<实际命令>" --result passed --required 1 --executed 1 --passed 1 --failed 0 --case-ids E2E-1 --artifacts "<产物路径>" --report "<报告路径>" --exit-code 0 --source-revision "<contract.sourceRevision>"
node <plugin-root>/scripts/supermaestro.js evidence <workbench> --type test.visual --platform weapp --data-mode fixture --command "<实际命令>" --result passed --required 1 --executed 1 --passed 1 --failed 0 --case-ids VIS-1 --artifacts "<产物路径>" --report "<报告路径>" --exit-code 0 --source-revision "<contract.sourceRevision>" --baseline-manifest "<manifest>" --actual "<actual>" --expected "<contract中的baseline路径>" --diff "<diff>" --purpose design-conformance --baseline-hash "<contract中的sha256>" --diff-ratio 0 --max-diff-ratio 0.05
node <plugin-root>/scripts/supermaestro.js evidence <workbench> --type test.e2e --platform weapp --data-mode uat --result blocked --case-ids "<contract-case-id>" --reason "测试账号暂不可用，用户接受本次跳过" --accepted-skip true --confirmed-by user --confirmation "用户确认接受本次 E2E 跳过"
```

需要执行细则时，按任务选用 `validate-weapp-e2e` 或 `validate-visual-regression`；Mission Control 只负责触发器、契约、证据和门禁约束。

## 门禁语义

### 范围门禁

确认用户和 AI 对需求范围、非范围、验收场景及关键假设理解一致。`lite` 使用 `brief.md`，`standard` / `strict` 使用 `context.md` 与 `specs/requirement-alignment.md`。

CLI 强制校验规则：

- `approve-scope` 要求 `--confirmed-by user` 和 `--confirmation`。
- `check-workbench` 会检查 `lite` 模式的需求简述或需求对齐文档。

### 计划门禁

确认执行模式、任务依赖图（DAG）、审查包策略和验证策略。

CLI 强制校验规则：

- `approve-plan` 要求范围门禁已批准。
- `approve-plan` 要求 `plans/task-plan.md`、`plans/progress.md`、`reviews/review-packs.md`、`reports/validation.md`。
- `plans/task-plan.md` 不能保留 `pending`、`TODO`、`待补` 或 `待确认` 等未收敛占位。
- `strict` 模式会自动执行 `check-contracts` 严格检查。

### 审查门禁

确认审查包和验证证据可以进入人工审查。

CLI 强制校验规则：

- `request-review` 要求计划门禁已批准。
- `request-review` 先执行 `verify`；`approve-review` 在批准前再次执行 `verify`，防止等待期间契约、证据或产物失效。
- `verify` 会检查审查包、验证报告、严格模式契约，以及每个已启用的用例所对应的最新结构化证据。
- `strict` 模式下，审查门禁不接受只有 `pending` 状态、没有代码差异、补丁、分支或 PR 的审查包。
- 启用审查智能体时，`strict` 模式要求存在结构化的 `agent-approved` 或 `not-needed` 结论，且不能保留 `pending` 或 `changes-requested`。

### 最终门禁

确认 `commit`、`merge`、`push`、`cleanup` 等最终动作。

CLI 强制校验规则：

- `request-final` 要求审查门禁已批准，`lite` 模式要求范围门禁已批准；`request-final` 与 `approve-final` 都会重新执行 `verify`，防止最终门禁等待期间契约、证据或产物失效。
- `approve-final` 要求独立 `--confirmed-by user` 和 `--confirmation`。
- `check --action commit|merge|push|cleanup` 在最终动作授权前也会再次执行 `verify`。

## 严格模式契约校验

`strict` 模式的强制规则：

- 计划门禁前，存在 UI 物料时需要 `specs/ui-contract.md`、`specs/machine/ui-contract.json`、`specs/ui-material-index.md`、`specs/ui-schema-extract.md`，并要求 `ui-schema-extract.md` 内含标准的 Schema 到实现映射表；旧工作台可回退使用 `specs/ui-contract.json` 与 `specs/ui-schema-map.md`。
- 计划门禁前，存在 API 物料时需要 `specs/api-contract.md` 与 `specs/machine/api-contract.json`；旧工作台可回退使用 `specs/api-contract.json`。
- 同时存在 API + UI 时，需要 `page-contract-matrix.md`。
- 显式传入 `e2e=true` 或 `visual=true` 后，需要在契约顶层提供 `sourceRoot` 和由 CLI 计算的 `sourceRevision`，且对应分区至少包含一个合法用例；视觉用例还需提供合法的 `purpose`、`baseline` 和 `baselineHash`。验证结果必须由与现场源码指纹、当前 `contractHash` 和产物哈希相匹配的证据覆盖。
- `behavior=true` 或 `strict` 模式需要 `behavior-contract.md`；无复杂行为时允许用明确结论收敛，例如“结论：无状态机、权限、缓存、并发行为变更。”
- `standard` / `strict` 模式或 `review=true` 时，需要 `reviews/review-packs.md` 内含审查契约表；旧工作台可回退使用 `specs/review-contract.md`。机器 JSON 可放在 `specs/machine/review-contract.json`。
- UI 编码前需要 `schema-extract`；`strict` 模式要求 `schema-extract` 内含标准映射表，旧工作台可回退使用 `schema-map`。
- 行为变更任务需要在任务卡和验证报告中记录 TDD 适用性；跳过或延后时必须写明原因、风险和补测动作。
- 审查门禁前需要可审查产物；计划阶段可以保留 `pending` 状态。

## UI、API 与行为实现建议

- 有 `source/ui/manifest.json` 时，建议先运行 `inspect-ui.js <workbench> --write-index true` 生成 UI 物料索引。
- 有 `source/ui/schemas/*.json` 时，建议按 Sketch Data 提取节点级布局、文本、颜色、资源和状态差异，并维护 Schema 到实现的映射表。
- 强视觉节点建议优先绑定设计资源或 OSS 资源；资源缺失时记录 `blocked`，不建议用 CSS 近似替代。
- 有 API 物料时，建议在 `api-contract.md` 与 `specs/machine/api-contract.json` 中记录接口、字段、`loading` / `empty` / `error` 状态、`mock` 和 `no-change` 结论。
- 有状态机、权限、跳转、缓存、并发或异常分支时，建议维护 `behavior-contract.md`。
- 有关键用户链路时启用 E2E 触发器；有设计还原或视觉回归要求时启用视觉验证触发器，并确保每个 PRD 或画板状态都有独立用例和可定位产物。

## 审查与交接建议

- 每个编码任务建议形成独立审查包。
- 预计超过 5-8 个文件或跨多个功能面时，建议继续拆分。
- 审查包建议指向真实的代码差异、补丁、分支或 PR。
- 不建议自动执行 `commit`。编码完成后保留未提交改动供审查；用户明确授权后，再执行 `commit`、`merge`、`push` 或清理工作树。

## 触发示例

- “用 `mission-control` 处理这个需求，先拆任务，不要写代码。”
- “按 `strict` 模式处理这个多页面 UI + API 需求。”
- “先读 PRD，生成 `source/` 与 `workbench/`，到范围门禁后停下。”
- “先到计划门禁，让我确认任务拆分和是否启用子智能体。”
- “检查这个工作台的契约是否满足 `strict` 模式要求。”
