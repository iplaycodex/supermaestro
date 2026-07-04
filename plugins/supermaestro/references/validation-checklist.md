# Validation Checklist

Use checks proportional to risk.

Minimum:

- Workbench completeness check.
- Review pack references actual artifacts.
- Validation report lists executed and skipped checks.
- Fresh verification evidence before any completion, Gate 2, Gate 3, commit, merge, push, or PR claim.
- Root-cause evidence for any bug, test failure, build failure, integration failure, or behavior review finding.
- Review feedback is verified against codebase reality before implementation.

For frontend / Taro:

- Try the narrowest meaningful build or page-level run.
- Verify route and mock/API wiring.
- Verify login/binding, empty state, stale response, and repeated click behavior.
- For schema-backed UI, record schema-to-implementation mapping and visual evidence.

Static checks such as formatting or `git diff --check` are helpful but not enough for behavior completion.
