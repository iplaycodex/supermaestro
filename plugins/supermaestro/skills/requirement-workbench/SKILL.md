---
name: requirement-workbench
description: 当用户接到一个新的软件需求，希望 Codex 收集 PRD、接口文档、蓝湖/UI、mock、截图或其他研发物料，生成 documents/<需求名>/source + workbench 工作台，按需调用 lanhu-export 和 prd-structure，并初始化 mission-control 规划、停在 Gate 1 等待确认时使用。
---

# 需求工作台

把零散需求物料整理成可交给 `mission-control` 推进的需求工作台。本 skill 只做轻量入口和流程路由；蓝湖导出、PRD 结构化和任务编排细节交给插件内的专用 skills。

## 原则

- 默认使用中文输出。
- 需求接收后必须初始化 SuperMaestro 机器状态：`workbench/state.json`、`workbench/events.jsonl` 和 `workbench/mission.state.json`。
- 工作台 Markdown 是人类审阅投影；关键 Gate 和动作状态以 `scripts/supermaestro.js` 维护的机器状态为准。
- 原始物料保持不改，统一放在 `documents/<需求同名目录>/source/`。
- 过程产物统一放在 `documents/<需求同名目录>/workbench/`。
- 遇到蓝湖 stage 链接、版本分组或 UI schema 导出需求时，使用 `$lanhu-export`。
- 遇到中大型、规则复杂、边界不清或后续需要拆任务的 PRD 时，使用 `$prd-structure`。
- 需求工作台初始化、Gate Brief、Review Pack、验证记录、worktree 规划和执行控制交给 `$mission-control`。
- 默认停在 Human Gate 1；除非用户明确要求继续编码，不要进入实现阶段。

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
5. 如果 `source/api/` 中是接口文档地址或 Knife4j/Swagger/OpenAPI/Postman 入口，Gate 1 前必须先尝试解析真实接口清单：优先使用文档页面给出的 OpenAPI JSON；Knife4j 可尝试 `swagger-resources`、`/v3/api-docs`、`/v2/api-docs`；无法访问时在 `workbench/specs/api-spec.md` 标记 blocked/partial 和原因。不要把核心接口发现延后到 F1。
6. 如果用户提供蓝湖 stage 链接或分组名，调用 `$lanhu-export`，默认以 schema-only 方式导出到 `source/ui/`；只有用户明确要求视觉基线时才导出图片。
7. 如果存在 PRD 物料，调用 `$prd-structure`，默认把结构化结果放入 `workbench/specs/`，除非用户指定其他路径。
8. 运行 `node <skill-dir>/scripts/supermaestro.js init documents/<需求同名目录>/workbench --name "<需求名>"` 初始化机器状态。
9. 调用 `$mission-control` 初始化或刷新工作台，完成 UI 体检、物料索引、共享上下文、任务计划、进度表、Review Pack 骨架和验证报告。
10. 同时存在 API 物料和 UI 物料时，必须生成 `workbench/specs/page-contract-matrix.md`：把页面/模块、PRD source_ref、UI 画板/schema、接口/mock、公共契约和 RP 逐项绑定；多页面需求没有该矩阵不得进入 Gate 1。
11. 输出简短的 Gate 1 Decision Brief，说明范围、缺失物料、UI/API 健康状态、页面契约矩阵、待确认问题、推荐执行档位、审查成本和需要用户确认的具体决策。

## 边界

- 在获得对应的 `mission-control` Gate 确认前，不要开始编码、创建 worktree、派发子 agent、commit、merge、push 或清理 worktree。
- 不要把 `structured-prd.json` 当成唯一事实源；必须保留 `source_ref`，并确保原始 PRD/API/UI 物料可回溯。
- 不要自行发挥 UI 细节。只要存在 `source/ui/manifest.json` 和 `schemas/*.json`，就把 Sketch Data 作为 UI 主事实源，并遵守 `$mission-control` 的 UI 规则。
- 不要把接口地址当成已确认接口契约；能解析时必须在 Gate 1 前解析并分类公共接口、页面接口和范围外接口，不能留给实现阶段临时发现。
- 不要把蓝湖 Cookie、token、账号、私有链接等敏感信息写入 manifest、报告或最终回复。
- 物料缺失但风险较低时，可以说明假设并继续规划；如果缺失信息会影响范围、最终画板绑定、接口契约、权限、奖励、发布安全或验收结论，必须在 Gate 1 标为阻塞确认项。

## 推荐提示词

```text
使用 $requirement-workbench 处理这个需求：PRD 在 <path/link>，接口文档在 <path/link>，蓝湖链接是 <url>，目标仓库是 <repo>。请生成 documents/<需求名>/source 和 workbench，先停在 Gate 1。
```
