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

function assertReadmeCommandsMatchCli() {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const commandRe = /node plugins\/supermaestro\/scripts\/supermaestro\.js\s+([^\s]+)/g;
  const allowed = new Set([
    'init',
    'status',
    'next',
    'resume',
    'scaffold',
    'check-workbench',
    'check-contracts',
    'source-revision',
    'approve-scope',
    'approve-gate1',
    'approve-plan',
    'approve-gate2',
    'evidence',
    'check',
    'verify',
    'request-review',
    'request-gate3',
    'approve-review',
    'approve-gate3',
    'request-final',
    'request-gate4',
    'approve-final',
    'approve-gate4'
  ]);
  const commands = Array.from(readme.matchAll(commandRe), match => match[1]);
  assert.ok(commands.length > 0, 'README should document SuperMaestro CLI commands');
  for (const command of commands) {
    assert.ok(allowed.has(command), `README documents unknown CLI command: ${command}`);
  }
}

function seedScope(workbench) {
  write(path.join(workbench, 'context.md'), '# Context\n\nBrainstorming：无\n');
  write(path.join(workbench, 'specs', 'requirement-alignment.md'), '# Scope\n\n状态：已确认\n确认人：user\nBrainstorming：无\n');
  write(path.join(workbench, 'plans', 'progress.md'), '# Progress\n\nBrainstorming：无\n');
}

function seedPlan(workbench, { reviewReady = false } = {}) {
  write(path.join(workbench, 'plans', 'task-plan.md'), '# Plan\n\n任务：验证 strict contracts。\n\n验证：运行 npm test。\n');
  write(
    path.join(workbench, 'reports', 'validation.md'),
    '# Validation\n\n- TDD 决策：适用，已覆盖 strict contract 用例。\n- 完成前验证：运行 npm test，结果通过，exit code 0。\n- UI schema-only 人工核对通过。\n'
  );
  write(
    path.join(workbench, 'reviews', 'review-packs.md'),
    reviewReady
      ? '# Review Packs\n\n## Review Contract\n\n| RP | Scope | Diff command | Files | Validation | Review Focus | Risk |\n| --- | --- | --- | --- | --- | --- | --- |\n| RP1 | Demo | git diff HEAD | CLI | npm test | strict contracts | 无 |\n'
      : '# Review Packs\n\n## Review Contract\n\n| RP | Scope | Diff command | Files | Validation | Review Focus | Risk |\n| --- | --- | --- | --- | --- | --- | --- |\n| RP1 | Demo | pending | pending | pending | strict contracts | Plan 阶段待实现后绑定 diff |\n'
  );
}

function seedContracts(workbench) {
  write(path.join(workbench, 'specs', 'ui-contract.md'), '# UI Contract\n\n画板：Demo\n资源映射：schema-only。\n');
  write(path.join(workbench, 'specs', 'machine', 'ui-contract.json'), '{"version":1,"boards":[{"name":"Demo"}]}\n');
  write(path.join(workbench, 'specs', 'ui-material-index.md'), '# UI 物料索引\n\nmanifest: source/ui/manifest.json\n');
  write(path.join(workbench, 'specs', 'ui-schema-extract.md'), '# UI Schema Extract\n\n| Schema 节点/路径 | 设计值 | 代码文件/组件/样式选择器 | 实现值 | 偏差说明 |\n| --- | --- | --- | --- | --- |\n| /root | 375x812 | demo | 375x812 | 无 |\n\n资源映射：schema-only。\n');
  write(path.join(workbench, 'specs', 'api-contract.md'), '# API Contract\n\n结论：无接口变更。\n');
  write(path.join(workbench, 'specs', 'machine', 'api-contract.json'), '{"version":1,"apis":[],"conclusion":"无接口变更"}\n');
  write(path.join(workbench, 'specs', 'page-contract-matrix.md'), '# Page Contract Matrix\n\n| 页面/模块 | UI | API | RP |\n| --- | --- | --- | --- |\n| Demo | Demo | 无接口变更 | RP1 |\n');
  write(path.join(workbench, 'specs', 'behavior-contract.md'), '# Behavior Contract\n\n结论：无状态机、权限、缓存或并发行为变更。\n');
  write(path.join(workbench, 'specs', 'machine', 'review-contract.json'), '{"version":1,"reviewPacks":[]}\n');
}

function seedLegacyContracts(workbench, { reviewReady = false } = {}) {
  write(path.join(workbench, 'specs', 'ui-contract.md'), '# UI Contract\n\n画板：Demo\n资源映射：schema-only。\n');
  write(path.join(workbench, 'specs', 'ui-contract.json'), '{"version":1,"boards":[{"name":"Demo"}]}\n');
  write(path.join(workbench, 'specs', 'ui-material-index.md'), '# UI 物料索引\n\nmanifest: source/ui/manifest.json\n');
  write(path.join(workbench, 'specs', 'ui-schema-extract.md'), '# UI Schema Extract\n\n资源映射：schema-only。\n');
  write(path.join(workbench, 'specs', 'ui-schema-map.md'), '# UI Schema Map\n\n| Schema 节点/路径 | 设计值 | 代码文件/组件/样式选择器 | 实现值 | 偏差说明 |\n| --- | --- | --- | --- | --- |\n| /root | 375x812 | demo | 375x812 | 无 |\n');
  write(path.join(workbench, 'specs', 'api-contract.md'), '# API Contract\n\n结论：无接口变更。\n');
  write(path.join(workbench, 'specs', 'api-contract.json'), '{"version":1,"apis":[],"conclusion":"无接口变更"}\n');
  write(path.join(workbench, 'specs', 'page-contract-matrix.md'), '# Page Contract Matrix\n\n| 页面/模块 | UI | API | RP |\n| --- | --- | --- | --- |\n| Demo | Demo | 无接口变更 | RP1 |\n');
  write(path.join(workbench, 'specs', 'behavior-contract.md'), '# Behavior Contract\n\n结论：无状态机、权限、缓存或并发行为变更。\n');
  write(
    path.join(workbench, 'specs', 'review-contract.md'),
    reviewReady
      ? '# Review Contract\n\n| RP | Scope | Diff command | Files | Validation | Review Focus | Risk |\n| --- | --- | --- | --- | --- | --- | --- |\n| RP1 | Demo | git diff HEAD | CLI | npm test | strict contracts | 无 |\n'
      : '# Review Contract\n\nPlan 阶段 review pack pending，待实现后绑定 diff。\n'
  );
}

function approveScope(workbench) {
  mustPass(['approve-gate1', workbench, '--confirmed-by', 'user', '--confirmation', '用户确认 scope']);
}

function approvePlan(workbench) {
  mustPass(['approve-gate2', workbench, '--mode', 'main-serial', '--confirmed-by', 'user', '--confirmation', '用户确认 plan']);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supermaestro-strict-contracts-'));

try {
  assertReadmeCommandsMatchCli();

  const strict = path.join(tmp, 'strict', 'documents', 'demo', 'workbench');
  mustPass(['init', strict, '--name', 'Strict Demo', '--mode', 'strict']);
  write(path.join(tmp, 'strict', 'documents', 'demo', 'source', 'ui', 'manifest.json'), '{"boards":[{"name":"Demo"}]}\n');
  write(path.join(tmp, 'strict', 'documents', 'demo', 'source', 'api', 'openapi.json'), '{}\n');
  mustPass(['scaffold', strict, '--ui', 'true', '--api', 'true', '--ui-coding', 'true', '--behavior', 'true']);
  assert.equal(fs.existsSync(path.join(strict, 'specs', 'api-contract.json')), false);
  assert.equal(fs.existsSync(path.join(strict, 'specs', 'ui-contract.json')), false);
  assert.equal(fs.existsSync(path.join(strict, 'specs', 'review-contract.json')), false);
  assert.equal(fs.existsSync(path.join(strict, 'specs', 'machine', 'api-contract.json')), true);
  assert.equal(fs.existsSync(path.join(strict, 'specs', 'machine', 'ui-contract.json')), true);
  assert.equal(fs.existsSync(path.join(strict, 'specs', 'machine', 'review-contract.json')), true);
  assert.equal(fs.existsSync(path.join(strict, 'specs', 'ui-schema-map.md')), false);
  assert.equal(fs.existsSync(path.join(strict, 'specs', 'review-contract.md')), false);
  assert.equal(fs.existsSync(path.join(strict, 'specs', 'gate-1-brainstorming-questions.md')), false);
  mustFail(['check-contracts', strict], /FAIL/);

  const brainstormingWb = path.join(tmp, 'brainstorming', 'documents', 'demo', 'workbench');
  mustPass(['init', brainstormingWb, '--name', 'Brainstorming Demo', '--mode', 'strict']);
  mustPass(['scaffold', brainstormingWb, '--brainstorming', 'true']);
  assert.equal(fs.existsSync(path.join(brainstormingWb, 'specs', 'gate-1-brainstorming-questions.md')), true);

  seedScope(strict);
  seedPlan(strict);
  seedContracts(strict);
  mustPass(['check-contracts', strict]);
  approveScope(strict);
  approvePlan(strict);
  mustPass(['check', strict, '--action', 'code', '--ui', 'true', '--schema-extract', 'specs/ui-schema-extract.md']);

  const finalWb = path.join(tmp, 'strict-final', 'documents', 'demo', 'workbench');
  mustPass(['init', finalWb, '--name', 'Strict Final', '--mode', 'strict']);
  write(path.join(tmp, 'strict-final', 'documents', 'demo', 'source', 'ui', 'manifest.json'), '{"boards":[{"name":"Demo"}]}\n');
  write(path.join(tmp, 'strict-final', 'documents', 'demo', 'source', 'api', 'openapi.json'), '{}\n');
  mustPass(['scaffold', finalWb, '--ui', 'true', '--api', 'true', '--ui-coding', 'true', '--behavior', 'true', '--review-agent', 'true']);
  seedScope(finalWb);
  seedPlan(finalWb, { reviewReady: true });
  seedContracts(finalWb);
  approveScope(finalWb);
  approvePlan(finalWb);
  mustFail(['request-gate3', finalWb], /requires a review-agent report/);
  write(path.join(finalWb, 'reviews', 'code-review', 'RP1.md'), '# Review Agent RP1\n\nstatus: changes-requested\n');
  mustFail(['request-gate3', finalWb], /unresolved pending or changes-requested/);
  write(path.join(finalWb, 'reviews', 'code-review', 'RP1.md'), '# Review Agent RP1\n\nstatus: agent-approved\n');
  mustPass(['request-gate3', finalWb]);
  mustPass(['approve-gate3', finalWb, '--review', 'true', '--validation', 'true']);
  mustPass(['request-gate4', finalWb]);
  mustFail(['approve-gate4', finalWb, '--merge', 'false'], /confirmed-by user/);
  mustPass(['approve-gate4', finalWb, '--confirmed-by', 'user', '--confirmation', '用户确认 final action', '--merge', 'false', '--commit', 'false', '--push', 'false', '--cleanup', 'false']);

  const fallbackWb = path.join(tmp, 'fallback', 'documents', 'demo', 'workbench');
  mustPass(['init', fallbackWb, '--name', 'Fallback Demo', '--mode', 'strict']);
  write(path.join(tmp, 'fallback', 'documents', 'demo', 'source', 'ui', 'manifest.json'), '{"boards":[{"name":"Demo"}]}\n');
  write(path.join(tmp, 'fallback', 'documents', 'demo', 'source', 'api', 'openapi.json'), '{}\n');
  mustPass(['scaffold', fallbackWb, '--ui', 'true', '--api', 'true', '--ui-coding', 'true', '--behavior', 'true']);
  seedScope(fallbackWb);
  seedPlan(fallbackWb, { reviewReady: true });
  seedLegacyContracts(fallbackWb, { reviewReady: true });
  mustPass(['check-contracts', fallbackWb]);
  approveScope(fallbackWb);
  approvePlan(fallbackWb);
  mustPass(['check', fallbackWb, '--action', 'code', '--ui', 'true', '--schema-extract', 'specs/ui-schema-extract.md']);

  const legacy = path.join(tmp, 'legacy', 'documents', 'demo', 'workbench');
  mustPass(['init', legacy, '--name', 'Legacy Demo', '--mode', 'standard']);
  mustPass(['scaffold', legacy]);
  seedScope(legacy);
  seedPlan(legacy, { reviewReady: true });
  approveScope(legacy);
  approvePlan(legacy);
  mustPass(['request-gate3', legacy]);
  mustPass(['approve-gate3', legacy, '--review', 'true', '--validation', 'true']);
  mustPass(['request-gate4', legacy]);
  mustPass(['approve-gate4', legacy, '--confirmed-by', 'user', '--confirmation', '用户确认 legacy final', '--merge', 'false']);

  console.log('SuperMaestro strict contract tests passed.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
