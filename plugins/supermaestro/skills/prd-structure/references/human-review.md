# 人工审查与偏差修正

## 人工要审什么

人工不需要逐字改 JSON，重点审会影响实现和验收的事实：

- 本期范围和明确不做的范围。
- 登录、实名、权限、会员身份、渠道、端差异。
- 奖励发放、领取、过期、回滚和重复领取。
- 任务展示、排序、完成、领取、循环周期。
- 状态机和按钮文案。
- 后台配置字段、枚举和生效规则。
- 接口入参、出参、错误态、mock 场景。
- UI 最终设计稿、资源来源、强视觉区域。
- 前后端埋点 key、字段名和口径。
- 验收标准和测试覆盖。

## 审查状态

使用这些状态：

| 状态 | 含义 | 后续动作 |
| --- | --- | --- |
| `accepted` | 抽取正确 | 可进入计划和任务卡 |
| `corrected` | 人工已修正 | 按修正后内容执行 |
| `rejected` | 不属于需求或理解错误 | 不得进入实现 |
| `unclear` | 需要产品/后端/设计确认 | 进入 open questions，阻塞相关任务 |
| `pending` | 尚未审查 | 不能作为编码唯一依据 |

## 偏差修正流程

发现结构化 PRD 和原文或产品口径不一致时：

1. 在 `structured-prd-review.md` 标记条目 ID、问题和正确口径。
2. 修改 `structured-prd.json` 对应条目，保留原 `source_ref`。
3. 在条目 `human_note` 写明修正原因。
4. 同步更新 `open-questions.md`：已解决的问题移出阻塞，未解决的保持阻塞。
5. 若已经生成 `$mission-control` 工作台，更新 `context.md`、`plans/task-plan.md`、`reviews/review-packs.md` 和 `reports/validation.md` 中受影响部分。
6. 若已经编码，相关 review pack 标记 `changes-requested`，回到对应任务修复。

## Gate 1 前最小审查清单

进入 `$mission-control` Gate 1 前，至少确认：

- 所有 P0/P1 业务规则不是 `pending`。
- 所有编码任务依赖的规则为 `accepted` 或 `corrected`。
- 所有 `unclear` 都在 Gate 1 Brief 中出现。
- 结构化 PRD 中的接口和字段没有被当成真实接口事实，除非原文或 API 文档明确给出。
- UI 任务不会只依赖 PRD 截图；如有 Lanhu/MasterGo schema，必须以后者为 UI source of truth。
- review pack 可以追溯到结构化条目和原文 source_ref。

## 给 AI worker 的输入边界

不要把完整 `structured-prd.json` 一股脑交给 worker。应按任务切片提供：

- 任务相关的结构化条目 ID。
- 对应原文 source_ref。
- 允许修改范围和禁止修改范围。
- 验收标准。
- 待确认项和不可自行假设项。

worker 发现结构化内容与代码、API、UI schema 或原文冲突时，必须停下并回报，不得自行选择一种解释继续实现。
