# SuperMaestro

SuperMaestro 是一个 Codex 研发工作流插件。它把 PRD、API、蓝湖/UI 和测试资料整理成可审查、可暂停、可恢复的需求工作台，再通过 Scope、Plan、Review、Final 四道人工门禁推进实现和交付。

插件提供六个 Skill：

| Skill | 用途 |
| --- | --- |
| `$requirement-workbench` | 接收需求、归档物料、选择工作流模式并建立工作台 |
| `$prd-structure` | 把复杂 PRD 抽取为可追溯、可人工修正的事实包 |
| `$lanhu-export` | 按蓝湖版本分组导出画板清单和 schema |
| `$mission-control` | 管理计划、执行模式、门禁、Review Pack 和验证证据 |
| `$validate-weapp-e2e` | 运行项目自己的微信小程序 E2E，并记录结构化证据 |
| `$validate-visual-regression` | 按画板/状态执行设计还原或视觉回归验证 |

## 版本与兼容性

- 当前插件发行版本为 `2.0.1`，`package.json` 与 `.codex-plugin/plugin.json` 必须始终保持一致。
- 新工作台使用 `workflowVersion: 3`；它是 SuperMaestro 内部状态契约版本，不等于插件主版本。
- v2 工作台不会由 `status`、`resume` 或其他命令静默升级，只能显式重新运行
  `init <workbench>` 迁移。迁移保留原有 `source/` 和工作台物料；有效 Scope
  确认可保留，但 Plan、Review、Final、执行模式、旧验证快照、最终动作和
  worktree 所有权必须重新建立。旧状态缺少 `sourceRoot` 时，迁移命令还要
  传 `--source-root "<git-worktree>"`。
- 当前版本不声明兼容 OpenSpec，也不承诺 OpenSpec 文档、命令或状态的导入、导出及往返转换。后续如实现兼容层，应单独定义映射、冲突处理和迁移测试后再声明。
- 破坏现有 CLI、状态文件或 Gate 语义时应提升插件主版本；向后兼容的新能力提升次版本；文档和兼容性修复提升修订版本。正式发布时同时更新两个版本字段并运行版本一致性检查。

## 系统要求

运行插件需要：

- 支持 `codex plugin` 命令的 Codex CLI。
- Node.js `18` 或 `20`。
- Git 2.x；只有选择 worktree 执行模式时才需要 `git worktree`。

按需依赖：

- 蓝湖导出需要访问蓝湖接口，并由用户提供有效 Cookie 文件或 `LANHU_COOKIE`。
- 微信小程序 E2E、截图和像素对比使用目标项目已有的构建工具、微信开发者工具和测试运行器；SuperMaestro 不内置这些运行时。
- 本地执行官方插件/Skill 校验器需要 Python 3 和 PyYAML；普通插件运行不需要 Python。

## 安装

从 Git marketplace 安装：

```bash
codex plugin marketplace add iplaycodex/supermaestro --ref main
codex plugin list --marketplace supermaestro
codex plugin add supermaestro@supermaestro
```

本地开发时，也可以把仓库路径直接注册为 marketplace：

```bash
codex plugin marketplace add "<supermaestro-repo>"
codex plugin add supermaestro@supermaestro
```

安装后新建 Codex 任务，让新的 Skill 和插件元数据进入上下文。可用以下命令确认安装状态：

```bash
codex plugin list --json
```

## 更新

Git marketplace 先刷新快照：

```bash
codex plugin marketplace upgrade supermaestro
```

如果已安装插件仍显示旧版本，再重装插件缓存：

```bash
codex plugin remove supermaestro@supermaestro
codex plugin add supermaestro@supermaestro
```

本地 marketplace 没有远端快照可升级；修改源码后执行同样的 `remove` / `add`，再新建 Codex 任务。

## 卸载

只移除插件：

```bash
codex plugin remove supermaestro@supermaestro
```

不再需要该 marketplace 时，再移除 marketplace 配置：

```bash
codex plugin marketplace remove supermaestro
```

卸载不会删除目标仓库中的 `documents/<需求名>/source`、`workbench`、代码改动、分支或 worktree；这些产物仍由用户自行保留或清理。

## 两类模式

工作流模式决定需要经过哪些门禁：

| 模式 | 场景 | 门禁 |
| --- | --- | --- |
| `lite` | 小缺陷、小文案、小范围样式、低风险改动 | Scope + Final |
| `standard` | 普通软件需求 | Scope + Plan + Review + Final |
| `strict` | 多页面、多画板、强 UI、API 契约或高风险任务 | Scope + Plan + Review + Final，并严格校验契约和证据 |

执行模式在 Plan Gate 选择，决定代码放在哪里、是否并行：

| 执行模式 | 适用场景 |
| --- | --- |
| `main-serial` | 单一、低冲突、小范围改动 |
| `single-worktree-serial` | 需要隔离用户主工作区，但不需要并行 |
| `multi-worktree-parallel` | 多个边界独立的切片，可用 worktree 并行 |

工作流模式在 `init` 时选择。Scope Gate 批准后不得用 `scaffold` 或其他命令把模式降级来绕过 Plan/Review；确需改模式时，先说明原因并重新初始化工作台。执行模式必须根据任务依赖、预计文件数、公共契约和 Review Pack 成本选择，不能把中大型需求默认塞进 `main-serial`。

## 快速开始

```bash
node plugins/supermaestro/scripts/supermaestro.js init documents/demo/workbench --name "Demo" --mode standard
node plugins/supermaestro/scripts/supermaestro.js scaffold documents/demo/workbench --api true --ui true --worktree true
node plugins/supermaestro/scripts/supermaestro.js check-workbench documents/demo/workbench
node plugins/supermaestro/scripts/supermaestro.js approve-scope documents/demo/workbench --confirmed-by user --confirmation "用户确认需求理解和范围"
node plugins/supermaestro/scripts/supermaestro.js approve-plan documents/demo/workbench --execution-mode single-worktree-serial --worktree true --subagents false --confirmed-by user --confirmation "用户确认任务计划和执行模式"
node plugins/supermaestro/scripts/supermaestro.js check documents/demo/workbench --action create-worktree --target "../demo.worktrees/feature" --branch "codex/demo-feature" --base "main"
git -C "." worktree add -b "codex/demo-feature" "../demo.worktrees/feature" "main"
node plugins/supermaestro/scripts/supermaestro.js register-worktree documents/demo/workbench --target "../demo.worktrees/feature" --branch "codex/demo-feature" --base "main"
node plugins/supermaestro/scripts/supermaestro.js check documents/demo/workbench --action code --non-ui true --reason "本任务不改 UI"
node plugins/supermaestro/scripts/supermaestro.js run-verification documents/demo/workbench --target "../demo.worktrees/feature" --program npm --args-json '["test"]' --report reports/commands/npm-test.log
node plugins/supermaestro/scripts/supermaestro.js verify documents/demo/workbench --target "../demo.worktrees/feature"
node plugins/supermaestro/scripts/supermaestro.js request-review documents/demo/workbench --target "../demo.worktrees/feature"
node plugins/supermaestro/scripts/supermaestro.js approve-review documents/demo/workbench --target "../demo.worktrees/feature" --review-accepted true --validation-accepted true --confirmed-by user --confirmation "用户确认审查包和验证结论"
node plugins/supermaestro/scripts/supermaestro.js request-final documents/demo/workbench --target "../demo.worktrees/feature"
node plugins/supermaestro/scripts/supermaestro.js approve-final documents/demo/workbench --confirmed-by user --confirmation "用户确认只保留当前改动" --merge false --commit false --push false --cleanup false
```

以上命令展示顺序，不代表可以跳过文档填写和用户确认；每次 `check` / `approve-*` 前都要先完成对应阶段产物。

旧的 `approve-gate1`、`approve-gate2`、`request-gate3`、`approve-gate3`、`request-gate4`、`approve-gate4` 仅作为迁移期兼容别名；新工作台统一使用 Scope、Plan、Review、Final 命令。

## Gate 语义

### Scope Gate

Scope 只确认需求目标、范围、非范围、规则、关键假设和验收场景，不用任务拆分替代需求理解。

存在 API 入口时，应在 Scope 前尝试真实接口发现，并把来源、解析方式、清单和缺口记录到 `specs/api-spec.md`。无法访问但会影响范围、鉴权、关键字段或验收时，保持 `partial` / `blocked`，不要把接口发现推迟给编码任务。

### Plan Gate

Plan 确认任务 DAG、执行模式、Review Pack、TDD 适用性和验证策略。API 需求必须在此之前把本期可执行结论同步到 `specs/api-contract.md` 和对应的机器契约 JSON；`strict` 还会对契约内容执行更严格的失败关闭检查。

执行模式 trigger 必须在 Plan 批准前显式生成。单 worktree 先运行
`scaffold --worktree true`；真实多 agent 先运行：

```text
scaffold <workbench> --worktree true --subagents true --review-agent true
approve-plan <workbench> --execution-mode multi-worktree-parallel --worktree true --subagents true --review-agent true ...
```

启用 subagents 时，`approve-plan` 必须显式给出 `--review-agent true|false`；
选择 `true` 前也必须先 scaffold 对应 trigger。已启用 trigger 不得在 Plan
批准时降级。review-agent 是独立的只读预审能力；即使
`main-serial + subagents=false`，只要存在真实 RP/diff，也可以先
`scaffold --review-agent true`，再用
`approve-plan ... --execution-mode main-serial --review-agent true` 启用。

`strict + UI` 必须在 Plan 前形成明确的视觉验证决策：

- 需要设计还原或回归证明时，先启用 `scaffold --visual true`、填写 validation contract，再用 `approve-plan --visual-decision required`。
- 确实不适用时，用 `--visual-decision not-applicable --visual-reason "<原因与风险>"` 记录用户确认。
- 缺少基线或运行环境且又不能排除视觉风险时，记为 `blocked` 并保持 Plan pending；`approve-plan --visual-decision blocked` 会立即失败关闭。

### Worktree 创建与所有权登记

选择 worktree 执行模式后，每个目标都要经过同一组精确参数：

1. 先运行 `check --action create-worktree --target <path> --branch <branch> --base <ref>`，记录本次创建意图。
2. CLI 返回 `ALLOW` 后，由调用方执行实际的 `git worktree add`。
3. 创建成功后运行 `register-worktree <workbench> --target <path> --branch <branch> --base <ref>`。
4. CLI 通过 `git worktree list`、目标路径、branch 和 base 验真后，才把目标登记为本流程 owned worktree。

`--target` 可以是绝对路径，也可以是相对 `state.sourceRoot` 的路径；相对
路径不受当前 shell cwd 影响。CLI 在状态中只保存 canonical absolute 路径。
目标必须位于 `sourceRoot` 外，也不能位于系统临时目录；项目内
`.worktrees/` / `worktrees/` 不受支持。
调用实际 Git 命令时，应使用 registry 中的 canonical absolute target，或
通过 `git -C "<state.sourceRoot>" ...` 保证相对路径按同一源码根解析。

三个参数必须与 Plan 和实际 Git 状态一致。`register-worktree` 失败时，不得派发 worker、同步物料、创建 checkpoint commit，也不得把目标写成“本流程拥有”。

worktree 模式下，以下动作必须携带已登记的 `--target`：

```text
check <workbench> --action dispatch-subagent --target <path>
check <workbench> --action sync-materials --target <path>
check <workbench> --action checkpoint-commit --target <path>
```

SuperMaestro CLI 只校验意图、核对 Git 状态并登记所有权；它不会自行执行 `git worktree add`、`git worktree remove` 或删除分支。

### Review Gate

Review 要求每个 Review Pack 都指向真实且非空的 diff、patch、branch 或 PR，并绑定本轮新鲜验证证据。仅有 Markdown 声明、空 diff、过期命令输出或 `pending` 占位不能批准。

`request-review` 和 `approve-review` 都会重新验证。Review 批准是独立的人工决定，不能从 Scope/Plan 的确认推导。worktree 模式下，`verify`、`request-review` 和 `approve-review` 都传同一已登记 integration `--target`。

### Final Gate

Final 只授权用户明确选择的最终动作。`approve-final` 中每个布尔字段都对应一个独立权限：

- `--commit true`
- `--merge true`
- `--push true`
- `--cleanup true`

例如只授权 `commit` 时，`check --action push` 仍应拒绝。四项都为 `false`
表示保留当前状态，不授权任何 Git 最终动作，此时不得传 `--target`。
`check` 只做前置校验，不会代替调用方实际执行 Git 命令；实际 `commit`、
`merge`、`push` 或清理仍需在校验通过后单独执行。worktree 模式下，
`request-final` 继续使用与 Review 相同的 integration `--target`；
`approve-final` 的 target 参数仅按所选最终动作契约提供。

授权清理时，`approve-final` 与后续 `check` 都必须指定同一个精确目标：

```text
approve-final <workbench> ... --cleanup true --target <path>
check <workbench> --action cleanup --target <path>
```

只有 registry 中仍存在、由本流程登记且当前路径/branch/base 与 Git 实际状态一致的 worktree 才能 `ALLOW`。随后仍由调用方单独执行 `git -C "<state.sourceRoot>" worktree remove <path>`；外部、未登记、已漂移或不存在的目标一律拒绝。

## 按触发条件生成产物

| 触发条件 | 主要产物 |
| --- | --- |
| 所有模式 | `state.json`、`events.jsonl`、`mission.state.json`、`reports/evidence.jsonl` |
| `lite` | `brief.md` |
| `standard` / `strict` | `context.md`、需求对齐、任务计划、进度、Review Pack、验证报告 |
| API 物料 | Scope 阶段的 `api-spec.md`；Plan 阶段的 `api-contract.md` 和机器 JSON |
| UI manifest / UI 编码 | UI contract、物料索引、`ui-schema-extract.md` |
| API + UI | `page-contract-matrix.md` |
| 行为风险 | `behavior-contract.md` |
| `--e2e true` / `--visual true` | `validation-contract.json` 和结构化 evidence |
| worktree / 子智能体 | 对应的 worktree、agent、handoff 和 code-review 文档 |

产物按真实触发条件生成，不为了目录完整性创建空文档。E2E / visual 触发器一旦启用，不得通过后续 `scaffold --e2e false` 或 `--visual false` 移除既有验证义务。

## 验证证据

普通 test、build 或 lint 必须由无 shell 的内置 runner 真正执行，不能通过
`evidence --type test.command` 手工自报成功：

```bash
node plugins/supermaestro/scripts/supermaestro.js run-verification documents/demo/workbench --program npm --args-json '["test"]' --report reports/commands/npm-test.log
```

runner 自动记录命令、退出码、当前 Git working tree 指纹、报告和 SHA-256；
源码或报告变化后旧证据失效。失败命令仍保留报告，但不能通过 `verify`。
worktree 模式必须额外传已登记的 `--target <path>`。单 worktree 使用该目标；
多 worktree 的主验证只能使用一个已登记且 live 的 integration target。
`main-serial` 可以省略 target；如显式提供，必须等于 `state.sourceRoot`。

`--args-json` 必须是 JSON 字符串数组。macOS/Linux shell 与 PowerShell 可使用
单引号；Windows CMD 需要转义内部双引号：

```powershell
node plugins/supermaestro/scripts/supermaestro.js run-verification documents/demo/workbench --target '..\demo.worktrees\feature' --program npm --args-json '["test"]' --report reports/commands/npm-test.log
```

```bat
node plugins/supermaestro/scripts/supermaestro.js run-verification documents/demo/workbench --target "..\demo.worktrees\feature" --program npm --args-json "[\"test\"]" --report reports/commands/npm-test.log
```

文档中的命令默认都可以合并成一行执行。确需换行时，PowerShell 使用反引号
`` ` ``，CMD 使用脱字符 `^`；不要把 Bash 的反斜杠续行直接复制到 Windows。

启用 E2E 或视觉验证时：

1. 在 `specs/machine/validation-contract.json` 声明 `sourceRoot`、稳定用例 ID、平台、数据模式、命令和预期。worktree 模式下，`sourceRoot` 必须是 owned registry 中单一、live 的 integration target，并与工作台目标源码属于同一个 Git 仓库（同一 Git common dir；路径无需与初始化位置相同）。
2. 运行 `source-revision <workbench> --target <integration-target>`，把 `git-working-tree:<sha256>` 写入 `sourceRevision`。
3. 使用目标项目自己的运行器执行测试。
4. 通过 `evidence` 命令记录实际命令、结果、退出码、报告、产物和源码指纹。
5. 在 Review 和 Final 前运行 `verify`。

worker 可在各自 target 运行局部验证，但结果只进入 handoff，不能通过轮换
顶层 `sourceRoot` 写入同一主 validation contract。进入 Review/Final 前必须
先 fan-in 到单一 integration target：其他 registered target 必须 clean，
且其 HEAD 已是 integration target HEAD 的祖先；否则主 `verify` 失败关闭。
主 evidence 与 Gate Review Pack 只证明该 integration target。

`fixture`、`mock-api`、`uat`、`real` 必须如实区分；Mock、静态检查或 HTTP 200 不能冒充真实业务链路。源码、contract 或证据产物变化后，旧 evidence 失效。详细字段见对应验证 Skill 的 `references/evidence-contract.md`。

## 安全边界

- `state.json` 和 `events.jsonl` 是当前 CLI 的机器状态主源；legacy harness 只转发旧命令，不再维护第二套状态，新调用应直接使用根 CLI。
- 原始 PRD、API、UI 物料保持不改，放在 `source/`；生成内容放在 `workbench/`。
- 蓝湖 Cookie、账号、令牌、私有 URL 和测试凭证不得进入仓库、manifest、报告、evidence 或最终回复。
- 插件不会自行安装目标项目依赖，也不会默认执行支付、下单、删除、生产写入或其他高副作用操作。
- 未经用户确认，不创建 worktree、不派发编码子智能体、不执行最终 Git 动作。
- worktree target 只能位于 `sourceRoot` 外的持久目录；相对路径固定以
  `state.sourceRoot` 解析，registry 只保存 canonical absolute 路径。
- `cleanup` 必须带精确 `--target`，且只能作用于 owned registry 中仍存在并与 Git 状态一致的 worktree；来源不明、未登记、detached、漂移或外部管理的工作区不得清理。
- 视觉遮罩、跳过用例和阻塞证据都必须说明原因；只有用户明确接受剩余风险时才可放行。

## 开发与验证

先运行仓库内测试：

```bash
npm test
```

其中包括：

- 全部 JavaScript / MJS 入口的语法检查。
- `package.json` 与插件 manifest 的版本一致性检查。
- 根 CLI、严格契约、结构化 evidence 和 legacy 兼容适配器测试。

CI 在 Ubuntu 和 Windows 上分别使用 Node.js 18、20，并额外运行 OpenAI 官方 `plugin-creator/scripts/validate_plugin.py` 以及每个 Skill 的 `skill-creator/scripts/quick_validate.py`。本地也可以从已安装的官方 `plugin-creator`、`skill-creator` 目录运行同一组校验器：

```bash
python "<plugin-creator>/scripts/validate_plugin.py" plugins/supermaestro
python "<skill-creator>/scripts/quick_validate.py" plugins/supermaestro/skills/mission-control
```
