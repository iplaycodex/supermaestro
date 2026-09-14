const { spawnSync } = require('child_process');
const { fingerprintGitWorkingTree } = require('./source-fingerprint');
module.exports = function createVerificationRunner({
  requireState,
  requireCodingGate,
  requireVerificationBinding,
  resolveExecutionCwd,
  resolveWritableWorkbenchRef,
  splitList,
  resolveSafeWorkbenchReadRef,
  readPositiveInteger,
  now,
  atomicWriteText,
  sha256File,
  deepClone,
  appendEvidence,
  appendEvent
}) {
  function runVerification(workbench, options) {
    const state = requireState(workbench);
    requireCodingGate(state);
    const program = String(options.program || '').trim();
    if (!program) throw new Error('run-verification requires --program.');

    let args;
    try {
      args = options.argsJson === undefined ? [] : JSON.parse(String(options.argsJson));
    } catch {
      throw new Error('run-verification --args-json must be a JSON array of strings.');
    }
    if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) {
      throw new Error('run-verification --args-json must be a JSON array of strings.');
    }

    const binding = requireVerificationBinding(
      workbench,
      state,
      options,
      { requireExplicitWorktreeTarget: true }
    );
    const sourceRoot = binding.sourceRoot;
    const executionCwd = resolveExecutionCwd(sourceRoot, options.cwd);
    const report = String(options.report || '').trim();
    const reportFile = resolveWritableWorkbenchRef(workbench, report);
    const artifacts = Array.from(new Set([...splitList(options.artifacts), report]));
    for (const ref of artifacts) {
      resolveSafeWorkbenchReadRef(workbench, ref, {
        label: 'run-verification artifact'
      });
    }
    const timeoutMs = options.timeoutMs === undefined
      ? 10 * 60 * 1000
      : readPositiveInteger(options.timeoutMs, 'timeout-ms');
    const startedAt = now();
    const sourceRevision = fingerprintGitWorkingTree(sourceRoot, { excludePaths: [workbench] });
    const result = spawnSync(program, args, {
      cwd: executionCwd,
      encoding: 'utf8',
      shell: false,
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024
    });
    const exitCode = Number.isInteger(result.status) ? result.status : 1;
    const finishedSourceRevision = fingerprintGitWorkingTree(sourceRoot, { excludePaths: [workbench] });
    const sourceChanged = sourceRevision !== finishedSourceRevision;
    const command = JSON.stringify([program, ...args]);
    const reportContent = [
      `startedAt: ${startedAt}`,
      `finishedAt: ${now()}`,
      `cwd: ${executionCwd}`,
      `command: ${command}`,
      `exitCode: ${exitCode}`,
      `sourceRevision: ${sourceRevision}`,
      `finishedSourceRevision: ${finishedSourceRevision}`,
      sourceChanged ? 'error: Source changed during verification; rerun on stable source.' : '',
      result.error ? `error: ${result.error.message}` : '',
      '',
      '--- stdout ---',
      String(result.stdout || ''),
      '',
      '--- stderr ---',
      String(result.stderr || '')
    ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n');
    atomicWriteText(reportFile, `${reportContent.trimEnd()}\n`);

    const artifactHashes = {};
    for (const ref of artifacts) {
      const file = resolveSafeWorkbenchReadRef(workbench, ref, {
        label: 'run-verification artifact',
        mustExist: true,
        requireNonEmpty: true
      });
      artifactHashes[ref] = sha256File(file);
    }
    const entry = {
      type: 'test.command',
      at: now(),
      phase: String(options.phase || '').trim(),
      command,
      program,
      args,
      cwd: executionCwd,
      result: exitCode === 0 && !result.error && !sourceChanged ? 'passed' : 'failed',
      exitCode,
      sourceRoot,
      sourceRevision,
      finishedSourceRevision,
      sourceChanged,
      verificationTarget: deepClone(binding.identity),
      verificationTargetHash: binding.identityHash,
      fanIn: deepClone(binding.fanIn),
      fanInHash: binding.fanInHash,
      report,
      artifacts,
      artifactHashes,
      executedBy: 'supermaestro-runner',
      source: 'supermaestro-runner'
    };
    appendEvidence(workbench, entry);
    appendEvent(workbench, 'verification.executed', {
      result: entry.result,
      exitCode,
      command,
      sourceRevision,
      verificationTargetHash: binding.identityHash,
      report
    });
    if (entry.result !== 'passed') {
      if (sourceChanged) {
        throw new Error(`Source changed during verification. Rerun on stable source. See ${report}.`);
      }
      throw new Error(`Verification command failed with exit code ${exitCode}. See ${report}.`);
    }
    console.log(`Verification command passed. Evidence: ${report}`);
  }

  return {
    runVerification
  };
};
