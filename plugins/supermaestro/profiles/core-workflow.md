# Core Workflow Profile

SuperMaestro core owns workflow mechanics only:

- requirement / change identity
- `source/` and `workbench/` layout
- workflow mode and state transitions
- Scope / Plan / Review / Final Gates
- artifact scaffold triggers
- policy and contract checks
- resume / next projection
- final action authorization

Project-specific UI, framework, and product rules belong in domain profiles such as `profiles/weapp-taro-lanhu.md`.

## Workflow Modes

| Mode | Use case | Gate flow | CLI behavior |
| --- | --- | --- | --- |
| `lite` | 小 bug、小文案、小样式、低风险改动 | Scope + Final | `check-workbench` checks `brief.md`; Plan and Review are skipped. |
| `standard` | 普通前端需求 | Scope + Plan + Review + Final | Keeps V2 policy checks usable without strict contract hard-fail. |
| `strict` | 多页面、多画板、强 UI、接口契约、高风险任务 | Scope + Plan + Review + Final | Adds hard contract validation and stricter policy evidence. |

旧 Gate 名称仅作为 compatibility aliases:

```text
approve-gate1 -> approve-scope
approve-gate2 -> approve-plan
request-gate3 -> request-review
approve-gate3 -> approve-review
request-gate4 -> request-final
approve-gate4 -> approve-final
```

## Machine State

Machine-readable workflow state:

```text
workbench/state.json              # current workflow state, mode, gates, execution, policies, artifacts
workbench/events.jsonl            # append-only workflow event log
workbench/mission.state.json      # resume/next projection
workbench/gates/*.json            # human gate decisions
workbench/reports/evidence.jsonl  # primary machine evidence source
```

Markdown files are human projections and review artifacts:

```text
workbench/context.md
workbench/specs/*.md
workbench/plans/task-plan.md
workbench/plans/progress.md
workbench/reviews/review-packs.md
workbench/reports/validation.md
```

`workbench/specs/` 顶层只放人类主文档。机器可读 contract JSON 放在 `workbench/specs/machine/`，包括 `api-contract.json`、`ui-contract.json` 和 `review-contract.json`。迁移期 CLI 仍 fallback 读取旧顶层 JSON。

`reports/validation.md`, `plans/task-plan.md`, `plans/progress.md`, and `reviews/review-packs.md` remain legacy fallback evidence sources during migration. New machine evidence should be written to `reports/evidence.jsonl` with `supermaestro evidence`.

## Gate Rules

- Scope Gate confirms scope / non-scope / acceptance alignment. CLI enforces explicit user confirmation through `approve-scope` or legacy `approve-gate1`.
- Plan Gate confirms execution mode, plan artifacts, review strategy, and policy evidence. CLI enforces `superpowers:writing-plans` evidence through policy checks.
- Review Gate confirms review packs and verification evidence. CLI enforces `superpowers:verification-before-completion` evidence through policy checks.
- Final Gate authorizes final actions. CLI enforces independent user confirmation plus `verification-before-completion` and `finishing-a-development-branch` evidence.
- CLI checks are authoritative. If `supermaestro.js` rejects an action, stop and report the reason.

## Artifact And Contract Rules

`scaffold` generates artifacts by trigger, not by completeness theater. Optional directories should appear only when their trigger is enabled and the artifact is useful.

`check-contracts` validates contracts:

- UI contract when UI material exists or `ui=true`.
- API contract when API material exists or `api=true`.
- Behavior contract in `strict` mode or `behavior=true`.
- Review contract in `standard` / `strict` or `review=true`.

Strict UI coding uses `specs/ui-schema-extract.md` as the primary UI schema node extraction and Schema-to-implementation mapping document. Legacy `specs/ui-schema-map.md` is accepted only as fallback for old workbenches.

Review Contract lives in `reviews/review-packs.md` as the primary human review entrypoint. Legacy `specs/review-contract.md` is accepted only as fallback for old workbenches. `specs/machine/review-contract.json` may remain as machine-readable metadata.

In `strict` mode, `approve-plan` runs contract validation as a hard gate. In `standard` mode, `check-contracts` is available for manual review and defaults to warnings unless `--strict true` is passed. `lite` skips contract validation by default.

## Superpowers Policy

Superpowers is not removed. It is managed as the default `superpowers` policy pack:

```text
plugins/supermaestro/policies/superpowers.policy.json
plugins/supermaestro/policies/superpowers.policy.md
```

Core workflow loads policy requirements and checks `reports/evidence.jsonl` first, then legacy Markdown fallback. The default policy enforces:

- Plan approval: `superpowers:writing-plans`.
- Code action: `superpowers:test-driven-development` plus `executing-plans` or `subagent-driven-development`.
- Dispatch subagent: `superpowers:subagent-driven-development`.
- Review request: `superpowers:verification-before-completion`.
- Final request / approval / final actions: `verification-before-completion` plus `finishing-a-development-branch`.

`strict` mode adds hard checks for contract completeness, UI schema map, Review Gate readiness, and no TDD skip for behavior/API/UI-risk work.

## Review Rules

- Every coding task should have a review artifact.
- Review artifacts should point to a diff, patch, branch, or PR. In Plan phase, `pending` review packs are acceptable; in `strict` Review Gate, CLI rejects review packs that still have no concrete review artifact.
- Review agent output is evidence, not a correctness guarantee.
- Human approval remains required for Scope, Plan, Review, and Final Gates.
