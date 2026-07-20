---
name: validate-weapp-e2e
description: Validate Taro or native WeChat mini-program behavior with an existing project runner such as miniprogram-automator, and record structured SuperMaestro E2E evidence. Use for navigation, tabs, gestures, dialogs, loading/empty/error states, API-integrated UAT flows, or Review Gate claims that require real mini-program runtime evidence.
---

# Validate WeApp E2E

Use the project's real mini-program build and runner to verify behavior. Keep the runner, routes, selectors, accounts, and test data in the project; SuperMaestro owns only the contract and evidence.

## Workflow

1. Read the target project's `AGENTS.md`, `package.json`, build scripts, route config, existing tests, and environment constraints.
2. Read [references/evidence-contract.md](references/evidence-contract.md).
3. Enable the trigger during planning:

   ```bash
   node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --e2e true
   ```

4. Fill `specs/machine/validation-contract.json`. Set top-level `sourceRoot` to the target Git worktree, run `supermaestro.js source-revision <workbench>`, and copy its `git-working-tree:<sha256>` output to `sourceRevision`. Create stable case IDs and map every case to requirement IDs, platform, data mode, command, and expected behavior.
5. Classify the data source honestly:
   - `fixture`: deterministic in-app fixture.
   - `mock-api`: mocked transport or server.
   - `uat`: real test-environment API.
   - `real`: real external/business chain.
6. Prefer an existing runner. If none exists, add the smallest project-local runner compatible with the current stack; do not install dependencies or change build infrastructure without authorization.
7. Use explicit waits and timeouts. Reset state between cases. Avoid purchase, payment, deletion, production writes, or other side effects unless the user explicitly authorized them.
8. Run a fresh build and E2E command. Preserve a machine-readable report or log artifact.
9. Add `test.e2e` evidence with the exact contract case IDs, data mode, counts, exit code, source revision, report, and artifacts.
10. Run `supermaestro.js verify <workbench>` before requesting Review.

## WeChat Runtime Guidance

- Confirm the WeChat DevTools CLI path and project build output before launching automation.
- Reuse one DevTools session when possible; use `reLaunch` or an equivalent reset between cases.
- Give every element lookup, page transition, and tool connection a bounded timeout.
- Treat subpackage remapping, test accounts, UAT store IDs, and host-project packaging as project configuration.
- Report authorization, payment, camera, map, scan, and device-only gaps as remaining manual or real-device validation.

## Integrity Rules

- A fixture or Mock run is not a real business E2E run.
- HTTP 200 alone does not prove UI behavior or API contract correctness.
- Do not convert skipped or conditionally absent assertions into passes.
- Do not reuse stale evidence after relevant code, build, fixture, or contract changes.
- A blocked case passes the Gate only when the reason is recorded and the user explicitly accepts the skip.
