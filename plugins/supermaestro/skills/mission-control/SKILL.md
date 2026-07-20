---
name: mission-control
description: Use when a medium or large software requirement needs staged planning, resumable workflow state, human gates, review packs, worktree isolation, subagent coordination, source/workbench materials, strict validation, or handoff.
---

# Mission Control

把一个中大型需求转成可审查、可暂停、可恢复的研发流程。主控负责上下文、任务边界、Gate 决策、进度和集成；子 agent 只执行任务卡限定的工作。

## 先读规则

- 先读取插件内 `profiles/core-workflow.md`，它是 workflow mode、状态、Gate、policy、contract 和 validation 的核心规则。
- 当目标项目是 Taro 小程序/H5 且存在蓝湖 schema 物料时，再读取 `profiles/weapp-taro-lanhu.md`。
- 关键动作优先通过 `plugins/supermaestro/scripts/supermaestro.js` 检查；脚本拒绝时停止并报告原因。

## Workflow Modes

| Mode | 场景 | Gate |
| --- | --- | --- |
| `lite` | 小 bug、小文案、小样式、低风险改动 | Scope + Final |
| `standard` | 普通前端需求 | Scope + Plan + Review + Final |
| `strict` | 多页面、多画板、强 UI、接口契约、高风险任务 | Scope + Plan + Review + Final，并启用更严格 evidence / contract enforcement |

默认使用 `standard`。小需求可用 `lite`，高风险前端需求或强 UI/API/Behavior 契约需求使用 `strict`。

## 状态与证据

机器状态优先由 CLI 维护：

```text
workbench/state.json              # 当前 workflow 状态
workbench/events.jsonl            # append-only 事件日志
workbench/mission.state.json      # resume/next 投影
workbench/gates/*.json            # Gate 决策
workbench/reports/evidence.jsonl  # 机器 evidence 主源
workbench/specs/machine/*.json    # 机器 contract JSON
```

Markdown 是人类投影和 review 材料，不是机器证据主源：

```text
workbench/context.md
workbench/specs/*.md
workbench/plans/task-plan.md
workbench/plans/progress.md
workbench/reviews/review-packs.md
workbench/reports/validation.md
```

`specs/` 顶层放人类主文档，`specs/machine/` 放机器 contract JSON。`specs/ui-schema-extract.md` 同时是 UI schema 节点提取和 Schema 到实现映射主文档；`reviews/review-packs.md` 是 Review Contract 主入口；启用 E2E / visual trigger 时，`specs/machine/validation-contract.json` 是必测 case 主源。

迁移期 CLI 仍兼容 `reports/validation.md`、`plans/task-plan.md`、`plans/progress.md`、`reviews/review-packs.md` 中的旧式 Superpowers 文本证据。新流程优先使用：

```bash
node <plugin-root>/scripts/supermaestro.js evidence <workbench> --type skill.used --skill superpowers:writing-plans --phase plan --summary "已应用 writing-plans 拆分任务"
```

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

## CLI Flow

初始化：

```bash
node <plugin-root>/scripts/supermaestro.js init <workbench> --name "<需求名>" --mode <lite|standard|strict>
```

按 trigger 生成 artifact：

```bash
node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --api true --ui true --ui-coding true --behavior true
```

`scaffold` 只按实际 trigger 生成文档和目录，不为了完整性生成空目录或无用文档。需要 E2E / 视觉验证时，在同一命令中显式追加 `--e2e true` / `--visual true`。

E2E 和 visual 都只在显式传入 `true` 时启用，`strict + UI` 不会自动开启。一旦启用，重复 scaffold 会永久保留对应 trigger，后续传入 `--e2e false` / `--visual false` 也不会降级。

如果在 Plan / Review / Final 后首次新增 E2E 或 visual trigger，`standard` / `strict` 会回退到 Plan pending 并锁定 Review / Final；`lite` 会撤销已请求或已批准的 Final，重新锁回 Final 验证流程。

检查工作台与契约：

```bash
node <plugin-root>/scripts/supermaestro.js check-workbench <workbench>
node <plugin-root>/scripts/supermaestro.js check-contracts <workbench>
node <plugin-root>/scripts/supermaestro.js check-contracts <workbench> --strict true
node <plugin-root>/scripts/supermaestro.js source-revision <workbench> [--source-root <git-worktree>]
```

Gate 命令：

```bash
node <plugin-root>/scripts/supermaestro.js approve-scope <workbench> --confirmed-by user --confirmation "<用户确认原话或摘要>"
node <plugin-root>/scripts/supermaestro.js approve-plan <workbench> --mode main-serial --confirmed-by user --confirmation "<用户确认原话或摘要>"
node <plugin-root>/scripts/supermaestro.js request-review <workbench>
node <plugin-root>/scripts/supermaestro.js approve-review <workbench> --review true --validation true
node <plugin-root>/scripts/supermaestro.js request-final <workbench>
node <plugin-root>/scripts/supermaestro.js approve-final <workbench> --confirmed-by user --confirmation "<用户确认最终动作>" --merge false --commit false --push false --cleanup false
```

旧命令继续可用，但只是 compatibility aliases：

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

结构化 E2E / 视觉验证：

1. 在 `specs/machine/validation-contract.json` 顶层声明 `sourceRoot`（相对 workbench 或绝对 Git worktree），运行 `source-revision` 得到 `git-working-tree:<sha256>` 后写入 `sourceRevision`，再逐项声明必测 case。E2E case 需要 `id`、`platform`、`dataMode`、`command`、`expected`；视觉 case 还需要 `sourceRef`、`target`、`purpose`、`baseline`、`baselineHash` 和 `maxDiffRatio`。
2. 使用项目已有 runner 执行测试，不由 core workflow 安装或绑定特定浏览器、微信开发者工具或像素差异引擎。
3. 用 `evidence` 命令记录 `test.e2e` / `test.visual`。数据模式只允许 `fixture`、`mock-api`、`uat`、`real`，不得混写验证结论。
4. 每条视觉 evidence（包括 blocked）只覆盖一个 case；非 blocked evidence 记录 baseline manifest、expected、actual、diff、用途、hash、差异比例、阈值和 mask 信息，且 `expected` 必须指向 contract baseline 并匹配 `baselineHash`。
5. `source-revision` 会按 Git worktree 的 tracked + non-ignored untracked 内容计算并排除 workbench；`verify` 会现场重算，因此源码变化会使旧 evidence 失效。非 blocked evidence 的 `--source-revision` 必须匹配 contract。CLI 还会绑定 `contractHash` 和产物 SHA-256；contract、源码或产物变化后必须重跑。
6. blocked evidence 必须写明原因，并同时传入 `--accepted-skip true --confirmed-by user --confirmation "<用户确认>"` 才能通过 `verify`；`reports/evidence.jsonl` 存在 malformed JSON 行时 fail closed。

```bash
node <plugin-root>/scripts/supermaestro.js evidence <workbench> --type test.e2e --platform weapp --data-mode uat --command "<实际命令>" --result passed --required 1 --executed 1 --passed 1 --failed 0 --case-ids E2E-1 --artifacts "<产物路径>" --report "<报告路径>" --exit-code 0 --source-revision "<contract.sourceRevision>"
node <plugin-root>/scripts/supermaestro.js evidence <workbench> --type test.visual --platform weapp --data-mode fixture --command "<实际命令>" --result passed --required 1 --executed 1 --passed 1 --failed 0 --case-ids VIS-1 --artifacts "<产物路径>" --report "<报告路径>" --exit-code 0 --source-revision "<contract.sourceRevision>" --baseline-manifest "<manifest>" --actual "<actual>" --expected "<contract中的baseline路径>" --diff "<diff>" --purpose design-conformance --baseline-hash "<contract中的sha256>" --diff-ratio 0 --max-diff-ratio 0.05
node <plugin-root>/scripts/supermaestro.js evidence <workbench> --type test.e2e --platform weapp --data-mode uat --result blocked --case-ids "<contract-case-id>" --reason "测试账号暂不可用，用户接受本次跳过" --accepted-skip true --confirmed-by user --confirmation "用户确认接受本次 E2E 跳过"
```

需要执行细则时按任务选用 `validate-weapp-e2e` 或 `validate-visual-regression`；Mission Control 只负责 trigger、contract、evidence 和 Gate enforcement。

## Gate 语义

### Scope Gate

确认人和 AI 对需求范围、非范围、验收场景、关键假设一致。`lite` 使用 `brief.md`，`standard` / `strict` 使用 `context.md` 与 `specs/requirement-alignment.md`。

CLI enforcement:

- `approve-scope` 要求 `--confirmed-by user` 和 `--confirmation`。
- `check-workbench` 会检查 `lite` brief 或需求对齐文档。

### Plan Gate

确认执行模式、任务 DAG、review pack 策略、验证策略和 policy evidence。

CLI enforcement:

- `approve-plan` 要求 Scope approved。
- `approve-plan` 要求 `plans/task-plan.md`、`plans/progress.md`、`reviews/review-packs.md`、`reports/validation.md`。
- policy 要求 `superpowers:writing-plans` evidence。
- `strict` mode 会自动执行 `check-contracts` hard check。

### Review Gate

确认 review pack 和验证证据可以进入人工 review。

CLI enforcement:

- `request-review` 要求 Plan approved。
- `request-review` 先执行 `verify`；`approve-review` 在批准前再次执行 `verify`，防止等待期间 contract、evidence 或产物失效。
- `verify` 要求 `superpowers:verification-before-completion` evidence；启用 E2E / visual trigger 时，还会核对 validation contract 与每个 case 的最新结构化 evidence。
- `strict` mode 下 Review Gate 不接受只有 pending、没有 diff/patch/branch/PR 的 review pack。
- 启用 review agent 时，`strict` mode 要求 `superpowers:requesting-code-review` evidence。

### Final Gate

确认 commit、merge、push、cleanup 等最终动作。

CLI enforcement:

- `request-final` 要求 Review approved，`lite` 要求 Scope approved；`request-final` 与 `approve-final` 都会重新执行 `verify`，防止 Final Gate 等待期间 contract、evidence 或产物失效。
- `request-final` / `approve-final` 要求 `verification-before-completion` 与 `finishing-a-development-branch` evidence。
- `approve-final` 要求独立 `--confirmed-by user` 和 `--confirmation`。
- `check --action commit|merge|push|cleanup` 在最终动作授权前也会再次执行 `verify`。

## Strict Mode Contract Validation

`strict` mode 的 hard rules:

- Plan Gate 前，UI material 需要 `specs/ui-contract.md`、`specs/machine/ui-contract.json`、`specs/ui-material-index.md`、`specs/ui-schema-extract.md`，并要求 `ui-schema-extract.md` 内含标准 Schema 到实现映射表；旧工作台可 fallback 到 `specs/ui-contract.json` 与 `specs/ui-schema-map.md`。
- Plan Gate 前，API material 需要 `specs/api-contract.md` 与 `specs/machine/api-contract.json`；旧工作台可 fallback 到 `specs/api-contract.json`。
- 同时存在 API + UI 时，需要 `page-contract-matrix.md`。
- 显式 `e2e=true` 或 `visual=true` 后，需要 contract 顶层 `sourceRoot` 和 CLI 计算的 `sourceRevision`，且对应 section 至少包含一个合法 case；视觉 case 还需合法 `purpose`、baseline 和 `baselineHash`。验证结果由匹配现场源码指纹、当前 `contractHash` 和产物哈希的 evidence 覆盖。
- `behavior=true` 或 `strict` mode 需要 `behavior-contract.md`；无复杂行为时允许用明确结论收敛，例如“结论：无状态机、权限、缓存、并发行为变更。”
- `standard` / `strict` 或 `review=true` 需要 `reviews/review-packs.md` 内含 Review Contract 表；旧工作台可 fallback 到 `specs/review-contract.md`。机器 JSON 可放 `specs/machine/review-contract.json`。
- UI coding 前需要 `schema-extract`；`strict` mode 要求 `schema-extract` 内含标准映射表，旧工作台可 fallback 到 `schema-map`。
- `strict` mode 下 `superpowers:test-driven-development` 需要真实 used evidence，不接受仅 skipped-with-reason。
- Review Gate 前需要可审查 artifact；Plan 阶段可以 pending。

## Superpowers Policy

Superpowers 不是被移除，而是作为默认 `superpowers` policy pack 启用。Core workflow 负责状态机、Gate、artifact、action authorization 和 evidence 读取；policy 负责声明阶段方法论要求。

常用 evidence：

```bash
node <plugin-root>/scripts/supermaestro.js evidence <workbench> --type skill.used --skill superpowers:writing-plans --phase plan --summary "已应用 writing-plans"
node <plugin-root>/scripts/supermaestro.js evidence <workbench> --type skill.used --skill superpowers:test-driven-development --phase code --summary "已评估 TDD"
node <plugin-root>/scripts/supermaestro.js evidence <workbench> --type skill.used --skill superpowers:verification-before-completion --phase review --summary "已完成验证"
node <plugin-root>/scripts/supermaestro.js evidence <workbench> --type skill.used --skill superpowers:finishing-a-development-branch --phase final --summary "已完成收尾检查"
```

## UI / API / Behavior 建议

- 有 `source/ui/manifest.json` 时，建议先运行 `inspect-ui.js <workbench> --write-index true` 生成 UI 物料索引。
- 有 `source/ui/schemas/*.json` 时，建议按 Sketch Data 提取节点级布局、文本、颜色、资源和状态差异，并维护 Schema 到实现映射表。
- 强视觉节点建议优先绑定设计资源或 OSS 资源；资源缺失时记录 blocked，不建议用 CSS 近似替代。
- 有 API 物料时，建议在 `api-contract.md` 与 `specs/machine/api-contract.json` 中记录接口、字段、loading/empty/error、mock 和 no-change 结论。
- 有状态机、权限、跳转、缓存、并发或异常分支时，建议维护 `behavior-contract.md`。
- 有关键用户链路时启用 E2E trigger；有设计还原或视觉回归要求时启用 visual trigger，并确保每个 PRD/画板状态都有独立 case 和可定位产物。

## Review 与交接建议

- 每个编码任务建议形成独立 review pack。
- 预计超过 5-8 个文件或跨多个功能面时，建议继续拆分。
- Review pack 建议指向真实 diff、patch、branch 或 PR。
- 不建议自动 commit。编码完成后保留未提交改动供 review；用户明确授权后再 commit、merge、push 或清理 worktree。

## 触发示例

- “用 mission-control 处理这个需求，先拆任务，不要写代码。”
- “按 strict mode 跑这个多页面 UI + API 需求。”
- “先读 PRD，生成 source/workbench，到 Scope Gate 停下。”
- “先到 Plan Gate，让我确认任务拆分和是否开 subagent。”
- “检查这个 workbench 的 contracts 是否满足 strict mode。”
