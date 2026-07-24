---
name: requirement-workbench
description: 当用户接到新的软件需求，希望 Codex 收集 PRD、接口文档、蓝湖/UI、mock、截图或其他研发物料，生成需求同名目录下的 source 和 workbench，按需调用 lanhu-export、prd-structure，并初始化 mission-control，停在需求对齐确认阶段时使用。
---

# 需求工作台

把零散需求物料整理成可交给 `mission-control` 推进的需求工作台。本能力只做轻量入口和流程路由；蓝湖导出、PRD 结构化和任务编排细节交给插件内的专用能力。

## 触发条件

在用户提交一个新的软件需求，并希望整理 PRD、API、UI、mock、截图或其他研发物料时使用。已有完整 workbench 且只需继续执行时，直接使用 `$mission-control`。

## 输入

至少确认：

- 需求名称、目标仓库和目标分支。
- 已有 PRD、API、UI、mock、截图或补充说明的位置。
- 用户明确的范围、禁止项、目标平台和期望停靠 Gate。
- 初始工作流模式：`lite`、`standard` 或 `strict`。

模式路由：

- 单文件、小文案、小样式或低风险缺陷：`lite`。
- 普通需求：`standard`。
- 多页面、多画板、强 UI、API 契约、权限/资金/生产风险：`strict`。

信息不足时默认建议 `standard`，但在执行 `init` 前向用户说明判断依据。不要先用 `lite` 初始化，再通过模式切换绕过 Plan/Review。

## 按需读取

- 蓝湖 stage 链接或版本分组：读取[蓝湖版本分组导出](../lanhu-export/SKILL.md)。
- 长 PRD、OCR 或复杂规则：读取[PRD 结构化](../prd-structure/SKILL.md)。
- 初始化状态、生成计划或推进 Gate：读取[任务控制台](../mission-control/SKILL.md)。

## 原则

- 默认使用中文输出。
- 需求接收后必须初始化 SuperMaestro 机器状态：`workbench/state.json`、`workbench/events.jsonl` 和 `workbench/mission.state.json`。
- 工作台 Markdown 是供人工审阅的投影；关键门禁和动作状态以 `scripts/supermaestro.js` 维护的机器状态为准。
- 原始物料保持不改，统一放在 `documents/<需求同名目录>/source/`。
- 过程产物统一放在 `documents/<需求同名目录>/workbench/`。
- 遇到蓝湖 stage 链接、版本分组或 UI schema 导出需求时，使用 `$lanhu-export`。
- 遇到中大型、规则复杂、边界不清或后续需要拆任务的 PRD 时，使用 `$prd-structure`。
- 遇到范围、UI 最终稿、接口契约、跨仓边界或验收口径不清的需求时，在 Scope Gate 前生成集中问题清单，辅助用户审阅。
- 需求工作台初始化、门禁简报、审查包、验证记录、Git 工作树规划和执行控制交给 `$mission-control`。
- 默认停在 Scope Gate 的需求对齐确认阶段；除非用户分别明确确认 Scope 和 Plan，否则不要进入实现阶段。

## 接收流程

1. 确认需求名称、目标仓库、目标分支、期望产物和用户明确限制。
2. 创建计划前，先读取目标仓库规则，例如 `AGENTS.md`、包管理脚本、已有 `documents/` 约定和相关代码入口。
3. 创建或复用需求目录：

```text
documents/<需求同名目录>/
├── source/
│   ├── prd/
│   ├── api/
│   └── ui/
└── workbench/
```

4. 归档原始物料：
   - PRD、语雀/飞书/Markdown 导出文本放入 `source/prd/`。
   - Swagger、OpenAPI、Postman、mock、接口说明和后端依赖说明放入 `source/api/`。
   - 蓝湖导出包、`manifest.json`、`schemas/*.json` 和可选图片基线放入 `source/ui/`。
5. 如果 `source/api/` 中是接口文档地址或 Knife4j/Swagger/OpenAPI/Postman 入口，Scope Gate 前必须先尝试解析真实接口清单：优先使用文档页面给出的 OpenAPI JSON；Knife4j 可尝试 `swagger-resources`、`/v3/api-docs`、`/v2/api-docs`；无法访问时，在 `workbench/specs/api-spec.md` 标记 `blocked` 或 `partial` 并说明原因。`api-spec.md` 保存接口发现明细；进入 Plan Gate 前，把本次范围内的契约结论同步到 `workbench/specs/api-contract.md` 和 `workbench/specs/machine/api-contract.json`。不要把核心接口发现延后到 F1。
6. 如果用户提供蓝湖 stage 链接或分组名，调用 `$lanhu-export`，默认仅导出 schema 到 `source/ui/`；只有用户明确要求视觉基线时才导出图片。
7. 如果存在 PRD 物料，按需求复杂度调用 `$prd-structure`：轻量/中等 PRD 默认把关键事实并入 `workbench/context.md`，把待确认问题并入 `workbench/plans/progress.md`；只有长文档、截图/OCR 多、规则特别复杂或用户明确需要机器事实包时，才把结构化中间产物放入 `workbench/research/structured-prd/`。不要默认把 `structured-prd.json`、`structured-prd-review.md` 或 `open-questions.md` 放入 `workbench/specs/`。
8. 根据已确认的复杂度运行 `node <plugin-root>/scripts/supermaestro.js init documents/<需求同名目录>/workbench --name "<需求名>" --mode <lite|standard|strict>` 初始化 `workflowVersion: 3` 机器状态。工作流模式一经 Scope 批准不得降级；确需改变时，说明原因并新建 workbench。
9. 调用 `$mission-control` 初始化或刷新工作台，先生成 `workbench/specs/requirement-alignment.md`：用业务语言复述需求，列出范围内/范围外、规则、例子、AI 推断、待确认项和验收场景。
10. 同时存在 API 物料和 UI 物料时，必须生成 `workbench/specs/page-contract-matrix.md`：把页面或模块、PRD `source_ref`、UI 画板或 schema、接口或 mock、公共契约和 RP 逐项绑定；多页面需求没有该矩阵不得进入 Scope Gate。
11. 如果 Scope Gate 仍存在需要用户判断的模糊点，生成 `workbench/specs/gate-1-brainstorming-questions.md`：问题必须成组、可回答、能反向更新主工作台文档，避免把问题散落在对话里。文件名保留 `gate-1` 仅用于旧工作台兼容。
12. 用户回答问题后，必须把答案汇总回写到 `context.md`、`specs/requirement-alignment.md`、`plans/progress.md`；如果存在页面、接口和 UI 联动，则同步更新 `specs/page-contract-matrix.md`。问题清单只作为审阅记录，不能成为唯一事实源。
13. 输出简短的 Scope 需求对齐简报，只确认需求理解、范围、规则、例子、推断项和验收场景；不要在 Scope 用任务计划细节替代需求对齐。
14. Scope 通过后，再生成或确认任务计划、进度表、审查包骨架和验证报告，并进入 Plan 计划确认阶段。
15. `strict + UI` 在计划门禁前必须记录视觉验证决策：需要设计还原/回归证明时启用 `--visual true`；确实不适用时记录 `not-applicable`、原因、风险和用户确认；缺少基线或运行环境且不能排除风险时标记 `blocked`。

## 输出与完成标准

- `documents/<需求名>/source/` 中保留不被改写的原始材料。
- `documents/<需求名>/workbench/` 中存在由根 CLI 初始化的机器状态。
- Scope 所需的人类文档已填写，API discovery、UI 物料健康和高风险缺口有明确状态。
- 回复包含模式选择、已收集/缺失物料、阻塞项、工作台路径和下一道人工 Gate。
- 默认停在 Scope Gate；未获用户明确确认时，不批准 Scope。

## 异常与降级

- 目标仓库或分支不明确：停止创建工作台，先确认目标。
- 外链、API 或蓝湖物料不可访问：保留来源与尝试记录，标为 `partial` / `blocked`，不得伪造发现结果。
- 原始材料互相冲突：把冲突集中到需求对齐和进度文档，等待用户或事实源负责人决策。
- 低风险材料缺失：可带明确假设继续规划；高风险材料缺失则保持 Scope 阻塞。
- 已有 v3 工作台：先读取 `state.json` 和 `events.jsonl`，按 `resume`/`next`
  恢复；不要重新 `init` 覆盖状态。
- v2 工作台：`status` / `resume` 不静默迁移，只能显式运行
  `init <workbench>`。迁移保留原物料和工作台文档，保留有效 Scope，重置
  Plan/Review/Final、执行模式、旧验证和 worktree registry；缺少
  `sourceRoot` 时追加 `--source-root "<git-worktree>"`。未知版本失败关闭。

## 边界

- 在获得对应的 `mission-control` 门禁确认前，不要开始编码、创建 Git 工作树、派发子智能体、执行 `commit`、`merge`、`push` 或清理 Git 工作树。Scope 只能在用户明确确认需求对齐后批准；Plan 只能在用户明确确认任务计划和执行模式后批准；两个命令都必须记录 `--confirmed-by user --confirmation "<用户确认原话或摘要>"`。
- 不要把结构化 PRD 中间产物或 Scope 的集中讨论问题清单当成唯一事实源；必须保留 `source_ref`，并确保原始 PRD、API、UI 和用户回答可回溯。轻量需求优先把可执行事实写入 `context.md`、`specs/requirement-alignment.md`、`plans/task-plan.md` 和 `plans/progress.md`，避免在 `specs/` 堆放不会被编码直接引用的过程文件。
- 不要自行发挥 UI 细节。只要存在 `source/ui/manifest.json` 和 `schemas/*.json`，就把 Sketch Data 作为 UI 主事实源，并遵守 `$mission-control` 的 UI 规则。
- 不要把接口地址当成已确认的接口契约；能解析时必须在 Scope 前解析并分类公共接口、页面接口和范围外接口，不能留给实现阶段临时发现。
- 不要把蓝湖 Cookie、令牌、账号、私有链接等敏感信息写入 manifest、报告或最终回复。
- 物料缺失但风险较低时，可以说明假设并继续规划；如果缺失信息会影响范围、最终画板绑定、接口契约、权限、奖励、发布安全或验收结论，必须在 Scope 标为阻塞确认项。

## 推荐提示词

```text
使用 $requirement-workbench 处理这个需求：PRD 在 <path/link>，接口文档在 <path/link>，蓝湖链接是 <url>，目标仓库是 <repo>。请生成 documents/<需求名>/source 和 workbench，先停在 Scope 需求对齐确认阶段。
```
