#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const cli = path.join(repoRoot, 'plugins/supermaestro/scripts/supermaestro.js');

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
}

function mustPass(args) {
  const result = run(args);
  assert.equal(
    result.status,
    0,
    `Expected command to pass: ${args.join(' ')}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
  );
  return result;
}

function mustFail(args, pattern) {
  const result = run(args);
  assert.notEqual(
    result.status,
    0,
    `Expected command to fail: ${args.join(' ')}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
  );
  if (pattern) {
    assert.match(`${result.stdout}\n${result.stderr}`, pattern);
  }
  return result;
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function write(file, content) {
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, content);
}

function readState(workbench) {
  return JSON.parse(fs.readFileSync(path.join(workbench, 'state.json'), 'utf8'));
}

function assertReadmeCommandsMatchCli() {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const commandRe = /node plugins\/supermaestro\/scripts\/supermaestro\.js\s+([^\s]+)/g;
  const allowed = new Set([
    'init',
    'status',
    'next',
    'resume',
    'check-workbench',
    'approve-gate1',
    'approve-gate2',
    'check',
    'verify',
    'request-gate3',
    'approve-gate3',
    'request-gate4',
    'approve-gate4'
  ]);
  const commands = Array.from(readme.matchAll(commandRe), match => match[1]);

  assert.ok(commands.length > 0, 'README should document SuperMaestro CLI commands');
  for (const command of commands) {
    assert.ok(allowed.has(command), `README documents unknown CLI command: ${command}`);
  }
}

function seedGate1Workbench(workbench) {
  write(path.join(workbench, 'context.md'), '# 上下文\n\nBrainstorming：无待确认问题。\n');
  write(
    path.join(workbench, 'specs', 'requirement-alignment.md'),
    [
      '# 需求对齐',
      '',
      '状态：已确认',
      '确认人：user',
      '确认摘要：用户确认需求理解、范围和验收标准一致。',
      'Brainstorming：无待确认问题。'
    ].join('\n')
  );
}

function seedGate2Docs(workbench, { subagents = false } = {}) {
  write(
    path.join(workbench, 'plans', 'task-plan.md'),
    [
      '# 任务计划',
      '',
      '已读取 superpowers:writing-plans。',
      '任务：完成 smoke test。'
    ].join('\n')
  );
  write(
    path.join(workbench, 'plans', 'progress.md'),
    [
      '# 进度',
      '',
      subagents
        ? '已执行 superpowers:subagent-driven-development。'
        : '已执行 superpowers:executing-plans。'
    ].join('\n')
  );
  write(path.join(workbench, 'reviews', 'review-packs.md'), '# Review Packs\n\npending。\n');
  write(
    path.join(workbench, 'reports', 'validation.md'),
    [
      '# 验证',
      '',
      '## Superpowers 调用证据',
      '',
      '- 已读取 superpowers:writing-plans。',
      '- 已读取 superpowers:test-driven-development。',
      subagents
        ? '- 已读取 superpowers:subagent-driven-development。'
        : '- 已执行 superpowers:executing-plans。'
    ].join('\n')
  );
}

function approveGate1(workbench) {
  mustPass([
    'approve-gate1',
    workbench,
    '--confirmed-by',
    'user',
    '--confirmation',
    '用户确认需求对齐'
  ]);
}

function approveGate2(workbench, { subagents = false } = {}) {
  mustPass([
    'approve-gate2',
    workbench,
    '--mode',
    subagents ? 'multi-worktree-parallel' : 'main-serial',
    '--confirmed-by',
    'user',
    '--confirmation',
    subagents ? '用户确认计划与多 agent 执行模式' : '用户确认计划与主控串行模式',
    '--subagents',
    String(subagents)
  ]);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supermaestro-smoke-'));

try {
  mustPass(['help']);
  assertReadmeCommandsMatchCli();

  const workbench = path.join(tmp, 'documents', 'demo', 'workbench');
  mustPass(['init', workbench, '--name', 'Demo']);
  assert.equal(readState(workbench).phase, 'initialized');

  mustFail(['check-workbench', workbench], /Missing or empty/);
  assert.equal(readState(workbench).checks.workbench, 'failed');

  seedGate1Workbench(workbench);
  write(
    path.join(workbench, 'specs', 'requirement-alignment.md'),
    '# 需求对齐\n\n状态：待确认\n确认人：user\n'
  );
  mustFail(['check-workbench', workbench], /Requirement alignment is not confirmed/);
  assert.equal(readState(workbench).checks.workbench, 'failed');

  seedGate1Workbench(workbench);
  mustPass(['check-workbench', workbench]);
  assert.equal(readState(workbench).checks.workbench, 'passed');

  approveGate1(workbench);
  assert.equal(readState(workbench).gates.gate1, 'approved');

  mustFail(['check', workbench, '--action', 'code'], /gate2 is not approved/i);

  seedGate2Docs(workbench);
  approveGate2(workbench);
  assert.equal(readState(workbench).gates.gate2, 'approved');

  mustPass(['check', workbench, '--action', 'code']);

  write(path.join(tmp, 'documents', 'demo', 'source', 'ui', 'manifest.json'), '{"images":[]}\n');
  mustFail(['check', workbench, '--action', 'code'], /Non-UI code checks require --non-ui true/);
  mustFail(['check', workbench, '--action', 'code', '--non-ui', 'true', '--reason', '短'], /Non-UI code checks require/);
  mustPass(['check', workbench, '--action', 'code', '--non-ui', 'true', '--reason', '只改接口逻辑不涉及视觉']);

  mustFail(['check', workbench, '--action', 'dispatch-subagent'], /Gate 2 execution mode did not enable subagents/);

  const agentWorkbench = path.join(tmp, 'documents', 'agent-demo', 'workbench');
  mustPass(['init', agentWorkbench, '--name', 'Agent Demo']);
  seedGate1Workbench(agentWorkbench);
  approveGate1(agentWorkbench);
  seedGate2Docs(agentWorkbench, { subagents: true });
  approveGate2(agentWorkbench, { subagents: true });
  mustPass(['check', agentWorkbench, '--action', 'dispatch-subagent']);

  console.log('SuperMaestro smoke tests passed.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
