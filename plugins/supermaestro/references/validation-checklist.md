# Validation Checklist

Use checks proportional to risk.

Minimum:

- Workbench completeness check.
- Review pack references actual artifacts.
- Validation report lists executed and skipped checks.
- Fresh verification evidence before Review / Final Gate, commit, merge, push, PR 或完成声明；`request-review`、`approve-review`、`request-final`、`approve-final` 都重新执行 `verify`。
- Root-cause evidence for any bug, test failure, build failure, integration failure, or behavior review finding.
- Review feedback is verified against codebase reality before implementation.

When E2E / visual trigger is enabled:

- E2E / visual 只通过显式 `--e2e true` / `--visual true` 启用；一旦启用，后续 scaffold 不得用 false 降级。
- Plan / Review / Final 后首次新增 validation trigger 时，确认 `standard` / `strict` 已回退 Plan pending（`lite` 重新锁回 Final）。
- Contract 顶层填写相对 workbench 或绝对 Git worktree `sourceRoot`；用 `source-revision` 计算并写入 `git-working-tree:<sha256>`，不要手工自报 commit/hash。
- Contract 覆盖所有必测 case；visual case 包含合法 `purpose`、baseline 和 `baselineHash`。
- `test.e2e` / `test.visual` evidence 的 `--source-revision` 匹配 contract；每条自动绑定当前 `contractHash`，契约变更后重跑。
- 通过证据包含可复现命令、exit code、source revision、报告和真实存在的产物；Mock、UAT、real 结果明确区分。
- 每条 `test.visual` evidence 只覆盖一个状态，并保留 baseline manifest、expected、actual、diff、baseline hash、阈值和遮罩说明；`expected` 指向 contract baseline 且 hash 一致。
- Blocked visual 同样每条只覆盖一个 case。
- 写入非 blocked evidence 时自动记录 report/artifacts SHA-256（visual 还包括 manifest、expected、actual、diff）；Gate 验证要求这些文件非空且 hash 未变化。
- blocked case 记录原因；只有带 `--accepted-skip true --confirmed-by user --confirmation "<用户确认>"` 才能越过验证，不把未执行写成 passed。
- `reports/evidence.jsonl` 任何非空 malformed JSON 行都 fail closed，先修复证据文件再继续 Gate。
- Review / Final Gate 和 `check --action commit|merge|push|cleanup` 都现场重算源码指纹并执行 `verify`；tracked 或 untracked 源码变化会让旧 evidence 失效。

For frontend / Taro:

- Try the narrowest meaningful build or page-level run.
- Verify route and mock/API wiring.
- Verify login/binding, empty state, stale response, and repeated click behavior.
- For schema-backed UI, record schema-to-implementation mapping and visual evidence.
- 对设计还原和视觉回归分别标注 `design-conformance` / `regression`，不要用历史截图替代设计来源。

Static checks such as formatting or `git diff --check` are helpful but not enough for behavior completion.
