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
    'scaffold',
    'check-workbench',
    'check-contracts',
    'check-reviewability',
    'source-revision',
    'run-verification',
    'register-worktree',
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
      '任务：完成 smoke test。',
      '验证：运行 npm test，并记录结果。'
    ].join('\n')
  );
  write(
    path.join(workbench, 'plans', 'progress.md'),
    [
      '# 进度',
      '',
      subagents
        ? '执行模式：多 agent 并行。'
        : '执行模式：主控串行。'
    ].join('\n')
  );
  write(
    path.join(workbench, 'reviews', 'review-packs.md'),
    [
      '# Review Packs',
      '',
      '| RP | Scope | Patch | Files | Validation | Review Focus | Risk |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| RP1 | smoke | pending | pending | pending | pending | pending |'
    ].join('\n')
  );
  write(
    path.join(workbench, 'reports', 'validation.md'),
    [
      '# 验证',
      '',
      '- TDD 决策：本次 smoke test 适用。',
      '- 完成前验证：运行 npm test。'
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

function approveGate2(workbench, { subagents = false, worktreeTargets = [] } = {}) {
  if (subagents) {
    mustPass([
      'scaffold',
      workbench,
      '--worktree',
      'true',
      '--subagents',
      'true',
      '--review-agent',
      'false'
    ]);
    write(
      path.join(workbench, 'specs', 'behavior-contract.md'),
      '# 行为契约\n\n本 smoke test 仅验证 CLI 授权边界，无业务行为变更。\n'
    );
    const planned = worktreeTargets.length
      ? worktreeTargets
      : [
          {
            task: 'worker',
            target: path.join(path.dirname(repoRoot), `.supermaestro-smoke-worker-${process.pid}`),
            branch: `codex/smoke-worker-${process.pid}`,
            base: 'HEAD'
          },
          {
            task: 'integration',
            target: path.join(path.dirname(repoRoot), `.supermaestro-smoke-integration-${process.pid}`),
            branch: `codex/smoke-integration-${process.pid}`,
            base: 'HEAD'
          }
        ];
    write(
      path.join(workbench, 'specs', 'machine', 'worktree-contract.json'),
      `${JSON.stringify({
        version: 1,
        integrationTarget: planned.at(-1).target,
        worktrees: planned
      }, null, 2)}\n`
    );
    write(
      path.join(workbench, 'worktrees', 'plan.md'),
      [
        '# Worktree 计划',
        '',
        ...planned.map(item =>
          `- ${item.task} | ${item.target} | ${item.branch} | ${item.base}`
        )
      ].join('\n')
    );
  }
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
    String(subagents),
    '--review-agent',
    'false',
    '--sync-materials',
    String(subagents),
    '--checkpoint',
    String(subagents)
  ]);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supermaestro-smoke-'));

try {
  mustPass(['help']);
  assertReadmeCommandsMatchCli();

  const workbench = path.join(tmp, 'documents', 'demo', 'workbench');
  mustPass(['init', workbench, '--name', 'Demo', '--source-root', repoRoot]);
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

  mustFail(['check', workbench, '--action', 'code'], /(gate2|plan gate) is not approved/i);

  seedGate2Docs(workbench);
  approveGate2(workbench);
  assert.equal(readState(workbench).gates.gate2, 'approved');
  const approvedPlanState = readState(workbench);
  const damagedPlanState = JSON.parse(JSON.stringify(approvedPlanState));
  damagedPlanState.execution.subagents = true;
  write(path.join(workbench, 'state.json'), `${JSON.stringify(damagedPlanState, null, 2)}\n`);
  mustFail(['check', workbench, '--action', 'dispatch-subagent'], /approval no longer matches/);
  write(path.join(workbench, 'state.json'), `${JSON.stringify(approvedPlanState, null, 2)}\n`);

  mustPass(['check', workbench, '--action', 'code']);

  write(path.join(tmp, 'documents', 'demo', 'source', 'ui', 'manifest.json'), '{"images":[]}\n');
  mustFail(
    ['check', workbench, '--action', 'code'],
    /approval no longer matches/
  );
  fs.rmSync(path.join(tmp, 'documents', 'demo', 'source'), {
    recursive: true,
    force: true
  });
  mustPass(['check', workbench, '--action', 'code']);

  mustFail(['check', workbench, '--action', 'dispatch-subagent'], /Gate 2 execution mode did not enable subagents/);
  mustFail(['check', workbench, '--action', 'create-worktree'], /did not authorize/);
  mustFail(['check', workbench, '--action', 'create-branch'], /did not authorize/);
  mustFail(['check', workbench, '--action', 'sync-materials'], /did not authorize/);
  mustFail(['check', workbench, '--action', 'checkpoint-commit'], /did not authorize/);

  const uiWorkbench = path.join(tmp, 'documents', 'ui-demo', 'workbench');
  mustPass(['init', uiWorkbench, '--name', 'UI Demo', '--source-root', repoRoot]);
  write(path.join(uiWorkbench, 'ui', 'manifest.json'), '{"images":[]}\n');
  write(
    path.join(uiWorkbench, 'specs', 'ui-contract.md'),
    '# UI Contract\n\n画板：smoke-board\n资源映射：无图片资源。\n可接受偏差：无。\n不可接受偏差：布局漂移。\n'
  );
  write(
    path.join(uiWorkbench, 'specs', 'ui-material-index.md'),
    '# UI 物料索引\n\n- smoke-board：已绑定。\n'
  );
  write(
    path.join(uiWorkbench, 'specs', 'machine', 'ui-contract.json'),
    `${JSON.stringify({
      version: 1,
      boards: [{ id: 'smoke-board', schema: 'ui/manifest.json' }],
      assets: [],
      tolerances: { accepted: [], rejected: ['layout drift'] }
    }, null, 2)}\n`
  );
  seedGate1Workbench(uiWorkbench);
  approveGate1(uiWorkbench);
  seedGate2Docs(uiWorkbench);
  approveGate2(uiWorkbench);
  mustFail(
    ['check', uiWorkbench, '--action', 'code'],
    /Non-UI code checks require --non-ui true/
  );
  mustFail(
    ['check', uiWorkbench, '--action', 'code', '--non-ui', 'true', '--reason', '短'],
    /Non-UI code checks require/
  );
  mustPass([
    'check',
    uiWorkbench,
    '--action',
    'code',
    '--non-ui',
    'true',
    '--reason',
    '只改接口逻辑不涉及视觉'
  ]);

  const agentWorkbench = path.join(tmp, 'documents', 'agent-demo', 'workbench');
  mustPass(['init', agentWorkbench, '--name', 'Agent Demo', '--source-root', repoRoot]);
  seedGate1Workbench(agentWorkbench);
  approveGate1(agentWorkbench);
  seedGate2Docs(agentWorkbench, { subagents: true });
  approveGate2(agentWorkbench, { subagents: true });
  mustFail(
    ['check', agentWorkbench, '--action', 'dispatch-subagent'],
    /Missing --target/
  );
  mustFail(
    ['check', agentWorkbench, '--action', 'create-worktree'],
    /Missing --target/
  );
  mustFail(
    ['check', agentWorkbench, '--action', 'create-branch'],
    /Missing --target/
  );
  mustFail(
    ['check', agentWorkbench, '--action', 'sync-materials'],
    /Missing --target/
  );
  mustFail(
    ['check', agentWorkbench, '--action', 'checkpoint-commit'],
    /Missing --target/
  );

  console.log('SuperMaestro smoke tests passed.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
