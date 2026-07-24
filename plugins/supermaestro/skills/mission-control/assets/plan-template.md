# 任务计划

## 摘要

- 需求：
- 目标分支：
- 需求根目录：
- 需求工作台：
- 推荐执行档位：
- 进度同步：`plans/progress.md`
- Review artifact：worktree diff / patch / PR / explicit local commit
- Foundation baseline：none / checkpoint commit after human approval
- 执行纪律：可验收任务粒度 / worker 边界 / TDD 决策 / 根因调试 / 新鲜验证

## 事实源

| 类型 | 路径/地址 | 关键结论 | 风险 |
| --- | --- | --- | --- |
| PRD | ../source/prd/ |  |  |
| API 发现 | specs/api-spec.md |  |  |
| API 可执行契约 | specs/api-contract.md |  |  |
| UI | specs/ui-schema-extract.md |  |  |
| 页面契约矩阵 | specs/page-contract-matrix.md |  |  |
| 共享上下文 | context.md |  |  |

## 范围

需求范围：

-

非需求范围：

-

## 任务 DAG

| 任务 | 类型 | 依赖/Base | 契约面/边界 | 允许修改 | 禁止修改 | TDD 决策 | Review Pack | 验证要求 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1a | foundation / feature / integration |  | API/mock / route/scheme / component / test |  |  | required / not-applicable / deferred | RP-F1a |  |

## 任务颗粒度要求

每个编码任务必须按以下可验收粒度写清：

- 修改文件和测试文件。
- 关键实现步骤。
- RED 命令、预期失败原因、GREEN 命令和预期通过结果。
- 无法 TDD 时的跳过或延后原因、风险和后续补测动作。

## Foundation Review Checkpoint

仅在公共依赖会解锁多个页面/功能切片时填写；没有公共依赖时写 `不需要`。

| Checkpoint | 公共依赖 | Review Pack | 阻塞下游任务 | 放行条件 | 打回处理 |
| --- | --- | --- | --- | --- | --- |
| C-F1 |  |  |  | 用户确认公共依赖可复用 | 回到 foundation 修正后重新 review |

## 执行模式

- 推荐执行模式：main-serial / single-worktree-serial / multi-worktree-parallel
- Worktree：yes / no；root：
- Subagents：yes / no；仅真实外部 agent/thread 才生成 `agents/`
- Review agents：yes / no；仅只读审查真实 RP 时生成 `reviews/code-review/`
- Trigger 顺序：在 `approve-plan` 前 scaffold 对应 worktree/subagents/
  review-agent；启用 subagents 时显式传 `--review-agent true|false`
- Worker agents：yes / no；仅真实多 agent 且任务独立时启用
- 主控串行：yes / no；不开 subagent、跨会话或串行执行已有计划时使用
- 严格 UI 视觉决策：required / not-applicable / blocked；原因：
- TDD worker discipline：required / partially-required / not-applicable；说明：
- 根因调试：失败/bug/review finding 时 required
- Review Agent Checkpoint：yes / no
- Review finding 处理：changes-requested 时 required
- 完成前验证：Review Gate / Final Gate / completion claims required
- 分支与 worktree 收尾：Final Gate 精确动作授权 required
- Contract changes：yes / no；仅真实契约变更才生成 `contract-changes/`
- Integration：yes / no；仅独立集成分支/计划才生成 `integration/`
- 不生成的模块和原因：
- Foundation 拆分：单个 foundation 是否超过 5-8 文件、3 个目录或 3 类契约面；如是，拆分为：
- Foundation checkpoint commit：yes / no；用户授权语；下游 base commit 记录位置：
- 默认不自动提交 feature 改动；如需 feature checkpoint commit，用户授权语：
- Worktree 可运行性：每个 worktree npm install / yarn install / pnpm install / 完整项目拷贝 / 仅静态验证

### Worktree 精确意图

仅在 worktree 模式填写。每个目标必须先检查创建意图，由调用方执行
`git worktree add`，再用同一组参数运行 `register-worktree`；CLI 不执行
创建或删除。

| 任务 | Target | Branch | Base | 创建者 | 登记状态 | 后续动作目标 |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  | unregistered | sync / dispatch / checkpoint |

- Integration target：
- Fan-in 条件：其他 registered target clean，且 HEAD 均为 integration
  target HEAD 的祖先。
- Worker 验证只进 handoff；主 contract/evidence/Gate Review Pack 只绑定
  integration target。

## Reviewability

| RP | 审查目标 | Artifact 形式 | Base / 对比基线 | 预计文件数 | Diff 命令 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| RP-F1a |  | worktree diff / patch / PR / explicit local commit | target branch / foundation checkpoint commit |  |  |  |

启用 review agent 时，每个 RP 必须记录 review agent 结论：`not-needed / pending / changes-requested / agent-approved`。

## Plan Gate 决策简报

- 推荐选择：
- 必须确认：
- Scope API 发现：complete / partial / blocked；真实接口清单和公共/页面归属是否已确认
- Plan API 契约：complete / partial / blocked；本期可执行 contract 和机器 JSON 是否已收敛
- 页面契约矩阵：complete / partial / not-needed；页面、UI 画板/schema、API/mock、RP 是否一一绑定
- 选择影响：
- Review 成本：
- Foundation Checkpoint：拆分、放行条件、checkpoint commit 和下游 base
- Review Agent Checkpoint：对每个纳入预审的真实 RP/diff 新开只读 review
  agent；可独立于 subagents 启用，如关闭则说明风险
- 严格 UI 视觉决策：required / not-applicable / blocked；原因、trigger 与剩余风险
- 执行纪律：任务颗粒度、worker agents 或主控串行、TDD 覆盖范围和跳过条件
- 调试与 review 纪律：失败时根因调查；review agent 输入结构；review findings 核实与处理方式
- 完成与收尾纪律：Review/Final 前新鲜验证证据；Final 精确动作菜单、环境判断和清理边界
- Worktree 所有权：精确 `target/branch/base`、登记时点、registry 核验和
  cleanup `--target`
- 启用模块：
- 不生成模块：
- 验证策略：
- 推荐确认语：

## 降级记录

- Worktree/分支降级：
- Mock/API 降级：
- 验证降级：

## 下一步

-
