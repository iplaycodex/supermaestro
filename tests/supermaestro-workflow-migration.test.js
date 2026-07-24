#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

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
    `Expected pass: ${args.join(' ')}\nOUT:\n${result.stdout}\nERR:\n${result.stderr}`
  );
  return result;
}

function mustFail(args, pattern) {
  const result = run(args);
  assert.notEqual(
    result.status,
    0,
    `Expected fail: ${args.join(' ')}\nOUT:\n${result.stdout}\nERR:\n${result.stderr}`
  );
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
}

function createGitRepo(root) {
  fs.mkdirSync(root, { recursive: true });
  const result = spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function readState(workbench) {
  return JSON.parse(fs.readFileSync(path.join(workbench, 'state.json'), 'utf8'));
}

function writeState(workbench, state) {
  fs.writeFileSync(path.join(workbench, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
}

test('workflow v2 只通过 init 显式迁移，并重置 Plan/Review/Final 授权', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supermaestro-migration-'));
  try {
    const sourceRoot = path.join(tmp, 'source');
    const workbench = path.join(tmp, 'documents', 'migration', 'workbench');
    createGitRepo(sourceRoot);
    mustPass([
      'init',
      workbench,
      '--name',
      'Migration',
      '--mode',
      'standard',
      '--source-root',
      sourceRoot
    ]);
    fs.writeFileSync(path.join(workbench, 'raw-material.md'), '必须保留\n');

    const legacy = readState(workbench);
    legacy.workflowVersion = 2;
    legacy.phase = 'final_approved';
    legacy.gates = {
      gate1: 'approved',
      gate2: 'approved',
      gate3: 'approved',
      gate4: 'approved'
    };
    legacy.execution = {
      mode: 'main-serial',
      worktree: false,
      subagents: false,
      checkpoint: false,
      reviewAgent: false,
      syncMaterials: false
    };
    legacy.finalActions = { push: true, cleanup: true };
    legacy.verificationSnapshot = { sourceRoot, sourceRevision: 'legacy' };
    legacy.humanConfirmations = {
      gate1: {
        confirmedBy: 'user',
        confirmationText: '用户确认旧版范围',
        confirmedAt: new Date().toISOString()
      },
      gate2: {
        confirmedBy: 'user',
        confirmationText: '用户确认旧版计划',
        confirmedAt: new Date().toISOString()
      },
      gate3: {
        confirmedBy: 'user',
        confirmationText: '用户确认旧版评审',
        confirmedAt: new Date().toISOString()
      },
      gate4: {
        confirmedBy: 'user',
        confirmationText: '用户确认旧版交付',
        confirmedAt: new Date().toISOString()
      }
    };
    writeState(workbench, legacy);

    mustFail(['status', workbench], /must be migrated to v3/);
    const migration = mustPass(['init', workbench]);
    assert.match(migration.stdout, /Migrated workflow state from v2 to v3/);

    const migrated = readState(workbench);
    assert.equal(migrated.workflowVersion, 3);
    assert.equal(migrated.phase, 'scope_approved');
    assert.deepEqual(migrated.gates, {
      gate1: 'approved',
      gate2: 'pending',
      gate3: 'locked',
      gate4: 'locked'
    });
    assert.deepEqual(migrated.execution, {
      mode: null,
      worktree: false,
      subagents: false,
      checkpoint: false,
      reviewAgent: false,
      syncMaterials: false
    });
    assert.equal('finalActions' in migrated, false);
    assert.equal('verificationSnapshot' in migrated, false);
    assert.deepEqual(Object.keys(migrated.humanConfirmations), ['gate1']);
    assert.equal(
      migrated.humanConfirmations.gate1.approvalContext.mode,
      'standard'
    );
    assert.deepEqual(
      Object.values(
        migrated.humanConfirmations.gate1.approvalContext.scopeArtifacts.files
      ),
      [null, null, null, null, null, null, null]
    );
    assert.match(
      migrated.humanConfirmations.gate1.approvalContext.scopeArtifacts
        .sourceMaterialsHash,
      /^sha256:[a-f0-9]{64}$/
    );
    assert.equal(
      fs.readFileSync(path.join(workbench, 'raw-material.md'), 'utf8'),
      '必须保留\n'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('v2 状态缺少 sourceRoot 时必须在迁移时显式重绑', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supermaestro-migration-rebind-'));
  try {
    const sourceRoot = path.join(tmp, 'source');
    const workbench = path.join(tmp, 'workbench');
    createGitRepo(sourceRoot);
    mustPass([
      'init',
      workbench,
      '--mode',
      'standard',
      '--source-root',
      sourceRoot
    ]);
    const legacy = readState(workbench);
    legacy.workflowVersion = 2;
    legacy.sourceRoot = '';
    writeState(workbench, legacy);

    mustFail(
      ['init', workbench],
      /Standard\/strict mode requires a Git source root/
    );
    mustPass(['init', workbench, '--source-root', sourceRoot]);
    assert.equal(readState(workbench).workflowVersion, 3);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('未知 workflowVersion 不会被静默覆盖', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supermaestro-migration-unknown-'));
  try {
    const sourceRoot = path.join(tmp, 'source');
    const workbench = path.join(tmp, 'workbench');
    createGitRepo(sourceRoot);
    mustPass([
      'init',
      workbench,
      '--mode',
      'standard',
      '--source-root',
      sourceRoot
    ]);
    const state = readState(workbench);
    state.workflowVersion = 99;
    writeState(workbench, state);
    mustFail(['init', workbench], /Unsupported workflowVersion 99/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('validation contract 与工作流状态必须绑定同一 sourceRoot', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supermaestro-source-binding-'));
  try {
    const sourceA = path.join(tmp, 'source-a');
    const sourceB = path.join(tmp, 'source-b');
    const workbench = path.join(tmp, 'workbench');
    createGitRepo(sourceA);
    createGitRepo(sourceB);
    mustPass([
      'init',
      workbench,
      '--mode',
      'standard',
      '--source-root',
      sourceA
    ]);
    mustPass(['scaffold', workbench, '--e2e', 'true']);
    const contractFile = path.join(
      workbench,
      'specs',
      'machine',
      'validation-contract.json'
    );
    const contract = JSON.parse(fs.readFileSync(contractFile, 'utf8'));
    contract.sourceRoot = sourceB;
    fs.writeFileSync(contractFile, `${JSON.stringify(contract, null, 2)}\n`);

    mustFail(
      ['source-revision', workbench],
      /Validation contract sourceRoot must match state\.sourceRoot/
    );
    mustFail(
      ['source-revision', workbench, '--source-root', sourceB],
      /must match state\.sourceRoot/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
