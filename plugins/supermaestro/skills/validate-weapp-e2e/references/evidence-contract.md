# WeApp E2E Evidence Contract

## Contract case

Add one entry per required behavior to `specs/machine/validation-contract.json`:

Set the contract's top-level `sourceRoot` to an absolute Git worktree path or a path relative to the workbench. It must not equal or live inside the workbench; a workbench nested inside the source repo is supported and excluded. Compute the source fingerprint after the build/test run and before recording evidence:

```bash
node <plugin-root>/scripts/supermaestro.js source-revision <workbench>
```

Copy the emitted `git-working-tree:<sha256>` value to top-level `sourceRevision` and pass the same value to evidence. The fingerprint covers tracked and non-ignored untracked source content while excluding the workbench itself, so a later source edit invalidates verification without being changed merely by committing identical content.

```json
{
  "id": "E2E-TAB-01",
  "requirementIds": ["REQ-TAB-01"],
  "platform": "weapp",
  "dataMode": "uat",
  "command": "npm run test:e2e:weapp",
  "expected": "一级 Tab 可切换且选中态同步"
}
```

Use stable IDs. Keep UAT identifiers, credentials, routes, selectors, and project-specific setup outside the plugin.

## Passed evidence

```bash
node <plugin-root>/scripts/supermaestro.js evidence <workbench> \
  --type test.e2e \
  --phase review \
  --platform weapp \
  --data-mode uat \
  --command "npm run test:e2e:weapp" \
  --result passed \
  --required 2 \
  --executed 2 \
  --passed 2 \
  --failed 0 \
  --case-ids E2E-TAB-01,E2E-NAV-01 \
  --exit-code 0 \
  --source-revision "git-working-tree:<sha256>" \
  --report reports/artifacts/weapp-e2e.json \
  --artifacts reports/artifacts/weapp-e2e.json,reports/artifacts/navigation.png
```

The command, platform, and data mode must match every covered contract case. Evidence may cover multiple E2E cases when the same command and environment ran them together.

## Blocked evidence

Record the blocker first. Add `--accepted-skip true` only after explicit user acceptance:

```bash
node <plugin-root>/scripts/supermaestro.js evidence <workbench> \
  --type test.e2e \
  --platform weapp \
  --data-mode real \
  --result blocked \
  --case-ids E2E-PAY-01 \
  --reason "真实支付需要受控账号和人工授权" \
  --accepted-skip true \
  --confirmed-by user \
  --confirmation "用户确认真实支付本轮不执行并接受剩余风险"
```

The CLI stores a canonical hash of the current validation contract and SHA-256 hashes for the report/artifacts in every test evidence entry. Editing a case or `sourceRevision`, or replacing an artifact after execution, invalidates its previous evidence.

## Report expectations

The report may use the project's existing format, but it must be a real, non-empty file and identify the executed command, case results, counts, environment, and timestamp. Store secrets outside reports and evidence.
