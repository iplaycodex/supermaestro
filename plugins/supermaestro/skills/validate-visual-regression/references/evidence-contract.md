# Visual Regression Evidence Contract

## Contract case

Add one entry per board/state:

Set top-level `sourceRoot` to an absolute Git worktree path or a path relative to the workbench. It must not equal or live inside the workbench; a workbench nested inside the source repo is supported and excluded. After capture and before recording evidence, run `supermaestro.js source-revision <workbench>`, copy its `git-working-tree:<sha256>` output to top-level `sourceRevision`, and pass the same value to evidence. Verification recomputes the tracked plus non-ignored untracked source fingerprint while excluding the workbench itself.

```json
{
  "id": "VIS-BOARD-01",
  "requirementIds": ["REQ-UI-01"],
  "platform": "weapp",
  "dataMode": "fixture",
  "command": "npm run test:e2e:weapp:visual",
  "sourceRef": "LANHU-V3.9.6/board-01",
  "target": "pages/visual-regression/demo?board=01",
  "baseline": "reports/artifacts/board-01.expected.png",
  "baselineHash": "<64-character-sha256>",
  "purpose": "design-conformance",
  "maxDiffRatio": 0.05,
  "expected": "页面结构、文案、颜色和关键几何与设计一致"
}
```

`visual.maxMaskedRatio` defaults to `0.05`. Lower it when the design and runtime are deterministic.

## Evidence

Record exactly one case ID per visual evidence entry:

```bash
node <plugin-root>/scripts/supermaestro.js evidence <workbench> \
  --type test.visual \
  --phase review \
  --platform weapp \
  --data-mode fixture \
  --purpose design-conformance \
  --command "npm run test:e2e:weapp:visual" \
  --result passed \
  --required 1 \
  --executed 1 \
  --passed 1 \
  --failed 0 \
  --case-ids VIS-BOARD-01 \
  --exit-code 0 \
  --source-revision "git-working-tree:<sha256>" \
  --baseline-manifest reports/artifacts/baseline-manifest.json \
  --baseline-hash "<64-character-sha256>" \
  --actual reports/artifacts/board-01.actual.png \
  --expected reports/artifacts/board-01.expected.png \
  --diff reports/artifacts/board-01.diff.png \
  --report reports/artifacts/board-01.report.json \
  --artifacts reports/artifacts/board-01.actual.png,reports/artifacts/board-01.expected.png,reports/artifacts/board-01.diff.png,reports/artifacts/board-01.report.json \
  --diff-ratio 0.021 \
  --max-diff-ratio 0.05 \
  --masked-ratio 0.004 \
  --mask-reason "设计稿红色批注像素"
```

Add `--geometry-assertions true` when the masked ratio exceeds the contract's configured maximum and independent text/layout assertions protect the omitted region.

The evidence purpose must match the contract. Its `expected` path must resolve to the contract baseline and the file hash must match `baselineHash`. The CLI also binds each entry to a canonical hash of the current validation contract and records SHA-256 hashes for the report, manifest, expected, actual, diff, and listed artifacts. Changing a board/state case or replacing an artifact requires fresh evidence.

## Artifact integrity

- `baseline-manifest`: maps board/state IDs to original source, dimensions, crop, scale, and hash.
- `expected`: normalized baseline actually compared.
- `actual`: fresh runtime screenshot.
- `diff`: visible pixel difference output.
- `report`: threshold, diff ratio, mask ratio, dimensions, result, and artifact paths.

Keep baselines and reports reviewable. Ignore disposable run artifacts only when the committed baseline and reproducible command remain available.
