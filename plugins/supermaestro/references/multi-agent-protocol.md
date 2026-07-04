# Multi-Agent Protocol

Use this only when Gate 1 explicitly enables subagents.

Flow:

1. Main controller prepares shared context and task boundary.
2. Implementation agent works in the assigned worktree or branch.
3. Implementation agent writes handoff and validation evidence.
4. Main controller checks completion and prepares a review pack.
5. Read-only review agent reviews that pack.
6. Main controller fans findings back into the main workbench.

No implementation or review agent may approve gates or perform final actions.
