#!/usr/bin/env node

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  collectValidationEvidenceIssues,
  createTestEvidenceEntry,
  hashValidationContract,
  recordTestEvidenceArtifactHashes
} = require('../plugins/supermaestro/scripts/validation-evidence');

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function tryCreateSymlink(target, link, type) {
  try {
    fs.symlinkSync(target, link, type);
    return true;
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) return false;
    throw error;
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-evidence-security-'));

try {
  const requirementRoot = path.join(tmp, 'documents', 'demo');
  const workbench = path.join(requirementRoot, 'workbench');
  const sourceUi = path.join(requirementRoot, 'source', 'ui');
  const inputUi = path.join(requirementRoot, 'input', 'ui');
  const workbenchUi = path.join(workbench, 'ui');
  const reports = path.join(workbench, 'reports');
  const baselineContent = 'trusted-baseline';
  const baselineHash = sha256(baselineContent);

  write(path.join(sourceUi, 'board.expected.png'), baselineContent);
  write(path.join(inputUi, 'baseline-manifest.json'), '{"version":1}\n');
  write(path.join(workbenchUi, 'local.expected.png'), baselineContent);
  write(path.join(reports, 'visual.json'), '{"status":"passed"}\n');
  write(path.join(reports, 'actual.png'), 'actual');
  write(path.join(reports, 'diff.png'), 'diff');
  write(path.join(requirementRoot, 'secret.txt'), 'secret');

  const contract = {
    version: 1,
    sourceRoot: '/project',
    sourceRevision: 'git-working-tree:trusted',
    e2e: {
      required: false,
      cases: []
    },
    visual: {
      required: true,
      maxMaskedRatio: 0.05,
      cases: [
        {
          id: 'VIS-SECURITY',
          platform: 'weapp',
          dataMode: 'fixture',
          command: 'npm run visual',
          expected: '视觉结果匹配',
          sourceRef: 'BOARD-SECURITY',
          target: 'pages/security/index',
          baseline: '../source/ui/board.expected.png',
          baselineHash,
          purpose: 'design-conformance',
          maxDiffRatio: 0.05
        }
      ]
    }
  };

  const entry = createTestEvidenceEntry(
    {
      type: 'test.visual',
      platform: 'weapp',
      dataMode: 'fixture',
      result: 'passed',
      command: 'npm run visual',
      required: '1',
      executed: '1',
      passed: '1',
      failed: '0',
      caseIds: 'VIS-SECURITY',
      artifacts: 'reports/visual.json',
      report: 'reports/visual.json',
      baselineManifest: '../input/ui/baseline-manifest.json',
      actual: 'reports/actual.png',
      expected: '../source/ui/board.expected.png',
      diff: 'reports/diff.png',
      exitCode: '0',
      sourceRevision: contract.sourceRevision,
      purpose: 'design-conformance',
      baselineHash,
      diffRatio: '0.01',
      maxDiffRatio: '0.05'
    },
    {
      contractHash: hashValidationContract(contract),
      at: '2026-07-24T00:00:00.000Z'
    }
  );

  recordTestEvidenceArtifactHashes(entry, workbench);
  assert.deepEqual(
    collectValidationEvidenceIssues({
      workbench,
      triggers: { visual: true },
      contract,
      evidence: [entry]
    }),
    []
  );

  const localBaselineEntry = clone(entry);
  localBaselineEntry.expected = 'ui/local.expected.png';
  localBaselineEntry.baselineManifest = 'ui/local.expected.png';
  assert.doesNotThrow(() =>
    recordTestEvidenceArtifactHashes(localBaselineEntry, workbench)
  );

  const customWorkbench = path.join(tmp, 'custom-workbench-name');
  write(path.join(customWorkbench, 'source', 'ui', 'board.expected.png'), baselineContent);
  write(path.join(customWorkbench, 'input', 'ui', 'baseline-manifest.json'), '{"version":1}\n');
  write(path.join(customWorkbench, 'reports', 'visual.json'), '{"status":"passed"}\n');
  write(path.join(customWorkbench, 'reports', 'actual.png'), 'actual');
  write(path.join(customWorkbench, 'reports', 'diff.png'), 'diff');
  const customEntry = clone(entry);
  customEntry.artifacts = ['reports/visual.json'];
  customEntry.report = 'reports/visual.json';
  customEntry.baselineManifest = 'input/ui/baseline-manifest.json';
  customEntry.actual = 'reports/actual.png';
  customEntry.expected = 'source/ui/board.expected.png';
  customEntry.diff = 'reports/diff.png';
  assert.doesNotThrow(() =>
    recordTestEvidenceArtifactHashes(customEntry, customWorkbench)
  );

  write(path.join(tmp, 'source', 'ui', 'outside.expected.png'), baselineContent);
  const escapedCustomExpected = clone(customEntry);
  escapedCustomExpected.expected = '../source/ui/outside.expected.png';
  assert.throws(
    () => recordTestEvidenceArtifactHashes(escapedCustomExpected, customWorkbench),
    /source\/ui, input\/ui, or workbench\/ui/
  );

  const absoluteReport = clone(entry);
  absoluteReport.report = path.join(reports, 'visual.json');
  assert.throws(
    () => recordTestEvidenceArtifactHashes(absoluteReport, workbench),
    /path must be relative/
  );

  const escapedArtifact = clone(entry);
  escapedArtifact.artifacts = ['../secret.txt'];
  assert.throws(
    () => recordTestEvidenceArtifactHashes(escapedArtifact, workbench),
    /must stay inside workbench/
  );

  const escapedReport = clone(entry);
  escapedReport.report = '../../outside.json';
  assert.throws(
    () => recordTestEvidenceArtifactHashes(escapedReport, workbench),
    /must stay inside workbench/
  );

  const escapedActual = clone(entry);
  escapedActual.actual = '../source/ui/board.expected.png';
  assert.throws(
    () => recordTestEvidenceArtifactHashes(escapedActual, workbench),
    /must stay inside workbench/
  );

  const arbitraryExpected = clone(entry);
  arbitraryExpected.expected = '../secret.txt';
  assert.throws(
    () => recordTestEvidenceArtifactHashes(arbitraryExpected, workbench),
    /source\/ui, input\/ui, or workbench\/ui/
  );

  const absoluteExpected = clone(entry);
  absoluteExpected.expected = path.join(sourceUi, 'board.expected.png');
  assert.throws(
    () => recordTestEvidenceArtifactHashes(absoluteExpected, workbench),
    /path must be relative/
  );

  const reportLink = path.join(reports, 'report-link.json');
  if (tryCreateSymlink('visual.json', reportLink, 'file')) {
    const linkedReport = clone(entry);
    linkedReport.report = 'reports/report-link.json';
    assert.throws(
      () => recordTestEvidenceArtifactHashes(linkedReport, workbench),
      /must not contain symbolic links/
    );
  }

  const manifestLink = path.join(inputUi, 'manifest-link.json');
  if (tryCreateSymlink('baseline-manifest.json', manifestLink, 'file')) {
    const linkedManifest = clone(entry);
    linkedManifest.baselineManifest = '../input/ui/manifest-link.json';
    assert.throws(
      () => recordTestEvidenceArtifactHashes(linkedManifest, workbench),
      /must not contain symbolic links/
    );
  }

  const nestedBaselineDir = path.join(sourceUi, 'nested');
  write(path.join(nestedBaselineDir, 'board.png'), baselineContent);
  if (tryCreateSymlink('nested', path.join(sourceUi, 'nested-link'), 'dir')) {
    const linkedExpected = clone(entry);
    linkedExpected.expected = '../source/ui/nested-link/board.png';
    assert.throws(
      () => recordTestEvidenceArtifactHashes(linkedExpected, workbench),
      /must not contain symbolic links/
    );
  }

  const tamperedEntry = clone(entry);
  tamperedEntry.report = path.join(reports, 'visual.json');
  const tamperedIssues = collectValidationEvidenceIssues({
    workbench,
    triggers: { visual: true },
    contract,
    evidence: [tamperedEntry]
  });
  assert.ok(
    tamperedIssues.some(issue =>
      /test\.visual report reference is invalid: path must be relative/.test(issue)
    )
  );

  const escapedContract = clone(contract);
  escapedContract.visual.cases[0].baseline = '../secret.txt';
  const escapedContractEntry = clone(entry);
  escapedContractEntry.contractHash = hashValidationContract(escapedContract);
  const escapedContractIssues = collectValidationEvidenceIssues({
    workbench,
    triggers: { visual: true },
    contract: escapedContract,
    evidence: [escapedContractEntry]
  });
  assert.ok(
    escapedContractIssues.some(issue =>
      /baseline for case VIS-SECURITY reference is invalid/.test(issue)
    )
  );

  console.log('PASS validation evidence path security tests');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
