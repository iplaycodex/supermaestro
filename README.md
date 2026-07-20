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
- `specs/` 顶层放人类主文档，`specs/machine/` 放机器 contract JSON。
- Markdown 是人类审阅投影。
- CLI enforcement 强于 prompt 规则。
- Superpowers 默认作为 `superpowers` policy pack 启用。
- Artifact 按 trigger 生成，不为了完整性生成空文档。
- E2E / 视觉验证先在 validation contract 中声明必测 case，再用结构化 evidence 记录实际执行结果。

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
| API material | `specs/api-contract.md`, `specs/machine/api-contract.json` |
| UI manifest | `specs/ui-contract.md`, `specs/machine/ui-contract.json`, `specs/ui-material-index.md` |
| UI coding | `specs/ui-schema-extract.md`，同时承载 UI schema 节点提取和 Schema 到实现映射表 |
| API + UI | `specs/page-contract-matrix.md` |
| behavior risk | `specs/behavior-contract.md` |
| E2E / visual validation | `specs/machine/validation-contract.json`；执行证据写入 `reports/evidence.jsonl` |
| review | `reviews/review-packs.md`，同时作为 Review Contract 主入口；机器 JSON 放 `specs/machine/review-contract.json` |
| worktree / subagents / review agent | `worktrees/`, `agents/`, `reviews/code-review/` |

E2E 和 visual 都是显式 trigger，只有传入 `--e2e true` / `--visual true` 才会启用，`strict + UI` 也不会自动开启：

```bash
node plugins/supermaestro/scripts/supermaestro.js scaffold documents/demo/workbench --api true --ui true --e2e true --visual true
```

E2E / visual trigger 一旦启用，后续重复执行 `scaffold`（包括传入 `--e2e false` / `--visual false`）都不会降级，避免既有验证义务被静默移除。

如果在 Plan / Review / Final 之后首次新增 E2E 或 visual trigger，`standard` / `strict` 会回退到 Plan pending，并锁定 Review / Final；`lite` 会撤销已请求或已批准的 Final，重新锁回 Final 验证流程。

## E2E / 视觉验证证据

启用 E2E 或 visual 后，先填写 `specs/machine/validation-contract.json`。Contract 顶层 `sourceRoot` 和 `sourceRevision` 都必填：`sourceRoot` 可写相对 workbench 的路径或绝对 Git worktree 路径，但不能等于 workbench 或位于 workbench 内；workbench 可以位于 source repo 内并会被指纹计算排除。`sourceRevision` 必须由 SuperMaestro 计算，每条非 blocked evidence 的 `--source-revision` 必须与其一致。每个 case 都要声明 `id`、`platform`、`dataMode`、`command` 和 `expected`；视觉 case 还要声明设计来源、目标页面/状态、`purpose`、baseline、baseline SHA-256 和最大差异比例。视觉 evidence 的 `expected` 必须指向 contract 中的 baseline，文件内容必须匹配 `baselineHash`。`dataMode` 只能是 `fixture`、`mock-api`、`uat` 或 `real`，不同模式的证据不可互相冒充。

先设置 `sourceRoot`，再计算并把输出写入 contract 的 `sourceRevision`：

```bash
node plugins/supermaestro/scripts/supermaestro.js source-revision documents/demo/workbench --source-root "<git-worktree>"
```

输出格式为 `git-working-tree:<sha256>`。它基于 Git worktree 的 tracked + non-ignored untracked 内容计算，并排除 workbench；contract 已有 `sourceRoot` 时可省略 `--source-root`。

执行后通过 CLI 写入机器证据：

```bash
node plugins/supermaestro/scripts/supermaestro.js evidence documents/demo/workbench --type test.e2e --platform weapp --data-mode uat --command "<实际命令>" --result passed --required 1 --executed 1 --passed 1 --failed 0 --case-ids E2E-1 --artifacts "<产物路径>" --report "<报告路径>" --exit-code 0 --source-revision "<contract.sourceRevision>"
node plugins/supermaestro/scripts/supermaestro.js evidence documents/demo/workbench --type test.visual --platform weapp --data-mode fixture --command "<实际命令>" --result passed --required 1 --executed 1 --passed 1 --failed 0 --case-ids VIS-1 --artifacts "<产物路径>" --report "<报告路径>" --exit-code 0 --source-revision "<contract.sourceRevision>" --baseline-manifest "<manifest>" --actual "<actual>" --expected "<contract中的baseline路径>" --diff "<diff>" --purpose design-conformance --baseline-hash "<contract中的sha256>" --diff-ratio 0 --max-diff-ratio 0.05
node plugins/supermaestro/scripts/supermaestro.js evidence documents/demo/workbench --type test.e2e --platform weapp --data-mode uat --result blocked --case-ids "<contract-case-id>" --reason "测试账号暂不可用，用户接受本次跳过" --accepted-skip true --confirmed-by user --confirmation "用户确认接受本次 E2E 跳过"
```

每条 test evidence 会自动绑定写入时的当前 `contractHash`；非 blocked evidence 还会记录 report/artifacts 的 SHA-256，visual 额外覆盖 manifest、expected、actual、diff。`verify` 会按 `sourceRoot` 现场重算 source revision；源码变化、contract 变化或证据文件 hash 变化都会使旧 evidence 失效。视觉 evidence（包括 blocked）每条只能覆盖一个 case。`reports/evidence.jsonl` 任一非空行不是合法 JSON 时按失败处理。阻塞 case 只有同时提供 `--accepted-skip true --confirmed-by user --confirmation "<用户确认>"` 才能通过，不能将 Mock、静态检查或 HTTP 200 当成真实链路通过。

`request-review`、`approve-review`、`request-final`、`approve-final` 都会重新运行 `verify`，防止 Gate 等待期间契约、证据或产物发生变化。

最终动作也不会复用旧验证：`check --action commit|merge|push|cleanup` 会在授权前再次运行 `verify`。

## Superpowers policy

SuperMaestro 默认启用 `plugins/supermaestro/policies/superpowers.policy.json`。Core workflow 不直接硬编码每个阶段的 Superpowers 要求，而是通过 policy 检查 evidence。

机器证据优先记录到：

```text
workbench/reports/evidence.jsonl
```

迁移期仍兼容 `reports/validation.md`、`plans/task-plan.md`、`plans/progress.md` 和 `reviews/review-packs.md` 中的旧式文本证据。

## 收尾规则 / Strict mode

`strict` mode 用于多页面、多画板、强 UI、接口契约和高风险任务。相比 `standard`，它会在 Plan Gate 前 hard check contracts，在 UI coding 前要求 `ui-schema-extract.md` 内含标准 Schema 到实现映射表，在 Review Gate 前要求 review pack 指向真实 diff / patch / branch / PR。

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

- UI: `ui-contract.md`、`specs/machine/ui-contract.json`、`ui-material-index.md`、`ui-schema-extract.md`
- API: `api-contract.md`、`specs/machine/api-contract.json`
- Behavior: `behavior-contract.md`
- Validation: `specs/machine/validation-contract.json`（启用 E2E / visual trigger 时）
- Review: `reviews/review-packs.md`，兼容旧 `specs/review-contract.md`

`strict` mode 下失败会阻塞；`standard` 默认以 warning 形式辅助人工 review。

迁移期 `check-contracts` 仍 fallback 读取旧路径：`specs/api-contract.json`、`specs/ui-contract.json`、`specs/ui-schema-map.md`、`specs/review-contract.md`。
