# Worktree Strategy

Default location:

```text
<repo>.worktrees/<change-id>-<task-id>
```

Rules:

- Detect whether the current workspace is already a linked worktree or detached HEAD before creating another worktree.
- If using project-local `.worktrees/` or `worktrees/`, verify the directory is ignored before creating worktrees.
- Do not put worktrees in `/tmp`, `/private/tmp`, or system temp directories.
- Record worktree path, branch, base commit, and diff command in `plans/progress.md` or `worktrees/plan.md`.
- Feature worktrees that depend on foundation work should start from a reviewed checkpoint base.
- Do not copy unreviewed foundation changes into multiple feature worktrees as an invisible base.
- Gate 3 cleanup follows `superpowers:finishing-a-development-branch`: verify first, identify normal repo / linked worktree / detached HEAD, merge before cleanup, keep worktrees for PR/keep, and require explicit confirmation for discard.
- Only clean worktrees created and recorded by this SuperMaestro run; leave harness-owned or unknown workspaces alone.
