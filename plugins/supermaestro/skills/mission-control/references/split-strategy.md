# 任务拆分策略

按依赖关系拆分任务。不要在没有检查代码归属、共享状态、公共组件、接口契约和路由关系之前，假设页面或文件天然独立。

## 拆分步骤

先判断复杂度和 reviewability。命中多页面、多画板、公共契约、超过 8 个文件、多个新增页面等信号时，默认采用 foundation-first，并避免 `main-serial + checkpoint=false`。

1. 从 PRD 中列出所有交付物。
2. 把每个交付物映射到可能涉及的代码区域。
3. 如果存在 `specs/ui-material-index.md`，把 PRD 交付物映射到具体画板、schema 和基线图。
4. 找出多个交付物共同依赖的基础能力。
5. 找出可以在基础能力完成后并发推进的独立切片。
6. 找出高风险的跨领域改动，保留给主控或专项 agent 处理。
7. 给每个切片标注 TDD 决策：`required / not-applicable / deferred`，并写明失败测试命令、预期失败原因、通过测试命令或跳过原因。
8. 给每个切片定义 review pack：文件范围、review artifact、预期 diff 命令、验证命令和排除项。
9. 确定动态模块：串行只保留 Core；worktree 才生成 worktree 计划；subagents
   才生成 agent brief/handoff；复杂集成才生成 integration。
10. worktree 模式为每个编码切片分配唯一 `target/branch/base`，后续按精确
    意图检查、调用方创建和 CLI 登记闭环执行。
11. 把结果整理成带前置依赖、review pack、TDD 决策和验证点的 DAG。

## Foundation Review Checkpoint

如果一个基础任务会解锁两个或更多页面/功能切片，必须把它标记为 Foundation Review Checkpoint。该任务完成并形成 review artifact 后，主控必须停下让用户 review；确认前，不启动或继续依赖它的下游任务。

常见 checkpoint 包括：公共组件、基础页面框架、接口封装、mock、路由、scheme、store、数据模型、全局配置和跨页面工具函数。

Checkpoint 计划必须写清：

- checkpoint 任务和 review pack。
- 解锁的下游任务。
- 用户需要 review 的内容。
- 放行条件和打回后的处理方式。
- 下游 worktree/agent 获取修正后的同步方式。

## 好的任务形态

- 共享 UI 组件、数据类型、API client、mock、工具函数。
- 一个有独立设计稿和 mock 输入的页面或流程。
- 一个绑定了明确画板/schema/基线图的 UI 页面、组件或状态切片。
- 一个适配器、集成点或后端接口契约。
- 一次针对已完成切片的 review。
- 一次最终集成。
- 一个能让用户单独 review 的小 diff，通常不超过 5-8 个文件，且属于同一个功能面。

## TDD 切分规则

把 TDD 当成任务边界设计的一部分，不要等 worker 开始写代码后再临时决定。

- `required`：接口封装、mock 数据契约、数据转换、hook、store、状态机、业务规则、权限/异常分支、路由参数、埋点参数、工具函数和可观察交互逻辑。
- `not-applicable`：纯样式还原、切图/资源搬运、文案调整、配置登记、无行为分支的静态页面骨架、由工具生成且不应手改的代码。
- `deferred`：当前环境缺少测试 harness、依赖无法安装、第三方运行时不可控或必须先完成 foundation 才能写有效测试。必须写清风险和后续补测点。

UI 页面通常是混合任务：视觉还原走 Sketch Data/schema 验证；按钮禁用、投票状态、请求参数、分享计数、列表排序、异常空态等行为部分仍应标记为 `required` 并写 RED/GREEN 证据。

## 不好的任务形态

- “把整个需求都实现了。”
- 两个 agent 同时编辑同一个核心文件，但没有明确合并顺序。
- 页面任务顺手发明公共组件，并被其他页面依赖。
- 任务要求理解 PRD，但没有明确业务规则。
- 审查任务不知道原始范围和验收标准。
- 把基础能力、多个页面、mock、路由和详情页一次性混在同一个 review diff 里。
- UI 任务只写“按设计稿还原”，但没有绑定画板、schema、基线图、mock 数据和视觉验收方式。

## DAG 输出格式

使用这个紧凑格式：

```text
基础任务
- F1: <名称> | 负责: <文件/模块> | review: <pack-name> | 解锁: P1,P2 | TDD: required/not-applicable/deferred | 验证: <命令>

Foundation Checkpoint
- C-F1: review F1 | 阻塞: P1,P2 | 放行条件: 用户确认 <公共契约/组件/基础页面> 可复用

并发切片
- P1: <名称> | 依赖: F1 | 负责: <文件/模块> | review: <pack-name> | TDD: required/not-applicable/deferred | 物料: <路径>
- P2: <名称> | 依赖: F1 | 负责: <文件/模块> | review: <pack-name> | TDD: required/not-applicable/deferred | 物料: <路径>

审查
- R1: 审查 P1 | 依赖: P1
- R2: 审查 P2 | 依赖: P2

集成
- I1: 合并 F1,P1,P2 | 依赖: R1,R2 | 验证: <命令>
```
