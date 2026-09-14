---
name: mission-control
description: 用于处理中大型软件需求，适合需要分阶段规划、可恢复工作流状态、人工门禁、审查包、工作树隔离、子智能体协作、严格契约/验证或任务交接的场景。
---

# 任务控制台（Mission Control）

主控维护需求上下文、机器状态、计划、门禁和集成；worker 只执行任务卡限定的工作。先按当前阶段加载需要的规则，不一次读取全部引用。

## 触发条件

- 多页面、多模块、API/UI 契约，或需要可暂停、恢复、交接的研发流程。
- 用户要求 Scope、Plan、Review、Final 门禁，或明确要求 worktree / 多智能体。
- 已有 SuperMaestro workbench，需要继续、查看阻塞或恢复异常。

无需工作台的单一低风险修改可直接处理；只分析、只规划的请求不得进入实现。

## 输入

确认需求名称、目标仓库与分支、workbench 路径、PRD/API/UI 等事实源、用户范围与禁止项。识别鉴权、权限、资金、生产写入、数据库或发布风险。

- `lite`：低风险小改动，Scope + Final。
- `standard`：普通需求，Scope + Plan + Review + Final。
- `strict`：多页面、强 UI、复杂契约或高风险需求，额外检查契约和验证证据。

默认建议 standard；解释选择依据。模式初始化后不可更改，需要变更模式时新建工作台。

## 状态与边界

- 根 CLI 为 `<plugin-root>/scripts/supermaestro.js`；新调用不经过 legacy harness。
- `state.json` 是状态主源；`events.jsonl` 保存事件；`mission.state.json` 和 Markdown 是审查投影。不要手改机器状态使门禁通过。
- 原始资料保存在 `documents/<需求名>/source/`，不得改写；过程产物放在同级 `workbench/`。
- Scope/Plan/Review/Final 需要各阶段明确的用户确认。执行 `approve-*` 必须记录 `--confirmed-by user --confirmation "<用户原话或摘要>"`；AI 或 review agent 不替代人工批准。
- CLI 拒绝时停止受控动作。`ALLOW` 是前置检查结果，CLI 不实际执行 Git、派发或同步操作。
- 不默认安装依赖、写生产数据、支付或删除；commit/merge/push/cleanup 分别获得精确授权。
- 不泄露 Cookie、令牌、账号、私有 URL 或环境变量；不把推断或 mock 结果写成真实事实。

## 按阶段执行

| 当前阶段 | 操作与完成条件 | 按需读取 |
| --- | --- | --- |
| 初始化/恢复 | 已有工作台先 `status` / `resume`；无状态才 `init`；仅按实际 trigger `scaffold` | [命令与恢复指南](references/commands-and-recovery.md) |
| Scope | 对齐范围、规则、假设、验收；有 API 时先尝试真实 discovery；有 UI 时核对物料；UI + API 建立页面契约矩阵 | [核心工作流规则](../../profiles/core-workflow.md)、[API 发现模板](assets/api-spec-template.md)、[页面契约矩阵模板](assets/page-contract-matrix-template.md) |
| Plan | 完成契约、任务 DAG、允许修改范围、Review Pack、TDD 决策和验证策略；明确执行模式及开关；strict + UI 作出视觉决策 | [执行模式与动态模块](references/execution-modes.md)、[任务拆分策略](references/split-strategy.md) |
| 编码 | 先 `check --action code`；按任务卡实现，失败先复现和查根因；不扩大范围 | 当前任务对应的契约与原文片段 |
| Review/Final | 收齐真实 artifact 与新鲜验证，按 CLI 检查并提交人工确认；Final 逐动作授权 | [验证清单](references/validation-checklist.md)、[核心工作流规则](../../profiles/core-workflow.md) |

只有生成对应产物时才读取[计划模板](assets/plan-template.md)、[进度模板](assets/progress-template.md)、[Review Pack 模板](assets/review-template.md)、[验证报告模板](assets/report-template.md)。普通串行任务使用精简模板；可选模块的详细记录留在各自文档。

## 按条件加载

- 选择/管理 worktree：读取[Worktree 策略](references/worktree-strategy.md)和[Worktree 计划模板](assets/worktree-plan-template.md)。每个目标须经过精确 `target/branch/base` 创建意图检查、实际 Git 创建和登记；未登记不执行后续受控动作。
- 启用真实 worker/review agent：读取[多智能体协议](references/multi-agent-protocol.md)、[角色职责](references/agent-roles.md)。任务与交接分别使用[任务卡](assets/task-card-template.md)、[Agent Brief](assets/agent-brief-template.md)、[Handoff](assets/agent-handoff-template.md)、[Review Agent](assets/review-agent-template.md)。未启用不生成这些记录。
- 需要独立集成计划时读取[集成模板](assets/integration-plan-template.md)。多 worktree 的主验证只绑定 fan-in 后的单一 integration target；worker 局部证据仅进 handoff。
- Taro 小程序/H5 且有蓝湖 schema：读取[Taro/H5 蓝湖规则](../../profiles/weapp-taro-lanhu.md)。不猜测 UI；先检查 schema 提取及实现映射。
- 微信小程序 E2E：读取[小程序验证 Skill](../validate-weapp-e2e/SKILL.md)。
- 设计还原或视觉回归：读取[视觉验证 Skill](../validate-visual-regression/SKILL.md)。

## 异常与恢复

- 材料无法访问、关键契约冲突或验收缺失：记录来源、尝试和缺口，保持 partial/blocked；不得伪造结论。
- 批准过期：查看 `status --json true` 的 `gateValidity`，按[恢复指南](references/commands-and-recovery.md)重新打开最早受影响门禁。旧批准保留在 `approvalHistory`；重新打开不等于批准。
- 状态写入失败：本次事务自动回退；进程中断留下事务时，先 `recover-workbench`。恢复拒绝接管活跃 writer，或覆盖事务之后的外部修改。
- v2：只能显式 `init` 迁移到 v3，保留物料和有效 Scope，重新建立下游批准与 worktree registry。未知版本或损坏状态保持阻塞。
- 命令执行期间源码变化：保留失败日志，停止修改后重新验证。不得复用旧证据。

## 输出与完成标准

报告模式、阶段、有效 Gate、阻塞原因、下一步和 workbench 路径。交付时附实际改动范围、Review Pack artifact、执行位置、验证命令与数据模式、证据路径、未执行检查和剩余风险。

worktree 任务另报告登记/现场核验和 integration target；Final 报告精确授权组合与尚未执行的动作。只有机器状态、文档、diff 和新鲜验证一致时才声明对应阶段完成。
