---
name: prd-structure
description: 将 PRD、需求文档、语雀/飞书/Markdown 导出、产品说明或研发需求资料抽取为可审查、可追溯的结构化需求事实包。用于用户要求“读需求文档生成结构化数据/JSON/prd.json/结构化 PRD”、希望给 mission-control 提供更稳定的事实源，或需要先做需求抽取再进入任务拆分、第 1 道门禁、审查包和 AI 编码流程时。
---

# PRD 结构化

## 目标

把原始需求文档读成“可审查、可追溯、可修正、可进入研发编排”的结构化事实包。结构化结果是中间事实源，不替代原始 PRD；原始 PRD 永远优先。

适合中大型需求进入 `$mission-control` 前使用，也适合单独生成 `structured-prd.json`、人工审查清单和待确认问题。

## 工作原则

- 先保留原文，再抽取结构；不要改写原始 PRD。
- 每条结构化事实必须带 `source_ref`，至少包含文件、章节、行号或原文定位。
- 区分 `fact`、`inference`、`question`：不要把推断写成事实。
- 给每条事实标记 `confidence` 和 `review_status`，默认人工未确认前为 `pending`。
- 结构化 PRD 只能驱动已确认或已修正的范围；`unclear`、`rejected`、`conflict` 不能进入编码任务。
- 输出要服务研发：模块、规则、状态、字段、接口、UI、埋点、验收和风险都要能映射到后续任务或审查包。

## 推荐产物

若用户没有指定输出位置，在当前需求工作台或当前目录生成：

```text
structured-prd/
├── structured-prd.json        # 结构化需求事实包
├── structured-prd-review.md   # 人工审查表
├── open-questions.md          # 待确认问题
└── source-map.json            # 结构化条目到原文位置的映射
```

在 `$mission-control` 工作台内使用时，默认不要把结构化中间产物放进 `workbench/specs/`。轻量或中等 PRD 应把可执行事实合并到 `context.md`、`plans/task-plan.md`，把阻塞或待确认问题合并到 `plans/progress.md` 或门禁简报。

只有长文档、OCR/截图多、规则复杂到需要机器事实包，或用户明确要求保留结构化结果时，推荐放在：

```text
documents/<需求名>/
├── source/prd/original.md
└── workbench/research/structured-prd/
    ├── structured-prd.json
    ├── structured-prd-review.md
    ├── open-questions.md
    └── source-map.json
```

若已有 `workbench/context.md`、`plans/task-plan.md`、`reviews/review-packs.md`，不要直接覆盖；先把结构化结果作为规格输入，待人工确认后再同步。

## 抽取流程

1. 读取原始材料
   - Markdown/HTML/导出文本优先直接读取。
   - 链接、PDF、图片、设计稿按当前可用工具读取；无法完整访问时明确标注“基于有限信息”。
   - 记录源文件路径、标题、章节层级、表格、图片 OCR、外链和明显缺失物料。

2. 建立文档骨架
   - 抽取版本记录、背景、目标、范围、非范围。
   - 建立章节树和来源映射。
   - 标出表格、图片 OCR、删除线、红字、批注、链接等可能影响理解的内容。

3. 抽取研发事实
   - `modules`: 页面、流程、后台、配置、数据统计、入口。
   - `rules`: 业务规则、展示规则、排序规则、领取规则、过期规则。
   - `states`: 状态机、按钮状态、任务状态、奖励状态。
   - `fields`: 展示字段、后台配置字段、接口依赖字段。
   - `entities`: 用户、任务、奖励、里程碑、会员、渠道、活动。
   - `apis`: PRD 明确给出的接口、后端依赖、mock 或 API 待补项。
   - `ui`: PRD 图片、设计稿引用、蓝湖/MasterGo/Lanhu schema 需求。
   - `analytics`: 前端埋点、后端 CDP key、字段映射。
   - `acceptance`: 可验收场景和缺失验收标准。
   - `open_questions`: 影响开发、联调、测试、上线的问题。

4. 生成审查表
   - 按模块和风险排序列出待人工确认项。
   - 高风险项优先：登录/实名/权限、奖励发放、状态流转、接口字段、投放人群、过期/循环、埋点口径、UI 资源。
   - 每个问题写清影响面和建议确认对象。

5. 人工确认后再同步
   - `accepted` 和 `corrected` 可以进入 `context.md`、`task-plan.md`、任务卡和审查包。
   - `unclear` 必须进入 `plans/progress.md` 的阻塞或待确认项；如果当前是复杂 PRD 且已生成 `research/structured-prd/open-questions.md`，该文件只作为临时审查来源，不替代进度记录和门禁简报。
   - `rejected` 不得进入实现范围。
   - 如已经生成计划或代码，发现结构化偏差时必须回到规格层修正，再更新受影响任务。

## 质量分级

给结构化结果一个整体质量等级：

| 等级 | 条件 | 可用于 |
| --- | --- | --- |
| 高 | 原文结构清晰、表格完整、规则可定位、关键事实有 source_ref | 第 1 道门禁的需求对齐，第 2 道门禁的计划和任务拆分 |
| 中 | 主要规则可抽取，但 UI/接口/埋点依赖外部资料 | 规划草稿和人工审查 |
| 低 | 文档短、截图多、OCR 多、缺少表格或关键状态 | 只做问题清单，不直接进编码 |

不要因为能生成 JSON 就声明质量高。质量判断必须基于可追溯性、规则完整性和人工审查成本。

## 与 mission-control 配合

使用 `$mission-control` 时，结构化 PRD 的职责是提升第 1 道门禁的质量：

- 轻量或中等 PRD：不生成独立的 `specs/structured-prd*` 文件；把事实摘要合并进 `context.md`，把阻塞或确认项合并进 `plans/progress.md` 和第 1 道门禁决策简报。
- 复杂 PRD：`research/structured-prd/structured-prd.json` 作为事实候选源，`structured-prd-review.md` 作为人工审查清单，`open-questions.md` 作为临时来源；确认后仍需汇总回写到 `context.md`、`plans/task-plan.md` 和 `plans/progress.md`。
- `source_ref` 帮助审查代理和人工回到原文检查。

不要让编码执行者只读取结构化 JSON。编码执行者至少还应读取共享的 `context.md`、相关 `specs/*`、任务卡和必要的原文片段。

## 何时读取引用

- 需要设计 JSON 字段或输出完整结构时，读取 `references/structured-prd-schema.md`。
- 需要安排人工介入、偏差修正或第 1 道门禁审查时，读取 `references/human-review.md`。
