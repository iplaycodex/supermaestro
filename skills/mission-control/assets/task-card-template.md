# 任务卡：<TASK-ID> <标题>

## 元信息

- 类型：foundation / feature / integration / review
- 状态：planned
- Owner：
- 依赖：
- 解锁任务：
- Foundation Checkpoint：yes / no
- Checkpoint 放行条件：
- Worktree：
- Branch：
- Base commit：
- Foundation checkpoint commit：none / <commit>
- P-only diff base：target branch / foundation checkpoint commit
- Review Pack：
- Review artifact：worktree diff / patch / PR / explicit local commit
- 自动提交 feature：no
- Foundation human-approved 后 checkpoint commit 授权：
- Worktree 可运行性：每个 worktree install / 完整项目拷贝 / 仅静态验证

## 允许修改

-

## 禁止修改

-

## 输入上下文

- 共享上下文：context.md
- API 规格：specs/api-spec.md
- UI 规格：specs/ui-schema-extract.md（Sketch Data 提取）
- 其他：

## UI Schema 映射

| Sketch Data 节点/路径 | 设计值 | 代码文件/组件/样式选择器 | 实现值 | 偏差说明 |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

> UI 任务必须先补齐本表再编码；图片缺失时必须显式按 schema-only 验收。所有视觉值必须来自 Sketch Data，不得自行发挥。

## 实现要求

- Foundation 任务只实现本卡契约面；超过 5-8 个文件、3 个目录或 3 类契约面时，停止并要求主控拆分。
- Feature 任务不得修改已批准 foundation 基线；review artifact 必须能显示 P-only diff。

## 验证命令

```bash

```

## 完成标准

-

## Foundation Checkpoint 交接

适用于 `Foundation Checkpoint: yes` 的任务；不适用时写 `不适用`。

- 公共契约：
- 下游任务：
- 典型状态/mock 覆盖：
- 用户 review 重点：
- 放行结果：
- 打回处理：

## Handoff

- 输出路径：workbench/agents/<TASK-ID>/handoff.md
