# 多 Agent 协作协议

Plan Gate 记录 `state.execution.subagents=true` 并派发真实 worker，或独立启用
`state.execution.reviewAgent=true` 审查真实 RP/diff 时，读取本协议对应部分。
不开 worker 就不生成 worker brief/handoff，但仍可只生成 review-agent 记录。

## 角色

- 主控：维护 workbench、任务 DAG、Gate、公共契约、review pack、集成顺序。
- Foundation agent：实现拆小后的公共底座，如 service/mock、scheme/路由、公共组件、基础测试中的一个或少数相邻契约面；不得把所有公共工作合成一个上帝任务。
- Feature agent：只实现任务卡内页面或模块，消费 foundation 契约，不擅自改公共底座。
- Review agent：只读审查某个 review pack 的 diff/patch、验证证据和风险，不修改源码，不提交。
- Integration agent 或主控：按用户授权合并各分支、处理冲突、跑总验证，并更新 Review/Final 材料。

## 执行分层

Mission Control 同时负责主控流程和 worker 执行纪律：

- 每个任务必须有明确文件、步骤、测试、命令和预期结果。
- 真实多 agent 执行时，主控给 worker 完整任务卡和最小必要上下文，worker 不继承主会话全部历史。
- 编码 worker 必须按任务卡记录 TDD 适用性；只有标记 `not-applicable` 或 `deferred` 时才可跳过，并且必须写明原因。
- worker 遇到 bug、测试失败、构建失败、联调异常或行为 review finding 时，先记录复现和根因，再做最小修复并复验。
- review agent 只接收冻结的 review pack；changes-requested 修复前先核实 finding，再逐项处理或给出有证据的技术性驳回。
- Review/Final Gate 和任何完成声明前必须重新运行验证；Final 只按用户明确授权的交付与清理动作收尾。
- 不开 subagent、跨会话或串行执行已有计划时，由主控直接按任务计划推进。

worktree 模式下，主控必须先用 Plan 中的精确 `target/branch/base` 完成创建
意图检查、调用方 `git worktree add` 和 `register-worktree`。目标进入 owned
registry 后，才可执行：

```bash
node <plugin-root>/scripts/supermaestro.js check <workbench> --action sync-materials --target "<path>"
node <plugin-root>/scripts/supermaestro.js check <workbench> --action dispatch-subagent --target "<path>"
```

任一步缺少 `--target`，或目标未登记、已漂移、不存在，都不得启动 agent。
CLI 只校验和登记，不自行创建或删除 worktree。

## Foundation-first

多 agent 不得一开始同时修改公共文件。优先顺序：

1. Foundation 任务完成并形成 review artifact。
2. 主控请求用户进行 Foundation Review Checkpoint，确认公共契约稳定。
3. Foundation human-approved 后，如下游依赖该代码，先对已登记目标执行
   `check --action checkpoint-commit --target "<path>"`，再由调用方创建本地
   checkpoint commit 并记录 base commit。
4. Feature agents 基于已确认的 foundation checkpoint commit 启动，保证后续 P-only diff 干净。
5. 如果 feature 发现公共契约不够用，提交 contract-change request，不直接改公共文件。

公共契约通常包括：接口封装、mock、路由、scheme、store、公共组件、全局配置、类型/常量。

用户确认 checkpoint 前，不派发依赖该 foundation 的 feature agent，不把相关任务状态推进到 `running`。checkpoint 被打回时，相关 feature 保持 `blocked` 或 `planned`，直到 foundation 修正并重新确认。

## 任务状态机

任务状态使用：

- `planned`
- `ready`
- `assigned`
- `running`
- `blocked`
- `ready-for-agent-review`
- `agent-approved`
- `ready-for-human-review`
- `changes-requested`
- `human-approved`
- `merged`
- `abandoned`

主控工作台里的 `workbench/plans/progress.md` 是任务状态的人类投影，记录每个任务的 owner、worktree、branch、base commit、latest diff/patch、updated_at、blocker、validation；`state.json` 的 owned registry 才是 worktree 所有权机器依据。不要创建或维护 `tasks/state.json`。

多 worktree 下必须区分“本任务产物”和“全局状态”：worker worktree 里的 `workbench` 文件不会自动同步回主控工作台。编码 worker 不得直接修改主控工作台的 `plans/progress.md`、`agents/agent-index.md`、`worktrees/plan.md`、`reviews/review-packs.md` 或 `reports/validation.md`；它只写自己的 handoff 和局部验证记录。主控读取 handoff、diff 和验证记录后，统一 fan-in 回主控工作台。局部结果不能直接作为 Review/Final 主 evidence。

## Agent 启动包

每个真实 agent 启动前必须生成 `workbench/agents/<task-id>/brief.md`，包含：

- 任务卡路径。
- 必读上下文路径。
- 执行方式：真实多 agent 任务由主控派发；编码 worker 按任务卡记录 TDD 决策和验证证据。
- 允许修改和禁止修改范围。
- 精确 worktree target、branch、base 和 owned registry 登记状态。
- UI/API 事实源。
- 验证命令。
- TDD 决策和证据要求：RED 命令、预期失败原因、GREEN 命令、证据写入位置或跳过原因。
- 调试纪律：遇到失败必须记录复现、根因调查、假设、最小修复和复验；不得直接猜测性改动。
- handoff 输出路径。

## Agent Handoff

Agent 完成、阻塞或请求决策时，写自己 worktree 内的 `workbench/agents/<task-id>/handoff.md`。不得只在聊天里口头说完成，也不得把自己 worktree 内的 `plans/progress.md` 当成主控进度已经同步。主控自己执行的任务直接更新主工作台的 `plans/progress.md` 和 `reviews/review-packs.md`，不得伪造 agent handoff。主控根据 handoff、diff 和验证记录判断 worker 是否完成任务边界；review agent 只审查已冻结的 RP，不负责猜测 worker 是否还没交付。

Handoff 必须包含：

- 完成内容。
- 改动文件。
- 实际 worktree target、branch、base，以及交接时与 registry/Git 的一致性。
- review artifact 引用：worktree diff、patch、PR，或用户明确授权后的 local commit。
- TDD 证据：`required / not-applicable / deferred`、RED 命令与失败原因、GREEN 命令与通过结果、跳过或延后原因。
- 调试证据：如果出现失败或 bug，记录 root cause、证据和修复验证。
- 验证命令和结果。
- 未执行检查和原因。
- 是否触碰公共契约。
- 是否需要主控决策。

## Review Agent Checkpoint

Review agent 不新增正式 Gate，也不依赖编码 subagent。Plan 可为
`main-serial` 或任意真实 RP/diff 独立启用；启用 subagents 时必须在
`approve-plan` 显式决定 `--review-agent true|false`。它的职责是降低人工
review 成本，不替代用户 review。

- 输入限定为一个 RP：diff 命令或 patch、相关 worktree/branch、上下文、API/UI 规格和验证记录。
- 输出写入 `reviews/code-review/<RP>.md` 或 `reviews/code-review/index.md`。review agent 不直接同步 `reviews/review-packs.md` 或 `plans/progress.md`；主控读取 review 输出后统一 fan-in。
- 输出采用 code-review 形式：findings 优先，按严重级别排序，包含文件/位置、行为风险、测试缺口和建议。
- 只读边界：不得修改源码、不得暂存、不得 commit、不得 merge/push、不得清理 worktree。
- 有阻塞 findings 时，RP 状态为 `changes-requested`；修复后重新进入 `ready-for-agent-review`。无阻塞 findings 时，状态为 `agent-approved` / `ready-for-human-review`。
- changes-requested 修复前，主控/worker 必须先核实 review 建议是否成立、是否超出任务范围、是否违反既有决策或 YAGNI；确认成立后逐项修复并复验，不能盲目批量套用。

## Contract Change

Feature agent 默认不能改公共契约。必须改且主控判断为真实契约变更时，才创建 `workbench/contract-changes/CCR-<id>.md`，说明：

- 需要变更的契约。
- 原因。
- 影响任务。
- 兼容性和迁移方案。
- 主控决策。

主控确认前，相关 feature 任务保持 `blocked` 或 `changes-requested`。

## 集成

集成前主控检查：

- 每个真实 agent 任务有 handoff；主控任务有 `plans/progress.md` 和 review pack 记录。
- 主控工作台已完成 fan-in：`plans/progress.md`、`agents/agent-index.md`、`worktrees/plan.md`、`reviews/review-packs.md`、`reports/validation.md` 与 handoff/review 输出一致。
- 每个 review pack 有实际 artifact。
- 启用 review agent 时，每个相关 RP 已 `agent-approved` 或明确 `not-needed`。
- 公共契约变更已关闭或记录为风险。
- 每个编码 worktree 仍存在于 owned registry，当前 target/branch/base 与 Git
  状态一致；feature worktree 的 base 应为已 human-approved 的 foundation
  checkpoint commit。
- 已选定单一 owned/live integration target；其他 registered target 均
  clean，且 HEAD 是 integration target HEAD 的祖先。
- 主 validation contract 的 `sourceRoot` 等于 integration target；
  `source-revision`、`run-verification`、`verify`、`request-review`、
  `approve-review` 与 `request-final` 都传入同一个 integration
  `--target`；`approve-final` 的 target 参数只按最终动作契约提供。
- 主 evidence、verification snapshot 与 Gate Review Pack 只绑定
  integration target，并记录其身份、identity hash 和 fan-in 快照；
  target、registry 或 fan-in 变化后旧证据失效。worker target 的局部证据
  只保留在 handoff。
- 未跟踪文件被 worktree diff 或 patch 覆盖。
