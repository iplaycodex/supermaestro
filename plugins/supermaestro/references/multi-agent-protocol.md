# Multi-Agent Protocol

Use this only when Gate 1 explicitly enables subagents.

Execution layering:

- Mission Control keeps the workbench, gates, review packs, fan-in, validation, and final actions.
- Use independent worker agents only for task cards with clear boundaries and minimal required context.
- Keep serial or cross-session execution under the main controller when subagents are not enabled.
- Coding workers record a TDD decision for behavior changes: `required`, `not-applicable`, or `deferred`.
- Before fixing failures or review findings, workers record reproduction, root cause, the minimal fix, and revalidation evidence.
- Review checkpoints use a frozen review pack; changes-requested findings must be verified, resolved, or rejected with technical evidence.
- Gate 3/Gate 4 and completion claims require fresh validation; final actions follow the approved delivery and cleanup choices.

Flow:

1. Main controller prepares shared context and task boundary.
2. Main controller gives the implementation agent the full task card, minimal necessary context, TDD decision, and evidence requirements.
3. Implementation agent works in the assigned worktree or branch.
4. Implementation agent writes handoff, RED/GREEN or skip/defer evidence, debugging evidence when relevant, and validation evidence.
5. Main controller checks completion and prepares a review pack.
6. Read-only review agent reviews that pack.
7. Main controller fans findings back into the main workbench.

No implementation or review agent may approve gates or perform final actions.
