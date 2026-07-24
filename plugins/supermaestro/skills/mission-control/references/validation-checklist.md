# 验收清单

使用能证明改动行为的最小验证。当改动涉及共享契约、路由、鉴权、请求封装、构建配置或高风险流程时，扩大验证范围。

## 单任务验收

- diff 与任务卡一致。
- 没有无关重构或格式化噪音。
- review pack 可单独审查，文件数和功能面没有失控。
- 编码任务在指定 worktree/分支或用户确认的降级位置完成；如果降级，已记录原因。
- worktree 模式已用精确 `target/branch/base` 通过
  `check --action create-worktree` 记录意图；调用方创建后，已用同一组参数
  通过 `register-worktree`，且 registry 与当前 Git 状态一致。
- worktree 模式下的 `dispatch-subagent`、`sync-materials` 和
  `checkpoint-commit` 检查都携带对应的已登记 `--target`。
- 编码前已通过 `node <plugin-root>/scripts/supermaestro.js check <workbench> --action code`；如果存在 UI manifest，必须显式选择 `--ui true --schema-extract specs/ui-schema-extract.md` 或 `--non-ui true --reason <原因>`。
- 业务规则与共享上下文一致。
- UI 任务绑定的画板、schema、schema 提取结果、基线图与 `specs/ui-material-index.md` 一致；备份/旁支画板已确认范围。
- UI 任务已经在编码前读取对应 `ui/schemas/*.json`，并记录节点层级、坐标、尺寸、颜色、字体、圆角、阴影、资源和关键文本等提取结果。
- 如果 UI 任务没有 schema 提取证据，或实现主要来自截图目测估算，不允许标记为 done。
- 相关 happy path、失败态、空态、loading、边界状态已处理。
- 接口或 mock 契约被正确遵守。
- 修改公共逻辑、共享工具、请求代码或复杂 UI 行为时，已补充或更新测试。
- 如果任务经历 bug、测试失败、构建失败或行为 review finding，已按 systematic debugging 记录复现、错误信息、最近改动检查、根因假设、最小修复和复验结果。
- 已记录验证命令和结果，并标明验证类型：static、behavior、build、ui-review。
- 普通 test、build 或 lint 已通过 `run-verification --program <程序> --args-json <JSON 数组> --report <工作台内报告>` 真实执行并记录；worktree 模式还传已登记 `--target`，多 worktree 使用 fan-in 后的 integration target；没有用手工 `evidence --type test.command` 自报成功。
- `--args-json` 是 JSON 字符串数组：macOS/Linux shell 和 PowerShell 可写
  `'["test"]'`，CMD 写 `"[\"test\"]"`；Windows 多行命令分别使用
  PowerShell 反引号或 CMD `^`，不使用 Bash `\`。
- worktree 模式下，validation contract 的 `sourceRoot` 必须等于选定的
  单一、已登记且 live 的 integration target，并与 `state.sourceRoot` 指向的
  目标源码属于同一个 Git 仓库（同一 Git common dir；路径无需相同）。
- worktree 模式下，`source-revision`、`run-verification`、`verify`、
  `request-review`、`approve-review` 和 `request-final` 都传入同一个
  integration `--target`；`approve-final` 的 target 参数只按最终动作契约
  提供，keep 不传。main-serial 模式的验证命令可省略该参数。
- multi-worktree worker 的局部验证只写 handoff，不轮换主 contract 的
  `sourceRoot`。Review/Final 前，其他 registered target 均 clean，且 HEAD
  已是 integration target HEAD 的祖先；否则主验证失败关闭。
- 主 evidence 与 verification snapshot 已记录 integration target 身份、
  identity hash 和 fan-in 快照；target、registry 或 fan-in 变化后没有复用
  旧证据。
- Parser、formatter、`git diff --check` 只算 static 检查；除非任务只改文档或纯格式，否则不能单独作为完成依据。
- 任何完成声明、ready 状态或 Gate 请求都有本轮新鲜验证证据；没有重新运行验证命令时，只能标记为 partial/blocked/pending。

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
- 启用 review agent 且存在阻塞 findings 时，不能进入人工 Review Gate；必须回到实现 worktree 修复并复查。
- review agent 输入必须包含变更描述、需求/任务卡、base/head 或 diff 命令、验证证据和审查范围，不能只给聊天摘要。
- 处理 review feedback 前必须先核实建议是否符合当前代码、需求边界和既有用户决策；正确的逐项修复，错误或超范围的写明技术理由并交给主控/用户决策。

## 最终集成验收

- 合并顺序符合 DAG。
- 冲突被有意识地处理。
- 主 validation contract、主 evidence 和 Gate Review Pack 只绑定一个
  owned/live integration target。
- 其他 registered target 均 clean，且 HEAD 已是 integration target HEAD
  的祖先；worker 局部证据已作为 handoff fan-in，但不冒充主 Gate 证据。
- 未经用户 review 的多个 review pack 不应混成一个不可拆的大 diff。
- 可行时运行最终 test、build 或 lint。
- 对页面/路由/组件切片，优先跑聚焦测试、页面构建、路由可达性、mock 数据链路或截图检查中的至少一项；确实不可行时写清阻塞点。
- 跳过的检查说明原因；如果命令没有进入代码检查或编译阶段，要明确写出阻塞点。
- 最终答复包含改动范围、验证证据、未解决风险和建议下一步。
- Final Gate 前已判断当前环境是 normal repo、linked worktree 还是 detached HEAD，并核对 owned registry。
- merge/commit/push/cleanup 前已执行对应 CLI check 和最新验证；cleanup 的
  `approve-final` 授权与 `check` 使用同一 `--target`，且只放行 registry
  中仍存在并与当前 Git target/branch/HEAD、源码指纹及 clean 状态一致的
  worktree。
- merge 成功后才允许由调用方执行 `git worktree remove`；CLI 不自行删除。
  PR/keep 选择不清理 worktree；discard 需要额外明确确认。
