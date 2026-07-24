# 微信小程序 / Taro / 蓝湖 Profile

适用于使用蓝湖 schema 物料的 Taro 3 微信小程序或 H5 需求。

## UI 事实源

- `source/ui/manifest.json` 与 `source/ui/schemas/*.json` 是 UI 主事实源。
- 图片是可选视觉基线；图片缺失不代表可以降低 UI 准确度。
- 存在 schema 时必须 schema-first 实现。
- 未经用户明确接受，不把图片型或复杂视觉节点改成近似 CSS。
- 蓝湖 Cookie、账号、令牌和私有地址不得写入仓库、manifest、报告或
  evidence。

## UI 编码前

必须具备：

- `specs/ui-material-index.md`
- `specs/ui-schema-extract.md`
- Schema 到实现映射表
- 图片型节点的资源映射

编码检查必须显式声明 UI 任务并提供 schema 提取；纯非 UI 任务要写清原因。

## Plan 与 Review

`strict + UI` 在 Plan Gate 必须明确视觉决策：

- `required`：启用 `--visual true`，补齐 validation contract；
- `not-applicable`：说明原因、剩余风险并由用户确认；
- `blocked`：保持 Plan 未批准，先补基线或运行环境。

Review 前：

- 每个必测画板/页面状态各有一条 `test.visual` evidence；
- actual、expected、diff 与对应 contract case 一一绑定；
- 强视觉区域逐块核对；
- `reports/validation.md` 写清剩余 UI 风险；
- blocked visual 不能合并覆盖多个 case，跳过必须满足契约和人工接受条件。

结构化视觉验证必须声明 `sourceRoot`，由 `source-revision` 计算当前
`git-working-tree:<sha256>`。`verify` 会现场重算源码指纹并校验 baseline、
actual、diff、报告及其 hash。固定 fixture 或 mock 只证明对应数据模式，
不等同于 UAT 或真实链路。

worktree 模式下，`sourceRoot` 必须指向 owned registry 中单一、live 的
integration target，并与 `state.sourceRoot` 指向的目标源码属于同一个 Git
仓库（同一 Git common dir；路径无需相同）。多 worktree 的 worker 截图和
局部验证只进入 handoff；fan-in 后在 integration target 重跑主视觉验证，
不得用其他仓库或未集成 worktree 的结果为 Review/Final 放行。

## Taro 约束

- 计划前读取项目 `AGENTS.md`、`package.json`、路由配置及相关页面/服务。
- 沿用现有 Taro、React、Sass、组件和请求封装约定。
- JSX class 拼接遵循目标项目现有工具与风格。
- 平台差异优先沿用平台文件或项目已有 `process.env.TARO_ENV` 逻辑。

## API 与 Mock

- 页面级 API 默认放在目标项目既有页面服务层；已有领域共享 API 模块时复用。
- Scope discovery 记录在 `specs/api-spec.md`；Plan 前把本期可执行字段、
  异常态和兼容结论同步到 `specs/api-contract.md`。
- 同时存在 API 与 UI 时维护 `specs/page-contract-matrix.md`。
- Mock 与真实 API 的字段映射、数据模式和切换条件必须记录。
- 登录、手机号绑定、权限、并发请求、空态、异常态和陈旧响应是高风险审查点。
