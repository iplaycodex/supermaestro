# Worktree 策略

当两个或更多实现任务可以独立推进，并且仓库适合并行分支开发时，使用 worktree。

Worktree 是代码隔离手段，子 agent 是执行人力手段，二者独立：可以只用 worktree 不派发子 agent，也可以多 worktree + 多 agent 并行。

编码型子 agent 默认必须绑定独立 worktree 或独立分支。不要把多个子 agent 的代码直接落在主控工作区后再统一 review。

## 创建 Worktree 前

- 先检测当前是否已经在 linked worktree 或 detached HEAD 中；如果已经隔离，不要再嵌套创建 worktree。
- 检查当前分支和 `git status`。
- 识别用户已有改动，避免触碰或回滚。
- 选择稳定的基准分支。
- 派发前先定义分支名和 worktree 路径；默认使用主仓库同级目录 `<repo>.worktrees/<task-id>`。
- 如果改用项目内 `.worktrees/` 或 `worktrees/`，必须确认目录已被 git ignore；未忽略时先停下说明风险并请求用户确认处理方式。
- 定位需求工作台 `documents/<需求同名目录>/`。
- 确认标准子目录存在或可创建：`specs/`、`plans/`、`reviews/`、`reports/`。
- 检查需求工作台是否已被 git 跟踪；未跟踪时，新 worktree 默认看不到这些物料。
- 执行破坏性清理前必须确认。

## 推荐目录结构

```text
<repo>                         # 主控或集成工作区
../<repo>.worktrees/
├── foundation                 # 基础任务分支
├── <task-a>                   # 功能任务 A
└── <task-b>                   # 功能任务 B
```

不得默认使用 `/tmp`、`/private/tmp`、系统临时目录或其他易清理位置创建 worktree。如果项目旁目录不可用，必须先说明原因并征得用户确认。

## 需求目录同步

如果需求工作台已被 git 跟踪：

- 创建 worktree 后，确认该目录在子 worktree 中存在。
- 在 `plans/progress.md` 或真实 agent brief 中写明 worktree 内的需求目录路径。

如果需求工作台未被 git 跟踪：

- 优先询问用户是否允许把需求目录加入 git。
- 如果用户不想纳入 git，则把需求目录同步复制到每个编码 worktree。
- 同步后在进度看板记录同步方式。
- 不要只把 PRD 摘要塞给子 agent 后跳过物料同步；子 agent 必须能读取原始物料或共享上下文文件。

## 分支规则

- 默认使用 `codex/` 前缀，除非用户要求其他前缀。
- 一个实现任务对应一个分支。
- 除非已经规划合并顺序，否则不要让多个 agent 修改同一个高冲突文件。
- commit、push、删除 worktree 或 merge 前，需要用户确认。编码完成默认保留未提交改动供 review；但 foundation 已通过 human review 且要作为下游 base 时，应请求/执行本地 checkpoint commit，并把 commit 记录到 progress、worktree plan 和 review pack。

## Foundation-first

多 worktree 任务默认先创建 foundation 任务，但 foundation 不能变成一个覆盖所有公共面的“大包”。按契约面拆分 service/mock、route/scheme、公共组件、测试/fixture 等；单个 foundation 超过 5-8 个文件、跨 3 个以上目录或覆盖 3 类以上契约面时，继续拆成多个 foundation RP 并安排审查顺序。功能 worktree 在相关 foundation 完成、形成 review artifact、通过用户 checkpoint review 后再启动。

当 foundation 解锁多个下游 worktree 时：

- 先在 foundation worktree 完成共享代码和最小验证。
- 更新 `reviews/review-packs.md` 中的 foundation review pack。
- 更新 `plans/progress.md` 中的唯一任务状态和 checkpoint 状态。
- 停下请求用户 review；确认前不创建或不继续下游功能 worktree。
- 用户打回时，只在 foundation worktree 修正公共依赖，再重新 checkpoint。
- 放行后，如果下游需要 foundation 代码，先创建用户确认过的本地 checkpoint commit，再从该 commit 创建或重建下游 worktree。
- 下游 review artifact 必须是 P-only diff：diff base 使用 foundation checkpoint commit，不能混入已审过的 foundation 改动。
- 如果用户不允许 checkpoint commit，不要把未提交 foundation 基线复制到多个 feature worktree；改用串行/单 worktree 或 per-RP patch，并提前说明 review 成本。


## 可运行性

标准 git worktree 是独立 checkout，不会带上主仓库中被 gitignore 的 `node_modules`、构建缓存或本地生成文件。

- 如果要求每个 worktree 可独立运行，必须在每个 worktree 内执行项目需要的依赖安装命令，并在 handoff 中记录安装结果。
- 只共享主仓库依赖或只复制源码时，只能声明完成静态检查或有限验证，不能声称该 worktree 可独立运行。
- 如果选择完整项目拷贝模式，先说明它不是标准 git worktree；review artifact 必须用 patch、PR 或明确 checkpoint commit 管理，不能只依赖目录间人工对比。

## 冲突规避

- 先把共享代码放到基础任务里完成。
- 功能任务消费共享代码，不要各自创建平行版本。
- 路由、store、API、配置文件容易冲突，必须有意识地分配。
- 如果两个切片必须改同一个文件，优先串行，不要并发。

## 降级规则

只有在以下信息写清楚后，才允许从 worktree 降级为单工作区或单分支：

- 为什么不能创建 worktree。
- 哪些任务受影响。
- 如何保持 review pack 可拆。
- 哪些文件可能产生冲突。
- 用户是否确认继续。

未确认前，不派发编码型子 agent。不得用额外文档弥补本可避免的大 diff。

## Gate 3 收尾与清理

收尾动作受 SuperMaestro Gate 3 控制，并遵循先验证、再选择交付动作、最后按授权清理的顺序。

- 收尾前必须重新验证关键命令，不能拿旧结果证明当前状态。
- 先判断环境：normal repo、linked worktree、detached HEAD；记录 `git rev-parse --git-dir` 与 `git rev-parse --git-common-dir` 的判断结论。
- 给用户的 Gate 3 Brief 必须明确动作组合：本地 merge、push/PR、keep as-is、discard、cleanup worktree、delete branch。
- merge 路径：先切回主控/目标分支并完成 merge，再运行合并后验证；只有 merge 和验证成功后，才允许清理 worktree 和删除分支。
- PR 或 keep 路径：保留 worktree 和分支，方便继续迭代。
- discard 路径：必须额外列出将删除的 branch、worktree 和 commit 范围，并要求用户明确确认。
- cleanup 只能清理本流程创建且记录在 `worktrees/plan.md` 的 worktree；不清理 harness-owned、detached 或来源不明的工作区。
