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
- Superpowers 执行增强：writing-plans 粒度 / SDD / executing-plans fallback / TDD worker discipline

## 事实源

| 类型 | 路径/地址 | 关键结论 | 风险 |
| --- | --- | --- | --- |
| PRD | ../source/prd/ |  |  |
| API | specs/api-spec.md |  |  |
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

每个编码任务必须按 `superpowers:writing-plans` 的粒度写清：

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

- 推荐档位：
- Worktree：yes / no；root：
- Subagents：yes / no；仅真实外部 agent/thread 才生成 `agents/`
- Review agents：yes / no；仅只读审查真实 RP 时生成 `reviews/code-review/`
- SDD：yes / no；真实多 agent 且任务独立时默认 yes
- executing-plans fallback：yes / no；仅不开 subagent、跨会话或串行执行已有计划时使用
- TDD worker discipline：required / partially-required / not-applicable；说明：
- systematic-debugging：失败/bug/review finding 时 required
- requesting-code-review：Review Agent Checkpoint yes / no
- receiving-code-review：changes-requested 时 required
- verification-before-completion：Gate 2 / Gate 3 / completion claims required
- finishing-a-development-branch：Gate 3 final action required
- Contract changes：yes / no；仅真实契约变更才生成 `contract-changes/`
- Integration：yes / no；仅独立集成分支/计划才生成 `integration/`
- 不生成的模块和原因：
- Foundation 拆分：单个 foundation 是否超过 5-8 文件、3 个目录或 3 类契约面；如是，拆分为：
- Foundation checkpoint commit：yes / no；用户授权语；下游 base commit 记录位置：
- 默认不自动提交 feature 改动；如需 feature checkpoint commit，用户授权语：
- Worktree 可运行性：每个 worktree npm install / yarn install / pnpm install / 完整项目拷贝 / 仅静态验证

## Reviewability

| RP | 审查目标 | Artifact 形式 | Base / 对比基线 | 预计文件数 | Diff 命令 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| RP-F1a |  | worktree diff / patch / PR / explicit local commit | target branch / foundation checkpoint commit |  |  |  |

启用 review agent 时，每个 RP 必须记录 review agent 结论：`not-needed / pending / changes-requested / agent-approved`。

## Gate 1 Decision Brief

- 推荐选择：
- 必须确认：
- API Discovery：complete / partial / blocked；真实接口清单和公共/页面归属是否已确认
- 页面契约矩阵：complete / partial / not-needed；页面、UI 画板/schema、API/mock、RP 是否一一绑定
- 选择影响：
- Review 成本：
- Foundation Checkpoint：拆分、放行条件、checkpoint commit 和下游 base
- Review Agent Checkpoint：每个 worker 完成后新开只读 review agent；如关闭，说明风险
- Superpowers 执行增强：writing-plans 颗粒度、SDD 或 executing-plans fallback、TDD 覆盖范围和跳过条件
- 调试与 review 纪律：失败时根因调查；review agent 输入结构；review findings 核实与处理方式
- 完成与收尾纪律：Gate 2/Gate 3 前新鲜验证证据；Gate 3 final action 菜单、环境判断和清理边界
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
