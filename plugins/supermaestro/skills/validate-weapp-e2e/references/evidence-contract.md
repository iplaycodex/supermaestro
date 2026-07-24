# 微信小程序 E2E 证据契约

## 契约用例

在 `specs/machine/validation-contract.json` 中为每个必测行为添加一个用例。

把契约顶层的 `sourceRoot` 设为 Git worktree 的绝对路径，或相对于 workbench 的路径。它不能等于 workbench，也不能位于 workbench 内；workbench 可以嵌套在源码仓库中，指纹计算会排除它。worktree 模式下，它必须等于 owned registry 中选定的单一、live integration target，并与 `state.sourceRoot` 指向的目标源码属于同一个 Git 仓库（同一 Git common dir；路径无需相同）；禁止用另一个仓库的测试证据为当前仓库放行。

在构建/测试执行完成后、记录 evidence 之前计算源码指纹：

```bash
node <plugin-root>/scripts/supermaestro.js source-revision <workbench> --target "<integration-target>"
```

worktree 模式必须传已登记的 integration target；main-serial 模式可省略
`--target`。把输出的 `git-working-tree:<sha256>` 写入顶层
`sourceRevision`，并向 evidence 传入同一个值。指纹覆盖已跟踪文件和未忽略
的未跟踪文件，并排除 workbench；后续源码修改会让旧 evidence 失效，提交
相同内容本身不会改变指纹。

多 worktree 的 worker 局部结果只写 handoff，不写入主 evidence。主 contract
不能轮换顶层 `sourceRoot`；先 fan-in，确认其他 registered target clean，
且 HEAD 已是 integration target HEAD 的祖先，再在 integration target
重跑并记录 Review/Final evidence。

CLI 会把主 evidence 与 verification snapshot 绑定到 integration target
身份、identity hash 和 fan-in 快照。worktree 模式的 `verify`、
`request-review`、`approve-review` 与 `request-final` 都必须传入同一个
integration `--target`；`approve-final` 的 target 参数只按最终动作契约
提供。target、registry 或 fan-in 关系变化后，旧证据失效。

```json
{
  "id": "E2E-TAB-01",
  "requirementIds": ["REQ-TAB-01"],
  "platform": "weapp",
  "dataMode": "uat",
  "command": "npm run test:e2e:weapp",
  "expected": "一级 Tab 可切换且选中态同步"
}
```

使用稳定 ID。UAT 标识、凭证、路由、选择器和项目专用设置留在目标项目，不写入插件或 workbench evidence。

## 通过证据

以下多行示例使用 Bash `\` 排版。Windows 可直接合并成单行；需要续行时，
PowerShell 使用行末反引号，CMD 使用行末 `^`。

```bash
node <plugin-root>/scripts/supermaestro.js evidence <workbench> \
  --type test.e2e \
  --phase review \
  --platform weapp \
  --data-mode uat \
  --command "npm run test:e2e:weapp" \
  --result passed \
  --required 2 \
  --executed 2 \
  --passed 2 \
  --failed 0 \
  --case-ids E2E-TAB-01,E2E-NAV-01 \
  --exit-code 0 \
  --source-revision "git-working-tree:<sha256>" \
  --report reports/artifacts/weapp-e2e.json \
  --artifacts reports/artifacts/weapp-e2e.json,reports/artifacts/navigation.png
```

命令、平台和数据模式必须匹配每个被覆盖的契约用例。同一命令和环境确实一起执行多个 E2E case 时，一条 evidence 可以覆盖多个 case。

## 阻塞证据

先记录阻塞原因。只有用户明确接受后，才添加 `--accepted-skip true`：

下例同样遵循上述跨平台续行规则。

```bash
node <plugin-root>/scripts/supermaestro.js evidence <workbench> \
  --type test.e2e \
  --platform weapp \
  --data-mode real \
  --result blocked \
  --case-ids E2E-PAY-01 \
  --reason "真实支付需要受控账号和人工授权" \
  --accepted-skip true \
  --confirmed-by user \
  --confirmation "用户确认真实支付本轮不执行并接受剩余风险"
```

CLI 会在每条测试 evidence 中保存当前 validation contract 的规范化哈希，以及 report/artifacts 的 SHA-256。修改 case、`sourceRevision`，或在执行后替换产物，都会让旧 evidence 失效。

## 报告要求

报告可以使用项目已有格式，但必须是非空真实文件，并明确：

- 实际执行命令和环境。
- 每个 case 的状态。
- required、executed、passed、failed 计数。
- 执行时间。
- 报告与产物路径。

密钥、账号、Cookie、令牌和其他敏感值必须放在报告和 evidence 之外。

## 失败关闭规则

- 必测 case 没有 evidence，或 evidence 的 case ID 不存在时失败。
- 命令、平台、`dataMode` 或 `sourceRevision` 不一致时失败。
- report/artifact 不存在、为空或哈希变化时失败。
- `executed < required`、存在 failed，或用例被静默 skip 时失败。
- Mock/fixture evidence 不能覆盖契约中的 UAT/real case。
- 无法运行时保持 `blocked`；只有用户明确接受 skip 才能通过门禁，但不能声明真实链路 `passed`。
