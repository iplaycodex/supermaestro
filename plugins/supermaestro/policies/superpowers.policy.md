# Superpowers Policy

SuperMaestro 默认启用 `superpowers` policy。这个 policy 不是替代 Superpowers，而是把 Superpowers 正式作为默认执行策略包来管理。

Core workflow 只负责状态机、Gate、artifact、action authorization 和 evidence 读取；Superpowers policy 负责声明每个阶段需要哪些 `superpowers:*` skill 证据。

## 默认规则

| 事件 | 需要的 Superpowers evidence |
| --- | --- |
| `gate.plan.approve` | `superpowers:writing-plans` |
| `action.code` | `superpowers:test-driven-development`，以及按执行模式要求 `executing-plans` 或 `subagent-driven-development` |
| `action.code#strict` | 必须有真实 `superpowers:test-driven-development` used evidence，不接受仅 skipped-with-reason |
| `action.dispatch-subagent` | `superpowers:subagent-driven-development` |
| `gate.review.request` | `superpowers:verification-before-completion` |
| `gate.review.request#strict` | 启用 review agent 时需要 `superpowers:requesting-code-review` |
| `gate.final.request` / `gate.final.approve` / `action.final` | `verification-before-completion` + `finishing-a-development-branch` |

## Evidence

机器证据优先记录到 `workbench/reports/evidence.jsonl`。迁移期仍兼容 `reports/validation.md`、`plans/task-plan.md`、`plans/progress.md`、`reviews/review-packs.md` 中的旧式文本证据。
