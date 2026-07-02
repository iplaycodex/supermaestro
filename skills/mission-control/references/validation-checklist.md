# 验收清单

使用能证明改动行为的最小验证。当改动涉及共享契约、路由、鉴权、请求封装、构建配置或高风险流程时，扩大验证范围。

## 单任务验收

- diff 与任务卡一致。
- 没有无关重构或格式化噪音。
- review pack 可单独审查，文件数和功能面没有失控。
- 编码任务在指定 worktree/分支或用户确认的降级位置完成；如果降级，已记录原因。
- 编码前已通过 `harness.js check <需求工作台> --action code`；如果存在 `ui/manifest.json`，必须显式选择 `--ui true --boards --schemas --schema-extract` 或 `--non-ui true --reason <原因>`。
- 业务规则与共享上下文一致。
- UI 任务绑定的画板、schema、schema 提取结果、基线图与 `specs/ui-material-index.md` 一致；备份/旁支画板已确认范围。
- UI 任务已经在编码前读取对应 `ui/schemas/*.json`，并记录节点层级、坐标、尺寸、颜色、字体、圆角、阴影、资源和关键文本等提取结果。
- 如果 UI 任务没有 schema 提取证据，或实现主要来自截图目测估算，不允许标记为 done。
- 相关 happy path、失败态、空态、loading、边界状态已处理。
- 接口或 mock 契约被正确遵守。
- 修改公共逻辑、共享工具、请求代码或复杂 UI 行为时，已补充或更新测试。
- 已记录验证命令和结果，并标明验证类型：static、behavior、build、ui-review。
- Parser、formatter、`git diff --check` 只算 static 检查；除非任务只改文档或纯格式，否则不能单独作为完成依据。

## UI/视觉验收

- `scripts/inspect-ui.js` 已跑过；UI 包的 missing、relocated、dry-run、errors 风险已写入物料索引和 Gate Brief。
- 视觉实现以导出的 `ui/schemas/*` 为主事实源；视觉基线使用导出的 `ui/images/*`，不要直接截图蓝湖 stage 页面作为 expected。
- mock 数据、时间、状态栏、导航栏、头像、投票数、评论数、设备宽度、DPR 和页面滚动位置已固定。
- 对绑定画板输出 actual、expected、diff；无法截图或无法 diff 时说明原因、风险和后续动作。
- schema-only 时至少提供节点级映射、组件/页面实际渲染或可运行路径证据；不能只写“按 schema 实现”。
- 不把未绑定、未确认或疑似备份画板纳入“已验收”。

## Mock/API 验收

- mock 文件已创建或更新。
- mock 已挂载到服务级 index 和总 mock 入口。
- 调用方已显式切到 mock，或明确说明本轮只接真实接口。
- 本地 mock 启动命令已记录。
- 至少用脚本、单测或最小请求验证过核心接口 wrapper 和数据结构。
- 如果开发环境和生产环境走不同路径，说明切换条件。

## 审查验收

- 输出先给 bug、回归风险或缺口。
- 每个问题尽量包含文件位置和行为影响。
- 明确指出缺失测试和剩余风险。
- 不要在 actionable findings 前写空泛表扬或总结。
- review 输出应按 review pack 组织，避免让用户在一个大 diff 中自行拆边界。
- 启用 review agent 时，review agent 必须只读；不得修改源码、暂存、commit、merge、push 或清理 worktree。
- 启用 review agent 且存在阻塞 findings 时，不能进入 human review 或 Gate 2；必须回到实现 worktree 修复并复查。

## 最终集成验收

- 合并顺序符合 DAG。
- 冲突被有意识地处理。
- 未经用户 review 的多个 review pack 不应混成一个不可拆的大 diff。
- 可行时运行最终 test、build 或 lint。
- 对页面/路由/组件切片，优先跑聚焦测试、页面构建、路由可达性、mock 数据链路或截图检查中的至少一项；确实不可行时写清阻塞点。
- 跳过的检查说明原因；如果命令没有进入代码检查或编译阶段，要明确写出阻塞点。
- 最终答复包含改动范围、验证证据、未解决风险和建议下一步。
