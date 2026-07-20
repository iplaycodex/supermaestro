---
name: validate-visual-regression
description: Plan and validate design-conformance or regression screenshots against explicit UI boards and states, then record structured SuperMaestro visual evidence. Use for multi-board PRDs, Lanhu or image baselines, deterministic fixture pages, pixel diffs, layout geometry assertions, mask audits, and Review Gate visual-completeness claims.
---

# Validate Visual Regression

Verify every required visual state with traceable baselines and inspectable artifacts. Keep screenshots, fixtures, rendering drivers, and business selectors in the target project.

## Workflow

1. Read the UI manifest, schemas, board images, `ui-schema-extract.md`, resource mappings, project test runner, and target-platform constraints.
2. Read [references/evidence-contract.md](references/evidence-contract.md).
3. Enable the trigger during planning:

   ```bash
   node <plugin-root>/scripts/supermaestro.js scaffold <workbench> --visual true
   ```

4. Fill `specs/machine/validation-contract.json`. Set top-level `sourceRoot` to the target Git worktree, run `supermaestro.js source-revision <workbench>`, and copy its `git-working-tree:<sha256>` output to `sourceRevision`. Then add one visual case per required board/state and bind source, target, purpose, baseline path, baseline SHA-256, and maximum diff ratio.
5. Choose the purpose explicitly:
   - `design-conformance`: compare implementation with the approved design source.
   - `regression`: compare a later implementation with an approved runtime baseline.
6. Prefer deterministic fixture data for visual states. Register fixture routes only in test builds and keep production packages unaffected.
7. Use the existing screenshot/diff runner when available. Do not auto-update baselines after a failure.
8. Assert critical text, state, and geometry in addition to pixels when a masked or dynamic region could hide a defect.
9. Produce expected, actual, diff, report, and baseline-manifest artifacts.
10. Record exactly one `test.visual` evidence entry per contract case, then run `supermaestro.js verify <workbench>`.

## Baseline And Mask Rules

- Preserve the design source reference, dimensions, scale, crop, and SHA-256.
- Keep threshold and diff-ratio semantics explicit; do not label anti-aliasing tolerance as layout tolerance.
- Masks require a narrow region and a concrete reason.
- When masked pixels exceed `visual.maxMaskedRatio`, add independent geometry assertions or fail the Gate.
- Never mask the complete comparison target, core content, price, primary action, or state indicator merely to make the test pass.
- A single screenshot or diff cannot cover multiple board/state cases.

## Boundaries

- Visual fixtures prove deterministic rendering, not live API or real-order correctness.
- Design-conformance evidence does not replace behavior E2E.
- Missing design resources remain blocked; do not silently substitute approximate assets.
- Font rendering, image interpolation, and platform differences may justify configurable tolerance, but every exception must remain reviewable.
