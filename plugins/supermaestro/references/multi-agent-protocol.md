# Multi-Agent Protocol

Use this only when Gate 1 explicitly enables subagents.

Execution layering:

- Mission Control keeps the workbench, gates, review packs, fan-in, validation, and final actions.
- Use `superpowers:subagent-driven-development` for independent real worker agents in the current session.
- Use `superpowers:executing-plans` only as a fallback when subagents are not used or execution is serial/cross-session.
- Coding workers must follow `superpowers:test-driven-development` when the task touches behavior code, unless the task card explicitly marks TDD as `not-applicable` or `deferred`.

Flow:

1. Main controller prepares shared context and task boundary.
2. Main controller gives the implementation agent the full task card, minimal necessary context, TDD decision, and evidence requirements.
3. Implementation agent works in the assigned worktree or branch.
4. Implementation agent writes handoff, RED/GREEN or skip/defer evidence, and validation evidence.
5. Main controller checks completion and prepares a review pack.
6. Read-only review agent reviews that pack.
7. Main controller fans findings back into the main workbench.

No implementation or review agent may approve gates or perform final actions.
