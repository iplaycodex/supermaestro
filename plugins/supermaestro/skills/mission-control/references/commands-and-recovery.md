# 命令与恢复指南

以下命令中的 `<cli>` 表示插件根目录的 `scripts/supermaestro.js`，`<wb>` 表示工作台路径。路径有空格时用双引号；命令保持单行。

## 初始化与恢复

```text
node <cli> status <wb> --json true
node <cli> resume <wb>
node <cli> init <wb> --name "<需求名>" --mode standard --source-root "<目标仓库>"
node <cli> scaffold <wb> --api true --ui true
```

已有 v3 状态不要重新 init。`status` / `resume` 会检查已批准门禁的材料绑定；`gateValidity` 为 false 时不能按旧状态继续编码。

v2 → v3 必须显式运行 init；缺少 sourceRoot 时提供原目标仓库。迁移不改原始物料，保留有效 Scope，重置 Plan/Review/Final、旧验证、最终动作和 worktree registry。未知版本失败关闭。

## 常用阶段命令

完成阶段产物和用户确认后，再执行对应批准命令：

```text
node <cli> check-workbench <wb>
node <cli> approve-scope <wb> --confirmed-by user --confirmation "<范围确认>"
node <cli> approve-plan <wb> --execution-mode main-serial --worktree false --subagents false --confirmed-by user --confirmation "<计划确认>"
node <cli> check <wb> --action code --non-ui true --reason "<不涉及 UI 的原因>"
node <cli> check <wb> --action code --ui true --schema-extract specs/ui-schema-extract.md
node <cli> run-verification <wb> --program node --args-json '["test.js"]' --report reports/commands/test.log
node <cli> verify <wb>
node <cli> request-review <wb>
node <cli> approve-review <wb> --review-accepted true --validation-accepted true --confirmed-by user --confirmation "<审查与验证确认>"
node <cli> request-final <wb>
node <cli> approve-final <wb> --merge false --commit false --push false --cleanup false --confirmed-by user --confirmation "<仅保留改动>"
```

`lite` 跳过 Plan/Review。UI 风险存在时，非 UI 检查必须有原因；UI 检查必须绑定 schema 提取。严格 UI、worktree、subagents、review-agent 的前置条件见[核心规则](../../../profiles/core-workflow.md)和[执行模式](execution-modes.md)。

`run-verification` 不启动 shell，程序必须是当前平台可直接执行的程序。Windows `.cmd` 包装脚本应通过 Node 执行其真实 JS 入口；不要为了执行不可信参数而开启 shell。PowerShell/macOS/Linux 可以使用上面的 JSON 单引号；CMD 使用 `"[\"test.js\"]"`。

验证开始与结束的源码指纹必须相同；源码变化会记录 failed，即使命令退出码为 0。失败证据不能用于通过门禁，稳定后重跑。

worktree 模式中，验证、request-review、approve-review、request-final 始终携带同一个已登记 integration `--target`。approve-final 按动作契约给 target；keep 不传，cleanup 传精确清理目标。实际 Git 创建/登记/同步命令见[Worktree 策略](worktree-strategy.md)。

## 重新打开门禁

需求或契约变化时，先向用户展示变化及影响，再重新打开最早受影响的门禁：

```text
node <cli> reopen-gate <wb> --gate scope --reason "需求增加了验收条件"
node <cli> reopen-gate <wb> --gate plan --reason "实现计划增加了任务"
```

`--gate` 支持 scope、plan、review、final。理由至少 6 字符。该命令撤销授权，不代替新的人工确认：

- scope：使 Scope 和所有下游批准失效。
- plan：保留有效 Scope，重置执行选择及下游批准。
- review：保留有效 Scope/Plan，重新收集验证和审查。
- final：保留前置有效批准，撤销最终动作授权。

旧批准和变更原因保存在 `state.json.approvalHistory` 与事件记录。已登记 worktree 保留，不自动创建或删除；重新批准 Plan 后仍需通过现场检查。上游已过期时不能只重新打开下游。lite 只能重新打开 scope/final。

重新打开后回到对应阶段检查、请求、人工批准；不能手改 state，也不能靠 init 刷新旧批准。

## 恢复未完成的事务

```text
node <cli> recover-workbench <wb>
node <cli> status <wb> --json true
node <cli> resume <wb>
```

`.supermaestro-transaction.json` 保存事务前内容和本次写入哈希；`.supermaestro-lock.json` 表明当前写入者。普通写入异常自动回退；进程中断时，其他命令保持阻塞，直到显式恢复。

恢复只回退本次事务管理的工作台文件，不操作源码、Git 分支或 worktree。写入者仍存活、事务路径越界、符号链接、日志损坏或文件出现事务之外的修改时，拒绝恢复并保留日志；先审查和保全外部修改，不直接删除锁或覆盖状态。已经提交的事务仅清理遗留标记，不回退已完成状态。
