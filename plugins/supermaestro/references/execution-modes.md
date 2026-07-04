# Execution Modes

Use the lightest mode that keeps review artifacts understandable.

| Mode | Use When | Tradeoff |
| --- | --- | --- |
| `main-serial` | Small or low-risk changes | Lowest overhead, weakest isolation |
| `single-worktree-serial` | Medium changes that need clean review | Better isolation, still simple |
| `multi-worktree-parallel` | Multiple independent feature slices after a foundation checkpoint | Higher setup cost, best review separation |

Rules:

- Do not enable worktrees or subagents just for ceremony.
- If a foundation task unlocks several downstream tasks, review it before starting downstream work.
- If one review pack exceeds 5-8 files or mixes unrelated behavior, split it.
