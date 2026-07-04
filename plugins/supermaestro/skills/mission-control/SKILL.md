---
name: mission-control
description: Use when a medium or large software requirement needs staged planning, resumable workflow state, human gates, review packs, worktree isolation, subagent coordination, source/workbench materials, strict validation, or handoff.
---

# Mission Control

把一个中大型需求转成可审查、可暂停、可恢复的研发流程。主控负责上下文、任务边界、Gate 决策、进度和集成；子 agent 只执行任务卡限定的工作。

## 规范化分层

- 先读取插件内 `profiles/core-workflow.md`，把它作为 Gate、状态、review 和 validation 的核心规则。
- 当目标项目是 Taro 小程序/H5 且存在蓝湖 schema 物料时，再读取 `profiles/weapp-taro-lanhu.md`；不要把领域规则当成 core workflow。
- 机器状态优先由 `scripts/supermaestro.js` 维护：`state.json` 是当前 workflow 状态，`events.jsonl` 是追加事件日志，`mission.state.json` 是 resume/next 投影。
- Markdown 工作台文件仍然必须维护，但它们是人类审阅投影和交付证据，不应作为唯一机器状态源。
- 关键动作必须优先通过脚本检查；如果脚本拒绝动作，停止并向用户报告原因，不要只靠 prompt 规则继续执行。

## 核心原则

- 默认先规划，除非用户明确要求立刻实现。
- 默认中文输出；Markdown 文档标题、正文、表头用中文，路径、命令、代码标识和接口字段保留原文。
- 使用 `documents/<需求同名目录>/` 作为需求根目录；其中 `source/` 放用户提供的原始开发物料，`workbench/` 放本技能生成和维护的工作台文档。用户直接指定旧式工作台目录或旧版 `input/` 物料目录时，保持兼容。
- 拆任务前先读取仓库规则、当前分支、PRD、设计稿、mock/API、UI 导出包和相关代码。
- 默认轻量工作台：只生成当前需求必需的文档。流程文档的维护成本不得接近或超过编码成本；如果一个需求预计编码小于 1 天，核心工作台应优先控制在 6-8 个 Markdown/JSON 文件内。
- 任务状态对人类审阅时同步到 `workbench/plans/progress.md`；机器状态以 `workbench/state.json` 和 `workbench/events.jsonl` 为准。`mission.state.json` 只记录恢复摘要，不得手写任务 CRUD。
- 主控工作台是唯一全局状态写入点：编码 worker 和 review agent 可以读取共享上下文，但不得直接更新主控工作台的 `plans/progress.md`、`agents/agent-index.md`、`worktrees/plan.md`、`reviews/review-packs.md` 或 `reports/validation.md`。worker 只在自己的 worktree 写 `workbench/agents/<task-id>/handoff.md` 和任务验证记录；review agent 只写 `reviews/code-review/<RP>.md`。主控读取这些产物后 fan-in 回主工作台。
- `workbench/plans/task-plan.md` 保持短计划，只写范围、DAG、依赖、执行模式、review 顺序和验证策略；不要重复 `api-spec.md` 的接口表、`ui-schema-extract.md` 的 UI 映射表或 `progress.md` 的动态状态。
- `workbench/plans/progress.md` 记录动态进度、当前任务、阻塞项、进度日志、review artifact 和验证进展。
- `workbench/context.md` 是共享上下文和导航页；`workbench/specs/` 只放可实现、可验收、可引用的规格文档。
- 建立工作台时必须创建或更新标准 Markdown 占位文档，不能只创建目录；即使尚未编码，`reviews/review-packs.md` 和 `reports/validation.md` 也必须记录 pending 状态。
- 如果发现接口文档、Swagger/OpenAPI、Postman、Mock 数据或后端依赖，必须创建或更新 `specs/api-spec.md`；接口规格是接口封装、mock、联调、异常空态和 API 验证的主事实源。
- 未经过 Human Gate 1 确认，不创建 worktree、不切分支、不派发子 agent、不开始编码；`approve-gate1` 必须记录 `--confirmed-by user --confirmation "<用户确认原话或摘要>"`，不能由 agent 自行默认批准。
- Human Gate 保持三层：Gate 1 确认计划和执行模式，Gate 2 确认 review pack 与验证结果，Gate 3 确认 merge、commit、push 或清理 worktree 等最终危险动作。
- 未经过 Human Gate 2 确认，不进入最终动作申请；未经过 Human Gate 3 确认，不 merge、不 commit、不 push、不清理 worktree。
- 不为了使用本技能强制创建多个子 agent；先给出执行档位：主控串行、单 worktree 串行、多个 worktree/子 agent 并发。
- 执行能力必须动态插拔：只生成当前 Gate 1 档位实际需要且马上会被使用的工作台模块；串行模式不生成 worktree / multi-agent 专用文档。
- Worktree 和子 agent 是两个独立开关：可以只用 worktree 做代码隔离，不派发子 agent；也可以主控串行使用多个 worktree。
- Worktree 只代表代码隔离，不代表必须生成 `tasks/`、`agents/`、`contract-changes/` 或 `integration/`。没有真实外部 agent、真实契约变更或真实集成分支时，不生成对应目录。
- Review Agent Checkpoint 不新增正式 Gate，但在 `allowSubagents=true` 且派发真实编码 worker 时默认强制启用：每个 worker 完成 handoff 后，主控先做完成性检查，再新开只读 review agent 审查对应 RP；review agent 通过后才进入 `ready-for-human-review`。如用户明确关闭，Gate 1 Brief 必须写明缺少独立代码审查的 review 成本。
- Superpowers 作为执行方法栈接入，但不替代 Mission Control 主控：本技能继续负责 workbench、Gate、状态、review pack、worktree 和集成；计划粒度优先吸收 `superpowers:writing-plans` 的“文件/步骤/测试/命令/预期结果”格式；真实多 agent 执行优先使用 `superpowers:subagent-driven-development`；不开 subagent 或跨会话串行执行时才使用 `superpowers:executing-plans`。
- 编码 worker 默认必须评估 `superpowers:test-driven-development` 适用性。API/server/mock、hook、store、数据转换、状态机、跳转参数、权限/异常分支和业务计算等可测试行为必须先写失败测试并记录 RED/GREEN 证据；纯视觉还原、纯配置、资源搬运或生成代码可以跳过 TDD，但必须在任务卡、handoff 和 validation 中写明跳过原因。
- 中大型需求必须把 reviewability 作为 Gate 1 硬约束；review pack 必须对应实际可审查产物（worktree 未提交 diff、patch、PR，或用户明确授权后的 local commit），不能只停留在 Markdown 文件列表。
- 每个编码任务必须形成独立 review pack。预计超过 5-8 个文件或跨多个功能面时，继续拆分。
- 默认禁止自动 commit：编码任务完成后保持 worktree 中的未提交改动供用户 review；只有用户在对应 review 后明确授权提交、commit 或 checkpoint commit，才允许执行本地 commit。
- 默认禁止把 worktree 建在 `/tmp`、`/private/tmp`、系统临时目录或其他易清理位置；worktree 默认建在主仓库同级目录 `<repo>.worktrees/<task-id>`。如果权限、磁盘或工具限制导致无法使用项目旁目录，必须先停下说明原因并征得用户确认。
- 当多个交付物依赖同一个公共基础任务（如公共组件、基础页面、接口封装、mock、路由、scheme、store、数据模型或全局配置）时，必须设置阻塞型 Foundation Review Checkpoint：公共依赖任务完成并形成 review artifact 后，先停下让用户 review；用户确认前，不启动或继续依赖它的页面/功能切片。
- Foundation 不是单个“大包”任务。规划时按公共契约面拆小：API/server/mock、route/scheme、公共 UI 组件、测试/fixture 等应优先拆成 F1a/F1b/F1c 或多个 RP；单个 foundation 预计超过 5-8 个文件、跨 3 个以上目录或同时覆盖 3 类契约面时，必须继续拆分并说明 review 顺序。
- Foundation 经用户 human-approved 后，如果下游 worktree 依赖该公共基线，推荐并允许创建本地 checkpoint commit 作为 downstream base；后续 P 类 worktree 必须基于该 checkpoint commit 创建，保证 P-only diff 干净。不得默认把未提交 foundation 基线复制进每个 feature worktree；如果用户不允许 checkpoint commit，必须改用串行、单 worktree 或 per-RP patch 方案，并在 Gate 1 说明 review 成本。
- 标准 git worktree 是独立工作区，不自带忽略文件和依赖目录；需要可运行时，必须在每个 worktree 安装依赖或明确使用完整项目拷贝模式。完整项目拷贝不是标准 worktree 模式，采用时必须用 patch/commit 作为 review artifact 管理差异。
- Foundation Review Checkpoint 不新增正式 Gate 层级；Human Gate 仍保持三层。但它是 Gate 1 后、依赖切片开始前的强制人工检查点，必须写入计划、进度和 review pack。
- 预计命中复杂度阈值（多页面、多画板、公共组件/接口/路由、超过 8 个文件、同时新增和改造页面）时，不推荐 `main-serial + checkpoint=false`；如用户仍选择，Gate 1 Brief 必须明确 review 成本并安排 per-RP patch。
- 验证必须按风险分级，不能把 parser、formatter、`git diff --check` 当成行为验证。页面/组件任务至少要尝试可运行的页面级构建、聚焦测试、渲染/截图、mock 链路或路由检查；无法执行时必须写清真实阻塞和剩余风险。
- Gate 2 前必须输出人可执行的 review brief：按顺序列出要 review 的 RP、每个 RP 的 diff 命令、涉及文件、验证证据和未验证风险。不要只让用户翻工作台文档。
- 长流程恢复或换线程后，先运行 `supermaestro.js resume <需求工作台>`，用 `state.json` 和 `mission.state.json` 恢复上下文；不要只靠记忆猜当前阶段。
- 除非用户明确授权，不要擅自 commit、merge、push、清理 worktree 或回滚用户改动。

## UI 硬规则

- UI 还原事故红线：不得把强视觉设计稿实现成“结构可用版”。如果页面视觉主要由图片资产、复杂卡片、圆环、进度、渐变、高光、图标组合或特殊状态承载，必须先确认资源来源和图层结构，再编码；缺少资源或无法确认最终画板时，必须停下问用户，不能用 CSS 近似、经验补位或旧组件风格替代。
- 如果需求根目录存在 `source/ui/manifest.json`，或旧式 `input/ui/manifest.json` / `ui/manifest.json`，先运行 UI 体检；不要把蓝湖导出包当普通截图。
- UI 物料标准形态是 `ui/manifest.json` + `ui/schemas/*.json`：manifest 是画板和 `schema_path` 索引，不代表必须存在图片资源；`schemas/*.json` 是蓝湖导出的 Sketch Data 原文。
- 绑定画板必须精确到最终稿。用户、截图或蓝湖页面中出现 `版本2`、`新版`、`备份`、`副本`、`可开/不可开`、状态名、时间戳等差异时，必须在 manifest 和 schemas 中逐一核对画板名称、schema 文件、根尺寸、关键节点和截图标题；无法找到完全匹配的最终稿时，必须把 UI 编码标为 blocked 并询问用户重新导出或指定画板，不能默认选同名近似画板或旧稿。
- UI 开发必须 Sketch Data first 且 schema-only 可执行：存在 `source/ui/schemas/*.json`，或旧式 `input/ui/schemas/*.json` / `ui/schemas/*.json` 时，这些 JSON 是布局、尺寸、颜色、字体、圆角、阴影、图层、资源和文本的唯一主事实源；图片只是可选视觉基线 expected。图片缺失、被删除或不可读时，不得降低为凭截图/经验/现有组件“结构版还原”，必须显式进入 schema-only 模式继续按 Sketch Data 开发。
- 绑定蓝湖画板的 UI 编码任务，编码前必须直接读取对应 Sketch Data JSON 原文；不能只读 `inspect-ui` 摘要、manifest、基线图或人工概述。必须从 JSON 逐节点提取画板、组、形状、文本、图片等图层的层级、可见文本、坐标、尺寸、颜色、字号、字重、行高、圆角、边框、阴影、图层顺序、资源引用和组件重复结构。
- 实现必须严格按照 Sketch Data 写页面，不允许自行发挥任何视觉细节。不得自行改动或发明间距、尺寸、字号、颜色、圆角、阴影、布局方向、对齐方式、层级顺序、文案、省略规则、图标、状态样式或资源。如果 Sketch Data 缺字段、字段含义不明或与 PRD 冲突，必须停下记录阻塞并询问用户；不能靠经验补齐。
- 不允许把 Sketch Data 中的图片图层、复杂组合图层或明显由切图承载的视觉元素改成 CSS 意译。遇到签到奖励格、圆环进度、盲盒按钮、渐变高光、装饰背景、特殊 icon、复杂 badge 等强视觉节点时，优先使用设计资源或用户指定 OSS 资源；如资源缺失，必须记录缺失资源名/节点路径并询问用户，不得用圆形、线条、纯色块等近似替代。
- 用户声明切图已上传 OSS 或给出 `processOssImg('<prefix>/...')` 前缀时，UI 编码前必须建立“资源引用清单”：从 Sketch Data 图片节点、manifest、source/ui、用户说明和现有代码中提取资源名，逐项映射到 OSS 路径或本地资源。没有完成资源映射前，不得开始实现强视觉区域；如果资源名只能推断，必须在 Gate 1 或编码前向用户确认。
- schema 提取结果必须写入 `specs/ui-schema-extract.md`，或写入任务卡中明确的“Sketch Data 提取”小节；没有节点级 Sketch Data 提取结果，不得开始 UI 编码。节点级提取至少包含：根画板尺寸、设计宽度、关键容器/卡片/按钮/输入框/列表项的 x/y/width/height、背景色、圆角、边框/阴影、文本内容、字号、颜色、行高、字重、相邻间距、资源引用、图片图层名称、重复组件结构和状态差异。
- 每个 UI 任务必须维护一张“Schema 到实现映射表”：`schema 节点/路径`、`设计值`、`代码文件/组件/样式选择器`、`实现值`、`偏差说明`。缺少映射表时不得进入 Gate 2。
- “Schema 到实现映射表”必须包含资源与结构映射，不得只写文本和容器尺寸。对每个强视觉区域必须明确：设计节点路径、资源名/OSS 路径、实现组件、样式选择器、是否使用图片还是 CSS、偏差原因。任何“CSS 近似”“暂用纯色”“结构版占位”都必须视为 UI 阻塞，不能进入 ready-for-human-review，除非用户在 Gate 1 或 Gate 2 明确接受该降级。
- 只要需求根目录存在 `source/ui/manifest.json`，或旧式 `input/ui/manifest.json` / `ui/manifest.json`，编码前必须显式声明本任务是 UI 编码或非 UI 编码；非 UI 编码使用 `--non-ui true --reason <原因>` 说明为什么不需要 schema 检查。
- 不要把 Sketch Data 结构明显不同的多个画板强行抽成一个通用组件。只有 Sketch Data 证明结构一致、差异可参数化时才复用；复用现有组件时，必须用 Sketch Data 中的尺寸、间距、颜色和字号重新校准，不能以“沿用现有风格”为理由牺牲还原度。
- 有 Sketch Data 的 UI 任务不得交付“功能版”“结构版”“大概还原版”。如果无法按 Sketch Data 还原，必须在编码前或发现时停下，记录阻塞项并询问用户，而不是自行降低还原标准。
- UI Gate 2 前必须产出视觉还原证据。优先提供 actual 截图并与 expected/蓝湖截图/用户截图逐块对照；没有 expected 图片时，也必须按 Sketch Data 做人工逐块验收记录，至少覆盖首屏、关键卡片、重复列表、按钮、图标、强视觉资源和滚动位置。只有 parser、formatter、SCSS 编译、`git diff --check` 时，不得声明 UI 还原完成。
- 如果无法启动页面、无法截图、无法访问设计基线或无法核对 OSS 资源，UI 任务最多只能标记为 `code-complete / visual-validation-blocked`，不得标记为 `ready-for-human-review` 或请求 Gate 2，除非用户明确说接受跳过视觉验收。
- UI 编码前运行 harness 闸门：

```bash
node <skill-dir>/scripts/supermaestro.js check <需求工作台> --action code --ui true --boards "<画板名>" --schemas "../source/ui/schemas/<file>.json" --schema-extract "specs/ui-schema-extract.md" --baselines "../source/ui/images/<file>.png"
```

图片已删除或不提供基线图时，显式使用 schema-only：

```bash
node <skill-dir>/scripts/supermaestro.js check <需求工作台> --action code --ui true --schema-only true --boards "<画板名>" --schemas "../source/ui/schemas/<file>.json" --schema-extract "specs/ui-schema-extract.md"
```

新结构下 `<需求工作台>` 通常是 `documents/<需求同名目录>/workbench`，UI 路径使用 `../source/ui/schemas/<file>.json` 和可选的 `../source/ui/images/<file>.png`。旧式 `../input/ui/...` 和 `ui/...` 路径仍兼容。

## 工作台结构

创建或使用这些目录：

```text
documents/<需求同名目录>/
├── source/
│   ├── prd/
│   ├── api/
│   └── ui/
│       ├── manifest.json
│       ├── schemas/
│       └── images/         # 可选；未来可不存在
└── workbench/
    ├── state.json          # SuperMaestro CLI 维护的机器状态
    ├── events.jsonl        # append-only 流程事件
    ├── mission.state.json  # resume/next 投影；不要手写任务状态
    ├── context.md
    ├── gates/
    │   ├── gate-1-decision.json
    │   ├── gate-2-decision.json
    │   └── gate-3-decision.json
    ├── specs/
    │   ├── api-spec.md
    │   ├── ui-material-index.md
    │   ├── ui-schema-extract.md
    │   └── page-contract-matrix.md   # 同时存在 API + UI 物料时必填
    ├── plans/
    │   ├── task-plan.md
    │   └── progress.md
    ├── reviews/
    │   └── review-packs.md
    └── reports/
        └── validation.md
```

按 Gate 1 动态生成的可选目录：

```text
workbench/
├── worktrees/             # 真实使用 worktree 时生成路径/分支计划
├── tasks/                 # 仅当任务卡确实能减少沟通成本时生成；不含 state.json
├── agents/                # 仅当派发真实外部 agent/thread 时生成
├── reviews/code-review/   # 仅当启用只读 review agent 时生成
├── contract-changes/      # 仅当发生或预计发生公共契约变更请求时生成
├── integration/           # 仅当需要独立集成分支/集成计划时生成
└── reviews/patches/       # checkpoint=false 且多个 RP 时生成 patch 索引
```

不要在未启用对应 Gate 1 开关时生成这些可选目录。即使开关已启用，也只在目录会立刻承载实际信息时生成；禁止为了“完整”生成空索引、空状态表或 pending agent brief。

旧目录中已有 `AI开发上下文.md`、`AI任务看板.md`、`specs/context.md`、根目录直接放 `harness.json`，或已有旧版 `input/` 物料目录时，保持兼容，不自动迁移或删除；但新建或整理工作台时，优先使用 `source/` + `workbench/`。

## Harness 用法

Harness / SuperMaestro CLI 只做三件事：初始化机器状态、记录 Gate 确认、执行 UI/Gate/验证闸门检查。

初始化：

```bash
node <skill-dir>/scripts/supermaestro.js init <需求工作台> --name "<需求名>"
```

新结构中 `<需求工作台>` 是：

```bash
documents/<需求同名目录>/workbench
```

UI 体检：

```bash
node <skill-dir>/scripts/inspect-ui.js <需求工作台> --write-index true
```

体检默认优先读取 `<需求根目录>/source/ui/manifest.json`，并兼容旧版 `<需求根目录>/input/ui/manifest.json` 和旧式 `ui/manifest.json`；随后生成或更新 `workbench/specs/ui-material-index.md`，记录 manifest 来源、画板数量、schema/image 可读性、路径重定位、dry-run、图片尺寸、设计宽度/DPR、疑似备份画板和阻塞风险。

查看状态：

```bash
node <skill-dir>/scripts/supermaestro.js status <需求工作台>
```

查看推荐下一步：

```bash
node <skill-dir>/scripts/supermaestro.js next <需求工作台>
```

恢复长流程上下文：

```bash
node <skill-dir>/scripts/supermaestro.js resume <需求工作台>
```

`next` / `resume` 会刷新 `mission.state.json`，输出当前阶段、三层 Gate 状态、推荐下一步、建议命令、是否需要人工确认和阻塞项。它只做流程导航，不替代 `state.json` 和 `events.jsonl`。

Gate 1 前工作台完整性检查：

```bash
node <skill-dir>/scripts/supermaestro.js check-workbench <需求工作台>
```

`check-workbench` 会检查标准工作台文档是否存在且非空；共享上下文优先检查 `workbench/context.md`，并兼容旧路径 `specs/context.md`；存在接口/API/mock 物料时，还会检查 `specs/api-spec.md`；存在 `../source/ui/manifest.json`，或旧式 `../input/ui/manifest.json` / `ui/manifest.json` 时，还会检查 `specs/ui-material-index.md` 和 `specs/ui-schema-extract.md`；同时存在 API 和 UI 物料时，还会检查 `specs/page-contract-matrix.md`。缺少 `plans/progress.md` 等文件时必须先补齐占位文档，不能进入 Gate 1。

Gate 1 确认：

```bash
node <skill-dir>/scripts/supermaestro.js approve-gate1 <需求工作台> --mode <main-serial|single-worktree-serial|multi-worktree-parallel> --confirmed-by user --confirmation "<用户确认原话或摘要>" --worktree <true|false> --subagents <true|false> --checkpoint <true|false>
```

Gate 2 Review 请求和确认：

```bash
node <skill-dir>/scripts/supermaestro.js request-gate2 <需求工作台> --review-pack reviews/review-packs.md --validation reports/validation.md
```

Gate 3 最终动作请求和确认（当前脚本只提供 `check --action commit|merge|push|cleanup` 护栏；正式 approve-gate3 后续补齐前，不要自动执行最终动作）：

```bash
node <skill-dir>/scripts/supermaestro.js check <需求工作台> --action commit
```

危险动作前检查：

```bash
node <skill-dir>/scripts/supermaestro.js check <需求工作台> --action code --non-ui true --reason "只改接口或非视觉逻辑"
node <skill-dir>/scripts/supermaestro.js check <需求工作台> --action commit
node <skill-dir>/scripts/supermaestro.js check <需求工作台> --action push
```

Gate 1 后按执行档位生成可选模块：

```bash
# 当前版本由主控按 Gate 1 选择手动生成必要目录；后续可接入 scaffold-execution-mode.js。
```

Gate 2 前检查 review 可审查性：

```bash
node <skill-dir>/scripts/supermaestro.js verify <需求工作台> --strict true
```

Gate 2 前统一关门检查：

```bash
node <skill-dir>/scripts/supermaestro.js verify <需求工作台> --strict true
```

`verify --strict` 会组合检查工作台完整性、Gate 1 状态、review pack 和 `reports/validation.md` 的验证证据；通过后才请求 Gate 2。更细的 diff/patch/PR reviewability 检查后续作为 adapter 增强。

普通非 UI 编码只需要 Gate 1 通过；如果存在 UI manifest，仍必须额外带 `--non-ui true --reason <原因>`。UI 编码必须额外带 `--ui true --boards --schemas --schema-extract`。

## 工作流

### 1. 接收需求

收集并总结：

- 目标、目标分支、期望产物、时间要求。
- PRD、UI 设计稿、Lanhu 导出包、mock/API 文档、后端依赖、截图、切图资源。
- 可能涉及的代码区域。
- 兼容性、禁止修改范围、发布风险、验证要求。
- 缺失决策、关键假设和待确认问题。

如果信息缺失但能安全假设，先说明假设并继续规划；如果会影响范围或实现方向，只问最小必要问题。

### 2. 建立工作台

- 定位或创建 `documents/<需求同名目录>/`，并把原始 PRD、接口文档、UI 资料分别放在 `source/prd/`、`source/api/`、`source/ui/`；不要修改原始物料内容。
- 定位或创建 `documents/<需求同名目录>/workbench/` 作为 `<需求工作台>`。
- 扫描 PRD、接口文档、UI 资料、切图、截图和用户补充说明；读取原始物料时使用 `../source/...` 相对路径。
- 在 `workbench/` 初始化 SuperMaestro CLI；初始化后必须生成或刷新 `state.json`、`events.jsonl` 和 `mission.state.json`。
- 在 `context.md` 中维护“物料与健康度/事实源”小节：记录已发现物料、缺失物料、事实源和关键待确认项。不要为轻量需求单独生成 `specs/material-index.md`；`specs/` 只放会直接约束实现或验收的规格。
- 如果存在接口文档、Swagger/OpenAPI、Postman、Mock 数据或后端依赖，生成或更新 `specs/api-spec.md`：沉淀接口清单、入参、出参、数据模型、页面/任务映射、mock 场景、异常空态和待确认项。若原始物料是接口文档地址，Gate 1 前必须先尝试解析真实接口清单并记录 API Discovery：Knife4j/Swagger 优先读取 OpenAPI JSON，必要时尝试 `swagger-resources`、`/v3/api-docs`、`/v2/api-docs`；无法访问时明确 blocked/partial 和继续规划风险。
- 如果存在 `../source/ui/manifest.json`，或旧式 `../input/ui/manifest.json` / `ui/manifest.json`，运行 `scripts/inspect-ui.js <需求工作台> --write-index true`。
- 如果存在 `../source/ui/schemas/*.json`，必须创建或更新 `specs/ui-schema-extract.md`，并按画板写入节点级 Sketch Data 提取结果和 Schema 到实现映射表占位；图片缺失时记录 `schema-only`，不得把图片缺失记为可以跳过 UI 还原。
- 如果同时存在 API 物料和 UI 物料，生成或更新 `specs/page-contract-matrix.md`：按页面/模块绑定 PRD source_ref、UI 画板/schema、API/mock、公共契约、Review Pack 和阻塞项；没有页面契约矩阵不得把多页面需求推进到 Gate 1。
- 生成或更新根目录 `context.md`：使用 `templates/context-template.md`，沉淀 PRD 摘要、业务规则、技术上下文、UI 契约、任务依赖、风险假设和验证计划。多 agent、worktree、长流程恢复前必须先读这份共享上下文。
- 生成或更新 `plans/progress.md`：使用 `templates/progress-template.md`，先写当前阶段、任务状态表、进度日志、阻塞决策和验证进展；不要把动态任务状态只写在 `task-plan.md`。
- 生成或更新 `reviews/review-packs.md`：使用 `templates/review-packs-template.md`，先写每个 RP 的审查目标、预期 artifact、建议审查顺序和 pending 验证；不要复制长文件清单或重复 progress 状态。
- 生成或更新 `reports/validation.md`：使用 `templates/validation-template.md`，先记录已完成的规划/体检/API 检查、未执行检查和 pending 状态；不要等最终验证才创建文件。

### 3. 生成计划

生成计划前先读取 `references/execution-modes.md` 判断复杂度、执行档位、动态模块和 review artifact。

当需求包含多个页面、模块、公共组件、接口或不确定依赖时，读取 `references/split-strategy.md`。

写 `plans/task-plan.md`，至少包含：

- 共享上下文路径和关键结论。
- 需求范围和非范围。
- 关键事实源和待确认问题。
- 接口规格路径和关键接口风险；详细接口表放 `specs/api-spec.md`。
- UI 画板/schema 范围和 schema-only 策略；节点级提取和映射表放 `specs/ui-schema-extract.md`。必须写明最终画板绑定证据：用户/截图标题、manifest 画板名、schema 文件名、根尺寸和关键节点是否一致；存在 `版本2`、备份稿、状态稿或同名近似稿时，列为待确认或阻塞项。
- 页面契约矩阵路径和覆盖健康度；同时存在 API + UI 物料时，把页面/模块、PRD source_ref、UI 画板/schema、API/mock 和 RP 绑定关系放在 `specs/page-contract-matrix.md`，`task-plan.md` 只写摘要和关键风险。
- UI 资源策略：列出用户提供的 OSS 前缀、本地切图目录、Sketch Data 图片节点和资源引用清单；强视觉区域计划用图片还是 CSS 必须在计划中写清。无法确认资源时，不得把该 UI 任务列为可直接编码。
- 任务 DAG：基础任务、功能切片、审查任务、集成任务。
- 任务颗粒度：参照 `superpowers:writing-plans`，每个可执行任务必须写清修改文件、测试文件、关键步骤、验证命令和预期结果；可测试行为必须包含 TDD 适用性、失败测试命令、预期失败原因、通过测试命令和证据记录位置。
- 公共依赖和 Foundation Review Checkpoint：列明哪些 foundation 任务会解锁多个页面/功能切片、对应 review pack、验收标准、被阻塞的下游任务，以及用户确认前不得启动的范围。
- 进度同步路径：`plans/progress.md`。
- 执行档位推荐：主控串行、单 worktree 串行、多个 worktree/子 agent 并发。
- 动态模块选择：哪些目录会实际生成，哪些不生成；说明原因。
- Reviewability 方案：每个 review pack 对应 worktree 未提交 diff、patch、PR，或用户明确授权后的 local commit；如果 foundation 解锁下游 worktree，写明 human-approved 后的 checkpoint commit 计划、downstream base 和 P-only diff 命令。
- 默认 feature review artifact 使用独立 worktree 的未提交 diff、patch 文件或 PR；不要把 feature local commit 当成默认 review artifact。Foundation human-approved 后用于解锁下游的本地 checkpoint commit 是例外，但必须先获得用户确认并写入计划、progress 和 review pack。
- 每个任务的边界、依赖、验证要求和 review pack。Foundation 任务必须列出契约面、预计文件数、拆分理由和放行后是否生成 checkpoint commit；feature 任务必须列出 downstream base、P-only diff 命令和可运行性准备方式。详细任务卡只在任务边界复杂到 `task-plan.md` 放不下时生成。

### 4. Human Gate 1

开始编码、创建 worktree、切分支或派发子 agent 前，必须停下让用户确认。

输出 Decision Brief 前，必须运行：

```bash
node <skill-dir>/scripts/supermaestro.js check-workbench <需求工作台>
```

如果检查失败，先补齐缺失文档再进入 Gate 1。`approve-gate1` 也会执行同样检查，缺少 `context.md`、`plans/progress.md`、`specs/api-spec.md`、`reviews/review-packs.md`、`reports/validation.md` 等必要文档时不得确认。

给用户一份简短 Decision Brief：

- 当前推荐执行档位。
- 当前阶段、任务状态和阻塞项摘要。
- API Discovery 状态：真实接口清单是否已解析、公共/页面/范围外接口是否已分类，哪些接口仍是推断。
- 页面契约矩阵状态：每个页面/模块是否已绑定 PRD、UI、API/mock 和 RP；缺口是否阻塞。
- UI 资料包健康状态和是否阻塞。
- UI 最终画板绑定状态：截图/用户描述中的画板名是否与 manifest/schema 完全匹配；是否存在同名旧稿、备份稿、版本稿；若不匹配，必须请求用户确认或重新导出，不能继续编码。
- UI 资源映射状态：强视觉节点需要的 OSS/本地切图是否已清单化；是否存在待确认资源名或只能推断的资源路径。
- 接口规格、Mock/API 契约状态和是否阻塞。
- 需要确认的 3-5 个具体决策。
- 每个选择的影响。
- 每个选择的 review 成本、单包文件数预估、回滚方式和是否能单独测试。
- 如果存在公共依赖，列出 Foundation Review Checkpoint、被阻塞的下游任务、checkpoint 审查内容和放行条件。
- 是否启用 Review Agent Checkpoint；真实编码 worker 默认必须启用。说明哪些 RP 需要 agent review、review agent 只读边界、发现问题后的修复归属和复查方式；若用户明确关闭，说明缺少独立 review agent 的风险。
- 是否启用 Superpowers 执行增强：计划是否按 `writing-plans` 颗粒度生成，真实多 agent 是否使用 SDD，哪些任务必须 TDD，哪些任务允许跳过 TDD 以及原因。
- 将生成哪些可选工作台模块；未启用的 worktree/multi-agent 模块不得生成。
- 推荐确认语必须匹配实际档位，例如：“按推荐继续，foundation 拆小先行，使用项目旁 worktree 隔离，foundation human-approved 后允许本地 checkpoint commit，下游基于 checkpoint commit 创建，每个 worker 完成后开只读 review agent，不自动提交 feature 改动，review 后再决定提交。”；如果不采用 checkpoint commit，必须明确替代的 patch/串行方案和 review 成本。

用户确认后，运行 `approve-gate1` 写入状态，且必须用 `--confirmation` 保存用户确认原话或摘要；随后只生成当前档位实际需要的可选模块。需要真实 agent、review agent、契约变更或独立集成计划时，必须在 `plans/progress.md` 和 `state.json` 中同步记录。

### 5. 执行任务

- 编码型子 agent 默认使用独立 worktree 或独立分支；如果降级到主工作区串行，必须说明原因和 review pack 拆分方案。
- 启用真实子 agent 且任务相互独立时，主控优先按 `superpowers:subagent-driven-development` 执行：给每个 worker 提供完整任务卡和必要上下文，worker 完成后先做任务范围/规格符合性检查，再进入代码质量 review。不要让 worker 继承主会话的全部上下文或自行扩展任务范围。
- 编码 worker 在动生产代码前必须读取并遵守 `superpowers:test-driven-development`，除非任务卡明确标记为 `TDD适用性: not-applicable` 或 `deferred` 且写明原因。适用 TDD 的任务必须先提交失败测试、确认失败原因正确，再实现最小代码并确认通过。
- 不开子 agent 不等于不能用 worktree；当用户选择 worktree=true、subagents=false 时，主控仍按任务使用隔离 worktree，但不生成 `agents/` handoff 文档。
- 创建 worktree 时默认使用主仓库同级目录 `<repo>.worktrees/<task-id>`，例如主仓库为 `/path/project` 时使用 `/path/project.worktrees/<task-id>`；不得默认使用 `/tmp`、`/private/tmp` 或系统临时目录。
- 启用 worktree 时，只需在 `plans/progress.md` 和可选的 `worktrees/plan.md` 记录 worktree/branch/review artifact。只有任务边界复杂、跨人交接或用户要求时，才生成 `workbench/tasks/TASK-*.md`。
- 启用 subagents 不等于生成 agent 文档；只有派发真实外部 agent/thread 时，才生成 `workbench/agents/<task-id>/brief.md` 和 handoff 路径。主控自己执行的任务不得伪造成 agent。
- Feature 任务默认不能改公共契约；必须改时，创建 `contract-changes/CCR-*.md`，并由主控决策。
- 任务 DAG 中存在 Foundation Review Checkpoint 时，先完成拆小后的 foundation 任务，更新 `plans/progress.md`、`reviews/review-packs.md` 和 `reports/validation.md`，输出可审查 artifact，并停下请求用户 review；用户确认前，不启动依赖它的 feature agent/worktree，也不把下游任务标为 `running`。
- Foundation human-approved 后，若下游 worktree 依赖该基线，先按用户确认创建本地 checkpoint commit，并从该 commit 创建或重建下游 worktree；`plans/progress.md`、`worktrees/plan.md` 和 review pack 必须记录 base commit。没有 checkpoint commit 时，不得把未提交 foundation 改动复制成多个 feature 的隐性基线，除非 Gate 1 已明确选择 patch/串行替代方案。
- 如果某个 feature review 中发现必须修改公共组件、基础页面或公共契约，先暂停相关下游任务；由主控判断是 foundation bug、页面专属差异还是 contract change。属于公共依赖的问题必须回到 foundation 任务修正并重新 checkpoint review，确认后再同步给下游 worktree。
- 启用 Review Agent Checkpoint 时，编码任务完成后不要直接标记 `ready-for-human-review`；主控先根据 handoff、diff、验证记录判断 worker 是否完成任务边界，再标记 `ready-for-agent-review` 并派发新的只读 review agent 审查该 RP。发现问题则标记 `changes-requested` 并回到原实现 worktree 修复；无阻塞问题才标记 `agent-approved` / `ready-for-human-review`。
- 每次 worker handoff、review agent 输出、foundation checkpoint 或下游 worktree 创建后，必须由主控把结果 fan-in 回主工作台：同步 `plans/progress.md`、`agents/agent-index.md`、`worktrees/plan.md`、`reviews/review-packs.md`、`reports/validation.md`。不得把某个 worktree 内的工作台文件当成全局状态已经更新。
- Review agent 的输入必须限制在该 RP：共享上下文、任务计划/进度、相关 API/UI 规格、review pack、diff 命令或 patch、验证记录。不得让 review agent 自行扩大需求范围或重写实现。
- 创建 worktree 前读取 `references/worktree-strategy.md`。
- 派发子 agent 前读取 `references/agent-roles.md`。
- Gate 1 `allowSubagents=true` 时读取 `references/multi-agent-protocol.md`，否则不要加载或生成多 agent 专用材料。
- 每个任务必须在 `plans/progress.md` 或任务卡中有清晰边界：允许修改范围、禁止修改范围、输入物料、输出格式、验证命令、交接要求、预期 review artifact、base commit 和可运行性准备方式。
- 每个编码任务必须在 `plans/progress.md` 或任务卡中记录 TDD 决策：`required / not-applicable / deferred`。`required` 必须记录 RED/GREEN 命令和证据；`not-applicable` 必须说明为何不是行为代码；`deferred` 必须说明阻塞、风险和后续补测动作。
- UI 任务卡必须列出画板名、Sketch Data schema 路径、最终画板绑定证据、Sketch Data 提取结果、资源引用清单、Schema 到实现映射表、基线图（可选）、设计宽度/DPR、mock 数据和截图滚动位置；schema-only 时必须写明无图片基线也按 Sketch Data JSON 验收。
- UI 编码过程中发现实现结构与 Sketch Data 明显不一致，或发现某个视觉节点需要图片资产但当前用 CSS 近似时，必须立刻暂停并更新 `plans/progress.md` 为 blocked/changes-needed；不能把问题留到 Gate 2 或交给用户肉眼兜底。
- 任务状态更新直接写 `plans/progress.md`，不再通过 CLI 维护任务 CRUD；只有任务拆分、依赖或边界变化时才更新 `plans/task-plan.md`。

### 6. 审查与验证

完成任务前读取 `references/validation-checklist.md`。

Gate 2 前运行 `scripts/supermaestro.js verify <需求工作台> --strict true`。如果失败，先补齐工作台、per-RP branch、未提交 diff、patch、PR、review agent fan-in 或验证证据，再请求 Gate 2；不要为了通过 reviewability 检查自动 commit。

每个任务交接必须包含：

- 行为总结。
- 改动文件。
- TDD 证据：适用性、RED 命令与失败原因、GREEN 命令与通过结果、跳过或延后原因。
- 验证命令和结果。
- 行为验证优先级：能跑聚焦测试就跑聚焦测试；能做页面/组件构建就跑构建；能做渲染/截图/路由/mock 链路检查就做对应检查。parser、formatter、`git diff --check` 只能作为最低静态检查，不能单独支撑“可工作”结论。
- UI 任务的 Sketch Data 提取证据、expected、actual、diff 或无法截图原因。
- UI 任务的最终画板绑定证据、资源引用清单、Schema 到实现映射表；如果图片基线缺失，必须提供 schema-only 验收证据，不能只写“未截图”。
- UI 还原审查必须包含“强视觉区域逐块检查”：画板根/导航/首屏主体/关键卡片/重复组件/按钮/图标/图片资源/滚动后内容。每块都要记录设计依据、实现位置、验证方式和结论；存在未核对块时，不得请求 Gate 2。
- review pack：文件列表、建议 diff 命令、验证证据、排除项。
- 剩余风险和跳过的检查。

Review Agent Checkpoint 启用时：

- review agent 输出写入 `reviews/code-review/<RP>.md`，或汇总进 `reviews/code-review/index.md` 和 `reviews/review-packs.md`。
- review agent 只写自己的 review 输出；`reviews/review-packs.md`、`plans/progress.md` 和其他主工作台索引由主控 fan-in 更新。
- 输出必须采用 code-review 姿态：findings 优先，按严重级别排序，包含文件/行号或紧密位置、行为风险、测试缺口和建议修复方向。
- review agent 只能读代码和写 review 记录；不得修改源码、暂存、commit、merge、push 或清理 worktree。
- 有 P0/P1/P2 阻塞问题时，该 RP 不得进入人工 review；修复后重新进入 `ready-for-agent-review`。

Foundation Review Checkpoint 的交接还必须包含：公共契约说明、下游任务清单、典型 mock/状态覆盖、API/组件 props 或页面入口契约、兼容性风险、回滚方式，以及用户确认结果。checkpoint 未确认或被打回时，不得把依赖它的下游 review pack 送入 Gate 2。

使用 `templates/review-packs-template.md` 写 `reviews/review-packs.md`。

使用 `templates/validation-template.md` 写 `reports/validation.md`，记录验证命令、未执行检查、API/Mock 结果、UI/视觉证据和最终交接状态。

### 7. Human Gate 2 Review

实现任务完成后，merge、commit、push 或清理 worktree 前，必须先进入 Gate 2 Review。

请求 Gate 2 前输出 Decision Brief：

- `verify --strict` 是否通过；如果失败，不得请求 Gate 2。
- 已完成的 review pack，按建议 review 顺序列出；feature RP 必须能用 P-only diff 查看，不混入已 human-approved 的 foundation 基线。
- 每个 RP 的直接 diff 命令、worktree 路径、涉及文件和建议关注点。
- 如果启用 review agent，列出每个 RP 的 agent review 结论、findings 摘要和 unresolved 数量；未通过 agent review 的 RP 不得请求 Gate 2。
- 关键验证证据和未执行检查；明确区分静态检查、行为验证、构建验证和人工 UI 对比。
- TDD 覆盖结论：哪些 RP 完成 RED/GREEN，哪些 RP 跳过或延后 TDD，跳过/延后原因是否已被用户或主控接受。
- UI RP 必须单列视觉还原结论：最终画板是否匹配、资源映射是否完整、强视觉区域是否逐块核对、actual 截图或 schema-only 人工验收是否完成。若只完成静态检查，Gate 2 Decision Brief 必须明确写成未通过视觉验收，不能写 ready。
- `reports/validation.md` 中的验证状态、剩余风险和跳过项。
- `plans/progress.md` 中的完成状态、阻塞项和验证进展。
- 当前是否还有未提交、未跟踪或只存在于 worktree 的文件。
- Review artifact 是否覆盖 untracked 新文件和每个 RP。
- 需要用户确认的 review 结论，例如：“Review Pack 与验证记录已确认，允许进入 Gate 3 最终动作申请。”

用户确认后运行 `request-gate2` 和 `approve-gate2`。Gate 2 只表示 review pack 与验证结果被接受，不授权 merge、commit、push 或清理。

### 8. Human Gate 3 与收尾

merge、commit、push 或清理 worktree 前，必须进入 Gate 3。

请求 Gate 3 前输出 Decision Brief：

- 当前推荐动作组合。
- 每个动作的影响。
- Gate 2 Review 是否已确认。
- 是否已完成最终状态同步和验证记录。
- 当前是否还有未提交、未跟踪或只存在于 worktree 的文件。

用户确认后运行 `request-gate3` 和 `approve-gate3`。执行具体动作前再运行对应 `check`。

最终答复必须说明：

- 需求实现是否完成。
- review pack 和验证记录是否完成。
- `plans/progress.md` 是否已同步最终状态。
- 是否已 commit、merge、push。
- worktree 是否已清理。
- `documents/` 工作台当前状态。
- 剩余风险和发布前动作。

## 触发示例

- “用 mission-control 处理这个需求，先拆任务，不要写代码。”
- “按主控加多个子 agent 的流程跑这个 PRD。”
- “这个需求比较大，帮我拆成 worktree 并发任务并监控进度。”
- “先读 PRD，生成共享上下文、任务 DAG、agent 分工和验收计划。”
- “先到 Gate 1，让我确认任务拆分和是否开子 agent。”
