# 视觉回归证据契约

## 契约用例

每个画板/状态添加一个独立用例。

在契约顶层把 `sourceRoot` 设为 Git worktree 的绝对路径，或相对于 workbench 的路径。它不能等于 workbench，也不能位于 workbench 内；workbench 可以嵌套在源码仓库中，指纹计算会排除它。worktree 模式下，它必须等于 owned registry 中选定的单一、live integration target，并与 `state.sourceRoot` 指向的目标源码属于同一个 Git 仓库（同一 Git common dir；路径无需相同）；禁止用另一个仓库的视觉证据为当前仓库放行。

截图完成、记录 evidence 之前，worktree 模式运行
`supermaestro.js source-revision <workbench> --target "<integration-target>"`；
main-serial 模式可省略 `--target`。把输出的
`git-working-tree:<sha256>` 写入顶层 `sourceRevision`，并向 evidence
传入同一个值。验证会重新计算已跟踪文件和未忽略的未跟踪文件指纹，同时
排除 workbench。

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
  "id": "VIS-BOARD-01",
  "requirementIds": ["REQ-UI-01"],
  "platform": "weapp",
  "dataMode": "fixture",
  "command": "npm run test:e2e:weapp:visual",
  "sourceRef": "LANHU-V3.9.6/board-01",
  "target": "pages/visual-regression/demo?board=01",
  "baseline": "reports/artifacts/board-01.expected.png",
  "baselineHash": "<64-character-sha256>",
  "purpose": "design-conformance",
  "maxDiffRatio": 0.05,
  "expected": "页面结构、文案、颜色和关键几何与设计一致"
}
```

`visual.maxMaskedRatio` 默认值为 `0.05`。当设计和运行时都具有确定性时，应降低该值。

## 证据

每条视觉 evidence 必须且只能记录一个 case ID：

以下多行示例使用 Bash `\` 排版。Windows 可直接合并成单行；需要续行时，
PowerShell 使用行末反引号，CMD 使用行末 `^`。

```bash
node <plugin-root>/scripts/supermaestro.js evidence <workbench> \
  --type test.visual \
  --phase review \
  --platform weapp \
  --data-mode fixture \
  --purpose design-conformance \
  --command "npm run test:e2e:weapp:visual" \
  --result passed \
  --required 1 \
  --executed 1 \
  --passed 1 \
  --failed 0 \
  --case-ids VIS-BOARD-01 \
  --exit-code 0 \
  --source-revision "git-working-tree:<sha256>" \
  --baseline-manifest reports/artifacts/baseline-manifest.json \
  --baseline-hash "<64-character-sha256>" \
  --actual reports/artifacts/board-01.actual.png \
  --expected reports/artifacts/board-01.expected.png \
  --diff reports/artifacts/board-01.diff.png \
  --report reports/artifacts/board-01.report.json \
  --artifacts reports/artifacts/board-01.actual.png,reports/artifacts/board-01.expected.png,reports/artifacts/board-01.diff.png,reports/artifacts/board-01.report.json \
  --diff-ratio 0.021 \
  --max-diff-ratio 0.05 \
  --masked-ratio 0.004 \
  --mask-reason "设计稿红色批注像素"
```

当遮罩比例超过契约设置的上限，并且有独立文本/布局断言保护被忽略区域时，追加 `--geometry-assertions true`。

evidence 的 `purpose` 必须与契约一致。它的 `expected` 路径必须解析到契约 baseline，文件哈希必须匹配 `baselineHash`。CLI 还会把每条 evidence 绑定到当前 validation contract 的规范化哈希，并记录 report、manifest、expected、actual、diff 和其他产物的 SHA-256。画板/状态用例变化或产物被替换后，必须重新生成 evidence。

## 产物完整性

- `baseline-manifest`：把画板/状态 ID 映射到原始来源、尺寸、裁剪、缩放和哈希。
- `expected`：实际参与比较的规范化基线。
- `actual`：本轮新生成的运行时截图。
- `diff`：可见的像素差异图。
- `report`：阈值、差异比例、遮罩比例、尺寸、结果和产物路径。

基线和报告必须可审查。只有已批准基线和可复现命令仍可用时，才能忽略一次性运行产物。

## 失败关闭规则

- 任一必测 case 没有独立 evidence 时失败。
- `sourceRevision`、`contractHash`、baseline hash 或产物 hash 不一致时失败。
- report、expected、actual 或 diff 为空/不存在时失败。
- 差异比例超过阈值时失败，不自动更新 baseline。
- 遮罩越界且没有独立几何断言时失败。
- 无法运行时保持 `blocked`；只有用户明确接受 skip 才能通过门禁，但结论仍不是视觉 `passed`。
