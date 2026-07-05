# SuperMaestro

SuperMaestro 是一个 Codex 插件，用来把 PRD、接口文档、蓝湖/UI 物料整理成可审查、可暂停、可恢复的需求工作台，并通过 Scope / Plan / Review / Final Gate、Review Pack 和验证记录推进研发任务。

## Workflow modes

SuperMaestro 支持三种模式：

| Mode | 场景 | Gate |
| --- | --- | --- |
| `lite` | 小 bug、小文案、小样式、低风险改动 | Scope + Final |
| `standard` | 普通前端需求 | Scope + Plan + Review + Final |
| `strict` | 多页面、多画板、强 UI、接口契约、高风险任务 | Scope + Plan + Review + Final，并启用更严格 evidence |

## 核心原则

- `state.json + events.jsonl` 是机器状态。
- Markdown 是人类审阅投影。
- CLI enforcement 强于 prompt 规则。
- Superpowers 默认作为 `superpowers` policy pack 启用。
- Artifact 按 trigger 生成，不为了完整性生成空文档。

## 快速开始

```bash
node plugins/supermaestro/scripts/supermaestro.js init documents/demo/workbench --name "Demo" --mode standard
node plugins/supermaestro/scripts/supermaestro.js scaffold documents/demo/workbench --api true --ui true
node plugins/supermaestro/scripts/supermaestro.js check-workbench documents/demo/workbench
node plugins/supermaestro/scripts/supermaestro.js check-contracts documents/demo/workbench
node plugins/supermaestro/scripts/supermaestro.js approve-scope documents/demo/workbench --confirmed-by user --confirmation "用户确认需求理解和范围"
node plugins/supermaestro/scripts/supermaestro.js evidence documents/demo/workbench --type skill.used --skill superpowers:writing-plans --phase plan --summary "已应用 writing-plans 拆分任务"
node plugins/supermaestro/scripts/supermaestro.js approve-plan documents/demo/workbench --mode main-serial --confirmed-by user --confirmation "用户确认计划和执行模式"
node plugins/supermaestro/scripts/supermaestro.js check documents/demo/workbench --action code --non-ui true --reason "只改接口逻辑不涉及视觉"
node plugins/supermaestro/scripts/supermaestro.js verify documents/demo/workbench --strict true
node plugins/supermaestro/scripts/supermaestro.js request-review documents/demo/workbench
node plugins/supermaestro/scripts/supermaestro.js approve-review documents/demo/workbench --review true --validation true
node plugins/supermaestro/scripts/supermaestro.js request-final documents/demo/workbench
node plugins/supermaestro/scripts/supermaestro.js approve-final documents/demo/workbench --confirmed-by user --confirmation "用户确认最终动作" --merge false --commit false --push false --cleanup false
```

兼容旧命令：

```text
approve-gate1 -> approve-scope
approve-gate2 -> approve-plan
request-gate3 -> request-review
approve-gate3 -> approve-review
request-gate4 -> request-final
approve-gate4 -> approve-final
```

## Artifact triggers

| Trigger | Artifact |
| --- | --- |
| all modes | `state.json`, `events.jsonl`, `reports/evidence.jsonl`, `reports/validation.md` |
| `lite` | `brief.md` |
| `standard` / `strict` | `context.md`, `specs/requirement-alignment.md`, `plans/task-plan.md`, `plans/progress.md`, `reviews/review-packs.md` |
| API material | `specs/api-contract.md`, `specs/api-contract.json` |
| UI manifest | `specs/ui-contract.md`, `specs/ui-contract.json`, `specs/ui-material-index.md` |
| UI coding | `specs/ui-schema-extract.md`, `specs/ui-schema-map.md` |
| API + UI | `specs/page-contract-matrix.md` |
| behavior risk | `specs/behavior-contract.md` |
| worktree / subagents / review agent | `worktrees/`, `agents/`, `reviews/code-review/` |

## Superpowers policy

SuperMaestro 默认启用 `plugins/supermaestro/policies/superpowers.policy.json`。Core workflow 不直接硬编码每个阶段的 Superpowers 要求，而是通过 policy 检查 evidence。

机器证据优先记录到：

```text
workbench/reports/evidence.jsonl
```

迁移期仍兼容 `reports/validation.md`、`plans/task-plan.md`、`plans/progress.md` 和 `reviews/review-packs.md` 中的旧式文本证据。

## 收尾规则 / Strict mode

`strict` mode 用于多页面、多画板、强 UI、接口契约和高风险任务。相比 `standard`，它会在 Plan Gate 前 hard check contracts，在 UI coding 前要求 `ui-schema-map`，在 Review Gate 前要求 review pack 指向真实 diff / patch / branch / PR。

Final Gate 仍需要独立人工确认：

```bash
node plugins/supermaestro/scripts/supermaestro.js request-final documents/demo/workbench
node plugins/supermaestro/scripts/supermaestro.js approve-final documents/demo/workbench --confirmed-by user --confirmation "用户确认最终动作" --merge false --commit false --push false --cleanup false
```

## Contract validation

手动检查 contracts：

```bash
node plugins/supermaestro/scripts/supermaestro.js check-contracts documents/demo/workbench
node plugins/supermaestro/scripts/supermaestro.js check-contracts documents/demo/workbench --strict true
```

检查项包括：

- UI: `ui-contract.md/json`、`ui-material-index.md`、`ui-schema-extract.md`、`ui-schema-map.md`
- API: `api-contract.md/json`
- Behavior: `behavior-contract.md`
- Review: `review-contract.md` 或 `reviews/review-packs.md`

`strict` mode 下失败会阻塞；`standard` 默认以 warning 形式辅助人工 review。
