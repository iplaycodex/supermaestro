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

`specs/` 顶层放人类主文档，`specs/machine/` 放机器 contract JSON。`specs/ui-schema-extract.md` 同时是 UI schema 节点提取和 Schema 到实现映射主文档；`reviews/review-packs.md` 是 Review Contract 主入口。

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

`scaffold` 只按实际 trigger 生成文档和目录，不为了完整性生成空目录或无用文档。

检查工作台与契约：

```bash
node <plugin-root>/scripts/supermaestro.js check-workbench <workbench>
node <plugin-root>/scripts/supermaestro.js check-contracts <workbench>
node <plugin-root>/scripts/supermaestro.js check-contracts <workbench> --strict true
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
- `verify` 要求 `superpowers:verification-before-completion` evidence。
- `strict` mode 下 Review Gate 不接受只有 pending、没有 diff/patch/branch/PR 的 review pack。
- 启用 review agent 时，`strict` mode 要求 `superpowers:requesting-code-review` evidence。

### Final Gate

确认 commit、merge、push、cleanup 等最终动作。

CLI enforcement:

- `request-final` 要求 Review approved，`lite` 要求 Scope approved 并通过 verify。
- `request-final` / `approve-final` 要求 `verification-before-completion` 与 `finishing-a-development-branch` evidence。
- `approve-final` 要求独立 `--confirmed-by user` 和 `--confirmation`。

## Strict Mode Contract Validation

`strict` mode 的 hard rules:

- Plan Gate 前，UI material 需要 `specs/ui-contract.md`、`specs/machine/ui-contract.json`、`specs/ui-material-index.md`、`specs/ui-schema-extract.md`，并要求 `ui-schema-extract.md` 内含标准 Schema 到实现映射表；旧工作台可 fallback 到 `specs/ui-contract.json` 与 `specs/ui-schema-map.md`。
- Plan Gate 前，API material 需要 `specs/api-contract.md` 与 `specs/machine/api-contract.json`；旧工作台可 fallback 到 `specs/api-contract.json`。
- 同时存在 API + UI 时，需要 `page-contract-matrix.md`。
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
