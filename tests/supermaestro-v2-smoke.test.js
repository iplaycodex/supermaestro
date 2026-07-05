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
  mustPass(['help']);

  const lite = path.join(tmp, 'lite', 'workbench');
  mustPass(['init', lite, '--name', 'Lite Demo', '--mode', 'lite']);
  mustPass(['scaffold', lite]);
  assert.equal(state(lite).mode, 'lite');
  mustFail(['check-workbench', lite], /Lite brief is not confirmed/);
  write(path.join(lite, 'brief.md'), '# Lite Brief\n\n状态：已确认\n确认人：user\n\n## 本次要做\n- demo\n\n## 验证方式\n- demo\n');
  mustPass(['check-workbench', lite]);
  mustPass(['approve-scope', lite, '--confirmed-by', 'user', '--confirmation', '用户确认 lite 范围']);
  mustFail(['check', lite, '--action', 'code', '--non-ui', 'true', '--reason', '只改低风险逻辑'], /test-driven-development/);
  mustPass(['evidence', lite, '--type', 'skill.used', '--skill', 'superpowers:test-driven-development', '--phase', 'code', '--summary', '已评估 TDD']);
  mustPass(['evidence', lite, '--type', 'skill.used', '--skill', 'superpowers:executing-plans', '--phase', 'code', '--summary', '按计划执行']);
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
  mustFail(['approve-plan', standard, '--confirmed-by', 'user', '--confirmation', '用户确认 plan'], /writing-plans/);
  mustPass(['evidence', standard, '--type', 'skill.used', '--skill', 'superpowers:writing-plans', '--phase', 'plan', '--summary', '已应用 writing-plans']);
  mustPass(['approve-plan', standard, '--mode', 'main-serial', '--confirmed-by', 'user', '--confirmation', '用户确认 plan']);
  mustFail(['check', standard, '--action', 'code'], /Non-UI code checks require/);
  mustFail(['check', standard, '--action', 'code', '--ui', 'true', '--schema-extract', 'specs/ui-schema-extract.md'], /test-driven-development/);
  mustPass(['evidence', standard, '--type', 'skill.used', '--skill', 'superpowers:test-driven-development', '--phase', 'code', '--summary', '已评估 TDD']);
  mustPass(['evidence', standard, '--type', 'skill.used', '--skill', 'superpowers:executing-plans', '--phase', 'code', '--summary', '按计划执行']);
  mustPass(['check', standard, '--action', 'code', '--ui', 'true', '--schema-extract', 'specs/ui-schema-extract.md']);
  mustFail(['check', standard, '--action', 'dispatch-subagent'], /Gate 2 execution mode did not enable subagents/);

  console.log('SuperMaestro workflow v2 smoke tests passed.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
