const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEST_EVIDENCE_TYPES = new Set(['test.e2e', 'test.visual']);
const TEST_RESULTS = new Set(['passed', 'failed', 'blocked']);
const DATA_MODES = new Set(['fixture', 'mock-api', 'uat', 'real']);
const VISUAL_PURPOSES = new Set(['design-conformance', 'regression']);

function createValidationContract(triggers = {}) {
  return {
    version: 1,
    sourceRoot: '',
    sourceRevision: '',
    e2e: {
      required: triggers.e2e === true,
      cases: []
    },
    visual: {
      required: triggers.visual === true,
      maxMaskedRatio: 0.05,
      cases: []
    }
  };
}

function createTestEvidenceEntry(options = {}, metadata = {}) {
  const type = String(options.type || '').trim();
  if (!TEST_EVIDENCE_TYPES.has(type)) {
    throw new Error(`Unsupported test evidence type: ${type}`);
  }

  const platform = requiredText(options.platform, `${type} evidence requires --platform.`);
  const dataMode = requiredText(options.dataMode, `${type} evidence requires --data-mode.`);
  if (!DATA_MODES.has(dataMode)) {
    throw new Error(
      `${type} evidence --data-mode must be one of: ${Array.from(DATA_MODES).join(', ')}.`
    );
  }

  const result = requiredText(options.result, `${type} evidence requires --result.`).toLowerCase();
  if (!TEST_RESULTS.has(result)) {
    throw new Error(
      `${type} evidence --result must be one of: ${Array.from(TEST_RESULTS).join(', ')}.`
    );
  }

  const summary = String(options.summary || options.reason || '').trim();
  const caseIds = splitList(options.caseIds);
  const artifacts = splitList(options.artifacts);
  const acceptedSkipRequested = readBoolean(options.acceptedSkip, false);
  const confirmedBy = String(options.confirmedBy || '').trim();
  const confirmation = String(options.confirmation || '').trim();
  const contractHash = requiredSha256(
    metadata.contractHash,
    `${type} evidence requires a current validation contract hash.`
  );

  if (!caseIds.length) throw new Error(`${type} evidence requires --case-ids.`);

  const entry = {
    type,
    at: metadata.at || new Date().toISOString(),
    phase: options.phase || '',
    platform,
    dataMode,
    result,
    command: String(options.command || '').trim(),
    counts: {
      required: readCount(options.required, 'required'),
      executed: readCount(options.executed, 'executed'),
      passed: readCount(options.passed, 'passed'),
      failed: readCount(options.failed, 'failed')
    },
    caseIds,
    artifacts,
    acceptedSkip: acceptedSkipRequested
      ? {
          confirmedBy,
          confirmation,
          at: metadata.at || new Date().toISOString()
        }
      : null,
    contractHash,
    summary,
    limitations: splitList(options.limitations),
    sourceRevision: String(options.sourceRevision || '').trim(),
    source: options.source || metadata.source || 'agent'
  };

  if (type === 'test.visual' && entry.caseIds.length !== 1) {
    throw new Error('test.visual evidence must cover exactly one case per entry.');
  }

  if (result === 'blocked') {
    if (summary.length < 6) {
      throw new Error(`${type} blocked evidence requires --summary or --reason.`);
    }
    if (
      acceptedSkipRequested &&
      (confirmedBy.toLowerCase() !== 'user' || confirmation.length < 6)
    ) {
      throw new Error(
        `${type} accepted blocked evidence requires --confirmed-by user and --confirmation.`
      );
    }
    return entry;
  }

  if (!entry.command) throw new Error(`${type} evidence requires --command.`);
  if (!artifacts.length) throw new Error(`${type} evidence requires --artifacts.`);
  entry.exitCode = readCount(options.exitCode, 'exit-code');
  if (entry.exitCode === undefined) throw new Error(`${type} evidence requires --exit-code.`);
  if (result === 'passed' && entry.exitCode !== 0) {
    throw new Error(`${type} passed evidence requires --exit-code 0.`);
  }
  entry.sourceRevision = requiredText(
    options.sourceRevision,
    `${type} evidence requires --source-revision.`
  );
  entry.report = requiredText(options.report, `${type} evidence requires --report.`);
  validateCounts(entry);

  if (type === 'test.visual') {
    entry.baselineManifest = requiredText(
      options.baselineManifest,
      'test.visual evidence requires --baseline-manifest.'
    );
    entry.maskedRatio = readRatio(options.maskedRatio, 'masked-ratio', 0);
    entry.maskReason = String(options.maskReason || '').trim();
    entry.geometryAssertions = readBoolean(options.geometryAssertions, false);
    entry.actual = requiredText(options.actual, 'test.visual evidence requires --actual.');
    entry.expected = requiredText(options.expected, 'test.visual evidence requires --expected.');
    entry.diff = requiredText(options.diff, 'test.visual evidence requires --diff.');
    entry.purpose = requiredText(options.purpose, 'test.visual evidence requires --purpose.');
    if (!VISUAL_PURPOSES.has(entry.purpose)) {
      throw new Error(
        `test.visual evidence --purpose must be one of: ${Array.from(VISUAL_PURPOSES).join(', ')}.`
      );
    }
    entry.baselineHash = requiredSha256(
      options.baselineHash,
      'test.visual evidence requires --baseline-hash as a SHA-256 hex digest.'
    );
    entry.diffRatio = readRequiredRatio(options.diffRatio, 'diff-ratio');
    entry.maxDiffRatio = readRequiredRatio(options.maxDiffRatio, 'max-diff-ratio');
    if (entry.result === 'passed' && entry.diffRatio > entry.maxDiffRatio) {
      throw new Error('test.visual passed evidence diff ratio exceeds max diff ratio.');
    }
    if (entry.maskedRatio > 0 && !entry.maskReason) {
      throw new Error('test.visual evidence with masked pixels requires --mask-reason.');
    }
  }

  return entry;
}

function recordTestEvidenceArtifactHashes(entry, workbench) {
  if (entry.result === 'blocked') return entry;
  const artifactHashes = {};
  for (const ref of testEvidenceArtifactRefs(entry)) {
    if (!isExistingFile(workbench, ref)) {
      throw new Error(`${entry.type} evidence artifact does not exist or is empty: ${ref}.`);
    }
    artifactHashes[ref] = sha256File(resolveFile(workbench, ref));
  }
  entry.artifactHashes = artifactHashes;
  return entry;
}

function validateCounts(entry) {
  const { required, executed, passed, failed } = entry.counts;
  if ([required, executed, passed, failed].some(value => value === undefined)) {
    throw new Error(
      `${entry.type} evidence requires --required, --executed, --passed, and --failed.`
    );
  }
  if (required !== entry.caseIds.length) {
    throw new Error(`${entry.type} evidence --required must equal the number of --case-ids.`);
  }
  if (new Set(entry.caseIds).size !== entry.caseIds.length) {
    throw new Error(`${entry.type} evidence --case-ids must be unique.`);
  }
  if (executed !== required || passed + failed !== executed) {
    throw new Error(`${entry.type} evidence counts are inconsistent.`);
  }
  if (entry.result === 'passed' && (failed !== 0 || passed !== executed)) {
    throw new Error(`${entry.type} passed evidence cannot contain failed cases.`);
  }
}

function collectValidationContractIssues(contract, triggers = {}) {
  const issues = [];
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    return ['Validation contract JSON must be an object.'];
  }
  if (contract.version !== 1) issues.push('Validation contract version must be 1.');
  if (
    (triggers.e2e === true || triggers.visual === true) &&
    !String(contract.sourceRoot || '').trim()
  ) {
    issues.push('Validation contract sourceRoot is required for active test validation.');
  }
  if (
    (triggers.e2e === true || triggers.visual === true) &&
    !String(contract.sourceRevision || '').trim()
  ) {
    issues.push('Validation contract sourceRevision is required for active test validation.');
  }

  for (const kind of ['e2e', 'visual']) {
    const requiredByTrigger = triggers[kind] === true;
    const section = contract[kind];
    if (!section || typeof section !== 'object' || Array.isArray(section)) {
      issues.push(`Validation contract ${kind} section is missing.`);
      continue;
    }
    if (requiredByTrigger && section.required !== true) {
      issues.push(`Validation contract ${kind}.required must be true for the active trigger.`);
    }
    if (!Array.isArray(section.cases)) {
      issues.push(`Validation contract ${kind}.cases must be an array.`);
      continue;
    }
    if (requiredByTrigger && section.cases.length === 0) {
      issues.push(`Validation contract ${kind}.cases must contain at least one case.`);
    }
    validateContractCases(issues, kind, section.cases);
  }

  const maxMaskedRatio = contract.visual?.maxMaskedRatio;
  if (
    maxMaskedRatio !== undefined &&
    (!Number.isFinite(Number(maxMaskedRatio)) || Number(maxMaskedRatio) < 0 || Number(maxMaskedRatio) > 1)
  ) {
    issues.push('Validation contract visual.maxMaskedRatio must be between 0 and 1.');
  }

  return issues;
}

function validateContractCases(issues, kind, cases) {
  const ids = new Set();
  cases.forEach((testCase, index) => {
    const label = `${kind}.cases[${index}]`;
    if (!testCase || typeof testCase !== 'object' || Array.isArray(testCase)) {
      issues.push(`Validation contract ${label} must be an object.`);
      return;
    }
    const id = String(testCase.id || '').trim();
    if (!id) issues.push(`Validation contract ${label}.id is required.`);
    if (id && ids.has(id)) issues.push(`Validation contract ${kind} case id is duplicated: ${id}.`);
    ids.add(id);

    for (const field of ['platform', 'dataMode', 'command', 'expected']) {
      if (!String(testCase[field] || '').trim()) {
        issues.push(`Validation contract ${label}.${field} is required.`);
      }
    }
    if (testCase.dataMode && !DATA_MODES.has(String(testCase.dataMode))) {
      issues.push(
        `Validation contract ${label}.dataMode must be one of: ${Array.from(DATA_MODES).join(', ')}.`
      );
    }
    if (kind === 'visual') {
      for (const field of ['sourceRef', 'target', 'baseline', 'purpose']) {
        if (!String(testCase[field] || '').trim()) {
          issues.push(`Validation contract ${label}.${field} is required.`);
        }
      }
      if (testCase.purpose && !VISUAL_PURPOSES.has(String(testCase.purpose))) {
        issues.push(
          `Validation contract ${label}.purpose must be one of: ${Array.from(VISUAL_PURPOSES).join(', ')}.`
        );
      }
      if (!isSha256(testCase.baselineHash)) {
        issues.push(`Validation contract ${label}.baselineHash must be a SHA-256 hex digest.`);
      }
      const maxDiffRatio = Number(testCase.maxDiffRatio);
      if (!Number.isFinite(maxDiffRatio) || maxDiffRatio < 0 || maxDiffRatio > 1) {
        issues.push(`Validation contract ${label}.maxDiffRatio must be between 0 and 1.`);
      }
    }
  });
}

function collectValidationEvidenceIssues({ workbench, triggers = {}, contract, evidence = [] }) {
  if (triggers.e2e !== true && triggers.visual !== true) return [];

  const issues = collectValidationContractIssues(contract, triggers);
  if (issues.length) return issues;

  const parseErrors = evidence.filter(entry => entry?.type === 'parse-error');
  if (parseErrors.length) {
    const lines = parseErrors.map(entry => entry.line).filter(Boolean).join(', ');
    issues.push(
      `Evidence JSONL contains invalid JSON${lines ? ` at reports/evidence.jsonl:${lines}` : ''}.`
    );
  }

  const contractHash = hashValidationContract(contract);

  if (triggers.e2e === true) {
    validateEvidenceKind(issues, {
      workbench,
      kind: 'e2e',
      contractSection: contract.e2e,
      evidence,
      contractHash,
      sourceRevision: contract.sourceRevision
    });
  }
  if (triggers.visual === true) {
    validateEvidenceKind(issues, {
      workbench,
      kind: 'visual',
      contractSection: contract.visual,
      evidence,
      contractHash,
      sourceRevision: contract.sourceRevision
    });
  }
  return issues;
}

function validateEvidenceKind(
  issues,
  { workbench, kind, contractSection, evidence, contractHash, sourceRevision }
) {
  const type = `test.${kind}`;
  const entries = evidence.filter(entry => entry?.type === type);
  if (!entries.length) {
    issues.push(`${type} evidence is missing.`);
    return;
  }

  const latestByCaseId = new Map();
  entries.forEach(entry => {
    for (const caseId of Array.isArray(entry.caseIds) ? entry.caseIds : []) {
      latestByCaseId.set(caseId, entry);
    }
  });

  for (const testCase of contractSection.cases) {
    const entry = latestByCaseId.get(testCase.id);
    if (!entry) {
      issues.push(`${type} evidence does not cover contract case ${testCase.id}.`);
      continue;
    }
    validateStoredEntry(issues, {
      workbench,
      kind,
      entry,
      testCase,
      contractSection,
      contractHash,
      sourceRevision
    });
  }
}

function validateStoredEntry(
  issues,
  { workbench, kind, entry, testCase, contractSection, contractHash, sourceRevision }
) {
  const type = `test.${kind}`;
  if (entry.contractHash !== contractHash) {
    issues.push(`${type} evidence contractHash does not match the current validation contract.`);
  }
  if (entry.platform !== testCase.platform || entry.dataMode !== testCase.dataMode) {
    issues.push(`${type} evidence platform/dataMode does not match contract case ${testCase.id}.`);
  }
  if (entry.result === 'blocked') {
    const skip = entry.acceptedSkip;
    if (
      !skip ||
      String(skip.confirmedBy || '').toLowerCase() !== 'user' ||
      String(skip.confirmation || '').trim().length < 6
    ) {
      issues.push(`${type} blocked case ${testCase.id} requires explicit user-accepted skip.`);
    }
    if (String(entry.summary || '').trim().length < 6) {
      issues.push(`${type} blocked case ${testCase.id} requires a reason.`);
    }
    return;
  }

  if (entry.command !== testCase.command) {
    issues.push(`${type} evidence command does not match contract case ${testCase.id}.`);
  }

  if (entry.result !== 'passed') {
    issues.push(`${type} contract case ${testCase.id} is not passed.`);
    return;
  }

  try {
    validateCounts(entry);
  } catch (error) {
    issues.push(error.message);
  }

  const artifacts = Array.isArray(entry.artifacts) ? entry.artifacts : [];
  if (!artifacts.length) issues.push(`${type} passed evidence requires artifacts.`);
  for (const artifact of artifacts) {
    if (!isExistingFile(workbench, artifact)) {
      issues.push(`${type} artifact does not exist: ${artifact}.`);
    }
  }
  for (const [label, ref] of [['report', entry.report]]) {
    if (!isExistingFile(workbench, ref)) {
      issues.push(`${type} ${label} does not exist: ${ref || '-'}.`);
    }
  }
  if (!Number.isInteger(entry.exitCode) || entry.exitCode !== 0) {
    issues.push(`${type} passed evidence must have exitCode 0.`);
  }
  if (!String(entry.sourceRevision || '').trim()) {
    issues.push(`${type} passed evidence requires sourceRevision.`);
  } else if (entry.sourceRevision !== sourceRevision) {
    issues.push(`${type} evidence sourceRevision does not match the validation contract.`);
  }

  if (kind === 'visual') {
    if (!isExistingFile(workbench, entry.baselineManifest)) {
      issues.push(`test.visual baseline manifest does not exist: ${entry.baselineManifest || '-'}.`);
    }
    if (!isExistingFile(workbench, testCase.baseline)) {
      issues.push(`test.visual baseline does not exist for case ${testCase.id}: ${testCase.baseline}.`);
    } else {
      const actualHash = sha256File(resolveFile(workbench, testCase.baseline));
      if (actualHash !== String(testCase.baselineHash).toLowerCase()) {
        issues.push(`test.visual baseline hash does not match contract case ${testCase.id}.`);
      }
    }
    for (const [label, ref] of [
      ['actual', entry.actual],
      ['expected', entry.expected],
      ['diff', entry.diff]
    ]) {
      if (!isExistingFile(workbench, ref)) {
        issues.push(`test.visual ${label} does not exist: ${ref || '-'}.`);
      }
    }
    const maskedRatio = Number(entry.maskedRatio || 0);
    if (maskedRatio > 0 && !String(entry.maskReason || '').trim()) {
      issues.push(`test.visual masked case ${testCase.id} requires a mask reason.`);
    }
    const maxMaskedRatio = Number(contractSection.maxMaskedRatio ?? 0.05);
    if (maskedRatio > maxMaskedRatio && entry.geometryAssertions !== true) {
      issues.push(
        `test.visual masked ratio for case ${testCase.id} exceeds ${maxMaskedRatio}; geometry assertions are required.`
      );
    }
    if (!VISUAL_PURPOSES.has(entry.purpose)) {
      issues.push(`test.visual purpose is invalid for case ${testCase.id}.`);
    }
    if (entry.purpose !== testCase.purpose) {
      issues.push(`test.visual purpose does not match contract case ${testCase.id}.`);
    }
    if (!isSameFileRef(workbench, entry.expected, testCase.baseline)) {
      issues.push(`test.visual expected does not match contract baseline for case ${testCase.id}.`);
    } else if (
      isExistingFile(workbench, entry.expected) &&
      sha256File(resolveFile(workbench, entry.expected)) !== String(testCase.baselineHash).toLowerCase()
    ) {
      issues.push(`test.visual expected hash does not match contract case ${testCase.id}.`);
    }
    if (entry.baselineHash !== String(testCase.baselineHash).toLowerCase()) {
      issues.push(`test.visual evidence baselineHash does not match contract case ${testCase.id}.`);
    }
    if (entry.maxDiffRatio !== Number(testCase.maxDiffRatio)) {
      issues.push(`test.visual maxDiffRatio does not match contract case ${testCase.id}.`);
    }
    if (!Number.isFinite(entry.diffRatio) || entry.diffRatio > entry.maxDiffRatio) {
      issues.push(`test.visual diffRatio exceeds maxDiffRatio for case ${testCase.id}.`);
    }
  }

  validateStoredArtifactHashes(issues, workbench, entry);
}

function validateStoredArtifactHashes(issues, workbench, entry) {
  const hashes = entry.artifactHashes;
  for (const ref of testEvidenceArtifactRefs(entry)) {
    const expectedHash = hashes && hashes[ref];
    if (!isSha256(expectedHash)) {
      issues.push(`${entry.type} evidence artifact hash is missing or invalid: ${ref}.`);
      continue;
    }
    if (isExistingFile(workbench, ref)) {
      const actualHash = sha256File(resolveFile(workbench, ref));
      if (actualHash !== String(expectedHash).toLowerCase()) {
        issues.push(`${entry.type} evidence artifact hash changed after execution: ${ref}.`);
      }
    }
  }
}

function testEvidenceArtifactRefs(entry) {
  const refs = [...(Array.isArray(entry.artifacts) ? entry.artifacts : []), entry.report];
  if (entry.type === 'test.visual') {
    refs.push(entry.baselineManifest, entry.actual, entry.expected, entry.diff);
  }
  return Array.from(new Set(refs.map(ref => String(ref || '').trim()).filter(Boolean)));
}

function isExistingFile(workbench, ref) {
  const value = String(ref || '').trim();
  if (!value) return false;
  const file = path.isAbsolute(value) ? value : path.join(workbench, value);
  return fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size > 0;
}

function isSameFileRef(workbench, left, right) {
  const leftValue = String(left || '').trim();
  const rightValue = String(right || '').trim();
  if (!leftValue || !rightValue) return false;
  return path.resolve(workbench, leftValue) === path.resolve(workbench, rightValue);
}

function resolveFile(workbench, ref) {
  const value = String(ref || '').trim();
  return path.isAbsolute(value) ? value : path.join(workbench, value);
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function hashValidationContract(contract) {
  return crypto.createHash('sha256').update(stableStringify(contract)).digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function requiredText(value, message) {
  const text = String(value || '').trim();
  if (!text) throw new Error(message);
  return text;
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || '').trim());
}

function requiredSha256(value, message) {
  const text = String(value || '').trim().toLowerCase();
  if (!isSha256(text)) throw new Error(message);
  return text;
}

function readCount(value, label) {
  if (value === undefined || value === null || value === '') return undefined;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`test evidence --${label} must be a non-negative integer.`);
  }
  return count;
}

function readRatio(value, label, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new Error(`test evidence --${label} must be between 0 and 1.`);
  }
  return ratio;
}

function readRequiredRatio(value, label) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`test.visual evidence requires --${label}.`);
  }
  return readRatio(value, label);
}

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true' || value === '1' || value === 'yes') return true;
  if (value === false || value === 'false' || value === '0' || value === 'no') return false;
  return fallback;
}

module.exports = {
  collectValidationContractIssues,
  collectValidationEvidenceIssues,
  createTestEvidenceEntry,
  createValidationContract,
  hashValidationContract,
  recordTestEvidenceArtifactHashes
};
