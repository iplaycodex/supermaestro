#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const cli = path.join(
  repoRoot,
  'plugins',
  'supermaestro',
  'scripts',
  'supermaestro.js'
);

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
}

function runGit(cwd, args) {
  const result = run('git', ['-C', cwd, ...args], cwd);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return String(result.stdout || '').trim();
}

function runCli(workbench, args, cwd) {
  return run(process.execPath, [cli, ...args.slice(0, 1), workbench, ...args.slice(1)], cwd);
}

function expectPass(result, message) {
  assert.equal(result.status, 0, `${message}\n${result.stdout}${result.stderr}`);
}

function expectFail(result, pattern, message) {
  assert.notEqual(result.status, 0, message);
  assert.match(result.stderr, pattern, result.stdout + result.stderr);
}

function readState(workbench) {
  return JSON.parse(fs.readFileSync(path.join(workbench, 'state.json'), 'utf8'));
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const sandbox = fs.mkdtempSync(
  path.join(repoRoot, '.supermaestro-worktree-test-')
);
const sourceRoot = path.join(sandbox, 'project');
const workbench = path.join(sandbox, 'documents', 'registry-demo', 'workbench');
const target = path.join(sandbox, 'feature-worktree');
const secondTarget = path.join(sandbox, 'second-worktree');
const secondTargetRef = '../second-worktree';
const externalTarget = path.join(sandbox, 'external-worktree');
const branch = 'codex/worktree-registry-test';
const secondBranch = 'codex/worktree-registry-second';
const externalBranch = 'codex/worktree-registry-external';

try {
  fs.mkdirSync(sourceRoot, { recursive: true });
  runGit(sourceRoot, ['init']);
  runGit(sourceRoot, ['config', 'user.email', 'supermaestro-test@example.invalid']);
  runGit(sourceRoot, ['config', 'user.name', 'SuperMaestro Test']);
  fs.writeFileSync(path.join(sourceRoot, 'tracked.txt'), 'initial\n');
  runGit(sourceRoot, ['add', 'tracked.txt']);
  runGit(sourceRoot, ['commit', '-m', 'initial']);
  runGit(sourceRoot, ['branch', '-M', 'main']);
  const baseCommit = runGit(sourceRoot, ['rev-parse', 'HEAD']);

  const help = run(process.execPath, [cli, 'help'], sandbox);
  expectPass(help, 'CLI help should be available');
  assert.match(
    help.stdout,
    /create-worktree\|create-branch> --target <path> --branch <branch> --base <git-ref>/
  );
  assert.match(
    help.stdout,
    /register-worktree <workbench> --target <path> --branch <branch> --base <git-ref>/
  );
  assert.match(
    help.stdout,
    /--cleanup true --target <registered-worktree>/
  );

  expectPass(
    runCli(workbench, [
      'init',
      '--name',
      'Worktree Registry Test',
      '--mode',
      'standard',
      '--source-root',
      sourceRoot
    ], sandbox),
    'workflow should initialize through the real CLI'
  );
  expectPass(
    runCli(workbench, [
      'scaffold',
      '--worktree',
      'true',
      '--subagents',
      'true',
      '--review-agent',
      'false'
    ], sandbox),
    'worktree and subagent triggers should be scaffolded before Plan approval'
  );
  write(
    path.join(workbench, 'context.md'),
    '# 上下文\n\nBrainstorming：无待确认问题。\n'
  );
  write(
    path.join(workbench, 'specs', 'requirement-alignment.md'),
    [
      '# 需求对齐',
      '',
      '状态：已确认',
      '确认人：user',
      '确认摘要：用户确认 worktree registry 测试范围。',
      'Brainstorming：无待确认问题。'
    ].join('\n') + '\n'
  );
  expectPass(
    runCli(workbench, ['check-workbench'], sandbox),
    'scope workbench should pass'
  );
  expectPass(
    runCli(workbench, [
      'approve-scope',
      '--confirmed-by',
      'user',
      '--confirmation',
      '用户确认 worktree 测试范围'
    ], sandbox),
    'Scope gate should use a real user confirmation'
  );
  write(
    path.join(workbench, 'plans', 'task-plan.md'),
    '# 任务计划\n\n任务：验证 worktree registry。\n验证：运行离线 CLI 测试。\n'
  );
  write(
    path.join(workbench, 'plans', 'progress.md'),
    '# 进度\n\n执行模式：multi-worktree-parallel。\n'
  );
  write(
    path.join(workbench, 'specs', 'behavior-contract.md'),
    '# 行为契约\n\n本测试仅验证 CLI 授权边界，无业务行为变更。\n'
  );
  write(
    path.join(workbench, 'reports', 'validation.md'),
    '# 验证\n\n- TDD 决策：适用。\n- 完成前验证：运行 worktree registry 测试。\n'
  );
  write(
    path.join(workbench, 'reviews', 'review-packs.md'),
    [
      '# Review Packs',
      '',
      '| RP | Scope | Patch | Files | Validation | Review Focus | Risk |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| RP-WORKTREE | registry | pending | pending | pending | pending | pending |'
    ].join('\n') + '\n'
  );
  write(
    path.join(workbench, 'worktrees', 'plan.md'),
    [
      '# Worktree 计划',
      '',
      '| 任务 | Worktree | Branch | Base | 状态 |',
      '| --- | --- | --- | --- | --- |',
      `| registry | ${target} | ${branch} | HEAD | ready-for-human-review |`,
      `| registry-2 | ${secondTarget} | ${secondBranch} | HEAD | ready-for-human-review |`,
      `| external-guard | ${externalTarget} | ${externalBranch} | HEAD | security-check |`
    ].join('\n') + '\n'
  );
  write(
    path.join(workbench, 'specs', 'machine', 'worktree-contract.json'),
    `${JSON.stringify({
      version: 1,
      integrationTarget: target,
      worktrees: [
        {
          task: 'registry',
          target,
          branch,
          base: 'HEAD'
        },
        {
          task: 'registry-2',
          target: secondTarget,
          branch: secondBranch,
          base: 'HEAD'
        },
        {
          task: 'external-guard',
          target: externalTarget,
          branch: externalBranch,
          base: 'HEAD'
        }
      ]
    }, null, 2)}\n`
  );
  expectPass(
    runCli(workbench, [
      'approve-plan',
      '--execution-mode',
      'multi-worktree-parallel',
      '--confirmed-by',
      'user',
      '--confirmation',
      '用户确认 worktree 与多 agent 执行计划',
      '--worktree',
      'true',
      '--subagents',
      'true',
      '--review-agent',
      'false',
      '--checkpoint',
      'true',
      '--sync-materials',
      'true'
    ], sandbox),
    'Plan gate should use the real approval flow'
  );

  runGit(sourceRoot, [
    'worktree',
    'add',
    '-b',
    externalBranch,
    externalTarget,
    'HEAD'
  ]);
  fs.rmSync(externalTarget, { recursive: true, force: true });
  expectFail(
    runCli(workbench, [
      'check',
      '--action',
      'create-worktree',
      '--target',
      externalTarget,
      '--branch',
      externalBranch,
      '--base',
      'HEAD'
    ], sandbox),
    /already present in git worktree list/,
    'a pre-existing or prunable external worktree cannot be adopted'
  );
  runGit(sourceRoot, ['worktree', 'prune']);

  expectFail(
    runCli(workbench, [
      'check',
      '--action',
      'create-worktree',
      '--target',
      sourceRoot,
      '--branch',
      branch,
      '--base',
      'HEAD'
    ], sandbox),
    /must not equal or be inside sourceRoot/,
    'sourceRoot itself must never be an authorized target'
  );

  expectFail(
    runCli(workbench, [
      'check',
      '--action',
      'create-worktree',
      '--target',
      path.join(sourceRoot, 'nested'),
      '--branch',
      branch,
      '--base',
      'HEAD'
    ], sandbox),
    /must not equal or be inside sourceRoot/,
    'a target below sourceRoot must never be authorized'
  );

  expectFail(
    runCli(workbench, [
      'check',
      '--action',
      'create-worktree',
      '--target',
      path.join(os.tmpdir(), 'supermaestro-forbidden-worktree'),
      '--branch',
      branch,
      '--base',
      'HEAD'
    ], sandbox),
    /system temporary directory/,
    'system temporary worktrees must be rejected'
  );

  expectFail(
    runCli(workbench, [
      'check',
      '--action',
      'create-worktree',
      '--target',
      target,
      '--branch',
      branch,
      '--base',
      'missing-base'
    ], sandbox),
    /does not resolve to a commit/,
    'the base must resolve before authorization'
  );

  expectPass(
    runCli(workbench, [
      'check',
      '--action',
      'create-worktree',
      '--target',
      target,
      '--branch',
      branch,
      '--base',
      'HEAD'
    ], sandbox),
    'create-worktree intent should be authorized'
  );
  expectPass(
    runCli(workbench, [
      'check',
      '--action',
      'create-branch',
      '--target',
      target,
      '--branch',
      branch,
      '--base',
      'HEAD'
    ], sandbox),
    'create-branch should bind to the same exact intent'
  );

  let state = readState(workbench);
  let intents = Object.values(state.worktrees.intents);
  assert.equal(intents.length, 1);
  assert.equal(intents[0].target, target);
  assert.equal(intents[0].branch, branch);
  assert.equal(intents[0].base, 'HEAD');
  assert.equal(intents[0].baseCommit, baseCommit);
  assert.ok(path.isAbsolute(intents[0].gitCommonDir));
  assert.match(intents[0].intentNonce, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(intents[0].authorizedActions, ['create-branch', 'create-worktree']);

  expectFail(
    runCli(workbench, [
      'check',
      '--action',
      'create-worktree',
      '--target',
      target,
      '--branch',
      `${branch}-different`,
      '--base',
      'HEAD'
    ], sandbox),
    /was not approved by Gate 2/,
    'a target cannot be rebound to a branch outside the approved contract'
  );

  runGit(sourceRoot, ['worktree', 'add', '-b', branch, target, 'HEAD']);
  expectFail(
    runCli(workbench, [
      'register-worktree',
      '--target',
      target,
      '--branch',
      `${branch}-different`,
      '--base',
      'HEAD'
    ], sandbox),
    /target, branch, base, and baseCommit/,
    'registration must match the authorized branch'
  );
  expectPass(
    runCli(workbench, [
      'register-worktree',
      '--target',
      target,
      '--branch',
      branch,
      '--base',
      'HEAD'
    ], sandbox),
    'the exact live worktree should register'
  );

  state = readState(workbench);
  let registry = Object.values(state.worktrees.registry);
  assert.equal(registry.length, 1);
  assert.equal(registry[0].target, target);
  assert.equal(registry[0].branch, branch);
  assert.equal(registry[0].head, baseCommit);
  assert.equal(registry[0].createdByWorkflow, true);
  assert.equal(registry[0].gitCommonDir, intents[0].gitCommonDir);
  assert.equal(registry[0].intentNonce, intents[0].intentNonce);

  expectFail(
    runCli(workbench, ['check', '--action', 'dispatch-subagent'], sandbox),
    /Missing --target/,
    'worktree dispatch must name a target'
  );
  expectPass(
    runCli(workbench, [
      'check',
      '--action',
      'dispatch-subagent',
      '--target',
      target
    ], sandbox),
    'registered worktree dispatch should pass'
  );
  expectPass(
    runCli(workbench, [
      'check',
      '--action',
      'sync-materials',
      '--target',
      target
    ], sandbox),
    'registered worktree material sync should pass'
  );
  expectPass(
    runCli(workbench, [
      'check',
      '--action',
      'checkpoint-commit',
      '--target',
      target
    ], sandbox),
    'registered worktree checkpoint should pass'
  );

  runGit(target, ['checkout', '-b', `${branch}-mismatch`]);
  expectFail(
    runCli(workbench, [
      'check',
      '--action',
      'dispatch-subagent',
      '--target',
      target
    ], sandbox),
    /Live worktree branch mismatch/,
    'registered identity must be checked against live Git state'
  );
  runGit(target, ['checkout', branch]);

  const projected = runCli(workbench, ['status', '--json', 'true'], sandbox);
  expectPass(projected, 'status projection should be readable');
  const projectedState = JSON.parse(projected.stdout);
  assert.equal(
    Object.values(projectedState.worktrees.registry)[0].target,
    target
  );

  expectPass(
    runCli(workbench, [
      'check',
      '--action',
      'create-worktree',
      '--target',
      secondTargetRef,
      '--branch',
      secondBranch,
      '--base',
      'HEAD'
    ], sandbox),
    'second intent should be authorized'
  );
  runGit(sourceRoot, ['worktree', 'add', '-b', secondBranch, secondTarget, 'HEAD']);
  expectPass(
    runCli(workbench, [
      'register-worktree',
      '--target',
      secondTargetRef,
      '--branch',
      secondBranch,
      '--base',
      'HEAD'
    ], sandbox),
    'second worktree should register'
  );
  state = readState(workbench);
  assert.ok(
    Object.values(state.worktrees.registry).some(entry => entry.target === secondTarget),
    'relative --target must resolve against state.sourceRoot and store a canonical absolute path'
  );

  write(
    path.join(workbench, 'reports', 'validation.md'),
    [
      '# 验证报告',
      '',
      '- TDD：不适用；本测试只验证 CLI 授权边界。',
      '- 完成前验证：运行命令 node -e process.exit(0)，结果 passed，exit code 0。'
    ].join('\n') + '\n'
  );
  write(
    path.join(workbench, 'reviews', 'review-packs.md'),
    [
      '# Review Packs',
      '',
      '### RP-WORKTREE',
      '',
      '- Scope: worktree registry',
      '- Patch: `reviews/worktree-registry.patch`',
      '- Validation: worktree registry offline test'
    ].join('\n') + '\n'
  );
  write(
    path.join(workbench, 'reviews', 'worktree-registry.patch'),
    'diff --git a/worktree.js b/worktree.js\n--- a/worktree.js\n+++ b/worktree.js\n@@ -0,0 +1 @@\n+verified\n'
  );
  write(
    path.join(workbench, 'worktrees', 'plan.md'),
    [
      '# Worktree 计划',
      '',
      '| 任务 | Worktree | Branch | Base | 状态 |',
      '| --- | --- | --- | --- | --- |',
      `| registry | ${target} | ${branch} | ${baseCommit} | ready-for-human-review |`,
      `| registry-2 | ${secondTarget} | ${secondBranch} | ${baseCommit} | ready-for-human-review |`
    ].join('\n') + '\n'
  );
  write(
    path.join(workbench, 'agents', 'agent-index.md'),
    [
      '# Agent 索引',
      '',
      '| 任务 | Agent | 状态 |',
      '| --- | --- | --- |',
      '| registry | test-agent | agent-approved |'
    ].join('\n') + '\n'
  );
  expectPass(
    runCli(workbench, [
      'run-verification',
      '--program',
      process.execPath,
      '--args-json',
      '["-e","process.exit(0)"]',
      '--report',
      'reports/worktree-verification.log',
      '--target',
      target
    ], sandbox),
    'completion evidence should be generated by the trusted runner'
  );
  expectPass(
    runCli(workbench, ['request-review', '--target', target], sandbox),
    'Review gate should be requested through the real workflow'
  );
  expectPass(
    runCli(workbench, [
      'approve-review',
      '--review-accepted',
      'true',
      '--validation-accepted',
      'true',
      '--confirmed-by',
      'user',
      '--confirmation',
      '用户确认 worktree 审查与验证结果',
      '--target',
      target
    ], sandbox),
    'Review gate should use a real user confirmation'
  );
  expectPass(
    runCli(workbench, ['request-final', '--target', target], sandbox),
    'Final gate should be requested through the real workflow'
  );

  expectFail(
    runCli(workbench, [
      'approve-final',
      '--confirmed-by',
      'user',
      '--confirmation',
      '用户确认完成并允许清理',
      '--cleanup',
      'true'
    ], sandbox),
    /requires exactly one of --target or --cleanup-targets-json/,
    'cleanup approval must bind an exact target'
  );
  expectPass(
    runCli(workbench, [
      'approve-final',
      '--confirmed-by',
      'user',
      '--confirmation',
      '用户确认完成并允许清理',
      '--merge',
      'false',
      '--commit',
      'false',
      '--push',
      'false',
      '--cleanup',
      'true',
      '--cleanup-targets-json',
      JSON.stringify([secondTarget, target])
    ], sandbox),
    'final cleanup should bind every registered target'
  );

  state = readState(workbench);
  assert.equal(state.finalActions.cleanup, true);
  assert.equal(state.finalActionTargets.cleanup.integrationTarget, target);
  assert.equal(state.finalActionTargets.cleanup.targets.length, 2);
  const integrationBinding = state.finalActionTargets.cleanup.targets.find(
    entry => entry.target === target
  );
  const workerBinding = state.finalActionTargets.cleanup.targets.find(
    entry => entry.target === secondTarget
  );
  assert.equal(integrationBinding.branch, branch);
  assert.equal(integrationBinding.head, baseCommit);
  assert.equal(integrationBinding.clean, true);
  assert.equal(workerBinding.branch, secondBranch);
  assert.equal(workerBinding.head, baseCommit);
  assert.equal(workerBinding.clean, true);
  assert.match(
    integrationBinding.workingTreeFingerprint,
    /^git-working-tree:[a-f0-9]{64}$/
  );
  const approvedState = JSON.parse(JSON.stringify(state));
  const tamperedState = JSON.parse(JSON.stringify(state));
  tamperedState.finalActionTargets.cleanup.targets.find(
    entry => entry.target === target
  ).head = '0'.repeat(40);
  write(
    path.join(workbench, 'state.json'),
    `${JSON.stringify(tamperedState, null, 2)}\n`
  );
  expectFail(
    runCli(workbench, [
      'check',
      '--action',
      'cleanup-worktree',
      '--target',
      secondTarget
    ], sandbox),
    /approval no longer matches current workflow state/,
    'tampering with the cleanup binding must invalidate Gate Final'
  );
  write(
    path.join(workbench, 'state.json'),
    `${JSON.stringify(approvedState, null, 2)}\n`
  );

  expectFail(
    runCli(workbench, [
      'check',
      '--action',
      'cleanup-worktree',
      '--target',
      target
    ], sandbox),
    /must be the last cleanup target checked/,
    'the integration worktree must be checked after worker worktrees'
  );
  fs.writeFileSync(path.join(target, 'dirty-after-approval.txt'), 'dirty\n');
  expectFail(
    runCli(workbench, [
      'check',
      '--action',
      'cleanup-worktree',
      '--target',
      secondTarget
    ], sandbox),
    /requires a clean worktree|no longer clean|sourceRevision does not match|Freshness failures/,
    'dirty drift after approval must invalidate cleanup'
  );
  fs.unlinkSync(path.join(target, 'dirty-after-approval.txt'));
  expectPass(
    runCli(workbench, [
      'check',
      '--action',
      'cleanup-worktree',
      '--target',
      secondTarget
    ], sandbox),
    'worker cleanup should pass for the exact live owned target'
  );
  expectPass(
    runCli(workbench, [
      'check',
      '--action',
      'cleanup-worktree',
      '--target',
      target
    ], sandbox),
    'integration cleanup should pass after worker cleanup'
  );

  write(
    path.join(workbench, 'state.json'),
    `${JSON.stringify(approvedState, null, 2)}\n`
  );
  runGit(target, ['commit', '--allow-empty', '-m', 'post-approval drift']);
  expectFail(
    runCli(workbench, [
      'check',
      '--action',
      'cleanup-worktree',
      '--target',
      secondTarget
    ], sandbox),
    /authorization target\/ref\/HEAD\/fingerprint changed|Cleanup authorization HEAD changed|sourceRevision does not match|Freshness failures|target\/registry identity does not match/,
    'commit drift after approval must invalidate cleanup'
  );

  runGit(sourceRoot, ['worktree', 'remove', '--force', target]);
  expectFail(
    runCli(workbench, [
      'check',
      '--action',
      'cleanup-worktree',
      '--target',
      secondTarget
    ], sandbox),
    /does not exist/,
    'cleanup must fail closed after the live worktree disappears'
  );

  console.log('PASS SuperMaestro worktree registry tests');
} finally {
  if (fs.existsSync(sourceRoot)) {
    run('git', ['-C', sourceRoot, 'worktree', 'remove', '--force', target], sandbox);
    run('git', ['-C', sourceRoot, 'worktree', 'remove', '--force', secondTarget], sandbox);
  }
  fs.rmSync(sandbox, { recursive: true, force: true });
}
