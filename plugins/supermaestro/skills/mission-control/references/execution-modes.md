# 执行模式与动态模块

本技能只生成当前执行模式需要的工作台模块。不要为了“完整”在串行任务里生成 worktree、多智能体、handoff 或 contract-change 文档。

## 核心原则

- Core 模块永远启用：`context.md`、必要的 `specs/`、`plans/task-plan.md`、`plans/progress.md`、`reviews/review-packs.md`、`reports/validation.md`。
- Worktree 模块只在 Plan Gate 选择 `single-worktree-serial` / `multi-worktree-parallel`，且 `state.execution.worktree=true` 时启用；默认只生成 `worktrees/plan.md`，任务状态仍写 `plans/progress.md`。每个目标还必须在 Plan 中记录精确 `target/branch/base`。
- Multi-agent 模块只在 Plan Gate 记录 `state.execution.subagents=true`，且确实派发外部 agent/thread 时启用；主控自己执行的任务不得生成 agent brief/handoff。
- Review-agent 模块是独立只读预审能力，不依赖 subagents 或 worktree；
  `main-serial` 只要存在真实 RP/diff 也可启用。它生成
  `reviews/code-review/`，不新增正式 Gate。
- Review artifact 模块按 reviewability 启用：默认 feature 使用 per-RP worktree diff 或 patch；foundation human-approved 且要解锁下游时，允许本地 checkpoint commit 作为 downstream base；使用 worktree 时，后续 feature review 必须提供基于该 base 的 P-only diff/patch。
- Contract-change 模块只在发生或预计发生公共契约变更请求时启用；不要为空机制生成目录。
- Integration 模块只在需要独立集成分支或复杂合并顺序时启用；普通最终验证写入 `plans/progress.md` 和 `reports/validation.md`。
- 当公共组件、基础页面、接口契约、mock、路由或数据模型会被多个切片依赖时，必须启用 Foundation Review Checkpoint；它不新增 Gate 层级，但会阻塞下游切片启动。

## 复杂度判定

规划时先判断需求复杂度。命中以下任意 2 条，不推荐 `main-serial + checkpoint=false`，除非用户明确接受 review 成本：

- 涉及 2 个以上页面或模块。
- 预计改动超过 8 个文件。
- 同时新增公共组件、路由、接口、mock 或配置。
- 绑定 2 个以上 UI 画板。
- 同时新增页面并改造既有页面。
- 需要多人或多轮 review。

## 执行模式矩阵

| 模式 | 适用场景 | 动态模块 | Review artifact | 风险提示 |
| --- | --- | --- | --- | --- |
| `main-serial` + checkpoint=false | 小改动、单文件或少量文件 | Core；必要时 review patches | patch 或单一 diff | 中大型需求会变成大 diff |
| `main-serial` + checkpoint=true | 用户明确要求 checkpoint commit 的小到中型串行改动 | Core | per-task local commit | 仍共享同一工作区；不得默认推荐 |
| `main-serial` + review-agent=true | 主控串行实现，但真实 RP/diff 需要独立只读预审 | Core + Review-agent records | patch / diff / PR | 预审不替代人工 Gate |
| `single-worktree-serial` | 需要隔离用户主工作区但不并行 | Core + Worktree plan | worktree diff 或 patch | 速度不并行，但 review 更清楚 |
| `multi-worktree-parallel` + subagents=false | 主控亲自串行/交错实现多个隔离分支 | Core + Worktree plan | per-task worktree diff/patch | 管理成本中等 |
| `multi-worktree-parallel` + subagents=true | 多页面、多模块、确有外部 agent/thread 并行开发 | Core + Worktree plan + real Agent docs | per-agent worktree diff/patch | 需要 foundation-first 和集成收口 |
| `multi-worktree-parallel` + review-agents=true | 多个 RP 需要先由只读 agent 预审 | Core + Worktree plan + Review-agent records | per-RP worktree diff/patch + findings | 降低人工 review 成本，但不替代用户 review |

## Plan Gate 必须说明

Decision Brief 必须写清：

- 选用哪些动态模块，哪些模块不会生成；未生成的原因必须清楚。
- 预计 review pack 数量和单包文件数。
- Review artifact 类型：worktree diff、patch、PR，或用户明确授权后的 local commit 中至少一种。
- 默认不自动提交 feature 改动；如果 foundation 会解锁下游 worktree，说明 human-approved 后是否创建本地 checkpoint commit、授权语、base commit 记录位置和不采用时的 patch/串行替代方案。未提交、未跟踪文件必须能被 worktree diff 或 patch 覆盖。
- worktree 与 subagent 是两个独立开关：可以只开 worktree，不开 subagent。
- 是否启用 review agent。它可独立于 subagents 使用；说明真实 RP/diff、
  只读边界、审查顺序和 findings 打回机制。
- worktree 是否需要独立可运行；需要时说明每个 worktree 的依赖安装命令，或明确选择完整项目拷贝模式和 patch/commit review artifact。
- 每个计划 worktree 的 `target`、`branch`、`base`，以及由谁执行
  `git worktree add`、何时运行 `register-worktree`。没有精确三元组的目标
  不能创建或登记。
- 多 worktree 的单一 integration target、fan-in 顺序，以及“其他 registered
  target clean 且 HEAD 已是 integration HEAD 祖先”的 Gate 放行条件。
- 公共契约由哪个 foundation 任务负责。
- 是否存在 Foundation Review Checkpoint、它会阻塞哪些下游任务、用户 review 后如何放行。

## Plan Gate 前初始化执行 Trigger

执行模式写入 Plan 并获得用户确认意向后、调用 `approve-plan` 前，先为所选
执行模块调用根 CLI：

```bash
node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --worktree true --subagents true --review-agent true
node <plugin-root>/scripts/supermaestro.js approve-plan <workbench> --execution-mode multi-worktree-parallel --worktree true --subagents true --review-agent true --confirmed-by user --confirmation "<用户确认执行模式>"
```

根 CLI 以 `state.json` 为机器状态主源，按显式 trigger 生成可选模块：

- `--worktree true`：生成 `worktrees/plan.md`；未启用时，Plan 不能批准
  worktree 执行模式。
- `--subagents true`：仅在计划派发真实外部 agent/thread 时生成 `agents/`；
  未启用时，Plan 不能批准 subagents。
- `--review-agent true`：仅在启用只读 review agent 时生成 `reviews/code-review/`。
- `--contract-changes true`：仅在真实契约变更请求出现时生成 `contract-changes/`。
- `--integration true`：仅在需要独立集成分支或复杂集成计划时生成 `integration/`。

启用 subagents 时，`approve-plan` 必须显式传 `--review-agent true|false`。
选择 `true` 时必须先 scaffold review-agent trigger；已启用的 review-agent
trigger 不能在批准时降级。

任务卡和 per-agent brief/handoff 使用本 Skill 的 assets 按需创建；不要生成第二套任务状态 JSON。`skills/mission-control/scripts/scaffold-execution-mode.js` 只保留给 legacy 兼容测试，新工作台不要把它作为状态写入入口。

`scaffold --worktree true` 只生成计划文档，不创建 worktree。实际生命周期为：

1. `check --action create-worktree --target <path> --branch <branch> --base <ref>`
   记录精确意图。
2. 调用方执行 `git worktree add`。
3. `register-worktree` 使用同一组参数验真并写入 owned registry。
4. `dispatch-subagent`、`sync-materials`、`checkpoint-commit` 在 worktree 模式
   都携带已登记的 `--target`。
5. Final cleanup 的授权与检查携带同一 `--target`，且只放行 registry 中
   仍存在并匹配当前 Git 状态的所选目标。

CLI 不执行 `git worktree add/remove`，也不自动创建或删除分支。

若是纯串行小任务，不应生成 worktree/multi-agent 专用文档。
