# Multi-Agent Protocol

Use this only when Gate 1 explicitly enables subagents.

Execution layering:

- Mission Control keeps the workbench, gates, review packs, fan-in, validation, and final actions.
- Use `superpowers:subagent-driven-development` for independent real worker agents in the current session.
- Use `superpowers:executing-plans` only as a fallback when subagents are not used or execution is serial/cross-session.
- Coding workers must follow `superpowers:test-driven-development` when the task touches behavior code, unless the task card explicitly marks TDD as `not-applicable` or `deferred`.
- Workers must follow `superpowers:systematic-debugging` before fixing bugs, test failures, build failures, integration failures, or behavior review findings.
- Review checkpoints use `superpowers:requesting-code-review`; changes-requested handling uses `superpowers:receiving-code-review`.
- Gate 3/Gate 4 completion claims use `superpowers:verification-before-completion`; Gate 4 final action handling uses `superpowers:finishing-a-development-branch`.

Flow:

1. Main controller prepares shared context and task boundary.
2. Main controller gives the implementation agent the full task card, minimal necessary context, TDD decision, and evidence requirements.
3. Implementation agent works in the assigned worktree or branch.
4. Implementation agent writes handoff, RED/GREEN or skip/defer evidence, debugging evidence when relevant, and validation evidence.
5. Main controller checks completion and prepares a review pack.
6. Read-only review agent reviews that pack.
7. Main controller fans findings back into the main workbench.

No implementation or review agent may approve gates or perform final actions.
