#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const cli = path.join(repoRoot, 'plugins/supermaestro/scripts/supermaestro.js');

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: repoRoot, encoding: 'utf8' });
}

function mustPass(args) {
  const result = run(args);
  assert.equal(result.status, 0, `Expected pass: ${args.join(' ')}\nOUT:\n${result.stdout}\nERR:\n${result.stderr}`);
  return result;
}

function mustFail(args, pattern) {
  const result = run(args);
  assert.notEqual(result.status, 0, `Expected fail: ${args.join(' ')}\nOUT:\n${result.stdout}\nERR:\n${result.stderr}`);
  if (pattern) assert.match(`${result.stdout}\n${result.stderr}`, pattern);
  return result;
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function write(file, content) {
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, content);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function state(workbench) {
  return readJson(path.join(workbench, 'state.json'));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supermaestro-v2-smoke-'));

try {
  const removedPolicyName = ['super', 'powers'].join('');
  const helpResult = mustPass(['help']);
  assert.doesNotMatch(helpResult.stdout, new RegExp(removedPolicyName, 'i'));

  const lite = path.join(tmp, 'lite', 'workbench');
  mustPass(['init', lite, '--name', 'Lite Demo', '--mode', 'lite']);
  mustPass(['scaffold', lite]);
  mustFail(['scaffold', lite, '--mode', 'standard'], /cannot change workflow mode/i);
  mustFail(['init', lite, '--mode', 'strict'], /mode is immutable/i);
  mustFail(['status', lite, 'unexpected'], /Unexpected positional argument/);
  mustFail(['status', lite, '--bogus', 'true'], /Unknown option/);
  mustFail(['scaffold', lite, '--ui', 'maybe'], /Invalid boolean value/);
  assert.equal(state(lite).mode, 'lite');
  assert.equal(state(lite).policies, undefined);
  mustFail(['check-workbench', lite], /Lite brief is not confirmed/);
  write(path.join(lite, 'brief.md'), '# Lite Brief\n\n状态：已确认\n确认人：user\n\n## 本次要做\n- demo\n\n## 验证方式\n- demo\n');
  mustPass(['check-workbench', lite]);
  mustPass(['approve-scope', lite, '--confirmed-by', 'user', '--confirmation', '用户确认 lite 范围']);
  mustPass(['check', lite, '--action', 'code', '--non-ui', 'true', '--reason', '只改低风险逻辑']);

  const unbound = path.join(tmp, 'unbound', 'workbench');
  mustFail(
    ['init', unbound, '--name', 'Unbound Demo', '--mode', 'standard'],
    /requires a Git source root/
  );

  const standard = path.join(tmp, 'standard', 'documents', 'demo', 'workbench');
  mustPass(['init', standard, '--name', 'Standard Demo', '--mode', 'standard', '--source-root', repoRoot]);
  write(path.join(tmp, 'standard', 'documents', 'demo', 'source', 'ui', 'manifest.json'), '{"images":[]}\n');
  write(path.join(tmp, 'standard', 'documents', 'demo', 'source', 'api', 'openapi.json'), '{}\n');
  mustPass(['scaffold', standard, '--ui', 'true', '--api', 'true', '--ui-coding', 'true']);
  for (const [generated, asset] of [
    ['plans/task-plan.md', 'plan-template.md'],
    ['plans/progress.md', 'progress-template.md'],
    ['reviews/review-packs.md', 'review-template.md'],
    ['reports/validation.md', 'report-template.md'],
    ['specs/requirement-alignment.md', 'requirement-alignment-template.md'],
    ['specs/page-contract-matrix.md', 'page-contract-matrix-template.md']
  ]) {
    assert.equal(
      fs.readFileSync(path.join(standard, generated), 'utf8'),
      fs.readFileSync(path.join(repoRoot, 'plugins/supermaestro/skills/mission-control/assets', asset), 'utf8'),
      `${generated} 应直接使用 mission-control 的唯一模板源`
    );
  }
  mustFail(['check-workbench', standard], /Requirement alignment is not confirmed/);
  write(path.join(standard, 'specs', 'requirement-alignment.md'), '# Scope\n\n状态：已确认\n确认人：user\nBrainstorming：无\n');
  write(path.join(standard, 'context.md'), '# Context\n\nBrainstorming：无\n');
  write(path.join(standard, 'plans', 'progress.md'), '# Progress\n\nBrainstorming：无\n');
  write(path.join(standard, 'specs', 'api-contract.md'), '# API Contract\n\n结论：无接口变更。\n');
  write(
    path.join(standard, 'specs', 'ui-material-index.md'),
    '# UI Material Index\n\n画板 demo 已绑定。\n'
  );
  mustPass(['check-workbench', standard]);
  mustPass(['approve-gate1', standard, '--confirmed-by', 'user', '--confirmation', '用户确认 scope']);
  mustFail(['approve-plan', standard, '--confirmed-by', 'user', '--confirmation', '用户确认 plan'], /template placeholders/);
  write(path.join(standard, 'plans', 'task-plan.md'), '# Plan\n\n任务：完成标准模式验证。\n\n验证：运行 npm test。\n');
  write(
    path.join(standard, 'specs', 'ui-contract.md'),
    '# UI Contract\n\n画板 demo：按 schema-only 实现。\n'
  );
  write(
    path.join(standard, 'specs', 'ui-material-index.md'),
    '# UI Material Index\n\n画板 demo 已绑定。\n'
  );
  write(
    path.join(standard, 'specs', 'machine', 'ui-contract.json'),
    '{"boards":[{"id":"demo","name":"Demo"}]}\n'
  );
  write(
    path.join(standard, 'reviews', 'review-packs.md'),
    [
      '# Review Packs',
      '',
      '| RP | Scope | Patch | Files | Validation | Review Focus | Risk |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| RP1 | standard | pending | pending | npm test | contracts | low |'
    ].join('\n') + '\n'
  );
  mustFail(
    ['approve-plan', standard, '--mode', 'unknown-mode', '--confirmed-by', 'user', '--confirmation', '用户确认 plan'],
    /Invalid execution mode/
  );
  mustFail(
    ['approve-plan', standard, '--mode', 'main-serial', '--worktree', 'true', '--confirmed-by', 'user', '--confirmation', '用户确认 plan'],
    /cannot enable --worktree|requires scaffold --worktree/
  );
  mustPass(['approve-plan', standard, '--mode', 'main-serial', '--confirmed-by', 'user', '--confirmation', '用户确认 plan']);
  mustFail(['check', standard, '--action', 'code'], /Non-UI code checks require/);
  mustPass(['check', standard, '--action', 'code', '--ui', 'true', '--schema-extract', 'specs/ui-schema-extract.md']);
  mustFail(['check', standard, '--action', 'dispatch-subagent'], /Gate 2 execution mode did not enable subagents/);
  mustFail(['request-review', standard], /Completion readiness failures/);
  assert.equal(state(standard).checks.reviewability, 'failed');
  write(path.join(standard, 'reviews', 'review-packs.md'), '# Review Packs\n\nbranch: not-created\n');
  write(
    path.join(standard, 'reports', 'validation.md'),
    '# Validation\n\n- TDD 决策：未评估。\n- 完成前验证：npm test 未执行；预期通过。\n- UI / Visual Validation：schema-only 人工核对通过。\n'
  );
  mustFail(['request-review', standard], /executed completion-verification record/);
  write(
    path.join(standard, 'reports', 'validation.md'),
    '# Validation\n\n- TDD 决策：适用，已覆盖订单 pending 状态。\n- 完成前验证：运行 npm test，结果通过，exit code 0。\n- UI / Visual Validation：schema-only 人工核对通过。\n'
  );
  mustFail(['request-review', standard], /concrete diff command/);
  write(
    path.join(standard, 'reviews', 'review-packs.md'),
    '# Review Packs\n\n| RP | Scope | Patch | Files | Validation | Review Focus | Risk |\n| --- | --- | --- | --- | --- | --- | --- |\n| RP1 | CLI | reviews/rp1.patch | supermaestro.js | npm test | 订单 pending 状态 | low |\n'
  );
  write(path.join(standard, 'reviews', 'rp1.patch'), 'diff --git a/demo.js b/demo.js\n--- a/demo.js\n+++ b/demo.js\n@@ -0,0 +1 @@\n+verified\n');
  write(
    path.join(standard, 'reports', 'validation.md'),
    '# Validation\n\n- TDD 决策：适用。\n- 完成前验证：运行 npm test，结果未通过。\n- UI / Visual Validation：schema-only 人工核对通过。\n'
  );
  mustFail(['request-review', standard], /executed completion-verification record/);
  write(
    path.join(standard, 'reports', 'validation.md'),
    '# Validation\n\n- TDD 决策：适用。\n- 完成前验证：运行 npm test，结果通过。\n\n| 检查 | 结果 |\n| --- | --- |\n| npm test | passed |\n| E2E | pending |\n\n- UI / Visual Validation：schema-only 人工核对通过。\n'
  );
  mustFail(['request-review', standard], /unresolved template placeholders/);
  write(
    path.join(standard, 'reports', 'validation.md'),
    '# Validation\n\n- TDD 决策：是否适用仍未决定。\n- 完成前验证：运行 npm test，结果通过，exit code 0。\n- UI / Visual Validation：schema-only 人工核对通过。\n'
  );
  mustFail(['request-review', standard], /resolved TDD applicability decision/);
  write(
    path.join(standard, 'reports', 'validation.md'),
    '# Validation\n\n- TDD 决策：适用，已覆盖订单 pending 状态。\n\n## 完成前验证\n\n| 命令 | 结果 |\n| --- | --- |\n| npm test | passed |\n\n| 订单 | 业务状态 |\n| --- | --- |\n| 1 | pending |\n\n- UI / Visual Validation：schema-only 人工核对通过。\n'
  );
  mustPass([
    'run-verification',
    standard,
    '--program',
    process.execPath,
    '--args-json',
    '["-e","process.stdout.write(\\"verified\\\\n\\")"]',
    '--report',
    'reports/command.log',
    '--artifacts',
    'reports/validation.md'
  ]);
  mustPass(['verify', standard, '--validation', 'reports/validation.md']);
  mustPass(['request-review', standard]);
  assert.equal(state(standard).checks.reviewability, 'passed');
  mustFail(
    ['approve-review', standard, '--review-accepted', 'true', '--validation-accepted', 'true'],
    /confirmed-by user/
  );
  mustPass([
    'approve-review',
    standard,
    '--review-accepted',
    'true',
    '--validation-accepted',
    'true',
    '--confirmed-by',
    'user',
    '--confirmation',
    '用户确认 review 与验证'
  ]);
  const reviewApprovedState = state(standard);
  const damagedReviewState = JSON.parse(JSON.stringify(reviewApprovedState));
  delete damagedReviewState.humanConfirmations.gate3;
  write(path.join(standard, 'state.json'), `${JSON.stringify(damagedReviewState, null, 2)}\n`);
  mustFail(['request-final', standard], /missing explicit user confirmation/);
  write(path.join(standard, 'state.json'), `${JSON.stringify(reviewApprovedState, null, 2)}\n`);
  mustPass(['request-final', standard]);
  mustPass([
    'approve-final',
    standard,
    '--confirmed-by',
    'user',
    '--confirmation',
    '用户确认不授权最终动作',
    '--merge',
    'false',
    '--commit',
    'false',
    '--push',
    'false',
    '--cleanup',
    'false'
  ]);
  mustFail(['check', standard, '--action', 'push'], /did not authorize action/);
  mustFail(['check', standard, '--action', 'cleanup-worktree'], /did not authorize action/);
  const finalApprovedState = state(standard);
  const mismatchedFinalState = JSON.parse(JSON.stringify(finalApprovedState));
  mismatchedFinalState.finalActions.push = true;
  write(path.join(standard, 'state.json'), `${JSON.stringify(mismatchedFinalState, null, 2)}\n`);
  mustFail(['check', standard, '--action', 'push'], /approval no longer matches/);
  const damagedFinalState = JSON.parse(JSON.stringify(finalApprovedState));
  damagedFinalState.finalActions.push = true;
  delete damagedFinalState.humanConfirmations.gate4;
  write(path.join(standard, 'state.json'), `${JSON.stringify(damagedFinalState, null, 2)}\n`);
  mustFail(['check', standard, '--action', 'push'], /missing explicit user confirmation/);

  const apiFallback = path.join(tmp, 'api-fallback', 'documents', 'demo', 'workbench');
  mustPass(['init', apiFallback, '--name', 'API Fallback', '--mode', 'standard', '--source-root', repoRoot]);
  write(path.join(tmp, 'api-fallback', 'documents', 'demo', 'source', 'api', 'openapi.json'), '{}\n');
  write(path.join(apiFallback, 'context.md'), '# Context\n\nBrainstorming：无\n');
  write(path.join(apiFallback, 'specs', 'requirement-alignment.md'), '# Scope\n\n状态：已确认\n确认人：user\nBrainstorming：无\n');
  write(path.join(apiFallback, 'specs', 'api-spec.md'), '# API Spec\n\nGET /demo\n');
  write(path.join(apiFallback, 'plans', 'progress.md'), '# Progress\n\nBrainstorming：无\n');
  write(path.join(apiFallback, 'plans', 'task-plan.md'), '# Plan\n\n任务：API fallback。\n');
  write(path.join(apiFallback, 'reviews', 'review-packs.md'), '# Review Packs\n\npending\n');
  write(path.join(apiFallback, 'reports', 'validation.md'), '# Validation\n\npending\n');
  mustPass(['check-workbench', apiFallback]);
  mustPass(['approve-scope', apiFallback, '--confirmed-by', 'user', '--confirmation', '用户确认 API scope']);
  mustFail(
    ['approve-plan', apiFallback, '--mode', 'main-serial', '--confirmed-by', 'user', '--confirmation', '用户确认 API plan'],
    /API contract markdown is missing/
  );

  const reviewSource = path.join(tmp, 'review-source');
  mkdirp(reviewSource);
  assert.equal(spawnSync('git', ['init'], { cwd: reviewSource, encoding: 'utf8' }).status, 0);
  write(path.join(reviewSource, 'demo.js'), 'module.exports = 1;\n');
  assert.equal(spawnSync('git', ['add', 'demo.js'], { cwd: reviewSource, encoding: 'utf8' }).status, 0);
  assert.equal(
    spawnSync(
      'git',
      [
        '-c',
        'user.name=SuperMaestro Test',
        '-c',
        'user.email=supermaestro@example.invalid',
        'commit',
        '-m',
        'initial'
      ],
      { cwd: reviewSource, encoding: 'utf8' }
    ).status,
    0
  );
  const reviewWorkbench = path.join(tmp, 'review-security', 'workbench');
  mustPass([
    'init',
    reviewWorkbench,
    '--name',
    'Review Security',
    '--mode',
    'standard',
    '--source-root',
    reviewSource
  ]);
  mustPass(['scaffold', reviewWorkbench]);
  write(path.join(reviewWorkbench, 'context.md'), '# Context\n\nBrainstorming：无\n');
  write(path.join(reviewWorkbench, 'specs', 'requirement-alignment.md'), '# Scope\n\n状态：已确认\n确认人：user\nBrainstorming：无\n');
  write(
    path.join(reviewWorkbench, 'specs', 'behavior-contract.md'),
    '# Behavior Contract\n\n结论：无复杂行为变更。\n'
  );
  write(path.join(reviewWorkbench, 'plans', 'progress.md'), '# Progress\n\nBrainstorming：无\n');
  write(path.join(reviewWorkbench, 'plans', 'task-plan.md'), '# Plan\n\n任务：验证 review artifact。\n');
  write(
    path.join(reviewWorkbench, 'reports', 'validation.md'),
    '# Validation\n\n- TDD 决策：适用。\n- 完成前验证：运行 node verification，结果通过，exit code 0。\n'
  );
  write(
    path.join(reviewWorkbench, 'reviews', 'review-packs.md'),
    '# Review Packs\n\n| RP | Scope | Diff command | Files | Validation | Review Focus | Risk |\n| --- | --- | --- | --- | --- | --- | --- |\n| RP1 | demo | git diff HEAD | demo.js | node | empty diff | low |\n'
  );
  mustPass(['approve-scope', reviewWorkbench, '--confirmed-by', 'user', '--confirmation', '用户确认 review scope']);
  mustPass(['approve-plan', reviewWorkbench, '--mode', 'main-serial', '--confirmed-by', 'user', '--confirmation', '用户确认 review plan']);
  mustFail([
    'run-verification',
    reviewWorkbench,
    '--program',
    process.execPath,
    '--args-json',
    '["-e","process.stdout.write(\\"ok\\\\n\\")"]',
    '--report',
    '../escape.log'
  ], /must stay inside the workbench/);
  mustFail([
    'evidence',
    reviewWorkbench,
    '--type',
    'test.command',
    '--command',
    'fake',
    '--result',
    'passed',
    '--exit-code',
    '0'
  ], /only be created by run-verification/);
  mustPass([
    'run-verification',
    reviewWorkbench,
    '--program',
    process.execPath,
    '--args-json',
    '["-e","process.stdout.write(\\"ok\\\\n\\")"]',
    '--report',
    'reports/command.log',
    '--artifacts',
    'reports/validation.md'
  ]);
  mustFail(['request-review', reviewWorkbench], /concrete diff command/);
  write(
    path.join(reviewWorkbench, 'reviews', 'review-packs.md'),
    '# Review Packs\n\n### RP1\n\nArtifact: `git show --no-patch --format=diff%x20--git%x20a/fake%x20b/fake HEAD`\n'
  );
  mustFail(['check-reviewability', reviewWorkbench, '--strict', 'true'], /lacks a verifiable/);
  write(path.join(reviewWorkbench, 'reviews', 'fake.patch'), '这不是 Git patch。\n');
  write(
    path.join(reviewWorkbench, 'reviews', 'review-packs.md'),
    '# Review Packs\n\n### RP1\n\nArtifact: `reviews/fake.patch`\n'
  );
  mustFail(['check-reviewability', reviewWorkbench, '--strict', 'true'], /lacks a verifiable/);
  write(path.join(reviewWorkbench, 'reviews', 'rp1.patch'), 'diff --git a/demo.js b/demo.js\n--- a/demo.js\n+++ b/demo.js\n@@ -0,0 +1 @@\n+reviewable\n');
  write(
    path.join(reviewWorkbench, 'reviews', 'review-packs.md'),
    '# Review Packs\n\n| RP | Scope | Patch | Files | Validation | Review Focus | Risk |\n| --- | --- | --- | --- | --- | --- | --- |\n| RP1 | demo | reviews/rp1.patch | demo.js | node | patch | low |\n'
  );
  write(
    path.join(reviewWorkbench, 'reviews', 'review-packs.md'),
    '# Review Packs\n\n| RP | Scope | Patch | Files | Validation | Review Focus | Risk |\n| --- | --- | --- | --- | --- | --- | --- |\n| RP1 | demo | reviews/rp1.patch | demo.js | node | patch | low |\n| RP2 | demo | reviews/missing.patch | demo.js | node | missing patch | low |\n'
  );
  mustFail(['check-reviewability', reviewWorkbench, '--strict', 'true'], /RP2 lacks a verifiable/);
  write(
    path.join(reviewWorkbench, 'reviews', 'review-packs.md'),
    '# Review Packs\n\n| RP | Scope | Patch | Files | Validation | Review Focus | Risk |\n| --- | --- | --- | --- | --- | --- | --- |\n| RP1 | demo | reviews/rp1.patch | demo.js | node | patch | low |\n'
  );
  write(
    path.join(reviewWorkbench, 'agents', 'agent-index.md'),
    '| 任务 | 状态 |\n| --- | --- |\n| RP1 | running |\n'
  );
  mustFail(['check-reviewability', reviewWorkbench, '--strict', 'true'], /fan-in handoff/);
  fs.rmSync(path.join(reviewWorkbench, 'agents'), { recursive: true, force: true });
  mustPass(['check-reviewability', reviewWorkbench, '--strict', 'true']);
  mustPass(['verify', reviewWorkbench]);
  const behaviorContract = path.join(reviewWorkbench, 'specs', 'behavior-contract.md');
  const behaviorContent = fs.readFileSync(behaviorContract, 'utf8');
  fs.rmSync(behaviorContract);
  mustFail(
    ['verify', reviewWorkbench],
    /plan gate approval no longer matches/
  );
  mustFail(
    ['verify', reviewWorkbench, '--strict', 'true'],
    /Behavior contract is missing|plan gate approval no longer matches/
  );
  write(behaviorContract, behaviorContent);
  mustPass(['request-review', reviewWorkbench]);
  write(path.join(reviewSource, 'demo.js'), 'module.exports = 2;\n');
  mustFail(
    [
      'approve-review',
      reviewWorkbench,
      '--review-accepted',
      'true',
      '--validation-accepted',
      'true',
      '--confirmed-by',
      'user',
      '--confirmation',
      '用户确认 stale review'
    ],
    /sourceRevision does not match/
  );
  mustPass([
    'run-verification',
    reviewWorkbench,
    '--program',
    process.execPath,
    '--args-json',
    '["-e","process.stdout.write(\\"rerun\\\\n\\")"]',
    '--report',
    'reports/command.log',
    '--artifacts',
    'reports/validation.md'
  ]);
  mustPass([
    'approve-review',
    reviewWorkbench,
    '--review-accepted',
    'true',
    '--validation-accepted',
    'true',
    '--confirmed-by',
    'user',
    '--confirmation',
    '用户确认 fresh review'
  ]);

  const legacyPolicy = path.join(tmp, 'legacy-policy', 'workbench');
  mustPass(['init', legacyPolicy, '--name', 'Legacy Policy Demo', '--mode', 'standard', '--source-root', repoRoot]);
  const legacyState = state(legacyPolicy);
  legacyState.policies = { [removedPolicyName]: { enabled: true, enforcement: 'hard' } };
  legacyState.checks.policy = 'failed';
  legacyState.checks.policyMissing = [{ policy: removedPolicyName }];
  write(path.join(legacyPolicy, 'state.json'), `${JSON.stringify(legacyState, null, 2)}\n`);
  mustPass(['scaffold', legacyPolicy]);
  assert.equal(state(legacyPolicy).policies, undefined);
  assert.equal(state(legacyPolicy).checks.policy, undefined);
  assert.equal(state(legacyPolicy).checks.policyMissing, undefined);
  assert.equal(readJson(path.join(legacyPolicy, 'mission.state.json')).policies, undefined);

  console.log('SuperMaestro workflow v2 smoke tests passed.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
