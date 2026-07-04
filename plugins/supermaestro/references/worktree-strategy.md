# Worktree Strategy

Default location:

```text
<repo>.worktrees/<change-id>-<task-id>
```

Rules:

- Do not put worktrees in `/tmp`, `/private/tmp`, or system temp directories.
- Record worktree path, branch, base commit, and diff command in `plans/progress.md` or `worktrees/plan.md`.
- Feature worktrees that depend on foundation work should start from a reviewed checkpoint base.
- Do not copy unreviewed foundation changes into multiple feature worktrees as an invisible base.
