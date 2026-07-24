---
name: validate-weapp-e2e
description: 使用 miniprogram-automator 等项目现有运行器，验证 Taro 或原生微信小程序行为，并记录结构化的 SuperMaestro E2E 证据。适用于页面导航、标签页、手势、对话框、加载/空状态/错误状态、集成 API 的 UAT 流程，以及需要真实小程序运行时证据支撑的审查门禁场景。
---

# 微信小程序 E2E 验证

使用项目真实的小程序构建产物和运行器验证行为。将运行器、路由、选择器、账号和测试数据保留在项目中；SuperMaestro 只负责契约与证据。

## 工作流程

1. 阅读目标项目的 `AGENTS.md`、`package.json`、构建脚本、路由配置、现有测试和环境约束。
2. 阅读 [references/evidence-contract.md](references/evidence-contract.md)。
3. 在规划阶段启用触发器：

   ```bash
   node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --e2e true
   ```

4. 填写 `specs/machine/validation-contract.json`。将顶层 `sourceRoot` 设置为目标 Git 工作树，运行 `supermaestro.js source-revision <workbench>`，并将其 `git-working-tree:<sha256>` 输出复制到 `sourceRevision`。创建稳定的用例 ID，并为每个用例填写 `requirementIds`、`platform`、`dataMode`、`command` 和 `expected`。
5. 如实标记数据来源：
   - `fixture`：应用内的确定性 fixture。
   - `mock-api`：模拟的传输层或服务端。
   - `uat`：真实测试环境 API。
   - `real`：真实外部链路或业务链路。
6. 优先使用项目现有运行器。如果不存在，则添加与当前技术栈兼容的最小项目内运行器；未经授权，不得安装依赖或修改构建基础设施。
7. 使用明确的等待条件和超时时间。每个用例之间都要重置状态。除非用户明确授权，否则避免购买、支付、删除、生产写入或其他副作用。
8. 执行全新构建和 E2E 命令。保留机器可读的报告或日志产物。
9. 添加 `test.e2e` 证据，包含准确的契约用例 ID、`dataMode`、计数、退出码、`sourceRevision`、报告和产物。
10. 请求审查前运行 `supermaestro.js verify <workbench>`。

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
