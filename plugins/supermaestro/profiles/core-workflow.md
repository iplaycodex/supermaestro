# Core Workflow Profile

SuperMaestro core only owns workflow mechanics:

- change / requirement identity
- source and workbench layout
- state transitions
- Human Gates
- task DAG and review packs
- handoff and validation artifacts
- resume / next projection
- execution discipline handoff to Superpowers skills

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
workbench/specs/requirement-alignment.md
workbench/plans/task-plan.md
workbench/plans/progress.md
workbench/reviews/review-packs.md
workbench/reports/validation.md
```

## Gate Rules

- Gate 1 must pass before final task planning; it confirms human/AI requirement understanding, scope, rules, examples, assumptions, and acceptance scenarios.
- Gate 2 must pass before coding, worktree creation, branch creation, or subagent dispatch; it confirms task plan, execution mode, review packs, and implementation strategy.
- Gate 3 must pass before requesting final actions; it confirms review packs and validation evidence.
- Gate 4 must pass before commit, merge, push, cleanup, or rollback.
- CLI checks are stronger than prompt instructions. If a script rejects an action, stop and report the reason.
- Superpowers integration is enforced by CLI evidence gates. When a phase requires a `superpowers:*` skill, the agent must actually read/use that skill and record evidence in `reports/validation.md`; mentioning future intent in the plan is not enough.

## Review Rules

- Every coding task needs a review artifact.
- Review artifacts must point to an actual diff, patch, branch, or PR.
- Review agent output is evidence, not a correctness guarantee.
- Human approval remains required for Gate 1, Gate 2, Gate 3, and Gate 4.

## Superpowers Integration

- Mission Control owns orchestration: workbench, gates, state, review packs, worktrees, fan-in, validation and final actions.
- `superpowers:writing-plans` contributes task granularity: files, steps, tests, commands and expected results.
- `superpowers:subagent-driven-development` is the preferred execution discipline when real independent worker agents are used.
- `superpowers:executing-plans` is a fallback for serial or cross-session execution when subagents are not used.
- `superpowers:test-driven-development` is the default discipline for worker tasks that touch behavior code. RED/GREEN evidence or an explicit skip/defer reason must appear in handoff and validation artifacts.
- `superpowers:systematic-debugging` is required when a worker hits bugs, test failures, build failures, integration failures, or behavior review findings.
- `superpowers:requesting-code-review` shapes Review Agent Checkpoints: focused scope, requirements, base/head or diff, verification evidence, and findings-first output.
- `superpowers:receiving-code-review` shapes changes-requested handling: verify feedback against codebase reality before fixing, and push back with technical evidence when needed.
- `superpowers:verification-before-completion` is required before Gate 3, Gate 4, completion claims, commits, merges, pushes, or PR creation.
- `superpowers:finishing-a-development-branch` shapes Gate 4 final action menus and cleanup safety, while Human Gate 4 and CLI checks remain authoritative.

Hard gate mapping:

- Gate 1 workbench checks require `specs/requirement-alignment.md` with explicit user-confirmed alignment evidence.
- Gate 2 plan approval requires `superpowers:writing-plans` evidence.
- Code action checks require `superpowers:test-driven-development` plus either `superpowers:subagent-driven-development` or `superpowers:executing-plans` evidence, depending on execution mode.
- Subagent dispatch checks require `superpowers:subagent-driven-development` evidence.
- Gate 3 verification requires `superpowers:verification-before-completion` evidence and conditionally requires debugging/review evidence when failures or review findings exist.
- Gate 4/final action checks require `superpowers:verification-before-completion` and `superpowers:finishing-a-development-branch` evidence.
