# Agent Roles

## Main Controller

- Owns the main workbench.
- Updates `state.json`, `events.jsonl`, `plans/progress.md`, `reviews/review-packs.md`, and `reports/validation.md`.
- Decides Gate briefs and fan-in.

## Implementation Agent

- Works only on one assigned task.
- Writes code and a handoff.
- Does not update the main workbench directly.
- Does not commit, merge, push, or cleanup.

## Review Agent

- Read-only.
- Reviews one review pack.
- Writes findings first, ordered by severity.
- Does not modify source files.
