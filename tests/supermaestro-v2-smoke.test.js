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
  assert.equal(state(lite).mode, 'lite');
  assert.equal(state(lite).policies, undefined);
  mustFail(['check-workbench', lite], /Lite brief is not confirmed/);
  write(path.join(lite, 'brief.md'), '# Lite Brief\n\n状态：已确认\n确认人：user\n\n## 本次要做\n- demo\n\n## 验证方式\n- demo\n');
  mustPass(['check-workbench', lite]);
  mustPass(['approve-scope', lite, '--confirmed-by', 'user', '--confirmation', '用户确认 lite 范围']);
  mustPass(['check', lite, '--action', 'code', '--non-ui', 'true', '--reason', '只改低风险逻辑']);

  const standard = path.join(tmp, 'standard', 'documents', 'demo', 'workbench');
  mustPass(['init', standard, '--name', 'Standard Demo', '--mode', 'standard']);
  write(path.join(tmp, 'standard', 'documents', 'demo', 'source', 'ui', 'manifest.json'), '{"images":[]}\n');
  write(path.join(tmp, 'standard', 'documents', 'demo', 'source', 'api', 'openapi.json'), '{}\n');
  mustPass(['scaffold', standard, '--ui', 'true', '--api', 'true', '--ui-coding', 'true']);
  mustFail(['check-workbench', standard], /Requirement alignment is not confirmed/);
  write(path.join(standard, 'specs', 'requirement-alignment.md'), '# Scope\n\n状态：已确认\n确认人：user\nBrainstorming：无\n');
  write(path.join(standard, 'context.md'), '# Context\n\nBrainstorming：无\n');
  write(path.join(standard, 'plans', 'progress.md'), '# Progress\n\nBrainstorming：无\n');
  mustPass(['check-workbench', standard]);
  mustPass(['approve-gate1', standard, '--confirmed-by', 'user', '--confirmation', '用户确认 scope']);
  mustFail(['approve-plan', standard, '--confirmed-by', 'user', '--confirmation', '用户确认 plan'], /template placeholders/);
  write(path.join(standard, 'plans', 'task-plan.md'), '# Plan\n\n任务：完成标准模式验证。\n\n验证：运行 npm test。\n');
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
    '# Review Packs\n\n| RP | Scope | Diff command | Files | Validation | Review Focus | Risk |\n| --- | --- | --- | --- | --- | --- | --- |\n| RP1 | CLI | git diff HEAD | supermaestro.js | npm test | 订单 pending 状态 | low |\n'
  );
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
  mustPass(['request-review', standard]);
  assert.equal(state(standard).checks.reviewability, 'passed');

  const legacyPolicy = path.join(tmp, 'legacy-policy', 'workbench');
  mustPass(['init', legacyPolicy, '--name', 'Legacy Policy Demo', '--mode', 'standard']);
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
