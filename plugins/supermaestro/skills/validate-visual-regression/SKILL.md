---
name: validate-visual-regression
description: 针对明确的 UI 画板与状态，规划并验证 design-conformance 或 regression 截图，并记录结构化的 SuperMaestro 视觉证据。适用于多画板 PRD、蓝湖或图片基线、确定性 fixture 页面、像素差异、布局几何断言、遮罩审计，以及需要证明审查门禁视觉完整性的场景。
---

# 视觉回归验证

验证每个必需的视觉状态，确保基线可追溯、产物可审查。将截图、fixture、渲染驱动和业务选择器保留在目标项目中。

## 触发条件

在 Plan 已决定需要 `design-conformance` 或 `regression`，并且存在明确画板/状态和可定位基线时使用。只有模糊的“看起来差不多”、缺少设计来源或只需行为测试时，不应把本 Skill 当作完成证明。

## 输入

- workbench 和目标 Git worktree。
- UI contract、画板/状态清单、schema 与基线来源。
- 目标平台、固定 fixture/mock、设备尺寸和 DPR。
- 项目已有截图/像素差异运行器及可执行命令。
- 每个用例可接受的 `maxDiffRatio` 和必要遮罩规则。

缺少会影响结论的基线、运行环境或状态数据时保持 `blocked`；不要生成近似图片冒充 expected。

## 按需读取

填写契约或记录 evidence 前，读取[视觉证据契约](references/evidence-contract.md)。只有需要执行视觉验证时再读取，普通非 UI 任务无需加载。

## 工作流程

1. 阅读 UI 清单、数据结构定义、画板图片、`ui-schema-extract.md`、资源映射、项目测试运行器和目标平台约束。
2. 确认 Plan 中的视觉决策为 `required`；如为 `not-applicable` 或 `blocked`，不要伪造执行结果。
3. 在规划阶段启用触发器：

   ```bash
   node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --visual true
   ```

4. 填写 `specs/machine/validation-contract.json`。将顶层 `sourceRoot` 设置为目标 Git 工作树；worktree 模式下它必须等于 owned registry 中选定的单一、live integration target，并确认该目标与 `state.sourceRoot` 指向的目标源码属于同一个 Git 仓库（同一 Git common dir；路径无需相同）。多 worktree 先完成 fan-in，其他 registered target 必须 clean，且 HEAD 已是 integration target HEAD 的祖先；worker 局部结果只写 handoff。运行 `supermaestro.js source-revision <workbench> --target "<integration-target>"`，将其 `git-working-tree:<sha256>` 输出复制到 `sourceRevision`；main-serial 模式可省略 `--target`。随后为每个必需的画板或状态添加一个视觉用例，并绑定 `sourceRef`、`target`、`purpose`、`baseline`、`baselineHash` 和 `maxDiffRatio`。
5. 明确选择 `purpose`：
   - `design-conformance`：将实现与已批准的设计来源进行比较。
   - `regression`：将后续实现与已批准的运行时基线进行比较。
6. 视觉状态应优先使用确定性的 fixture 数据。仅在测试构建中注册 fixture 路由，不得影响生产包。
7. 项目已有截图或差异比较运行器时，优先复用。失败后不得自动更新基线。
8. 当遮罩区域或动态区域可能掩盖缺陷时，除像素比较外，还要对关键文本、状态和几何信息执行断言。
9. 生成 `expected`、`actual`、`diff`、`report` 和 `baseline-manifest` 产物。
10. 每个契约用例只记录一条 `test.visual` 证据，然后运行 `supermaestro.js verify <workbench> --target "<integration-target>"`；worktree 模式后续的 `request-review`、`approve-review` 和 `request-final` 也必须传入同一个 integration target。`approve-final` 的 target 参数只按所选最终动作契约提供：keep 不传，cleanup 传精确清理目标。main-serial 模式的验证命令可省略 `--target`。

## 输出与完成标准

- 每个必测画板/状态都有独立 contract case。
- 每个 case 有对应的 `expected`、`actual`、`diff`、report 和 baseline manifest。
- evidence 与当前 `sourceRevision`、`contractHash`、baseline hash 和产物 hash 一致。
- 回复按 case 报告通过、失败、阻塞、差异比例、阈值和剩余风险。

像素工具退出成功但 case 缺失、基线不可追溯、产物为空或遮罩越界时，不能声明视觉验证通过。

## 异常与降级

- 项目没有截图运行器：先提出最小项目内方案；未经授权不安装依赖或改构建基础设施。
- 基线缺失或哈希不匹配：保持 `blocked`，重新获取批准基线。
- 字体、状态栏或动态数据不稳定：先固定环境；无法固定时记录例外和风险，不提高阈值掩盖问题。
- 差异超阈值：报告失败，不自动更新 expected。
- 无法执行但用户接受跳过：按契约记录 `blocked` 和明确确认，不能写成 `passed`。

## 基线与遮罩规则

- 保留设计来源引用、尺寸、缩放比例、裁剪信息和 SHA-256。
- 明确说明阈值和差异比例的语义；不得将抗锯齿容差描述为布局容差。
- 遮罩必须限定在较小区域内，并提供具体原因。
- 当被遮罩像素超过 `visual.maxMaskedRatio` 时，添加独立的几何断言，否则判定门禁失败。
- 不得仅为了让测试通过而遮罩完整的比较目标、核心内容、价格、主要操作或状态指示器。
- 单张截图或单个差异结果不能覆盖多个画板或状态用例。

## 边界

- 视觉 `fixture` 只能证明确定性渲染，不能证明实时 API 或真实订单的正确性。
- `design-conformance` 证据不能替代行为 E2E。
- 缺少设计资源时保持 `blocked`，不得静默使用近似资源替代。
- 字体渲染、图片插值和平台差异可以作为配置容差的依据，但每项例外都必须可审查。
- 不执行支付、下单、删除或生产写入来制造截图状态，除非用户对精确动作另行授权。
