# Core Workflow Profile

SuperMaestro core only owns workflow mechanics:

- change / requirement identity
- source and workbench layout
- state transitions
- Human Gates
- task DAG and review packs
- handoff and validation artifacts
- resume / next projection

Core must not contain project-specific UI, framework, or product rules. Put those rules in domain profiles.

## Machine State

Use these files as the machine-readable workflow layer:

```text
workbench/state.json          # current workflow state
workbench/events.jsonl        # append-only workflow event log
workbench/mission.state.json  # human-readable resume/next projection
workbench/gates/*.json        # gate decisions
```

Markdown files remain human projections and review artifacts:

```text
workbench/context.md
workbench/plans/task-plan.md
workbench/plans/progress.md
workbench/reviews/review-packs.md
workbench/reports/validation.md
```

## Gate Rules

- Gate 1 must pass before coding, worktree creation, branch creation, or subagent dispatch.
- Gate 2 must pass before requesting final actions.
- Gate 3 must pass before commit, merge, push, cleanup, or rollback.
- CLI checks are stronger than prompt instructions. If a script rejects an action, stop and report the reason.

## Review Rules

- Every coding task needs a review artifact.
- Review artifacts must point to an actual diff, patch, branch, or PR.
- Review agent output is evidence, not a correctness guarantee.
- Human approval remains required for Gate 2 and Gate 3.
