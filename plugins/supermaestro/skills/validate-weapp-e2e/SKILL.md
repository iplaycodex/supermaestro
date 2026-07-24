---
name: validate-weapp-e2e
description: 使用 miniprogram-automator 等项目现有运行器，验证 Taro 或原生微信小程序行为，并记录结构化的 SuperMaestro E2E 证据。适用于页面导航、标签页、手势、对话框、加载/空状态/错误状态、集成 API 的 UAT 流程，以及需要真实小程序运行时证据支撑的审查门禁场景。
---

# 微信小程序 E2E 验证

使用项目真实的小程序构建产物和运行器验证行为。将运行器、路由、选择器、账号和测试数据保留在项目中；SuperMaestro 只负责契约与证据。

## 触发条件

在 Plan 已决定验证微信小程序关键行为，并启用 E2E trigger 时使用。只需单元测试、静态检查、H5 浏览器验证或人工真机检查时，不要把这些结果标成 WeApp E2E。

## 输入

- workbench、目标 Git worktree 和目标小程序构建产物。
- `validation-contract.json` 中的稳定用例 ID、平台、`dataMode`、命令和预期。
- 项目已有运行器、微信开发者工具 CLI 路径、路由、选择器和有界超时。
- fixture、mock、UAT 或 real 所需的账号/数据；敏感值只放项目安全配置。

缺少开发者工具、构建产物、测试账号或用户授权时，先判断能否缩小为不产生误导的部分验证；否则保持 `blocked`。

## 按需读取

填写契约或记录 evidence 前，读取[微信小程序 E2E 证据契约](references/evidence-contract.md)。非微信小程序任务无需加载。

## 工作流程

1. 阅读目标项目的 `AGENTS.md`、`package.json`、构建脚本、路由配置、现有测试和环境约束。
2. 确认 Plan 中已声明 E2E 范围和真实数据模式；不能用后续 mock 结果替代原计划的 UAT/real 用例。
3. 在规划阶段启用触发器：

   ```bash
   node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --e2e true
   ```

4. 填写 `specs/machine/validation-contract.json`。将顶层 `sourceRoot` 设置为目标 Git 工作树；worktree 模式下它必须等于 owned registry 中选定的单一、live integration target，并确认该目标与 `state.sourceRoot` 指向的目标源码属于同一个 Git 仓库（同一 Git common dir；路径无需相同）。多 worktree 先完成 fan-in，其他 registered target 必须 clean，且 HEAD 已是 integration target HEAD 的祖先；worker 局部结果只写 handoff。运行 `supermaestro.js source-revision <workbench> --target "<integration-target>"`，将其 `git-working-tree:<sha256>` 输出复制到 `sourceRevision`；main-serial 模式可省略 `--target`。创建稳定的用例 ID，并为每个用例填写 `requirementIds`、`platform`、`dataMode`、`command` 和 `expected`。
5. 如实标记数据来源：
   - `fixture`：应用内的确定性 fixture。
   - `mock-api`：模拟的传输层或服务端。
   - `uat`：真实测试环境 API。
   - `real`：真实外部链路或业务链路。
6. 优先使用项目现有运行器。如果不存在，则添加与当前技术栈兼容的最小项目内运行器；未经授权，不得安装依赖或修改构建基础设施。
7. 使用明确的等待条件和超时时间。每个用例之间都要重置状态。除非用户明确授权，否则避免购买、支付、删除、生产写入或其他副作用。
8. 执行全新构建和 E2E 命令。保留机器可读的报告或日志产物。
9. 添加 `test.e2e` 证据，包含准确的契约用例 ID、`dataMode`、计数、退出码、`sourceRevision`、报告和产物。
10. 请求审查前运行 `supermaestro.js verify <workbench> --target "<integration-target>"`；worktree 模式后续的 `request-review`、`approve-review` 和 `request-final` 也必须传入同一个 integration target。`approve-final` 的 target 参数只按所选最终动作契约提供：keep 不传，cleanup 传精确清理目标。main-serial 模式的验证命令可省略 `--target`。

## 输出与完成标准

- 每个必测行为都有稳定 contract case，实际命令与 case 的平台、数据模式一致。
- evidence 记录真实执行数量、通过/失败数量、退出码、报告、产物和当前 `sourceRevision`。
- 报告是非空真实文件，并能定位每个 case 的结果、环境和时间。
- 回复区分 `passed`、`failed`、`blocked` 和用户接受的 skip，列出未覆盖风险。

测试进程退出成功但未执行契约用例、报告为空、用例被跳过或数据模式不符时，不能声明 E2E 通过。

## 异常与降级

- 微信开发者工具或 CLI 不可用：记录环境阻塞和恢复条件，不用浏览器模拟冒充 WeApp E2E。
- UAT/real 账号或服务不可用：保持相应用例 `blocked`；可另跑 fixture/mock 辅助诊断，但结论分开。
- 选择器或路由不稳定：先修复项目测试契约并重新运行，不能把偶发成功写入正式 evidence。
- 涉及支付、删除、生产写入或不可逆动作：没有精确用户授权就不执行。
- 用户接受跳过：使用 `accepted-skip`、确认人和确认摘要记录剩余风险，不得改成 `passed`。

## 边界

- 不把账号、Cookie、令牌、门店 ID 或其他敏感值写入插件、报告或 evidence。
- 不默认安装依赖、修改生产构建或向生产环境写数据。
- 不用 Mock、静态检查、HTTP 200 或人工口述替代目标数据模式的完整链路。
- SuperMaestro 校验证据，但项目运行器和业务断言仍归目标项目维护。

## 微信运行时指引

- 启动自动化前，确认微信开发者工具 CLI 路径和项目构建输出。
- 尽可能复用同一个开发者工具会话；在用例之间使用 `reLaunch` 或等效方式重置状态。
- 为每次元素查找、页面跳转和工具连接设置有界超时时间。
- 将分包重映射、测试账号、UAT 门店 ID 和宿主项目打包方式作为项目配置处理。
- 将授权、支付、相机、地图、扫码和仅设备可用能力的缺口记录为尚待完成的人工验证或真机验证。

## 完整性规则

- `fixture` 或 `mock-api` 模式运行不属于真实业务 E2E 运行。
- 仅有 HTTP 200 不能证明 UI 行为或 API 契约正确。
- 不得将跳过的断言或因条件不满足而未执行的断言计为通过。
- 相关代码、构建、`fixture` 或契约发生变化后，不得复用过期证据。
- `blocked` 用例只有在记录原因且用户明确接受跳过时，才能通过门禁。
