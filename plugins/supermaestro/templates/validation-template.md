# Validation

## Summary

## Commands

| Command | Result | Evidence |
| --- | --- | --- |

## Structured E2E / Visual Validation（按 trigger）

- Contract（启用 E2E / visual 时）: `specs/machine/validation-contract.json`
- Source root（相对 workbench 或绝对 Git worktree）:
- Source revision（运行 `source-revision` 得到 `git-working-tree:<sha256>`）:
- Machine evidence: `reports/evidence.jsonl` (`test.e2e` / `test.visual`)
- Data mode: `fixture` / `mock-api` / `uat` / `real`
- Trigger: only explicit `--e2e true` / `--visual true`; once enabled, scaffold cannot downgrade it with `false`

| Case ID | Type | Platform | Data Mode | Purpose | Command | Expected / Baseline | Contract Hash | Result | Evidence / Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

运行 `source-revision` 计算 tracked + non-ignored untracked 源码指纹（排除 workbench），不要手工自报 revision。视觉 contract case 必须声明 `purpose`；每条 evidence（包括 blocked）只覆盖一个页面状态，非 blocked evidence 的 `--source-revision` 匹配 contract，`expected` 指向 baseline 并匹配 `baselineHash`。Gate 与最终动作会现场重算源码指纹并核对产物 hash；源码或产物变化后必须重跑。blocked case 只有带 `--accepted-skip true --confirmed-by user --confirmation "<用户确认>"` 才能通过；malformed `reports/evidence.jsonl` fail closed。

## Behavior Checks

## TDD Evidence

| Task/RP | Decision | RED Evidence | GREEN Evidence | Skip/Defer Reason | Result |
| --- | --- | --- | --- | --- | --- |

## Debugging Evidence

| Task/RP | Trigger | Root Cause | Fix | Recheck Evidence | Result |
| --- | --- | --- | --- | --- | --- |

## Completion Verification

| Claim/Action | Command | Exit Code | Output Summary | Result |
| --- | --- | --- | --- | --- |

## UI Checks

## API / Mock Checks

## Skipped Checks and Reasons

## Remaining Risks
