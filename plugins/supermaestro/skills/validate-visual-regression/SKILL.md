---
name: validate-visual-regression
description: 针对明确的 UI 画板与状态，规划并验证 design-conformance 或 regression 截图，并记录结构化的 SuperMaestro 视觉证据。适用于多画板 PRD、蓝湖或图片基线、确定性 fixture 页面、像素差异、布局几何断言、遮罩审计，以及需要证明审查门禁视觉完整性的场景。
---

# 视觉回归验证

验证每个必需的视觉状态，确保基线可追溯、产物可审查。将截图、fixture、渲染驱动和业务选择器保留在目标项目中。

## 工作流程

1. 阅读 UI 清单、数据结构定义、画板图片、`ui-schema-extract.md`、资源映射、项目测试运行器和目标平台约束。
2. 阅读 [references/evidence-contract.md](references/evidence-contract.md)。
3. 在规划阶段启用触发器：

   ```bash
   node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --visual true
   ```

4. 填写 `specs/machine/validation-contract.json`。将顶层 `sourceRoot` 设置为目标 Git 工作树，运行 `supermaestro.js source-revision <workbench>`，并将其 `git-working-tree:<sha256>` 输出复制到 `sourceRevision`。随后为每个必需的画板或状态添加一个视觉用例，并绑定 `sourceRef`、`target`、`purpose`、`baseline`、`baselineHash` 和 `maxDiffRatio`。
5. 明确选择 `purpose`：
   - `design-conformance`：将实现与已批准的设计来源进行比较。
   - `regression`：将后续实现与已批准的运行时基线进行比较。
6. 视觉状态应优先使用确定性的 fixture 数据。仅在测试构建中注册 fixture 路由，不得影响生产包。
7. 项目已有截图或差异比较运行器时，优先复用。失败后不得自动更新基线。
8. 当遮罩区域或动态区域可能掩盖缺陷时，除像素比较外，还要对关键文本、状态和几何信息执行断言。
9. 生成 `expected`、`actual`、`diff`、`report` 和 `baseline-manifest` 产物。
10. 每个契约用例只记录一条 `test.visual` 证据，然后运行 `supermaestro.js verify <workbench>`。

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
