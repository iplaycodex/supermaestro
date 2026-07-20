#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const cli = path.join(repoRoot, 'plugins/supermaestro/scripts/supermaestro.js');
const { fingerprintGitWorkingTree } = require('../plugins/supermaestro/scripts/source-fingerprint');
const baselineHash = crypto.createHash('sha256').update('baseline').digest('hex');
let validationSourceRoot;
let sourceRevision;

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: repoRoot, encoding: 'utf8' });
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

function readJsonLines(file) {
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function appendJsonLine(file, value) {
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
}

function seedReviewableWorkbench(workbench) {
  write(path.join(workbench, 'context.md'), '# Context\n\nBrainstorming：无\n');
  write(
    path.join(workbench, 'specs', 'requirement-alignment.md'),
    '# Scope\n\n状态：已确认\n确认人：user\nBrainstorming：无\n'
  );
  write(path.join(workbench, 'plans', 'progress.md'), '# Progress\n\nBrainstorming：无\n');
  write(path.join(workbench, 'plans', 'task-plan.md'), '# Plan\n\n结构化验证计划。\n');
  write(
    path.join(workbench, 'reviews', 'review-packs.md'),
    '# Review Packs\n\n## Review Contract\n\n| RP | Scope | Diff command | Files | Validation | Review Focus | Risk |\n| --- | --- | --- | --- | --- | --- | --- |\n| RP1 | validation | git diff HEAD | CLI | npm test | evidence | medium |\n'
  );
  write(
    path.join(workbench, 'reports', 'validation.md'),
    '# Validation\n\n结构化 E2E 与视觉 evidence 见 reports/evidence.jsonl。\n'
  );
}

function approvePlan(workbench) {
  mustPass([
    'approve-scope',
    workbench,
    '--confirmed-by',
    'user',
    '--confirmation',
    '用户确认验证能力范围'
  ]);
  mustPass([
    'evidence',
    workbench,
    '--type',
    'skill.used',
    '--skill',
    'superpowers:writing-plans',
    '--phase',
    'plan',
    '--summary',
    '已应用 writing-plans'
  ]);
  mustPass([
    'approve-plan',
    workbench,
    '--mode',
    'main-serial',
    '--confirmed-by',
    'user',
    '--confirmation',
    '用户确认验证执行计划'
  ]);
  mustPass([
    'evidence',
    workbench,
    '--type',
    'skill.used',
    '--skill',
    'superpowers:verification-before-completion',
    '--phase',
    'review',
    '--summary',
    '已执行完成前验证'
  ]);
}

function writeValidationContract(workbench) {
  write(
    path.join(workbench, 'specs', 'machine', 'validation-contract.json'),
    `${JSON.stringify(
      {
        version: 1,
        sourceRoot: validationSourceRoot,
        sourceRevision,
        e2e: {
          required: true,
          cases: [
            {
              id: 'E2E-1',
              requirementIds: ['REQ-1'],
              platform: 'weapp',
              dataMode: 'uat',
              command: 'npm run test:e2e:weapp',
              expected: '一级 Tab 可完成交互'
            }
          ]
        },
        visual: {
          required: true,
          maxMaskedRatio: 0.05,
          cases: [
            {
              id: 'VIS-1',
              requirementIds: ['REQ-1'],
              platform: 'weapp',
              dataMode: 'fixture',
              command: 'npm run test:e2e:weapp:visual',
              sourceRef: 'BOARD-1',
              target: 'pages/demo/index',
              baseline: 'reports/artifacts/board-1.expected.png',
              baselineHash,
              purpose: 'design-conformance',
              maxDiffRatio: 0.05,
              expected: '页面与设计画板一致'
            }
          ]
        }
      },
      null,
      2
    )}\n`
  );
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supermaestro-validation-evidence-'));

try {
  validationSourceRoot = path.join(tmp, 'validation-source');
  mkdirp(validationSourceRoot);
  const initGit = spawnSync('git', ['init'], { cwd: validationSourceRoot, encoding: 'utf8' });
  assert.equal(initGit.status, 0, initGit.stderr);
  write(path.join(validationSourceRoot, 'src.js'), 'module.exports = "source-v1";\n');
  const addSource = spawnSync('git', ['add', 'src.js'], {
    cwd: validationSourceRoot,
    encoding: 'utf8'
  });
  assert.equal(addSource.status, 0, addSource.stderr);
  sourceRevision = fingerprintGitWorkingTree(validationSourceRoot);
  const commitSource = spawnSync(
    'git',
    [
      '-c',
      'user.name=SuperMaestro Test',
      '-c',
      'user.email=supermaestro@example.invalid',
      'commit',
      '-m',
      'initial source'
    ],
    { cwd: validationSourceRoot, encoding: 'utf8' }
  );
  assert.equal(commitSource.status, 0, commitSource.stderr);
  assert.equal(fingerprintGitWorkingTree(validationSourceRoot), sourceRevision);

  const nestedWorkbench = path.join(validationSourceRoot, 'documents', 'demo', 'workbench');
  const excludedBefore = fingerprintGitWorkingTree(validationSourceRoot, {
    excludePaths: [nestedWorkbench]
  });
  write(path.join(nestedWorkbench, 'state.json'), '{"phase":"test"}\n');
  assert.equal(
    fingerprintGitWorkingTree(validationSourceRoot, { excludePaths: [nestedWorkbench] }),
    excludedBefore
  );
  const workbenchLink = path.join(validationSourceRoot, 'workbench-state-link');
  fs.symlinkSync('documents/demo/workbench/state.json', workbenchLink);
  const addWorkbenchLink = spawnSync('git', ['add', 'workbench-state-link'], {
    cwd: validationSourceRoot,
    encoding: 'utf8'
  });
  assert.equal(addWorkbenchLink.status, 0, addWorkbenchLink.stderr);
  const linkedFingerprint = fingerprintGitWorkingTree(validationSourceRoot, {
    excludePaths: [nestedWorkbench]
  });
  assert.notEqual(linkedFingerprint, excludedBefore);
  write(path.join(nestedWorkbench, 'state.json'), '{"phase":"changed"}\n');
  assert.equal(
    fingerprintGitWorkingTree(validationSourceRoot, { excludePaths: [nestedWorkbench] }),
    linkedFingerprint
  );
  const resetWorkbenchLink = spawnSync('git', ['reset', 'HEAD', '--', 'workbench-state-link'], {
    cwd: validationSourceRoot,
    encoding: 'utf8'
  });
  assert.equal(resetWorkbenchLink.status, 0, resetWorkbenchLink.stderr);
  fs.unlinkSync(workbenchLink);
  fs.rmSync(path.join(validationSourceRoot, 'documents'), { recursive: true, force: true });
  assert.equal(fingerprintGitWorkingTree(validationSourceRoot), sourceRevision);

  const collisionRepoA = path.join(tmp, 'collision-a');
  const collisionRepoB = path.join(tmp, 'collision-b');
  for (const repo of [collisionRepoA, collisionRepoB]) {
    mkdirp(repo);
    const init = spawnSync('git', ['init'], { cwd: repo, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
  }
  write(path.join(collisionRepoA, 'a'), Buffer.from('x\0b\0file\0y'));
  write(path.join(collisionRepoB, 'a'), 'x');
  write(path.join(collisionRepoB, 'b'), 'y');
  for (const repo of [collisionRepoA, collisionRepoB]) {
    const add = spawnSync('git', ['add', '.'], { cwd: repo, encoding: 'utf8' });
    assert.equal(add.status, 0, add.stderr);
  }
  assert.notEqual(
    fingerprintGitWorkingTree(collisionRepoA),
    fingerprintGitWorkingTree(collisionRepoB)
  );

  const gitlinkParent = path.join(tmp, 'gitlink-parent');
  mkdirp(path.join(gitlinkParent, 'vendor', 'sub'));
  const initGitlinkParent = spawnSync('git', ['init'], {
    cwd: gitlinkParent,
    encoding: 'utf8'
  });
  assert.equal(initGitlinkParent.status, 0, initGitlinkParent.stderr);
  const sourceHead = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: validationSourceRoot,
    encoding: 'utf8'
  });
  assert.equal(sourceHead.status, 0, sourceHead.stderr);
  const addGitlink = spawnSync(
    'git',
    [
      'update-index',
      '--add',
      '--info-only',
      '--cacheinfo',
      `160000,${sourceHead.stdout.trim()},vendor/sub`
    ],
    { cwd: gitlinkParent, encoding: 'utf8' }
  );
  assert.equal(addGitlink.status, 0, addGitlink.stderr);
  const fingerprintModule = path.join(
    repoRoot,
    'plugins',
    'supermaestro',
    'scripts',
    'source-fingerprint.js'
  );
  const gitlinkProbe = spawnSync(
    process.execPath,
    [
      '-e',
      `const { fingerprintGitWorkingTree } = require(${JSON.stringify(fingerprintModule)}); console.log(fingerprintGitWorkingTree(${JSON.stringify(gitlinkParent)}));`
    ],
    { encoding: 'utf8', timeout: 3000 }
  );
  assert.equal(gitlinkProbe.status, 0, gitlinkProbe.stderr || gitlinkProbe.signal);
  assert.match(gitlinkProbe.stdout, /^git-working-tree:[a-f0-9]{64}\n$/);

  const boundaryWorkbench = path.join(tmp, 'source-root-boundary');
  mustPass(['init', boundaryWorkbench, '--name', 'Source Boundary', '--mode', 'standard']);
  const initBoundaryGit = spawnSync('git', ['init'], {
    cwd: boundaryWorkbench,
    encoding: 'utf8'
  });
  assert.equal(initBoundaryGit.status, 0, initBoundaryGit.stderr);
  write(path.join(boundaryWorkbench, 'src.js'), 'module.exports = true;\n');
  const addBoundarySource = spawnSync('git', ['add', 'src.js'], {
    cwd: boundaryWorkbench,
    encoding: 'utf8'
  });
  assert.equal(addBoundarySource.status, 0, addBoundarySource.stderr);
  mustFail(
    ['source-revision', boundaryWorkbench, '--source-root', boundaryWorkbench],
    /sourceRoot must not be the workbench/
  );

  const workbench = path.join(tmp, 'documents', 'demo', 'workbench');
  mustPass(['init', workbench, '--name', 'Validation Demo', '--mode', 'standard']);
  mustPass(['scaffold', workbench, '--e2e', 'true', '--visual', 'true']);

  const state = readJson(path.join(workbench, 'state.json'));
  assert.equal(state.artifacts.triggers.e2e, true);
  assert.equal(state.artifacts.triggers.visual, true);

  const contractPath = path.join(workbench, 'specs', 'machine', 'validation-contract.json');
  assert.equal(fs.existsSync(contractPath), true);
  const scaffoldedContract = readJson(contractPath);
  assert.equal(scaffoldedContract.e2e.required, true);
  assert.equal(scaffoldedContract.visual.required, true);
  mustPass(['scaffold', workbench]);
  const rescaffoldedState = readJson(path.join(workbench, 'state.json'));
  assert.equal(rescaffoldedState.artifacts.triggers.e2e, true);
  assert.equal(rescaffoldedState.artifacts.triggers.visual, true);
  mustPass(['scaffold', workbench, '--e2e', 'false', '--visual', 'false']);
  const downgradeAttemptState = readJson(path.join(workbench, 'state.json'));
  assert.equal(downgradeAttemptState.artifacts.triggers.e2e, true);
  assert.equal(downgradeAttemptState.artifacts.triggers.visual, true);
  mustFail(['check-contracts', workbench, '--strict', 'true'], /cases must contain at least one case/);

  const strictWorkbench = path.join(tmp, 'strict', 'documents', 'demo', 'workbench');
  mustPass(['init', strictWorkbench, '--name', 'Strict Visual Demo', '--mode', 'strict']);
  write(
    path.join(tmp, 'strict', 'documents', 'demo', 'source', 'ui', 'manifest.json'),
    '{"boards":[{"name":"Demo"}]}\n'
  );
  mustPass(['scaffold', strictWorkbench, '--ui', 'true']);
  const strictState = readJson(path.join(strictWorkbench, 'state.json'));
  assert.equal(strictState.artifacts.triggers.visual, false);
  assert.equal(
    fs.existsSync(path.join(strictWorkbench, 'specs', 'machine', 'validation-contract.json')),
    false
  );
  mustPass(['scaffold', strictWorkbench, '--visual', 'true']);
  const strictVisualState = readJson(path.join(strictWorkbench, 'state.json'));
  assert.equal(strictVisualState.artifacts.triggers.visual, true);
  assert.equal(
    readJson(path.join(strictWorkbench, 'specs', 'machine', 'validation-contract.json')).visual
      .required,
    true
  );

  seedReviewableWorkbench(workbench);
  writeValidationContract(workbench);
  assert.equal(mustPass(['source-revision', workbench]).stdout.trim(), sourceRevision);
  approvePlan(workbench);

  mustFail(
    [
      'evidence',
      workbench,
      '--type',
      'test.visual',
      '--platform',
      'weapp',
      '--data-mode',
      'fixture',
      '--result',
      'blocked',
      '--case-ids',
      'VIS-1,VIS-2',
      '--reason',
      '两个视觉状态暂时无法截图',
      '--accepted-skip',
      'true',
      '--confirmed-by',
      'user',
      '--confirmation',
      '用户确认本轮接受两个状态阻塞'
    ],
    /exactly one case/
  );

  mustFail(['verify', workbench], /test\.e2e evidence is missing/);
  mustFail(
    ['evidence', workbench, '--type', 'test.e2e', '--result', 'passed'],
    /--platform/
  );
  mustFail(
    [
      'evidence',
      workbench,
      '--type',
      'test.e2e',
      '--platform',
      'weapp',
      '--data-mode',
      'uat',
      '--command',
      'npm run test:e2e:weapp',
      '--result',
      'passed',
      '--required',
      '1',
      '--executed',
      '1',
      '--passed',
      '1',
      '--failed',
      '0',
      '--case-ids',
      'E2E-1',
      '--artifacts',
      'reports/artifacts/e2e.json'
    ],
    /--exit-code/
  );

  const artifacts = path.join(workbench, 'reports', 'artifacts');
  write(path.join(artifacts, 'e2e.json'), '{"status":"passed"}\n');
  write(path.join(artifacts, 'visual.json'), '{"status":"passed"}\n');
  write(path.join(artifacts, 'baseline-manifest.json'), '{"version":1}\n');
  write(path.join(artifacts, 'board-1.expected.png'), 'baseline');
  write(path.join(artifacts, 'board-1.actual.png'), 'actual');
  write(path.join(artifacts, 'board-1.diff.png'), 'diff');

  const passedE2eEvidence = [
    'evidence',
    workbench,
    '--type',
    'test.e2e',
    '--phase',
    'review',
    '--platform',
    'weapp',
    '--data-mode',
    'uat',
    '--command',
    'npm run test:e2e:weapp',
    '--result',
    'passed',
    '--required',
    '1',
    '--executed',
    '1',
    '--passed',
    '1',
    '--failed',
    '0',
    '--case-ids',
    'E2E-1',
    '--artifacts',
    'reports/artifacts/e2e.json',
    '--report',
    'reports/artifacts/e2e.json',
    '--exit-code',
    '0',
    '--source-revision',
    sourceRevision
  ];
  mustPass(passedE2eEvidence);

  mustFail(
    [
      'evidence',
      workbench,
      '--type',
      'test.visual',
      '--phase',
      'review',
      '--platform',
      'weapp',
      '--data-mode',
      'fixture',
      '--command',
      'npm run test:e2e:weapp:visual',
      '--result',
      'passed',
      '--required',
      '1',
      '--executed',
      '1',
      '--passed',
      '1',
      '--failed',
      '0',
      '--case-ids',
      'VIS-1',
      '--artifacts',
      'reports/artifacts/visual.json',
      '--baseline-manifest',
      'reports/artifacts/baseline-manifest.json',
      '--report',
      'reports/artifacts/visual.json',
      '--actual',
      'reports/artifacts/board-1.actual.png',
      '--expected',
      'reports/artifacts/board-1.expected.png',
      '--diff',
      'reports/artifacts/board-1.diff.png',
      '--exit-code',
      '0',
      '--source-revision',
      sourceRevision,
      '--purpose',
      'design-conformance',
      '--baseline-hash',
      baselineHash,
      '--diff-ratio',
      '0.02',
      '--max-diff-ratio',
      '0.05',
      '--masked-ratio',
      '0.01'
    ],
    /--mask-reason/
  );

  mustPass([
    'evidence',
    workbench,
    '--type',
    'test.visual',
    '--phase',
    'review',
    '--platform',
    'weapp',
    '--data-mode',
    'fixture',
    '--command',
    'npm run test:e2e:weapp:visual',
    '--result',
    'passed',
    '--required',
    '1',
    '--executed',
    '1',
    '--passed',
    '1',
    '--failed',
    '0',
    '--case-ids',
    'VIS-1',
    '--artifacts',
    'reports/artifacts/visual.json',
    '--baseline-manifest',
    'reports/artifacts/baseline-manifest.json',
    '--report',
    'reports/artifacts/visual.json',
    '--actual',
    'reports/artifacts/board-1.actual.png',
    '--expected',
    'reports/artifacts/board-1.expected.png',
    '--diff',
    'reports/artifacts/board-1.diff.png',
    '--exit-code',
    '0',
    '--source-revision',
    sourceRevision,
    '--purpose',
    'design-conformance',
    '--baseline-hash',
    baselineHash,
    '--diff-ratio',
    '0.02',
    '--max-diff-ratio',
    '0.05',
    '--masked-ratio',
    '0.01',
    '--mask-reason',
    '设计稿批注像素'
  ]);

  mustPass(['verify', workbench]);

  const evidenceFile = path.join(workbench, 'reports', 'evidence.jsonl');
  write(path.join(validationSourceRoot, 'src.js'), 'module.exports = "source-v2";\n');
  mustFail(['verify', workbench], /current Git working tree/);
  write(path.join(validationSourceRoot, 'src.js'), 'module.exports = "source-v1";\n');
  mustPass(['verify', workbench]);

  write(path.join(artifacts, 'e2e.json'), '{"status":"tampered"}\n');
  mustFail(['verify', workbench], /artifact hash changed after execution/);
  write(path.join(artifacts, 'e2e.json'), '{"status":"passed"}\n');
  mustPass(['verify', workbench]);

  const unknownE2eEvidence = [...passedE2eEvidence];
  unknownE2eEvidence[unknownE2eEvidence.indexOf('E2E-1')] = 'E2E-OLD';
  mustFail(unknownE2eEvidence, /unknown contract case/);

  const latestE2e = readJsonLines(evidenceFile).filter(entry => entry.type === 'test.e2e').at(-1);
  appendJsonLine(evidenceFile, {
    ...latestE2e,
    at: '2026-07-20T00:00:01.000Z',
    caseIds: ['E2E-OLD']
  });
  mustPass(['verify', workbench]);

  const cleanEvidence = fs.readFileSync(evidenceFile, 'utf8');
  fs.appendFileSync(evidenceFile, '{"type":"test.e2e"\n');
  mustFail(['verify', workbench], /reports\/evidence\.jsonl:\d+/);
  fs.writeFileSync(evidenceFile, cleanEvidence);
  mustPass(['verify', workbench]);

  const latestVisual = readJsonLines(evidenceFile)
    .filter(entry => entry.type === 'test.visual')
    .at(-1);
  appendJsonLine(evidenceFile, {
    ...latestVisual,
    at: '2026-07-20T00:00:02.000Z',
    purpose: 'regression'
  });
  mustFail(['verify', workbench], /purpose does not match contract case VIS-1/);
  appendJsonLine(evidenceFile, { ...latestVisual, at: '2026-07-20T00:00:03.000Z' });
  mustPass(['verify', workbench]);

  write(path.join(artifacts, 'board-1.other.png'), 'not-the-baseline');
  appendJsonLine(evidenceFile, {
    ...latestVisual,
    at: '2026-07-20T00:00:04.000Z',
    expected: 'reports/artifacts/board-1.other.png'
  });
  mustFail(['verify', workbench], /expected does not match contract baseline/);
  appendJsonLine(evidenceFile, { ...latestVisual, at: '2026-07-20T00:00:05.000Z' });
  mustPass(['verify', workbench]);

  appendJsonLine(evidenceFile, {
    ...latestE2e,
    at: '2026-07-20T00:00:06.000Z',
    sourceRevision: 'working-tree:stale'
  });
  mustFail(['verify', workbench], /sourceRevision does not match/);
  appendJsonLine(evidenceFile, { ...latestE2e, at: '2026-07-20T00:00:07.000Z' });
  mustPass(['verify', workbench]);

  const currentContract = readJson(contractPath);
  const changedContract = JSON.parse(JSON.stringify(currentContract));
  changedContract.e2e.cases[0].expected = '一级 Tab 交互规则已变化';
  write(contractPath, `${JSON.stringify(changedContract, null, 2)}\n`);
  mustFail(['verify', workbench], /contractHash does not match/);
  write(contractPath, `${JSON.stringify(currentContract, null, 2)}\n`);
  mustPass(['verify', workbench]);

  const tamperedState = readJson(path.join(workbench, 'state.json'));
  tamperedState.artifacts.triggers.e2e = false;
  tamperedState.artifacts.triggers.visual = false;
  write(path.join(workbench, 'state.json'), `${JSON.stringify(tamperedState, null, 2)}\n`);
  fs.rmSync(path.join(artifacts, 'e2e.json'));
  mustFail(['verify', workbench], /test\.e2e artifact does not exist/);
  write(path.join(artifacts, 'e2e.json'), '{"status":"passed"}\n');
  const restoredState = readJson(path.join(workbench, 'state.json'));
  restoredState.artifacts.triggers.e2e = true;
  restoredState.artifacts.triggers.visual = true;
  write(path.join(workbench, 'state.json'), `${JSON.stringify(restoredState, null, 2)}\n`);
  mustPass(['verify', workbench]);

  mustPass([
    'evidence',
    workbench,
    '--type',
    'test.e2e',
    '--phase',
    'review',
    '--platform',
    'weapp',
    '--data-mode',
    'uat',
    '--command',
    'npm run test:e2e:weapp',
    '--result',
    'failed',
    '--required',
    '1',
    '--executed',
    '1',
    '--passed',
    '0',
    '--failed',
    '1',
    '--case-ids',
    'E2E-1',
    '--artifacts',
    'reports/artifacts/e2e.json',
    '--report',
    'reports/artifacts/e2e.json',
    '--exit-code',
    '1',
    '--source-revision',
    sourceRevision
  ]);
  mustFail(['verify', workbench], /contract case E2E-1 is not passed/);
  mustPass(passedE2eEvidence);
  mustPass(['verify', workbench]);

  mustPass([
    'evidence',
    workbench,
    '--type',
    'test.visual',
    '--phase',
    'review',
    '--platform',
    'weapp',
    '--data-mode',
    'fixture',
    '--command',
    'npm run test:e2e:weapp:visual',
    '--result',
    'passed',
    '--required',
    '1',
    '--executed',
    '1',
    '--passed',
    '1',
    '--failed',
    '0',
    '--case-ids',
    'VIS-1',
    '--artifacts',
    'reports/artifacts/visual.json',
    '--baseline-manifest',
    'reports/artifacts/baseline-manifest.json',
    '--report',
    'reports/artifacts/visual.json',
    '--actual',
    'reports/artifacts/board-1.actual.png',
    '--expected',
    'reports/artifacts/board-1.expected.png',
    '--diff',
    'reports/artifacts/board-1.diff.png',
    '--exit-code',
    '0',
    '--source-revision',
    sourceRevision,
    '--purpose',
    'design-conformance',
    '--baseline-hash',
    baselineHash,
    '--diff-ratio',
    '0.02',
    '--max-diff-ratio',
    '0.05',
    '--masked-ratio',
    '0.06',
    '--mask-reason',
    '设计稿存在已确认批注'
  ]);
  mustFail(['verify', workbench], /geometry assertions are required/);

  mustPass([
    'evidence',
    workbench,
    '--type',
    'test.visual',
    '--phase',
    'review',
    '--platform',
    'weapp',
    '--data-mode',
    'fixture',
    '--command',
    'npm run test:e2e:weapp:visual',
    '--result',
    'passed',
    '--required',
    '1',
    '--executed',
    '1',
    '--passed',
    '1',
    '--failed',
    '0',
    '--case-ids',
    'VIS-1',
    '--artifacts',
    'reports/artifacts/visual.json',
    '--baseline-manifest',
    'reports/artifacts/baseline-manifest.json',
    '--report',
    'reports/artifacts/visual.json',
    '--actual',
    'reports/artifacts/board-1.actual.png',
    '--expected',
    'reports/artifacts/board-1.expected.png',
    '--diff',
    'reports/artifacts/board-1.diff.png',
    '--exit-code',
    '0',
    '--source-revision',
    sourceRevision,
    '--purpose',
    'design-conformance',
    '--baseline-hash',
    baselineHash,
    '--diff-ratio',
    '0.02',
    '--max-diff-ratio',
    '0.05',
    '--masked-ratio',
    '0.06',
    '--mask-reason',
    '设计稿存在已确认批注',
    '--geometry-assertions',
    'true'
  ]);
  mustPass(['verify', workbench]);

  fs.rmSync(path.join(artifacts, 'visual.json'));
  mustFail(['verify', workbench], /artifact does not exist/);
  write(path.join(artifacts, 'visual.json'), '{"status":"passed"}\n');
  mustPass(['request-review', workbench]);
  fs.rmSync(path.join(artifacts, 'e2e.json'));
  mustFail(
    ['approve-review', workbench, '--review', 'true', '--validation', 'true'],
    /artifact does not exist/
  );
  write(path.join(artifacts, 'e2e.json'), '{"status":"passed"}\n');
  mustPass(['approve-review', workbench, '--review', 'true', '--validation', 'true']);

  fs.rmSync(path.join(artifacts, 'e2e.json'));
  mustFail(['request-final', workbench], /artifact does not exist/);
  write(path.join(artifacts, 'e2e.json'), '{"status":"passed"}\n');
  mustPass([
    'evidence',
    workbench,
    '--type',
    'skill.used',
    '--skill',
    'superpowers:finishing-a-development-branch',
    '--phase',
    'final',
    '--summary',
    '已执行最终分支交付检查'
  ]);
  mustPass(['request-final', workbench]);
  fs.rmSync(path.join(artifacts, 'e2e.json'));
  mustFail(
    [
      'approve-final',
      workbench,
      '--confirmed-by',
      'user',
      '--confirmation',
      '用户确认最终交付',
      '--merge',
      'false',
      '--commit',
      'false',
      '--push',
      'false',
      '--cleanup',
      'false'
    ],
    /artifact does not exist/
  );
  write(path.join(artifacts, 'e2e.json'), '{"status":"passed"}\n');

  const lateTriggerWorkbench = path.join(tmp, 'late-trigger', 'workbench');
  mustPass(['init', lateTriggerWorkbench, '--name', 'Late Trigger Demo', '--mode', 'standard']);
  mustPass(['scaffold', lateTriggerWorkbench]);
  seedReviewableWorkbench(lateTriggerWorkbench);
  approvePlan(lateTriggerWorkbench);
  mustPass(['request-review', lateTriggerWorkbench]);
  mustPass([
    'approve-review',
    lateTriggerWorkbench,
    '--review',
    'true',
    '--validation',
    'true'
  ]);
  mustPass([
    'evidence',
    lateTriggerWorkbench,
    '--type',
    'skill.used',
    '--skill',
    'superpowers:finishing-a-development-branch',
    '--phase',
    'final',
    '--summary',
    '已执行最终分支交付检查'
  ]);
  mustPass(['request-final', lateTriggerWorkbench]);
  mustPass([
    'approve-final',
    lateTriggerWorkbench,
    '--confirmed-by',
    'user',
    '--confirmation',
    '用户确认最终交付动作',
    '--merge',
    'false',
    '--commit',
    'false',
    '--push',
    'true',
    '--cleanup',
    'false'
  ]);
  const lateValidation = path.join(lateTriggerWorkbench, 'reports', 'validation.md');
  const lateValidationContent = fs.readFileSync(lateValidation, 'utf8');
  fs.writeFileSync(lateValidation, '');
  mustFail(['check', lateTriggerWorkbench, '--action', 'push'], /Missing or empty/);
  fs.writeFileSync(lateValidation, lateValidationContent);
  mustPass(['check', lateTriggerWorkbench, '--action', 'push']);
  mustPass(['scaffold', lateTriggerWorkbench, '--e2e', 'true']);
  const invalidatedState = readJson(path.join(lateTriggerWorkbench, 'state.json'));
  assert.equal(invalidatedState.gates.gate2, 'pending');
  assert.equal(invalidatedState.gates.gate3, 'locked');
  assert.equal(invalidatedState.gates.gate4, 'locked');
  mustFail(['check', lateTriggerWorkbench, '--action', 'push'], /final gate is not approved/i);

  const blockedWorkbench = path.join(tmp, 'blocked', 'workbench');
  mustPass(['init', blockedWorkbench, '--name', 'Blocked Demo', '--mode', 'standard']);
  mustPass(['scaffold', blockedWorkbench, '--e2e', 'true']);
  seedReviewableWorkbench(blockedWorkbench);
  write(
    path.join(blockedWorkbench, 'specs', 'machine', 'validation-contract.json'),
    `${JSON.stringify(
      {
        version: 1,
        sourceRoot: validationSourceRoot,
        sourceRevision,
        e2e: {
          required: true,
          cases: [
            {
              id: 'E2E-BLOCKED',
              platform: 'weapp',
              dataMode: 'uat',
              command: 'npm run e2e',
              expected: '验证登录态'
            }
          ]
        },
        visual: { required: false, maxMaskedRatio: 0.05, cases: [] }
      },
      null,
      2
    )}\n`
  );
  approvePlan(blockedWorkbench);
  mustFail(
    [
      'evidence',
      blockedWorkbench,
      '--type',
      'test.e2e',
      '--platform',
      'weapp',
      '--data-mode',
      'uat',
      '--result',
      'blocked',
      '--case-ids',
      'E2E-BLOCKED',
      '--reason',
      '用户确认测试账号不可用并接受本次跳过',
      '--accepted-skip',
      'true'
    ],
    /--confirmed-by user/
  );
  mustPass([
    'evidence',
    blockedWorkbench,
    '--type',
    'test.e2e',
    '--platform',
    'weapp',
    '--data-mode',
    'uat',
    '--result',
    'blocked',
    '--case-ids',
    'E2E-BLOCKED',
    '--reason',
    '测试账号暂不可用'
  ]);
  mustFail(['verify', blockedWorkbench], /explicit user-accepted skip/);
  mustPass([
    'evidence',
    blockedWorkbench,
    '--type',
    'test.e2e',
    '--platform',
    'weapp',
    '--data-mode',
    'uat',
    '--result',
    'blocked',
    '--case-ids',
    'E2E-BLOCKED',
    '--reason',
    '用户确认测试账号不可用并接受本次跳过',
    '--accepted-skip',
    'true',
    '--confirmed-by',
    'user',
    '--confirmation',
    '用户确认接受本次 E2E 跳过'
  ]);
  mustPass(['verify', blockedWorkbench]);

  console.log('SuperMaestro validation evidence tests passed.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
