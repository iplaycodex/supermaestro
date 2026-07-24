#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const {
  collectValidationContractIssues,
  collectValidationEvidenceIssues,
  createTestEvidenceEntry,
  createValidationContract,
  hashValidationContract,
  recordTestEvidenceArtifactHashes
} = require('./validation-evidence');
const {
  fingerprintGitWorkingTree,
  resolveValidationSourceRoot
} = require('./source-fingerprint');

const WORKFLOW_VERSION = 3;
const MIGRATABLE_WORKFLOW_VERSIONS = new Set([2]);
const MISSION_ASSETS_DIR = path.resolve(__dirname, '../skills/mission-control/assets');
const VALID_MODES = new Set(['lite', 'standard', 'strict']);
const VALID_EXECUTION_MODES = new Set([
  'main-serial',
  'single-worktree-serial',
  'multi-worktree-parallel'
]);
const VALID_VISUAL_DECISIONS = new Set(['required', 'not-applicable', 'blocked']);
const DEFAULT_MODE = 'standard';
const GENERATED_WORKBENCH_DIRS = new Set(['gates', 'plans', 'reports', 'reviews', 'specs', 'ui', 'workbench']);
const API_MATERIAL_NAME_RE = /(api|swagger|openapi|postman|mock|interface|interfaces|接口|后端|联调|knife4j)/i;

const GATE_ALIASES = {
  gate1: 'scope',
  gate2: 'plan',
  gate3: 'review',
  gate4: 'final'
};

const LEGACY_GATE_NAMES = {
  scope: 'gate1',
  plan: 'gate2',
  review: 'gate3',
  final: 'gate4'
};

const SCAFFOLD_OPTIONS = [
  'api',
  'ui',
  'uiCode',
  'uiCoding',
  'e2e',
  'visual',
  'behavior',
  'review',
  'worktree',
  'subagents',
  'reviewAgent',
  'reviewAgentCheckpoint',
  'brainstorming',
  'contractChanges',
  'integration'
];

const EVIDENCE_OPTIONS = [
  'type',
  'phase',
  'platform',
  'dataMode',
  'purpose',
  'command',
  'result',
  'required',
  'executed',
  'passed',
  'failed',
  'caseIds',
  'artifacts',
  'report',
  'baselineManifest',
  'baselineHash',
  'expected',
  'actual',
  'diff',
  'diffRatio',
  'maxDiffRatio',
  'maskedRatio',
  'maskReason',
  'geometryAssertions',
  'exitCode',
  'sourceRevision',
  'acceptedSkip',
  'confirmedBy',
  'confirmation',
  'limitations',
  'summary',
  'reason',
  'source'
];

const VERIFY_OPTIONS = ['reviewPack', 'validation', 'strict', 'target'];

const COMMAND_OPTIONS = new Map([
  ['init', new Set(['name', 'mode', 'sourceRoot', 'scaffold', ...SCAFFOLD_OPTIONS])],
  ['status', new Set(['json'])],
  ['next', new Set(['json'])],
  ['resume', new Set(['json'])],
  ['scaffold', new Set(['mode', ...SCAFFOLD_OPTIONS])],
  ['check-workbench', new Set()],
  ['check-contracts', new Set(['strict', 'phase', 'silent'])],
  ['check-reviewability', new Set(['strict', 'json', 'reviewPack'])],
  ['source-revision', new Set(['sourceRoot', 'target'])],
  ['run-verification', new Set([
    'program',
    'argsJson',
    'report',
    'artifacts',
    'phase',
    'cwd',
    'timeoutMs',
    'target'
  ])],
  ['register-worktree', new Set(['target', 'branch', 'base'])],
  ['approve-scope', new Set(['confirmedBy', 'by', 'confirmation'])],
  ['approve-plan', new Set([
    'mode',
    'executionMode',
    'confirmedBy',
    'by',
    'confirmation',
    'worktree',
    'subagents',
    'reviewAgent',
    'checkpoint',
    'syncMaterials',
    'visualDecision',
    'visualReason'
  ])],
  ['check', new Set([
    'action',
    'ui',
    'nonUi',
    'reason',
    'schemaExtract',
    'schemaMap',
    'target',
    'branch',
    'base',
    'mergeSource',
    'mergeDestination',
    'pushRemote',
    'pushRef'
  ])],
  ['verify', new Set(VERIFY_OPTIONS)],
  ['request-review', new Set(VERIFY_OPTIONS)],
  ['approve-review', new Set([
    'reviewAccepted',
    'validationAccepted',
    'confirmedBy',
    'by',
    'confirmation',
    ...VERIFY_OPTIONS
  ])],
  ['request-final', new Set(VERIFY_OPTIONS)],
  ['approve-final', new Set([
    'confirmedBy',
    'by',
    'confirmation',
    'merge',
    'commit',
    'push',
    'cleanup',
    'target',
    'cleanupTargetsJson',
    'mergeSource',
    'mergeDestination',
    'pushRemote',
    'pushRef',
    ...VERIFY_OPTIONS
  ])],
  ['evidence', new Set(EVIDENCE_OPTIONS)]
]);

const BOOLEAN_OPTIONS = new Set([
  'scaffold',
  'api',
  'ui',
  'uiCode',
  'uiCoding',
  'e2e',
  'visual',
  'behavior',
  'review',
  'reviewAccepted',
  'validationAccepted',
  'worktree',
  'subagents',
  'checkpoint',
  'syncMaterials',
  'reviewAgent',
  'reviewAgentCheckpoint',
  'brainstorming',
  'contractChanges',
  'integration',
  'strict',
  'silent',
  'json',
  'nonUi',
  'merge',
  'commit',
  'push',
  'cleanup',
  'geometryAssertions',
  'acceptedSkip'
]);

const DEFAULT_STATE = {
  workflowVersion: WORKFLOW_VERSION,
  mode: DEFAULT_MODE,
  phase: 'initialized',
  gates: {
    gate1: 'pending',
    gate2: 'locked',
    gate3: 'locked',
    gate4: 'locked'
  },
  execution: {
    mode: null,
    worktree: false,
    subagents: false,
    checkpoint: false,
    reviewAgent: false,
    syncMaterials: false
  },
  checks: {
    workbench: 'unknown',
    reviewability: 'unknown',
    validation: 'unknown'
  },
  artifacts: {},
  worktrees: {
    intents: {},
    registry: {}
  }
};

main();

function main() {
  try {
    const [command, workbenchArg, ...args] = process.argv.slice(2);
    if (!command || command === 'help' || command === '--help') {
      printHelp();
      return;
    }

    if (!workbenchArg) {
      throw new Error('Missing workbench path.');
    }

    const workbench = path.resolve(process.cwd(), workbenchArg);
    const normalized = normalizeCommand(command);
    const options = parseArgs(args);
    validateCommandOptions(normalized, options);

    switch (normalized) {
      case 'init':
        init(workbench, options);
        break;
      case 'status':
        status(workbench, options);
        break;
      case 'next':
        next(workbench, options);
        break;
      case 'resume':
        resume(workbench, options);
        break;
      case 'scaffold':
        scaffold(workbench, options);
        break;
      case 'check-workbench':
        checkWorkbench(workbench);
        break;
      case 'check-contracts':
        checkContractsCommand(workbench, options);
        break;
      case 'check-reviewability':
        checkReviewability(workbench, options);
        break;
      case 'source-revision':
        printSourceRevision(workbench, options);
        break;
      case 'run-verification':
        runVerification(workbench, options);
        break;
      case 'register-worktree':
        registerWorktree(workbench, options);
        break;
      case 'approve-scope':
        approveScope(workbench, options);
        break;
      case 'approve-plan':
        approvePlan(workbench, options);
        break;
      case 'check':
        checkAction(workbench, options);
        break;
      case 'verify':
        verify(workbench, options);
        break;
      case 'request-review':
        requestReview(workbench, options);
        break;
      case 'approve-review':
        approveReview(workbench, options);
        break;
      case 'request-final':
        requestFinal(workbench, options);
        break;
      case 'approve-final':
        approveFinal(workbench, options);
        break;
      case 'evidence':
      case 'evidence-add':
        addEvidenceCommand(workbench, options);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(`supermaestro: ${error.message}`);
    process.exit(1);
  }
}

function normalizeCommand(command) {
  const aliases = {
    'approve-gate1': 'approve-scope',
    'approve-gate2': 'approve-plan',
    'request-gate3': 'request-review',
    'approve-gate3': 'approve-review',
    'request-gate4': 'request-final',
    'approve-gate4': 'approve-final',
    'evidence-add': 'evidence'
  };
  return aliases[command] || command;
}

function init(workbench, options) {
  ensureDir(workbench);
  ensureDir(path.join(workbench, 'gates'));

  const loadedState = loadState(workbench, null);
  if (
    loadedState &&
    loadedState.workflowVersion !== WORKFLOW_VERSION &&
    !MIGRATABLE_WORKFLOW_VERSIONS.has(loadedState.workflowVersion)
  ) {
    throw new Error(
      `Unsupported workflowVersion ${loadedState.workflowVersion ?? 'missing'}; expected ${WORKFLOW_VERSION}.`
    );
  }
  const requestedMode = options.mode === undefined ? null : normalizeMode(options.mode);
  if (
    loadedState &&
    requestedMode &&
    requestedMode !== normalizeMode(loadedState.mode || DEFAULT_MODE)
  ) {
    throw new Error(
      `Workflow mode is immutable after init (${loadedState.mode || DEFAULT_MODE}). Create a new workbench to use ${requestedMode}.`
    );
  }
  const mode = requestedMode || normalizeMode(loadedState?.mode || DEFAULT_MODE);
  const requestedSourceRoot = options.sourceRoot === undefined
    ? ''
    : normalizeProjectSourceRoot(options.sourceRoot);
  if (
    loadedState?.sourceRoot &&
    requestedSourceRoot &&
    canonicalPath(loadedState.sourceRoot) !== canonicalPath(requestedSourceRoot)
  ) {
    throw new Error('Validation source root is immutable after init. Create a new workbench to change it.');
  }
  const discoveredSourceRoot = requestedSourceRoot ||
    loadedState?.sourceRoot ||
    discoverGitRoot(workbench) ||
    discoverGitRoot(requirementRoot(workbench)) ||
    '';
  if (mode !== 'lite' && !discoveredSourceRoot) {
    throw new Error('Standard/strict mode requires a Git source root. Pass --source-root <git-worktree>.');
  }
  const migratedFrom = loadedState && loadedState.workflowVersion !== WORKFLOW_VERSION
    ? loadedState.workflowVersion
    : null;
  const existing = migratedFrom === null
    ? loadedState
    : migrateWorkflowState(loadedState, {
        mode,
        sourceRoot: discoveredSourceRoot,
        workbench
      });
  const state = existing || {
    ...deepClone(DEFAULT_STATE),
    workflowVersion: WORKFLOW_VERSION,
    mode,
    gates: initialGatesForMode(mode),
    name: options.name || path.basename(requirementRoot(workbench)),
    workbench,
    sourceRoot: discoveredSourceRoot,
    createdAt: now(),
    updatedAt: now()
  };

  state.workflowVersion = WORKFLOW_VERSION;
  state.mode = normalizeMode(state.mode || DEFAULT_MODE);
  state.workbench = workbench;
  state.sourceRoot = state.sourceRoot || discoveredSourceRoot;
  state.artifacts = state.artifacts || {};
  state.checks = state.checks || deepClone(DEFAULT_STATE.checks);
  state.worktrees = normalizeWorktreeState(state.worktrees);
  delete state.policies;
  delete state.checks.policy;
  delete state.checks.policyMissing;
  state.updatedAt = now();

  saveState(workbench, state);
  writeProjection(workbench, state);
  appendEvent(workbench, 'init', { name: state.name, mode: state.mode });
  if (migratedFrom !== null) {
    appendEvent(workbench, 'workflow.migrated', {
      from: migratedFrom,
      to: WORKFLOW_VERSION,
      resetGates: ['gate2', 'gate3', 'gate4']
    });
  }

  if (readBoolean(options.scaffold, false)) {
    scaffold(workbench, options);
  }

  console.log(`Initialized SuperMaestro workbench: ${workbench}`);
  console.log(`Mode: ${state.mode}`);
  if (migratedFrom !== null) {
    console.log(
      `Migrated workflow state from v${migratedFrom} to v${WORKFLOW_VERSION}; Plan, Review, and Final gates require fresh approval.`
    );
  }
}

function migrateWorkflowState(state, { mode, sourceRoot, workbench }) {
  if (!MIGRATABLE_WORKFLOW_VERSIONS.has(state.workflowVersion)) {
    throw new Error(
      `Unsupported workflowVersion ${state.workflowVersion ?? 'missing'}; expected ${WORKFLOW_VERSION}.`
    );
  }
  const migrated = deepClone(state);
  const scopeConfirmed = migrated.gates?.gate1 === 'approved' &&
    hasGateHumanConfirmation(migrated, 'gate1');
  migrated.workflowVersion = WORKFLOW_VERSION;
  migrated.mode = mode;
  migrated.workbench = workbench;
  migrated.sourceRoot = sourceRoot;
  migrated.gates = initialGatesForMode(mode);
  migrated.execution = deepClone(DEFAULT_STATE.execution);
  migrated.phase = 'initialized';
  migrated.worktrees = { intents: {}, registry: {} };
  delete migrated.verificationSnapshot;
  delete migrated.finalActions;
  delete migrated.finalActionTargets;
  delete migrated.finalActionChecks;
  migrated.humanConfirmations = {
    ...(migrated.humanConfirmations || {})
  };
  delete migrated.humanConfirmations.gate2;
  delete migrated.humanConfirmations.gate3;
  delete migrated.humanConfirmations.gate4;
  if (scopeConfirmed) {
    migrated.gates.gate1 = 'approved';
    migrated.phase = 'scope_approved';
    if (mode !== 'lite') migrated.gates.gate2 = 'pending';
    migrated.humanConfirmations.gate1.approvalContext = gateApprovalContext(
      migrated,
      'gate1'
    );
  } else {
    delete migrated.humanConfirmations.gate1;
  }
  migrated.updatedAt = now();
  return migrated;
}

function initialGatesForMode(mode) {
  if (mode === 'lite') {
    return {
      gate1: 'pending',
      gate2: 'skipped',
      gate3: 'skipped',
      gate4: 'locked'
    };
  }
  return deepClone(DEFAULT_STATE.gates);
}

function normalizeMode(mode) {
  const value = String(mode || DEFAULT_MODE).trim().toLowerCase();
  if (!VALID_MODES.has(value)) {
    throw new Error(`Invalid workflow mode: ${mode}. Expected one of: ${Array.from(VALID_MODES).join(', ')}`);
  }
  return value;
}

function status(workbench, options = {}) {
  const state = requireState(workbench);
  if (readBoolean(options.json, false)) {
    console.log(JSON.stringify(projectState(state, workbench), null, 2));
    return;
  }
  console.log(`Name: ${state.name}`);
  console.log(`Mode: ${state.mode || DEFAULT_MODE}`);
  console.log(`Phase: ${state.phase}`);
  console.log(`Scope: ${state.gates.gate1}`);
  console.log(`Plan: ${state.gates.gate2}`);
  console.log(`Review: ${state.gates.gate3}`);
  console.log(`Final: ${state.gates.gate4}`);
  console.log(`Execution: ${state.execution?.mode || '-'}`);
  console.log(`Workbench: ${workbench}`);
}

function next(workbench, options = {}) {
  const state = requireState(workbench);
  writeProjection(workbench, state);
  if (readBoolean(options.json, false)) {
    console.log(JSON.stringify({ recommendedNext: recommendNext(state), state: projectState(state, workbench) }, null, 2));
    return;
  }
  console.log(recommendNext(state));
}

function resume(workbench, options = {}) {
  const state = requireState(workbench);
  writeProjection(workbench, state);
  if (readBoolean(options.json, false)) {
    console.log(JSON.stringify({ recommendedNext: recommendNext(state), state: projectState(state, workbench) }, null, 2));
    return;
  }
  console.log(`Resume ${state.name}: ${state.phase}`);
  console.log(`Mode: ${state.mode || DEFAULT_MODE}`);
  console.log(recommendNext(state));
}

function scaffold(workbench, options) {
  const state = requireState(workbench);
  const mode = normalizeMode(options.mode || state.mode || DEFAULT_MODE);
  if (mode !== normalizeMode(state.mode || DEFAULT_MODE)) {
    throw new Error(
      `Scaffold cannot change workflow mode from ${state.mode || DEFAULT_MODE} to ${mode}. Create a new workbench for a different mode.`
    );
  }
  const previousTriggers = state.artifacts?.triggers || {};
  const triggers = detectArtifactTriggers(
    workbench,
    options,
    mode,
    previousTriggers
  );
  const artifacts = requiredArtifactsFor(mode, triggers);
  const created = [];

  for (const artifact of artifacts) {
    const file = resolveWorkbenchRef(workbench, artifact.path);
    if (!hasNonEmptyFile(file)) {
      writeWorkbenchFileIfMissing(workbench, artifact.path, artifact.content(state, triggers));
      created.push(artifact.path);
    }
  }

  const validationPlanInvalidated = invalidatePlanForValidationExpansion(
    state,
    previousTriggers,
    triggers,
    mode
  );
  state.artifacts = {
    ...(state.artifacts || {}),
    triggers,
    files: Array.from(new Set([...(state.artifacts?.files || []), ...artifacts.map(item => item.path)])).sort(),
    scaffoldedAt: now()
  };
  state.updatedAt = now();
  saveState(workbench, state);
  writeProjection(workbench, state);
  appendEvent(workbench, 'scaffold', { mode, triggers, created, validationPlanInvalidated });
  console.log(`Scaffolded ${created.length} artifact(s) for ${mode} mode.`);
  if (created.length) {
    for (const file of created) console.log(`- ${file}`);
  }
}

function invalidatePlanForValidationExpansion(state, previousTriggers, triggers, mode) {
  const expanded = Object.keys(triggers).filter(
    kind => previousTriggers[kind] !== true && triggers[kind] === true
  );
  if (!expanded.length) return [];

  if (mode === 'lite') {
    if (state.gates.gate4 === 'final_requested' || state.gates.gate4 === 'approved') {
      state.phase = 'scope_approved';
      state.gates.gate4 = 'locked';
      delete state.finalActions;
      delete state.finalActionTargets;
      delete state.finalActionChecks;
      if (state.humanConfirmations) delete state.humanConfirmations.gate4;
    }
    return expanded;
  }

  if (state.gates.gate2 === 'approved') {
    state.phase = 'scope_approved';
    state.gates.gate2 = 'pending';
    state.gates.gate3 = 'locked';
    state.gates.gate4 = 'locked';
    state.execution = deepClone(DEFAULT_STATE.execution);
    delete state.finalActions;
    delete state.finalActionTargets;
    delete state.finalActionChecks;
    if (state.humanConfirmations) {
      delete state.humanConfirmations.gate2;
      delete state.humanConfirmations.gate3;
      delete state.humanConfirmations.gate4;
    }
  }
  return expanded;
}

function detectArtifactTriggers(workbench, options, mode, existingTriggers = {}) {
  const sticky = (name, next) => existingTriggers[name] === true || next === true;
  const explicitBoolean = (names, fallback) => {
    const name = names.find(candidate =>
      Object.prototype.hasOwnProperty.call(options, candidate)
    );
    return name ? readBoolean(options[name], fallback) : fallback;
  };
  const api = sticky('api', explicitBoolean(['api'], hasApiMaterial(workbench)));
  const ui = sticky('ui', explicitBoolean(['ui'], hasUiManifest(workbench)));
  const e2e = sticky('e2e', explicitBoolean(['e2e'], false));
  const visual = sticky('visual', explicitBoolean(['visual'], false));
  return {
    mode,
    api,
    ui,
    e2e,
    visual,
    uiCoding: sticky(
      'uiCoding',
      explicitBoolean(['uiCoding', 'uiCode'], ui && mode === 'strict')
    ),
    behavior: sticky(
      'behavior',
      explicitBoolean(['behavior'], mode !== 'lite')
    ),
    review: sticky('review', explicitBoolean(['review'], mode !== 'lite')),
    worktree: sticky('worktree', explicitBoolean(['worktree'], false)),
    subagents: sticky('subagents', explicitBoolean(['subagents'], false)),
    reviewAgent: sticky(
      'reviewAgent',
      explicitBoolean(['reviewAgent', 'reviewAgentCheckpoint'], false)
    ),
    brainstorming: sticky(
      'brainstorming',
      explicitBoolean(['brainstorming'], false)
    ),
    contractChanges: sticky(
      'contractChanges',
      explicitBoolean(['contractChanges'], false)
    ),
    integration: sticky(
      'integration',
      explicitBoolean(['integration'], false)
    )
  };
}

function requiredArtifactsFor(mode, triggers) {
  const artifacts = [
    artifact('reports/evidence.jsonl', () => ''),
    artifact('reports/validation.md', validationTemplate),
  ];

  if (triggers.e2e || triggers.visual) {
    artifacts.push(artifact('specs/machine/validation-contract.json', validationContractJsonTemplate));
  }

  if (mode === 'lite') {
    artifacts.push(artifact('brief.md', liteBriefTemplate));
    return artifacts;
  }

  artifacts.push(
    artifact('context.md', contextTemplate),
    artifact('specs/requirement-alignment.md', requirementAlignmentTemplate),
    artifact('plans/task-plan.md', taskPlanTemplate),
    artifact('plans/progress.md', progressTemplate),
    artifact('reviews/review-packs.md', reviewPacksTemplate)
  );

  if (triggers.review) artifacts.push(artifact('specs/machine/review-contract.json', reviewContractJsonTemplate));

  if (triggers.api) {
    artifacts.push(artifact('specs/api-contract.md', apiContractTemplate));
    artifacts.push(artifact('specs/machine/api-contract.json', apiContractJsonTemplate));
  }

  if (triggers.ui) {
    artifacts.push(artifact('specs/ui-contract.md', uiContractTemplate));
    artifacts.push(artifact('specs/machine/ui-contract.json', uiContractJsonTemplate));
    artifacts.push(artifact('specs/ui-material-index.md', uiMaterialIndexTemplate));
  }

  if (triggers.uiCoding) {
    artifacts.push(artifact('specs/ui-schema-extract.md', uiSchemaExtractTemplate));
  }

  if (triggers.api && triggers.ui) {
    artifacts.push(artifact('specs/page-contract-matrix.md', pageContractMatrixTemplate));
  }

  if (triggers.behavior) {
    artifacts.push(artifact('specs/behavior-contract.md', behaviorContractTemplate));
  }
  if (triggers.brainstorming) {
    artifacts.push(artifact('specs/gate-1-brainstorming-questions.md', gate1BrainstormingQuestionsTemplate));
  }

  if (triggers.worktree) {
    artifacts.push(artifact('worktrees/plan.md', worktreePlanTemplate));
    artifacts.push(
      artifact(
        'specs/machine/worktree-contract.json',
        worktreeContractJsonTemplate
      )
    );
  }
  if (triggers.subagents) artifacts.push(artifact('agents/agent-index.md', agentIndexTemplate));
  if (triggers.reviewAgent) artifacts.push(artifact('reviews/code-review/README.md', codeReviewReadmeTemplate));
  if (triggers.contractChanges) artifacts.push(artifact('contract-changes/README.md', contractChangesTemplate));
  if (triggers.integration) artifacts.push(artifact('integration/plan.md', integrationPlanTemplate));

  return artifacts;
}

function artifact(pathName, content) {
  return { path: pathName, content };
}

function checkWorkbench(workbench) {
  const state = requireState(workbench);
  state.checks = { ...(state.checks || {}) };

  const missing = requiredWorkbenchFiles(workbench, state).filter(file => !hasNonEmptyFile(resolveWorkbenchRef(workbench, file)));
  const missingAlternatives = requiredWorkbenchAlternatives(workbench, state)
    .filter(entry => !entry.refs.some(ref => hasNonEmptyFile(resolveWorkbenchRef(workbench, ref))))
    .map(entry => entry.label);
  const allMissing = missing.concat(missingAlternatives);

  if (allMissing.length) {
    failWorkbenchCheck(workbench, state, allMissing, `Workbench check failed. Missing or empty: ${allMissing.join(', ')}`);
  }

  try {
    if (isLite(state)) {
      validateLiteBrief(workbench);
    } else {
      validateRequirementAlignment(workbench);
      validateGate1BrainstormingFanIn(workbench);
    }
  } catch (error) {
    failWorkbenchCheck(workbench, state, allMissing, error.message);
  }

  state.checks.workbench = 'passed';
  state.checks.workbenchMissing = [];
  delete state.checks.workbenchError;
  state.updatedAt = now();
  saveState(workbench, state);
  appendEvent(workbench, 'check-workbench', { result: 'passed', missing: [] });
  console.log('Workbench check passed.');
}

function failWorkbenchCheck(workbench, state, missing, message) {
  state.checks.workbench = 'failed';
  state.checks.workbenchMissing = missing;
  state.checks.workbenchError = message;
  state.updatedAt = now();
  saveState(workbench, state);
  appendEvent(workbench, 'check-workbench', { result: 'failed', missing, error: message });
  throw new Error(message);
}

function checkContractsCommand(workbench, options) {
  checkContracts(workbench, {
    strict: readBoolean(options.strict, false),
    phase: options.phase || 'manual'
  });
}

function checkReviewability(workbench, options) {
  const state = requireState(workbench);
  const strict = isStrict(state) || readBoolean(options.strict, false);
  const reviewPack = options.reviewPack || 'reviews/review-packs.md';
  const failures = [];
  const warnings = [];
  const file = resolveSafeWorkbenchReadRef(workbench, reviewPack, {
    label: '--review-pack'
  });
  if (!isLite(state) && !hasNonEmptyFile(file)) {
    failures.push(`${reviewPack} is missing or empty.`);
  } else if (!isLite(state)) {
    const readiness = validateCompletionReadiness(workbench, state, {
      reviewPack,
      validation: 'reports/validation.md'
    });
    failures.push(...readiness.reviewFailures);
  }
  if (strict) failures.push(...validateStrictReviewReadiness(workbench));
  const coordination = collectCoordinationReviewability(workbench, state, reviewPack);
  failures.push(...coordination.failures);
  warnings.push(...coordination.warnings);

  state.checks.reviewability = failures.length ? 'failed' : 'passed';
  state.checks.reviewabilityMissing = failures;
  state.updatedAt = now();
  saveState(workbench, state);
  appendEvent(workbench, 'check-reviewability', {
    strict,
    result: failures.length ? 'failed' : 'passed',
    failures,
    warnings,
    metrics: coordination.metrics
  });

  if (readBoolean(options.json, false)) {
    console.log(JSON.stringify({
      strict,
      passed: failures.length === 0,
      failures,
      warnings,
      metrics: coordination.metrics
    }, null, 2));
  } else {
    for (const warning of warnings) console.log(`WARN ${warning}`);
    if (!failures.length) {
      console.log('PASS reviewability');
    } else {
      for (const failure of failures) console.log(`${strict ? 'FAIL' : 'WARN'} ${failure}`);
    }
  }
  if (strict && failures.length) {
    throw new Error(`Reviewability check failed. ${failures.join('; ')}`);
  }
}

function checkContracts(workbench, options = {}) {
  const state = requireState(workbench);
  const mode = normalizeMode(state.mode || DEFAULT_MODE);
  const hard = mode === 'strict' ||
    readBoolean(options.strict, false) ||
    options.enforce === true;
  const issues = collectContractIssues(workbench, state, options);
  const failures = issues.filter(issue => issue.level === 'FAIL');
  const warnings = issues.filter(issue => issue.level === 'WARN');

  state.checks = { ...(state.checks || {}) };
  state.checks.contracts = failures.length ? 'failed' : 'passed';
  state.checks.contractFailures = failures;
  state.checks.contractWarnings = warnings;
  state.updatedAt = now();
  saveState(workbench, state);
  appendEvent(workbench, 'check-contracts', {
    mode,
    hard,
    phase: options.phase || 'manual',
    result: failures.length ? 'failed' : 'passed',
    failures,
    warnings
  });

  if (!options.silent) {
    if (mode === 'lite' && !hard) {
      console.log('PASS contracts skipped for lite mode.');
    }
    if (!issues.length) {
      console.log('PASS contracts');
    } else {
      for (const issue of issues) {
        const level = hard ? issue.level : issue.level === 'FAIL' ? 'WARN' : issue.level;
        console.log(`${level} ${issue.message}`);
      }
    }
  }

  if (hard && failures.length) {
    throw new Error(`Contract check failed. ${failures.map(issue => issue.message).join('; ')}`);
  }

  return { failures, warnings, issues };
}

function collectContractIssues(workbench, state, options = {}) {
  const mode = normalizeMode(state.mode || DEFAULT_MODE);
  if (mode === 'lite' && !readBoolean(options.strict, false)) return [];

  const triggers = state.artifacts?.triggers || {};
  const strict = mode === 'strict' || readBoolean(options.strict, false);
  const uiRequired = hasUiManifest(workbench) || triggers.ui === true;
  const apiRequired = hasApiMaterial(workbench) || triggers.api === true;
  const uiCodingRequired = triggers.uiCoding === true || (strict && uiRequired);
  const behaviorRequired = triggers.behavior === true || strict;
  const reviewRequired = triggers.review === true || mode === 'standard' || mode === 'strict';
  const validationRequired = triggers.e2e === true || triggers.visual === true;
  const issues = [];

  if (uiRequired) {
    const hasUiContract = requireNonEmpty(
      issues,
      workbench,
      'specs/ui-contract.md',
      'UI contract markdown is missing or empty.'
    );
    const uiContractRef = requireJsonAny(
      issues,
      workbench,
      ['specs/machine/ui-contract.json', 'specs/ui-contract.json'],
      'UI contract JSON is missing or invalid.'
    );
    const hasUiIndex = requireNonEmpty(
      issues,
      workbench,
      'specs/ui-material-index.md',
      'UI material index is missing or empty.'
    );
    if (hasUiContract && uiContractRef && hasUiIndex) {
      validateUiContractContent(issues, workbench, uiContractRef);
    }
  }

  if (uiCodingRequired) {
    if (requireNonEmpty(issues, workbench, 'specs/ui-schema-extract.md', 'UI schema extract is missing or empty.')) {
      const schemaExtract = fs.readFileSync(path.join(workbench, 'specs/ui-schema-extract.md'), 'utf8');
      if (!hasSchemaMapHeaders(schemaExtract)) {
        const legacyMap = resolveWorkbenchRef(workbench, 'specs/ui-schema-map.md');
        const legacyOk = hasNonEmptyFile(legacyMap) && hasSchemaMapHeaders(fs.readFileSync(legacyMap, 'utf8'));
        if (!legacyOk) {
          issues.push({ level: 'FAIL', message: 'UI schema extract must include the standard Schema-to-implementation mapping table, or fallback specs/ui-schema-map.md must include it.' });
        }
      }
    }
  }

  if (apiRequired) {
    if (requireNonEmpty(issues, workbench, 'specs/api-contract.md', 'API contract markdown is missing or empty.')) {
      validateApiContractContent(issues, workbench);
    }
    requireJsonAny(issues, workbench, ['specs/machine/api-contract.json', 'specs/api-contract.json'], 'API contract JSON is missing or invalid.');
  }

  if (apiRequired && uiRequired) {
    requireNonEmpty(issues, workbench, 'specs/page-contract-matrix.md', 'Page contract matrix is missing or empty.');
  }

  if (behaviorRequired && requireNonEmpty(issues, workbench, 'specs/behavior-contract.md', 'Behavior contract is missing or empty.')) {
    validateBehaviorContractContent(issues, workbench);
  }

  if (reviewRequired) {
    validateReviewContract(issues, workbench);
  }

  if (validationRequired) {
    validateValidationContractContent(issues, workbench, triggers, options);
  }

  return issues;
}

function validateValidationContractContent(issues, workbench, triggers, options = {}) {
  const ref = 'specs/machine/validation-contract.json';
  const file = resolveWorkbenchRef(workbench, ref);
  if (!hasNonEmptyFile(file)) {
    issues.push({ level: 'FAIL', message: 'Validation contract JSON is missing or empty.' });
    return;
  }
  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    issues.push({ level: 'FAIL', message: 'Validation contract JSON is invalid.' });
    return;
  }
  const contractIssues = collectValidationContractIssues(contract, triggers)
    .filter(message =>
      options.phase !== 'plan' ||
      !/sourceRevision is required/i.test(message)
    );
  for (const message of contractIssues) {
    issues.push({ level: 'FAIL', message });
  }
}

function requireNonEmpty(issues, workbench, ref, message) {
  if (hasNonEmptyFile(resolveWorkbenchRef(workbench, ref))) return true;
  issues.push({ level: 'FAIL', message });
  return false;
}

function requireJson(issues, workbench, ref, message) {
  const file = resolveWorkbenchRef(workbench, ref);
  if (!hasNonEmptyFile(file)) {
    issues.push({ level: 'FAIL', message });
    return false;
  }
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
    return true;
  } catch {
    issues.push({ level: 'FAIL', message });
    return false;
  }
}

function requireJsonAny(issues, workbench, refs, message) {
  const existing = refs.find(ref => hasNonEmptyFile(resolveWorkbenchRef(workbench, ref)));
  if (!existing) {
    issues.push({ level: 'FAIL', message });
    return '';
  }
  return requireJson(issues, workbench, existing, message) ? existing : '';
}

function validateUiContractContent(issues, workbench, jsonRef) {
  const markdown = fs.readFileSync(
    resolveWorkbenchRef(workbench, 'specs/ui-contract.md'),
    'utf8'
  );
  const materialIndex = fs.readFileSync(
    resolveWorkbenchRef(workbench, 'specs/ui-material-index.md'),
    'utf8'
  );
  if (/(?:\bpending\b|TODO|待补|待确认)/i.test(markdown)) {
    issues.push({
      level: 'FAIL',
      message: 'UI contract still contains unresolved template placeholders.'
    });
  }
  if (/(?:\bpending\b|TODO|待补|待确认)/i.test(materialIndex)) {
    issues.push({
      level: 'FAIL',
      message: 'UI material index still contains unresolved template placeholders.'
    });
  }
  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(resolveWorkbenchRef(workbench, jsonRef), 'utf8'));
  } catch {
    return;
  }
  if (!Array.isArray(contract.boards) || contract.boards.length === 0) {
    issues.push({
      level: 'FAIL',
      message: 'UI contract JSON boards must contain at least one bound board.'
    });
  }
}

function validateApiContractContent(issues, workbench) {
  const content = fs.readFileSync(path.join(workbench, 'specs/api-contract.md'), 'utf8');
  const hasPlaceholder = /(pending|TODO|待补|待确认)/i.test(content);
  const hasConclusion = /(blocked|partial|无接口变更|无 API|无接口|no api changes|no interface changes)/i.test(content);
  const hasConcreteApi = /\b(GET|POST|PUT|DELETE|PATCH)\b|\/[a-z0-9_-]+|接口[:：]/i.test(content);
  if (hasPlaceholder && !hasConclusion) {
    issues.push({ level: 'FAIL', message: 'API contract still contains template placeholders without blocked/partial/no-change conclusion.' });
  }
  if (!hasConclusion && !hasConcreteApi) {
    issues.push({ level: 'FAIL', message: 'API contract must contain concrete APIs, blocked/partial status, or explicit no API changes conclusion.' });
  }
}

function validateBehaviorContractContent(issues, workbench) {
  const content = fs.readFileSync(path.join(workbench, 'specs/behavior-contract.md'), 'utf8');
  const hasPlaceholder = /(pending|TODO|待补|待确认)/i.test(content);
  const hasRisk = /(open|blocking|blocked|阻塞|风险|pending)/i.test(content);
  if (hasPlaceholder && !hasRisk) {
    issues.push({ level: 'FAIL', message: 'Behavior contract still contains template placeholders.' });
    return;
  }
  if (hasRisk) {
    const projection = [
      path.join(workbench, 'plans/progress.md'),
      path.join(workbench, 'reports/validation.md')
    ]
      .filter(file => fs.existsSync(file))
      .map(file => fs.readFileSync(file, 'utf8'))
      .join('\n\n');
    if (/(open|blocking|blocked|阻塞|风险)/i.test(content) && !/(behavior|行为|状态机|权限|缓存|并发|阻塞|风险)/i.test(projection)) {
      issues.push({ level: 'FAIL', message: 'Behavior contract risks must be mirrored in plans/progress.md or reports/validation.md.' });
    }
  }
}

function validateReviewContract(issues, workbench) {
  const reviewPacks = resolveWorkbenchRef(workbench, 'reviews/review-packs.md');
  const legacyReviewContract = resolveWorkbenchRef(workbench, 'specs/review-contract.md');
  const candidate = hasNonEmptyFile(reviewPacks) && hasReviewContractHeaders(fs.readFileSync(reviewPacks, 'utf8'))
    ? reviewPacks
    : hasNonEmptyFile(legacyReviewContract)
      ? legacyReviewContract
      : '';
  if (!candidate) {
    issues.push({ level: 'FAIL', message: 'Review contract or review packs are missing.' });
    return;
  }
  const content = fs.readFileSync(candidate, 'utf8');
  if (!/(git diff|diff command|patch|branch|PR|pull request|pending|待实现|待绑定)/i.test(content)) {
    issues.push({ level: 'FAIL', message: 'Review contract must point to diff/patch/branch/PR or explicitly mark pending state.' });
  }
}

function approveScope(workbench, options) {
  const state = requireState(workbench);
  if (state.gates.gate1 === 'approved') {
    console.log('Scope gate is already approved.');
    return;
  }
  if (!['initialized', 'gate1_pending', 'scope_pending'].includes(state.phase)) {
    throw new Error(`Cannot approve Scope gate from phase: ${state.phase}`);
  }
  requireUserConfirmation(options, 'Scope gate');
  checkWorkbench(workbench);

  const nextState = requireState(workbench);
  nextState.phase = 'scope_approved';
  nextState.gates.gate1 = 'approved';
  if (isLite(nextState)) {
    nextState.gates.gate2 = 'skipped';
    nextState.gates.gate3 = 'skipped';
    nextState.gates.gate4 = 'pending';
  } else {
    nextState.gates.gate2 = 'pending';
  }
  recordHumanConfirmation(nextState, 'gate1', options);
  nextState.updatedAt = now();
  saveState(workbench, nextState);
  writeGateDecision(workbench, 1, nextState, options, 'scope');
  writeProjection(workbench, nextState);
  appendEvent(workbench, 'gate.approved', { gate: 'scope', confirmedBy: 'user' });
  console.log('Scope gate approved.');
}

function approvePlan(workbench, options) {
  const state = requireState(workbench);
  if (isLite(state)) {
    console.log('Plan gate is skipped in lite mode.');
    return;
  }
  requireGate(state, 'gate1');
  if (state.gates.gate2 === 'approved') {
    console.log('Plan gate is already approved.');
    return;
  }
  requireUserConfirmation(options, 'Plan gate');
  checkWorkbench(workbench);
  validatePlanWorkbench(workbench);
  validatePlanApiContract(workbench);
  const executionMode = normalizeExecutionMode(options.executionMode || options.mode || 'main-serial');
  const worktree = readBoolean(options.worktree, executionMode !== 'main-serial');
  const subagents = readBoolean(options.subagents, executionMode === 'multi-worktree-parallel');
  const checkpoint = readBoolean(options.checkpoint, false);
  const syncMaterials = readBoolean(options.syncMaterials, false);
  const triggers = state.artifacts?.triggers || {};
  if (worktree && triggers.worktree !== true) {
    throw new Error(
      'Worktree execution requires scaffold --worktree true before Plan approval.'
    );
  }
  if (subagents && triggers.subagents !== true) {
    throw new Error(
      'Subagent execution requires scaffold --subagents true before Plan approval.'
    );
  }
  if (subagents && options.reviewAgent === undefined) {
    throw new Error(
      'Subagent execution requires an explicit --review-agent true|false decision.'
    );
  }
  const reviewAgent = readBoolean(
    options.reviewAgent,
    triggers.reviewAgent === true
  );
  if (triggers.reviewAgent === true && !reviewAgent) {
    throw new Error(
      'Review-agent planning is already enabled and cannot be downgraded during Plan approval.'
    );
  }
  if (reviewAgent && triggers.reviewAgent !== true) {
    throw new Error(
      'Review-agent execution requires scaffold --review-agent true before Plan approval.'
    );
  }
  validateExecutionSelection(executionMode, {
    worktree,
    subagents,
    checkpoint,
    syncMaterials,
    reviewAgent
  });
  const worktreeContract = validatePlanWorktreeContract(
    workbench,
    state,
    { worktree, executionMode }
  );
  const visualDecision = validatePlanVisualDecision(workbench, state, options);
  if (visualDecision?.decision === 'blocked') {
    const blockedState = requireState(workbench);
    blockedState.validationDecisions = {
      ...(blockedState.validationDecisions || {}),
      visual: visualDecision
    };
    blockedState.phase = 'plan_blocked';
    blockedState.gates.gate2 = 'pending';
    blockedState.updatedAt = now();
    saveState(workbench, blockedState);
    writeProjection(workbench, blockedState);
    appendEvent(workbench, 'plan.blocked', { visual: visualDecision });
    throw new Error('Plan gate remains pending because visual validation is blocked.');
  }
  checkContracts(workbench, {
    strict: isStrict(state),
    enforce: true,
    phase: 'plan'
  });

  const nextState = requireState(workbench);
  nextState.phase = 'plan_approved';
  nextState.gates.gate2 = 'approved';
  nextState.gates.gate3 = 'pending';
  nextState.execution = {
    mode: executionMode,
    worktree,
    subagents,
    reviewAgent,
    checkpoint,
    syncMaterials,
    worktreeContract
  };
  nextState.validationDecisions = {
    ...(nextState.validationDecisions || {}),
    ...(visualDecision ? { visual: visualDecision } : {})
  };
  recordHumanConfirmation(nextState, 'gate2', options);
  nextState.updatedAt = now();
  saveState(workbench, nextState);
  writeGateDecision(workbench, 2, nextState, options, 'plan');
  writeProjection(workbench, nextState);
  appendEvent(workbench, 'gate.approved', { gate: 'plan', execution: nextState.execution });
  console.log('Plan gate approved.');
}

function checkAction(workbench, options) {
  const state = requireState(workbench);
  const requestedAction = String(options.action || '').trim();
  const action = requestedAction === 'cleanup-worktree' ? 'cleanup' : requestedAction;
  if (!action) throw new Error('Missing --action.');

  if (action === 'code') {
    requireCodingGate(state);
    const ui = readBoolean(options.ui, false);
    const uiRisk = hasUiManifest(workbench) ||
      state.artifacts?.triggers?.ui === true ||
      state.artifacts?.triggers?.uiCoding === true;
    if (uiRisk && !ui) {
      const nonUi = readBoolean(options.nonUi, false);
      const reason = String(options.reason || '').trim();
      if (!nonUi || reason.length < 6) {
        throw new Error('UI materials detected. Non-UI code checks require --non-ui true --reason "<原因>"; UI code checks require --ui true and --schema-extract.');
      }
    }
    if (ui && !options.schemaExtract) {
      throw new Error('UI coding requires --schema-extract.');
    }
    if (ui) {
      validateUiSchemaExtract(workbench, options.schemaExtract, options.schemaMap || 'specs/ui-schema-map.md');
      if (options.schemaMap) {
        resolveSafeWorkbenchReadRef(workbench, options.schemaMap, {
          label: '--schema-map'
        });
      }
      if (isStrict(state)) {
        validateUiSchemaMapping(workbench, options.schemaExtract, options.schemaMap || 'specs/ui-schema-map.md');
      }
    }
    console.log('ALLOW code');
    return;
  }

  if (action === 'dispatch-subagent') {
    requireGate(state, 'gate2');
    if (state.execution?.subagents !== true) {
      throw new Error('Gate 2 execution mode did not enable subagents.');
    }
    if (state.execution?.worktree === true) {
      verifyRegisteredWorktreeForAction(workbench, state, options, action);
    }
    console.log('ALLOW dispatch-subagent');
    return;
  }

  if (['create-worktree', 'create-branch'].includes(action)) {
    requireGate(state, 'gate2');
    if (state.execution?.worktree !== true) {
      throw new Error(`Gate 2 execution mode did not authorize ${action}.`);
    }
    authorizeWorktreeIntent(workbench, state, action, options);
    console.log(`ALLOW ${requestedAction}`);
    return;
  }

  if (action === 'sync-materials') {
    requireGate(state, 'gate2');
    if (state.execution?.worktree !== true) {
      throw new Error('Gate 2 execution mode did not authorize material synchronization.');
    }
    if (state.execution?.syncMaterials !== true) {
      throw new Error('Gate 2 execution mode did not authorize material synchronization.');
    }
    verifyRegisteredWorktreeForAction(workbench, state, options, action);
    console.log(`ALLOW ${requestedAction}`);
    return;
  }

  if (action === 'checkpoint-commit') {
    requireGate(state, 'gate2');
    if (state.execution?.checkpoint !== true) {
      throw new Error('Gate 2 execution mode did not authorize checkpoint commits.');
    }
    if (state.execution?.worktree === true) {
      verifyRegisteredWorktreeForAction(workbench, state, options, action);
    }
    console.log('ALLOW checkpoint-commit');
    return;
  }

  if (['commit', 'merge', 'push', 'cleanup'].includes(action)) {
    requireGate(state, 'gate4');
    assertFinalActionOptionShape(options, action);
    let refreshedState = state;
    if (action !== 'cleanup') {
      verify(workbench, {
        target: state.verificationSnapshot?.sourceRoot || ''
      });
      refreshedState = requireState(workbench);
      requireGate(refreshedState, 'gate4');
    }
    if (refreshedState.finalActions?.[action] !== true) {
      throw new Error(`Final gate did not authorize action: ${requestedAction}.`);
    }

    if (action === 'cleanup') {
      const checked = validateCleanupBatchForCheck(refreshedState, options);
      refreshedState.finalActionChecks = {
        ...(refreshedState.finalActionChecks || {}),
        cleanup: {
          ...(refreshedState.finalActionChecks?.cleanup || {}),
          [checked.requestedKey]: {
            target: checked.requested,
            checkedAt: now()
          }
        }
      };
    } else {
      if (refreshedState.finalActionChecks?.[action]) {
        throw new Error(
          `Final ${action} authorization was already consumed.`
        );
      }
      const expected = refreshedState.finalActionTargets?.[action];
      const actual = createFinalActionBinding(
        refreshedState,
        options,
        action
      );
      assertFinalActionBindingUnchanged(expected, actual);
      refreshedState.finalActionChecks = {
        ...(refreshedState.finalActionChecks || {}),
        [action]: {
          target: actual.target,
          checkedAt: now()
        }
      };
    }
    refreshedState.updatedAt = now();
    saveState(workbench, refreshedState);
    writeProjection(workbench, refreshedState);
    appendEvent(workbench, 'final.action-checked', {
      action,
      target: String(options.target || '').trim(),
      consumed: true
    });
    console.log(`ALLOW ${requestedAction}`);
    return;
  }

  throw new Error(`Unknown action: ${action}`);
}

function normalizeWorktreeState(value) {
  const worktrees = value && typeof value === 'object' ? value : {};
  return {
    intents: worktrees.intents && typeof worktrees.intents === 'object'
      ? worktrees.intents
      : {},
    registry: worktrees.registry && typeof worktrees.registry === 'object'
      ? worktrees.registry
      : {}
  };
}

function worktreeStateKey(target) {
  return crypto.createHash('sha256').update(target).digest('hex');
}

function requireWorktreeSourceRoot(state) {
  if (!state.sourceRoot) {
    throw new Error('Worktree actions require state.sourceRoot.');
  }
  return normalizeProjectSourceRoot(state.sourceRoot);
}

function requirePathOption(options, name, label = name) {
  const value = String(options[name] || '').trim();
  if (!value) throw new Error(`Missing --${toKebab(name)} for ${label}.`);
  if (/[\0\r\n]/.test(value)) {
    throw new Error(`--${toKebab(name)} contains an invalid control character.`);
  }
  return value;
}

function isPathInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' ||
    (
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    );
}

function canonicalPotentialPath(value) {
  const resolved = path.resolve(value);
  let cursor = resolved;
  const suffix = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      throw new Error(`Cannot resolve an existing ancestor for path: ${value}`);
    }
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  if (!fs.statSync(cursor).isDirectory()) {
    throw new Error(`Path ancestor is not a directory: ${cursor}`);
  }
  return path.resolve(fs.realpathSync(cursor), ...suffix);
}

function systemTemporaryRoots() {
  const candidates = [
    os.tmpdir(),
    process.env.TMPDIR,
    process.env.TEMP,
    process.env.TMP,
    ...(process.platform === 'win32' ? [] : ['/tmp', '/private/tmp', '/var/tmp'])
  ].filter(Boolean);
  return Array.from(new Set(candidates.map(candidate => {
    const resolved = path.resolve(candidate);
    return fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
  })));
}

function normalizeWorktreeTarget(options, sourceRoot, { mustExist = false } = {}) {
  const value = requirePathOption(options, 'target', 'worktree action');
  const requestedTarget = path.isAbsolute(value)
    ? value
    : path.resolve(sourceRoot, value);
  const target = canonicalPotentialPath(requestedTarget);
  const canonicalSourceRoot = fs.realpathSync(sourceRoot);
  if (isPathInside(canonicalSourceRoot, target)) {
    throw new Error('--target must not equal or be inside sourceRoot.');
  }
  const temporaryRoot = systemTemporaryRoots().find(root => isPathInside(root, target));
  if (temporaryRoot) {
    throw new Error(`--target must not be inside a system temporary directory: ${temporaryRoot}`);
  }
  if (mustExist) {
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      throw new Error(`Registered worktree target does not exist: ${target}`);
    }
    return fs.realpathSync(target);
  }
  if (fs.existsSync(target) && !fs.statSync(target).isDirectory()) {
    throw new Error(`Worktree target exists but is not a directory: ${target}`);
  }
  return target;
}

function normalizeWorktreeBranch(sourceRoot, value) {
  const branch = String(value || '').trim();
  if (!branch) throw new Error('Missing --branch for worktree action.');
  if (
    branch.startsWith('-') ||
    branch.startsWith('refs/') ||
    branch.includes('@{') ||
    /[\0\r\n]/.test(branch)
  ) {
    throw new Error(`Invalid worktree branch: ${branch}`);
  }
  const result = spawnSync(
    'git',
    ['-C', sourceRoot, 'check-ref-format', '--branch', branch],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const normalized = String(result.stdout || '').trim();
  if (result.status !== 0 || normalized !== branch) {
    throw new Error(`Invalid worktree branch: ${branch}`);
  }
  return branch;
}

function resolveBaseCommit(sourceRoot, value) {
  const base = String(value || '').trim();
  if (!base) throw new Error('Missing --base for worktree action.');
  if (base.startsWith('-') || /[\0\r\n]/.test(base)) {
    throw new Error(`Invalid worktree base: ${base}`);
  }
  const result = spawnSync(
    'git',
    ['-C', sourceRoot, 'rev-parse', '--verify', '--quiet', `${base}^{commit}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const commit = String(result.stdout || '').trim();
  if (result.status !== 0 || !/^[0-9a-f]{40,64}$/i.test(commit)) {
    throw new Error(`Worktree base does not resolve to a commit: ${base}`);
  }
  return commit.toLowerCase();
}

function authorizeWorktreeIntent(workbench, state, action, options) {
  const sourceRoot = requireWorktreeSourceRoot(state);
  const target = normalizeWorktreeTarget(options, sourceRoot);
  const branch = normalizeWorktreeBranch(
    sourceRoot,
    requirePathOption(options, 'branch', action)
  );
  const base = requirePathOption(options, 'base', action);
  const baseCommit = resolveBaseCommit(sourceRoot, base);
  const contractEntries = state.execution?.worktreeContract?.entries;
  if (!Array.isArray(contractEntries) || contractEntries.length === 0) {
    throw new Error(
      'Gate 2 is missing a machine-bound worktree contract. Repeat Plan approval.'
    );
  }
  const contractEntry = contractEntries.find(entry =>
    entry.target === target &&
    entry.branch === branch &&
    entry.base === base &&
    entry.baseCommit === baseCommit
  );
  if (!contractEntry) {
    throw new Error(
      `Worktree intent ${target} / ${branch} / ${base} was not approved by Gate 2.`
    );
  }
  if (fs.existsSync(target)) {
    throw new Error(
      `Worktree target must not exist before authorization: ${target}`
    );
  }
  const alreadyListed = parseGitWorktreeList(sourceRoot).some(entry => {
    return entry.worktree &&
      canonicalPotentialPath(entry.worktree) === target;
  });
  if (alreadyListed) {
    throw new Error(
      `Worktree target is already present in git worktree list: ${target}`
    );
  }
  const gitCommonDir = resolveGitCommonDir(sourceRoot);
  const key = worktreeStateKey(target);
  state.worktrees = normalizeWorktreeState(state.worktrees);
  const existingIntent = state.worktrees.intents[key];
  const existingRegistration = state.worktrees.registry[key];

  for (const existing of [existingIntent, existingRegistration].filter(Boolean)) {
    if (
      existing.target !== target ||
      existing.branch !== branch ||
      existing.base !== base ||
      existing.baseCommit !== baseCommit ||
      existing.gitCommonDir !== gitCommonDir
    ) {
      throw new Error(
        `Worktree target is already bound to ${existing.branch}@${existing.base} (${existing.baseCommit}).`
      );
    }
  }

  const authorizedActions = Array.from(new Set([
    ...(existingIntent?.authorizedActions || []),
    action
  ])).sort();
  state.worktrees.intents[key] = {
    target,
    branch,
    base,
    baseCommit,
    gitCommonDir,
    intentNonce: existingIntent?.intentNonce || crypto.randomUUID(),
    authorizedActions,
    authorizedAt: existingIntent?.authorizedAt || now(),
    updatedAt: now()
  };
  state.updatedAt = now();
  saveState(workbench, state);
  writeProjection(workbench, state);
  appendEvent(workbench, 'worktree.intent-authorized', {
    action,
    target,
    branch,
    base,
    baseCommit
  });
}

function parseGitWorktreeList(sourceRoot) {
  const result = spawnSync(
    'git',
    ['-C', sourceRoot, 'worktree', 'list', '--porcelain', '-z'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    const detail = String(result.stderr || '').trim();
    throw new Error(`Unable to inspect Git worktrees${detail ? `: ${detail}` : '.'}`);
  }

  const entries = [];
  let current = {};
  for (const field of String(result.stdout || '').split('\0')) {
    if (!field) {
      if (current.worktree) entries.push(current);
      current = {};
      continue;
    }
    const separator = field.indexOf(' ');
    const key = separator === -1 ? field : field.slice(0, separator);
    const value = separator === -1 ? true : field.slice(separator + 1);
    current[key] = value;
  }
  if (current.worktree) entries.push(current);
  return entries;
}

function resolveGitCommonDir(repoRoot) {
  const result = spawnSync(
    'git',
    ['-C', repoRoot, 'rev-parse', '--git-common-dir'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const raw = String(result.stdout || '').trim();
  if (result.status !== 0 || !raw) {
    const detail = String(result.stderr || '').trim();
    throw new Error(`Unable to resolve Git common dir${detail ? `: ${detail}` : '.'}`);
  }
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Git common dir does not exist: ${resolved}`);
  }
  return fs.realpathSync(resolved);
}

function findLiveWorktree(sourceRoot, target) {
  const matches = parseGitWorktreeList(sourceRoot).filter(entry => {
    if (!entry.worktree || !fs.existsSync(entry.worktree)) return false;
    return fs.realpathSync(entry.worktree) === target;
  });
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one live Git worktree for ${target}; found ${matches.length}.`
    );
  }
  return matches[0];
}

function assertLiveWorktreeMatches(entry, live, { requireInitialHead = false } = {}) {
  const expectedBranch = `refs/heads/${entry.branch}`;
  if (live.branch !== expectedBranch) {
    throw new Error(
      `Live worktree branch mismatch for ${entry.target}: expected ${expectedBranch}, got ${live.branch || '(detached)'}.`
    );
  }
  const head = String(live.HEAD || '').toLowerCase();
  if (!/^[0-9a-f]{40,64}$/.test(head)) {
    throw new Error(`Live worktree HEAD is invalid for ${entry.target}.`);
  }
  if (requireInitialHead && head !== entry.baseCommit) {
    throw new Error(
      `Live worktree HEAD mismatch for ${entry.target}: expected base commit ${entry.baseCommit}, got ${head}.`
    );
  }
  return head;
}

function registerWorktree(workbench, options) {
  const state = requireState(workbench);
  requireGate(state, 'gate2');
  if (state.execution?.worktree !== true) {
    throw new Error('Gate 2 execution mode did not authorize worktrees.');
  }

  const sourceRoot = requireWorktreeSourceRoot(state);
  const target = normalizeWorktreeTarget(options, sourceRoot, { mustExist: true });
  const branch = normalizeWorktreeBranch(
    sourceRoot,
    requirePathOption(options, 'branch', 'register-worktree')
  );
  const base = requirePathOption(options, 'base', 'register-worktree');
  const baseCommit = resolveBaseCommit(sourceRoot, base);
  const key = worktreeStateKey(target);
  state.worktrees = normalizeWorktreeState(state.worktrees);
  const intent = state.worktrees.intents[key];
  if (
    !intent ||
    intent.target !== target ||
    intent.branch !== branch ||
    intent.base !== base ||
    intent.baseCommit !== baseCommit
  ) {
    throw new Error(
      'register-worktree requires target, branch, base, and baseCommit to match the authorized intent.'
    );
  }

  const live = findLiveWorktree(sourceRoot, target);
  const head = assertLiveWorktreeMatches(intent, live, { requireInitialHead: true });
  const gitCommonDir = resolveGitCommonDir(target);
  if (gitCommonDir !== intent.gitCommonDir) {
    throw new Error(
      `Live worktree Git common dir mismatch: expected ${intent.gitCommonDir}, got ${gitCommonDir}.`
    );
  }
  const existing = state.worktrees.registry[key];
  if (
    existing &&
    (
      existing.target !== intent.target ||
      existing.branch !== intent.branch ||
      existing.base !== intent.base ||
      existing.baseCommit !== intent.baseCommit ||
      existing.gitCommonDir !== intent.gitCommonDir ||
      existing.intentNonce !== intent.intentNonce
    )
  ) {
    throw new Error('Existing worktree registry entry does not match the authorized intent.');
  }

  state.worktrees.registry[key] = {
    target: intent.target,
    branch: intent.branch,
    base: intent.base,
    baseCommit: intent.baseCommit,
    gitCommonDir,
    intentNonce: intent.intentNonce,
    head,
    createdByWorkflow: true,
    authorizedActions: [...intent.authorizedActions],
    registeredAt: existing?.registeredAt || now(),
    lastVerifiedAt: now(),
    lastVerifiedHead: head
  };
  state.updatedAt = now();
  saveState(workbench, state);
  writeProjection(workbench, state);
  appendEvent(workbench, 'worktree.registered', {
    target,
    branch,
    head,
    createdByWorkflow: true
  });
  console.log(`Registered worktree: ${target}`);
  console.log(`Branch: ${branch}`);
  console.log(`HEAD: ${head}`);
}

function verifyRegisteredWorktreeForAction(workbench, state, options, action) {
  const verified = inspectRegisteredWorktree(state, options, action);
  verified.entry.lastVerifiedAt = now();
  verified.entry.lastVerifiedHead = verified.head;
  state.updatedAt = now();
  saveState(workbench, state);
  writeProjection(workbench, state);
  appendEvent(workbench, 'worktree.verified', {
    action,
    target: verified.entry.target,
    branch: verified.entry.branch,
    head: verified.head
  });
  return verified;
}

function inspectRegisteredWorktree(state, options, action) {
  const sourceRoot = requireWorktreeSourceRoot(state);
  const target = normalizeWorktreeTarget(options, sourceRoot, { mustExist: true });
  const key = worktreeStateKey(target);
  state.worktrees = normalizeWorktreeState(state.worktrees);
  const entry = state.worktrees.registry[key];
  if (!entry || entry.target !== target || entry.createdByWorkflow !== true) {
    throw new Error(
      `${action} requires --target to identify a worktree registered by this workflow.`
    );
  }
  const live = findLiveWorktree(sourceRoot, target);
  const head = assertLiveWorktreeMatches(entry, live);
  const gitCommonDir = resolveGitCommonDir(target);
  if (gitCommonDir !== entry.gitCommonDir) {
    throw new Error(
      `Registered worktree Git common dir changed: expected ${entry.gitCommonDir}, got ${gitCommonDir}.`
    );
  }
  return { entry, live, head, gitCommonDir };
}

function readWorktreeStatus(target) {
  const result = spawnSync(
    'git',
    ['-C', target, 'status', '--porcelain=v1', '--untracked-files=all'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    const detail = String(result.stderr || '').trim();
    throw new Error(`Unable to inspect worktree cleanliness${detail ? `: ${detail}` : '.'}`);
  }
  return String(result.stdout || '');
}

function createCleanupBinding(verified) {
  const status = readWorktreeStatus(verified.entry.target);
  if (status.trim()) {
    throw new Error(
      `Final cleanup authorization requires a clean worktree: ${verified.entry.target}`
    );
  }
  return {
    target: verified.entry.target,
    branch: verified.entry.branch,
    head: verified.head,
    registryKey: worktreeStateKey(verified.entry.target),
    intentNonce: verified.entry.intentNonce,
    gitCommonDir: verified.gitCommonDir,
    workingTreeFingerprint: fingerprintGitWorkingTree(verified.entry.target),
    clean: true,
    authorizedAt: now()
  };
}

function assertCleanupBindingUnchanged(binding, verified) {
  if (!binding || typeof binding !== 'object') {
    throw new Error('Final gate cleanup authorization is missing its bound worktree identity.');
  }
  if (
    binding.target !== verified.entry.target ||
    binding.branch !== verified.entry.branch ||
    binding.registryKey !== worktreeStateKey(verified.entry.target) ||
    binding.intentNonce !== verified.entry.intentNonce ||
    binding.gitCommonDir !== verified.gitCommonDir
  ) {
    throw new Error(
      `Final gate cleanup authorization is bound to ${binding.target || '(none)'}, not ${verified.entry.target}.`
    );
  }
  if (binding.head !== verified.head) {
    throw new Error(
      `Cleanup authorization HEAD changed: expected ${binding.head}, got ${verified.head}.`
    );
  }
  if (readWorktreeStatus(verified.entry.target).trim()) {
    throw new Error('Cleanup authorization is stale because the worktree is no longer clean.');
  }
  const fingerprint = fingerprintGitWorkingTree(verified.entry.target);
  if (binding.workingTreeFingerprint !== fingerprint) {
    throw new Error('Cleanup authorization is stale because the worktree fingerprint changed.');
  }
}

function readGitHeadIdentity(target) {
  const branchResult = spawnSync(
    'git',
    ['-C', target, 'symbolic-ref', '--quiet', '--short', 'HEAD'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const branch = String(branchResult.stdout || '').trim();
  if (branchResult.status !== 0 || !branch) {
    throw new Error(`Final action target must be on a named branch: ${target}`);
  }
  normalizeWorktreeBranch(target, branch);
  const head = resolveBaseCommit(target, 'HEAD');
  return { branch, head };
}

function readScopedWorktreeStatus(target, workbench) {
  const args = ['status', '--porcelain=v1', '--untracked-files=all'];
  const canonicalTarget = canonicalPath(target);
  const canonicalWorkbench = canonicalPath(workbench);
  if (isPathInside(canonicalTarget, canonicalWorkbench)) {
    const relative = path.relative(canonicalTarget, canonicalWorkbench)
      .split(path.sep)
      .join('/');
    args.push('--', '.', `:(exclude,top)${relative}`);
  }
  const result = spawnSync('git', ['-C', target, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || '').trim();
    throw new Error(
      `Unable to inspect final action target status${detail ? `: ${detail}` : '.'}`
    );
  }
  return String(result.stdout || '');
}

function resolveFinalActionTarget(state, options, action) {
  const targetValue = requirePathOption(options, 'target', `${action} authorization`);
  if (state.execution?.worktree === true) {
    const verified = inspectRegisteredWorktree(
      state,
      { target: targetValue },
      `final ${action}`
    );
    if (
      action !== 'cleanup' &&
      canonicalPath(verified.entry.target) !==
        canonicalPath(state.verificationSnapshot?.sourceRoot || '')
    ) {
      throw new Error(
        `Final ${action} target must match the verified integration target.`
      );
    }
    return {
      target: verified.entry.target,
      targetKind: 'owned-worktree',
      registryKey: worktreeStateKey(verified.entry.target),
      intentNonce: verified.entry.intentNonce,
      gitCommonDir: verified.gitCommonDir,
      branch: verified.entry.branch,
      head: verified.head,
      verified
    };
  }
  if (action === 'cleanup') {
    throw new Error('Final cleanup is only supported for an owned registered worktree.');
  }
  const sourceRoot = normalizeProjectSourceRoot(state.sourceRoot);
  const requested = path.isAbsolute(targetValue)
    ? canonicalPath(targetValue)
    : canonicalPath(path.resolve(sourceRoot, targetValue));
  if (requested !== canonicalPath(sourceRoot)) {
    throw new Error(`Final ${action} target must match state.sourceRoot.`);
  }
  const git = readGitHeadIdentity(sourceRoot);
  return {
    target: sourceRoot,
    targetKind: 'main-worktree',
    registryKey: '',
    intentNonce: '',
    gitCommonDir: resolveGitCommonDir(sourceRoot),
    branch: git.branch,
    head: git.head,
    verified: null
  };
}

function validatePushRemote(target, value) {
  const remote = String(value || '').trim();
  if (!remote || remote.startsWith('-') || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(remote)) {
    throw new Error('Final push authorization requires a safe --push-remote.');
  }
  const readUrls = args => {
    const result = spawnSync(
      'git',
      ['-C', target, 'remote', 'get-url', ...args, remote],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const urls = String(result.stdout || '')
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean);
    if (result.status !== 0 || urls.length === 0) {
      throw new Error(`Final push remote does not exist: ${remote}`);
    }
    return sha256Text(JSON.stringify(urls));
  };
  return {
    remote,
    fetchUrlsHash: readUrls(['--all']),
    pushUrlsHash: readUrls(['--push', '--all'])
  };
}

function createFinalActionBinding(state, options, action) {
  const resolved = resolveFinalActionTarget(state, options, action);
  if (action === 'cleanup') {
    return {
      action,
      ...createCleanupBinding(resolved.verified)
    };
  }

  const status = readScopedWorktreeStatus(resolved.target, state.workbench);
  const clean = status.trim().length === 0;
  const binding = {
    action,
    target: resolved.target,
    targetKind: resolved.targetKind,
    registryKey: resolved.registryKey,
    intentNonce: resolved.intentNonce,
    gitCommonDir: resolved.gitCommonDir,
    branch: resolved.branch,
    head: resolved.head,
    workingTreeFingerprint: fingerprintGitWorkingTree(resolved.target, {
      excludePaths: [state.workbench]
    }),
    clean
  };

  if (action === 'commit') {
    if (clean) throw new Error('Final commit authorization refuses a clean/no-op target.');
    return binding;
  }

  if (!clean) {
    throw new Error(`Final ${action} authorization requires a clean target.`);
  }

  if (action === 'push') {
    const pushRef = normalizeWorktreeBranch(
      resolved.target,
      requirePathOption(options, 'pushRef', 'push authorization')
    );
    if (pushRef !== resolved.branch) {
      throw new Error(
        `Final push ref must match the target branch ${resolved.branch}.`
      );
    }
    return {
      ...binding,
      ...validatePushRemote(resolved.target, options.pushRemote),
      ref: pushRef
    };
  }

  if (action === 'merge') {
    const mergeSource = normalizeWorktreeBranch(
      resolved.target,
      requirePathOption(options, 'mergeSource', 'merge authorization')
    );
    const destinationRoot = normalizeProjectSourceRoot(state.sourceRoot);
    const destination = readGitHeadIdentity(destinationRoot);
    const mergeDestination = normalizeWorktreeBranch(
      destinationRoot,
      requirePathOption(options, 'mergeDestination', 'merge authorization')
    );
    if (mergeDestination !== destination.branch) {
      throw new Error(
        `Final merge destination must match the checked-out branch ${destination.branch}.`
      );
    }
    if (readScopedWorktreeStatus(destinationRoot, state.workbench).trim()) {
      throw new Error('Final merge authorization requires a clean destination worktree.');
    }
    let sourceHead;
    if (state.execution?.worktree === true) {
      if (mergeSource !== resolved.branch) {
        throw new Error(
          `Final merge source must match the integration branch ${resolved.branch}.`
        );
      }
      sourceHead = resolved.head;
    } else {
      if (mergeSource === mergeDestination) {
        throw new Error('Final merge source and destination must differ.');
      }
      sourceHead = resolveBaseCommit(destinationRoot, mergeSource);
    }
    return {
      ...binding,
      sourceBranch: mergeSource,
      sourceHead,
      destinationRoot,
      destinationBranch: mergeDestination,
      destinationHead: destination.head
    };
  }

  throw new Error(`Unsupported final action binding: ${action}`);
}

function comparableFinalActionBinding(binding) {
  const value = deepClone(binding || {});
  delete value.authorizedAt;
  return value;
}

function assertFinalActionBindingUnchanged(expected, actual) {
  if (
    JSON.stringify(comparableFinalActionBinding(expected)) !==
    JSON.stringify(comparableFinalActionBinding(actual))
  ) {
    throw new Error(
      `Final ${actual.action || 'action'} authorization target/ref/HEAD/fingerprint changed.`
    );
  }
}

function assertFinalActionOptionShape(options, action, { approval = false } = {}) {
  const actionOptions = [
    'target',
    'cleanupTargetsJson',
    'mergeSource',
    'mergeDestination',
    'pushRemote',
    'pushRef'
  ];
  const allowed = new Set(
    action === 'merge'
      ? ['target', 'mergeSource', 'mergeDestination']
      : action === 'push'
        ? ['target', 'pushRemote', 'pushRef']
        : action === 'commit'
          ? ['target']
          : action === 'cleanup'
            ? ['target', ...(approval ? ['cleanupTargetsJson'] : [])]
            : []
  );
  for (const key of actionOptions) {
    if (options[key] !== undefined && !allowed.has(key)) {
      throw new Error(
        `--${toKebab(key)} is not valid for Final action ${action || 'keep'}.`
      );
    }
  }
}

function parseCleanupTargets(state, options) {
  const hasSingle = options.target !== undefined;
  const hasBatch = options.cleanupTargetsJson !== undefined;
  if (hasSingle === hasBatch) {
    throw new Error(
      'Final cleanup requires exactly one of --target or --cleanup-targets-json.'
    );
  }
  let requested;
  if (hasSingle) {
    requested = [requirePathOption(options, 'target', 'cleanup authorization')];
  } else {
    try {
      requested = JSON.parse(
        requirePathOption(
          options,
          'cleanupTargetsJson',
          'cleanup authorization'
        )
      );
    } catch {
      throw new Error('--cleanup-targets-json must be a valid JSON array.');
    }
    if (!Array.isArray(requested)) {
      throw new Error('--cleanup-targets-json must be a JSON array.');
    }
  }
  if (requested.length === 0 || requested.length > 64) {
    throw new Error('Final cleanup requires between 1 and 64 exact targets.');
  }
  const targets = requested.map((value, index) => {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(
        `Cleanup target ${index + 1} must be a non-empty path string.`
      );
    }
    return resolveFinalActionTarget(
      state,
      { target: value },
      'cleanup'
    ).target;
  });
  if (new Set(targets).size !== targets.length) {
    throw new Error('Final cleanup target list contains duplicates.');
  }
  const registeredTargets = Object.values(
    normalizeWorktreeState(state.worktrees).registry
  )
    .map(entry => entry.target)
    .sort();
  const sortedTargets = [...targets].sort();
  if (
    JSON.stringify(sortedTargets) !== JSON.stringify(registeredTargets)
  ) {
    throw new Error(
      'Final cleanup must bind every owned registered worktree in one exact batch.'
    );
  }
  return sortedTargets;
}

function createCleanupBatchBinding(state, options) {
  const targets = parseCleanupTargets(state, options);
  const integrationTarget = String(
    state.verificationSnapshot?.sourceRoot || ''
  ).trim();
  if (!integrationTarget) {
    throw new Error(
      'Final cleanup requires a verified integration target.'
    );
  }
  if (
    !targets.some(target =>
      canonicalPath(target) === canonicalPath(integrationTarget)
    )
  ) {
    throw new Error(
      'Final cleanup batch must include the verified integration target.'
    );
  }
  return {
    action: 'cleanup',
    integrationTarget: canonicalPath(integrationTarget),
    targets: targets.map(target => ({
      ...createFinalActionBinding(
        state,
        { target },
        'cleanup'
      ),
      authorizedAt: now()
    }))
  };
}

function cleanupCheckKey(target) {
  return worktreeStateKey(canonicalPath(target));
}

function validateCleanupBatchForCheck(state, options) {
  const batch = state.finalActionTargets?.cleanup;
  if (
    !batch ||
    !Array.isArray(batch.targets) ||
    batch.targets.length === 0
  ) {
    throw new Error(
      'Final cleanup authorization is missing its exact target batch.'
    );
  }
  const requested = resolveFinalActionTarget(
    state,
    { target: requirePathOption(options, 'target', 'cleanup check') },
    'cleanup'
  ).target;
  const requestedKey = cleanupCheckKey(requested);
  const consumed = state.finalActionChecks?.cleanup || {};
  if (consumed[requestedKey]) {
    throw new Error(
      `Final cleanup authorization was already consumed for: ${requested}`
    );
  }
  const expected = batch.targets.find(
    binding => canonicalPath(binding.target) === canonicalPath(requested)
  );
  if (!expected) {
    throw new Error(
      `Final cleanup target was not authorized by Gate 4: ${requested}`
    );
  }

  const integrationTarget = canonicalPath(batch.integrationTarget || '');
  if (canonicalPath(requested) === integrationTarget) {
    const remainingWorkers = batch.targets.filter(binding =>
      canonicalPath(binding.target) !== integrationTarget &&
      !consumed[cleanupCheckKey(binding.target)]
    );
    if (remainingWorkers.length) {
      throw new Error(
        'The verified integration worktree must be the last cleanup target checked.'
      );
    }
  }

  for (const binding of batch.targets) {
    const key = cleanupCheckKey(binding.target);
    if (consumed[key] && !fs.existsSync(binding.target)) continue;
    const actual = createFinalActionBinding(
      state,
      { target: binding.target },
      'cleanup'
    );
    assertFinalActionBindingUnchanged(binding, actual);
  }
  return { expected, requested, requestedKey };
}

function verify(workbench, options) {
  const state = requireState(workbench);
  requireCodingGate(state);
  const binding = requireVerificationBinding(workbench, state, options);
  const effectiveStrict = isStrict(state) || readBoolean(options.strict, false);

  const reviewPack = options.reviewPack || 'reviews/review-packs.md';
  const validation = options.validation || 'reports/validation.md';
  const required = [validation];
  if (!isLite(state)) required.unshift(reviewPack);
  const requiredFiles = new Map(required.map(ref => [
    ref,
    resolveSafeWorkbenchReadRef(workbench, ref, {
      label: ref === reviewPack ? '--review-pack' : '--validation'
    })
  ]));
  const missing = required.filter(ref => !hasNonEmptyFile(requiredFiles.get(ref)));

  const strictContractFailures = effectiveStrict ? checkContracts(workbench, { strict: true, phase: 'review', silent: true }).failures : [];
  const strictReviewFailures = effectiveStrict
    ? validateStrictReviewReadiness(workbench, binding.sourceRoot)
    : [];
  const testEvidenceFailures = validateStructuredTestEvidence(
    workbench,
    state,
    binding
  );
  const readiness = validateCompletionReadiness(workbench, state, {
    reviewPack,
    validation,
    sourceRoot: binding.sourceRoot
  });
  const completionReadinessFailures = readiness.validationFailures;
  const reviewReadinessFailures = readiness.reviewFailures;
  const reviewPackMissing = !isLite(state) && missing.includes(reviewPack);
  const freshness = validateVerificationFreshness(workbench, state, {
    reviewPack,
    validation,
    strict: effectiveStrict,
    binding
  });
  const freshnessFailures = freshness.failures;

  state.checks.reviewability = reviewPackMissing || strictReviewFailures.length || reviewReadinessFailures.length ? 'failed' : 'passed';
  state.checks.validation = missing.length || strictContractFailures.length || strictReviewFailures.length || testEvidenceFailures.length || completionReadinessFailures.length || reviewReadinessFailures.length || freshnessFailures.length ? 'failed' : 'passed';
  state.checks.verifyMissing = missing;
  state.checks.contractMissing = strictContractFailures;
  state.checks.strictReviewMissing = strictReviewFailures;
  state.checks.testEvidenceMissing = testEvidenceFailures;
  state.checks.completionReadinessMissing = completionReadinessFailures;
  state.checks.reviewReadinessMissing = reviewReadinessFailures;
  state.checks.freshnessMissing = freshnessFailures;

  if (missing.length || strictContractFailures.length || strictReviewFailures.length || testEvidenceFailures.length || completionReadinessFailures.length || reviewReadinessFailures.length || freshnessFailures.length) {
    state.updatedAt = now();
    saveState(workbench, state);
    appendEvent(workbench, 'verify', {
      strict: effectiveStrict,
      result: 'failed',
      missing,
      contractMissing: strictContractFailures,
      strictReviewMissing: strictReviewFailures,
      testEvidenceMissing: testEvidenceFailures,
      completionReadinessMissing: completionReadinessFailures,
      reviewReadinessMissing: reviewReadinessFailures,
      freshnessMissing: freshnessFailures
    });
    const fileText = missing.length ? `Missing or empty: ${missing.join(', ')}` : '';
    const contractText = strictContractFailures.length
      ? `Contract failures: ${strictContractFailures.map(item => item.message).join(', ')}`
      : '';
    const reviewText = strictReviewFailures.length
      ? `Strict review failures: ${strictReviewFailures.join(', ')}`
      : '';
    const evidenceText = testEvidenceFailures.length
      ? `Validation evidence failures: ${testEvidenceFailures.join(', ')}`
      : '';
    const completionText = completionReadinessFailures.length
      ? `Completion readiness failures: ${completionReadinessFailures.join(', ')}`
      : '';
    const reviewReadinessText = reviewReadinessFailures.length
      ? `Review readiness failures: ${reviewReadinessFailures.join(', ')}`
      : '';
    const freshnessText = freshnessFailures.length
      ? `Freshness failures: ${freshnessFailures.join(', ')}`
      : '';
    throw new Error(`Verify failed. ${[fileText, contractText, reviewText, evidenceText, completionText, reviewReadinessText, freshnessText].filter(Boolean).join('; ')}`);
  }

  validateVisualEvidence(workbench, validation, state);
  const previousSnapshot = state.verificationSnapshot;
  state.verificationSnapshot = freshness.snapshot;
  state.updatedAt = now();
  saveState(workbench, state);
  if (
    freshness.snapshot &&
    (
      !previousSnapshot ||
      previousSnapshot.sourceRevision !== freshness.snapshot.sourceRevision ||
      previousSnapshot.validationHash !== freshness.snapshot.validationHash ||
      previousSnapshot.reviewPackHash !== freshness.snapshot.reviewPackHash ||
      previousSnapshot.verificationTargetHash !==
        freshness.snapshot.verificationTargetHash ||
      previousSnapshot.evidenceHash !== freshness.snapshot.evidenceHash ||
      JSON.stringify(previousSnapshot.reviewArtifactHashes || {}) !==
        JSON.stringify(freshness.snapshot.reviewArtifactHashes || {})
    )
  ) {
    appendEvidence(workbench, {
      type: 'verification.snapshot',
      at: now(),
      result: 'passed',
      sourceRoot: freshness.snapshot.sourceRoot,
      sourceRevision: freshness.snapshot.sourceRevision,
      validation: freshness.snapshot.validation,
      validationHash: freshness.snapshot.validationHash,
      reviewPack: freshness.snapshot.reviewPack,
      reviewPackHash: freshness.snapshot.reviewPackHash,
      reviewArtifactHashes: deepClone(freshness.snapshot.reviewArtifactHashes),
      evidenceHash: freshness.snapshot.evidenceHash,
      verificationTarget: deepClone(freshness.snapshot.verificationTarget),
      verificationTargetHash: freshness.snapshot.verificationTargetHash,
      fanIn: deepClone(freshness.snapshot.fanIn),
      fanInHash: freshness.snapshot.fanInHash
    });
  }
  appendEvent(workbench, 'verify', {
    strict: effectiveStrict,
    result: 'passed',
    verificationTargetHash: binding.identityHash,
    missing
  });

  console.log('Verify passed.');
}

function requestReview(workbench, options) {
  const state = requireState(workbench);
  if (isLite(state)) {
    console.log('Review gate is skipped in lite mode. Use request-final after verification.');
    return;
  }
  requireGate(state, 'gate2');
  verify(workbench, options);

  const nextState = requireState(workbench);
  nextState.phase = 'review_pending';
  nextState.gates.gate3 = 'review_requested';
  nextState.gates.gate4 = 'locked';
  delete nextState.finalActions;
  delete nextState.finalActionTargets;
  delete nextState.finalActionChecks;
  if (nextState.humanConfirmations) {
    delete nextState.humanConfirmations.gate3;
    delete nextState.humanConfirmations.gate4;
  }
  nextState.updatedAt = now();
  saveState(workbench, nextState);
  writeGateDecision(workbench, 3, nextState, options, 'review');
  writeProjection(workbench, nextState);
  appendEvent(workbench, 'gate.requested', { gate: 'review' });
  console.log('Review gate requested.');
}

function approveReview(workbench, options) {
  let state = requireState(workbench);
  if (isLite(state)) {
    console.log('Review gate is skipped in lite mode.');
    return;
  }
  if (state.gates.gate3 !== 'review_requested') {
    throw new Error('Review gate is not pending. Run request-review first.');
  }
  requireUserConfirmation(options, 'Review gate');
  const reviewAccepted = readBoolean(options.reviewAccepted, false);
  const validationAccepted = readBoolean(options.validationAccepted, false);
  if (!reviewAccepted || !validationAccepted) {
    throw new Error('Review gate approval requires review and validation to be accepted.');
  }
  verify(workbench, {
    strict: options.strict,
    reviewPack: options.reviewPack,
    validation: options.validation,
    target: options.target
  });
  state = requireState(workbench);
  state.phase = 'review_approved';
  state.gates.gate3 = 'approved';
  state.gates.gate4 = 'pending';
  delete state.finalActions;
  delete state.finalActionTargets;
  delete state.finalActionChecks;
  if (state.humanConfirmations) {
    delete state.humanConfirmations.gate4;
  }
  recordHumanConfirmation(state, 'gate3', options);
  state.updatedAt = now();
  saveState(workbench, state);
  writeGateDecision(workbench, 3, state, options, 'review');
  writeProjection(workbench, state);
  appendEvent(workbench, 'gate.approved', { gate: 'review' });
  console.log('Review gate approved.');
}

function requestFinal(workbench, options) {
  let state = requireState(workbench);
  if (isLite(state)) {
    requireGate(state, 'gate1');
  } else {
    requireGate(state, 'gate3');
  }
  verify(workbench, options);
  state = requireState(workbench);
  if (!isLite(state)) requireGate(state, 'gate3');
  state.phase = 'final_pending';
  state.gates.gate4 = 'final_requested';
  delete state.finalActions;
  delete state.finalActionTargets;
  delete state.finalActionChecks;
  if (state.humanConfirmations) {
    delete state.humanConfirmations.gate4;
  }
  state.updatedAt = now();
  saveState(workbench, state);
  writeGateDecision(workbench, 4, state, options, 'final');
  writeProjection(workbench, state);
  appendEvent(workbench, 'gate.requested', { gate: 'final' });
  console.log('Final gate requested.');
}

function approveFinal(workbench, options) {
  let state = requireState(workbench);
  if (state.gates.gate4 !== 'final_requested') {
    throw new Error('Final gate is not pending. Run request-final first.');
  }
  requireUserConfirmation(options, 'Final gate');
  const finalActions = {
    merge: readBoolean(options.merge, false),
    commit: readBoolean(options.commit, false),
    push: readBoolean(options.push, false),
    cleanup: readBoolean(options.cleanup, false)
  };
  const selectedActions = Object.entries(finalActions)
    .filter(([, enabled]) => enabled)
    .map(([action]) => action);
  if (selectedActions.length > 1) {
    throw new Error(
      'Final approval allows at most one action; verify and request Final again after each state-changing action.'
    );
  }
  const selectedAction = selectedActions[0] || '';
  assertFinalActionOptionShape(options, selectedAction, { approval: true });

  const verificationTarget = String(
    state.verificationSnapshot?.sourceRoot || ''
  ).trim();
  if (!verificationTarget) {
    throw new Error(
      'Final approval is missing a verified integration target. Run request-final again.'
    );
  }
  verify(workbench, {
    strict: options.strict,
    reviewPack: options.reviewPack,
    validation: options.validation,
    target: verificationTarget
  });
  state = requireState(workbench);
  if (!isLite(state)) requireGate(state, 'gate3');
  let finalActionTargets = {};
  if (selectedAction === 'cleanup') {
    finalActionTargets = {
      cleanup: createCleanupBatchBinding(state, options)
    };
  } else if (selectedAction) {
    finalActionTargets = {
      [selectedAction]: {
        ...createFinalActionBinding(state, options, selectedAction),
        authorizedAt: now()
      }
    };
  }
  state.phase = 'final_approved';
  state.gates.gate4 = 'approved';
  state.finalActions = finalActions;
  state.finalActionTargets = finalActionTargets;
  state.finalActionChecks = {};
  recordHumanConfirmation(state, 'gate4', options);
  state.updatedAt = now();
  saveState(workbench, state);
  writeGateDecision(workbench, 4, state, options, 'final');
  writeProjection(workbench, state);
  appendEvent(workbench, 'gate.approved', {
    gate: 'final',
    finalActions: state.finalActions,
    finalActionTargets: state.finalActionTargets
  });
  console.log('Final gate approved.');
}

function addEvidenceCommand(workbench, options) {
  requireState(workbench);
  const type = options.type || 'note';
  if (type === 'test.command') {
    throw new Error('test.command evidence can only be created by run-verification.');
  }
  const entry = type.startsWith('test.')
    ? createStructuredTestEvidence(workbench, options)
    : {
        type,
        at: now(),
        phase: options.phase || '',
        command: options.command || '',
        result: options.result || '',
        summary: options.summary || options.reason || '',
        source: options.source || 'agent'
      };
  appendEvidence(workbench, entry);
  appendEvent(workbench, 'evidence.added', { type: entry.type, phase: entry.phase });
  console.log(`Evidence added: ${entry.type}`);
}

function createStructuredTestEvidence(workbench, options) {
  const type = String(options.type || '').trim();
  const kind = type === 'test.e2e' ? 'e2e' : type === 'test.visual' ? 'visual' : '';
  if (!kind) throw new Error(`Unsupported test evidence type: ${type}`);

  const file = resolveWorkbenchRef(workbench, 'specs/machine/validation-contract.json');
  if (!hasNonEmptyFile(file)) {
    throw new Error(`${type} evidence requires specs/machine/validation-contract.json.`);
  }

  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error('Validation contract JSON is invalid.');
  }

  const state = requireState(workbench);
  const stateTriggers = state.artifacts?.triggers || {};
  const effectiveTriggers = {
    e2e: stateTriggers.e2e === true || contract.e2e?.required === true,
    visual: stateTriggers.visual === true || contract.visual?.required === true
  };
  const contractIssues = collectValidationContractIssues(contract, effectiveTriggers);
  if (contractIssues.length) {
    throw new Error(`Validation contract is not ready: ${contractIssues.join(', ')}`);
  }
  if (effectiveTriggers[kind] !== true) {
    throw new Error(`${type} evidence requires an active ${kind} validation contract.`);
  }

  const binding = requireVerificationBinding(
    workbench,
    state,
    { target: contract.sourceRoot }
  );
  const currentSourceRevision = currentValidationSourceRevision(
    workbench,
    state,
    contract
  );
  if (contract.sourceRevision !== currentSourceRevision) {
    throw new Error(
      `Validation contract sourceRevision is stale. Current source revision: ${currentSourceRevision}`
    );
  }

  const entry = createTestEvidenceEntry(options, {
    at: now(),
    source: options.source || 'agent',
    contractHash: hashValidationContract(contract)
  });
  entry.verificationTarget = deepClone(binding.identity);
  entry.verificationTargetHash = binding.identityHash;
  entry.fanIn = deepClone(binding.fanIn);
  entry.fanInHash = binding.fanInHash;
  const knownIds = new Set(contract[kind].cases.map(testCase => testCase.id));
  const unknownIds = entry.caseIds.filter(caseId => !knownIds.has(caseId));
  if (unknownIds.length) {
    throw new Error(`${type} evidence references unknown contract case(s): ${unknownIds.join(', ')}.`);
  }
  if (entry.result !== 'blocked' && entry.sourceRevision !== contract.sourceRevision) {
    throw new Error(`${type} evidence --source-revision must match the validation contract.`);
  }
  return recordTestEvidenceArtifactHashes(entry, workbench);
}

function validateStructuredTestEvidence(workbench, state, binding) {
  const triggers = state.artifacts?.triggers || {};
  const genericFailures = triggers.e2e === true || triggers.visual === true
    ? []
    : validateCommandEvidence(workbench, state, binding);
  const file = resolveWorkbenchRef(workbench, 'specs/machine/validation-contract.json');
  if (!hasNonEmptyFile(file)) {
    return triggers.e2e === true || triggers.visual === true
      ? ['Validation contract JSON is missing or empty.']
      : genericFailures;
  }

  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return ['Validation contract JSON is invalid.'];
  }

  const effectiveTriggers = {
    e2e: triggers.e2e === true || contract.e2e?.required === true,
    visual: triggers.visual === true || contract.visual?.required === true
  };
  if (effectiveTriggers.e2e !== true && effectiveTriggers.visual !== true) return genericFailures;

  const contractIssues = collectValidationContractIssues(contract, effectiveTriggers);
  if (contractIssues.length) return contractIssues;
  let currentSourceRevision;
  try {
    currentSourceRevision = currentValidationSourceRevision(workbench, state, contract);
  } catch (error) {
    return [error.message];
  }
  if (contract.sourceRevision !== currentSourceRevision) {
    return [
      `Validation contract sourceRevision does not match the current Git working tree: ${currentSourceRevision}.`
    ];
  }

  const evidence = readEvidence(workbench);
  return genericFailures.concat(collectValidationEvidenceIssues({
    workbench,
    triggers: effectiveTriggers,
    contract,
    evidence,
    verificationTargetHash: binding.identityHash
  }));
}

function validateCommandEvidence(workbench, state, binding) {
  const sourceRoot = binding.sourceRoot;
  const currentSourceRevision = fingerprintGitWorkingTree(sourceRoot, {
    excludePaths: [workbench]
  });
  const entries = readEvidence(workbench).filter(entry => entry?.type === 'test.command');
  if (!entries.length) {
    return ['test.command evidence is missing for completion verification.'];
  }
  const entry = entries[entries.length - 1];
  const failures = [];
  if (entry.executedBy !== 'supermaestro-runner' || entry.source !== 'supermaestro-runner') {
    failures.push('test.command evidence must be produced by run-verification.');
  }
  if (String(entry.command || '').trim().length < 3) failures.push('test.command evidence command is missing.');
  if (entry.result !== 'passed' || entry.exitCode !== 0) {
    failures.push('test.command evidence must record a passed command with exitCode 0.');
  }
  if (entry.sourceRoot !== sourceRoot || entry.sourceRevision !== currentSourceRevision) {
    failures.push('test.command evidence sourceRevision does not match the current Git working tree.');
  }
  if (entry.verificationTargetHash !== binding.identityHash) {
    failures.push(
      'test.command evidence target/registry identity does not match the current integration target.'
    );
  }
  const refs = Array.from(new Set([
    ...(Array.isArray(entry.artifacts) ? entry.artifacts : []),
    entry.report
  ].map(ref => String(ref || '').trim()).filter(Boolean)));
  if (!entry.report || !Array.isArray(entry.artifacts) || !entry.artifacts.length) {
    failures.push('test.command evidence requires a report and artifacts.');
  }
  for (const ref of refs) {
    let file;
    try {
      file = resolveSafeWorkbenchReadRef(workbench, ref, {
        label: 'test.command evidence artifact',
        mustExist: true,
        requireNonEmpty: true
      });
    } catch (error) {
      failures.push(error.message);
      continue;
    }
    const expectedHash = entry.artifactHashes?.[ref];
    if (!/^[a-f0-9]{64}$/i.test(String(expectedHash || ''))) {
      failures.push(`test.command evidence artifact hash is missing or invalid: ${ref}.`);
    } else if (sha256File(file) !== String(expectedHash).toLowerCase()) {
      failures.push(`test.command evidence artifact hash changed after execution: ${ref}.`);
    }
  }
  return failures;
}

function currentValidationSourceRevision(workbench, state, contract) {
  const sourceRoot = resolveValidationSourceRoot(workbench, contract.sourceRoot);
  const binding = requireVerificationBinding(
    workbench,
    state,
    { target: sourceRoot }
  );
  return fingerprintGitWorkingTree(binding.sourceRoot, {
    excludePaths: [workbench]
  });
}

function printSourceRevision(workbench, options) {
  const state = requireState(workbench);
  const requestedRoot = String(options.sourceRoot || '').trim();
  const requestedTarget = String(options.target || '').trim();
  if (
    requestedRoot &&
    requestedTarget &&
    canonicalPath(resolveValidationSourceRoot(workbench, requestedRoot)) !==
      canonicalPath(path.isAbsolute(requestedTarget)
        ? requestedTarget
        : path.resolve(state.sourceRoot || workbench, requestedTarget))
  ) {
    throw new Error('source-revision --source-root and --target must identify the same worktree.');
  }
  const binding = requireVerificationBinding(
    workbench,
    state,
    { target: requestedTarget || requestedRoot }
  );
  console.log(fingerprintGitWorkingTree(binding.sourceRoot, {
    excludePaths: [workbench]
  }));
}

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
  const result = spawnSync(program, args, {
    cwd: executionCwd,
    encoding: 'utf8',
    shell: false,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024
  });
  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  const command = JSON.stringify([program, ...args]);
  const reportContent = [
    `startedAt: ${startedAt}`,
    `finishedAt: ${now()}`,
    `cwd: ${executionCwd}`,
    `command: ${command}`,
    `exitCode: ${exitCode}`,
    result.error ? `error: ${result.error.message}` : '',
    '',
    '--- stdout ---',
    String(result.stdout || ''),
    '',
    '--- stderr ---',
    String(result.stderr || '')
  ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n');
  atomicWriteText(reportFile, `${reportContent.trimEnd()}\n`);

  const sourceRevision = fingerprintGitWorkingTree(sourceRoot, { excludePaths: [workbench] });
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
    result: exitCode === 0 && !result.error ? 'passed' : 'failed',
    exitCode,
    sourceRoot,
    sourceRevision,
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
    throw new Error(`Verification command failed with exit code ${exitCode}. See ${report}.`);
  }
  console.log(`Verification command passed. Evidence: ${report}`);
}

function requireCodingGate(state) {
  if (isLite(state)) {
    requireGate(state, 'gate1');
    return;
  }
  requireGate(state, 'gate2');
}

function isLite(state) {
  return normalizeMode(state.mode || DEFAULT_MODE) === 'lite';
}

function isStrict(state) {
  return normalizeMode(state.mode || DEFAULT_MODE) === 'strict';
}

function requireUserConfirmation(options, label) {
  const confirmedBy = String(options.confirmedBy || options.by || '').trim();
  const confirmationText = String(options.confirmation || '').trim();
  if (confirmedBy !== 'user') {
    throw new Error(`${label} approval requires --confirmed-by user after explicit user confirmation.`);
  }
  if (confirmationText.length < 6) {
    throw new Error(`${label} approval requires --confirmation "<用户确认原话或摘要>".`);
  }
}

function recordHumanConfirmation(state, gate, options) {
  const approvalContext = gateApprovalContext(state, gate);
  state.humanConfirmations = {
    ...(state.humanConfirmations || {}),
    [gate]: {
      confirmedBy: String(options.confirmedBy || options.by || '').trim(),
      confirmationText: String(options.confirmation || '').trim(),
      confirmedAt: now(),
      approvalContext
    }
  };
}

function normalizeExecutionMode(mode) {
  const value = String(mode || '').trim().toLowerCase();
  if (!VALID_EXECUTION_MODES.has(value)) {
    throw new Error(
      `Invalid execution mode: ${mode}. Expected one of: ${Array.from(VALID_EXECUTION_MODES).join(', ')}.`
    );
  }
  return value;
}

function validateExecutionSelection(mode, execution) {
  if (mode === 'main-serial' && execution.worktree) {
    throw new Error('main-serial execution cannot enable --worktree true.');
  }
  if (mode === 'single-worktree-serial' && !execution.worktree) {
    throw new Error('single-worktree-serial execution requires --worktree true.');
  }
  if (mode === 'multi-worktree-parallel' && !execution.worktree) {
    throw new Error('multi-worktree-parallel execution requires --worktree true.');
  }
  if (execution.subagents && mode !== 'multi-worktree-parallel') {
    throw new Error('--subagents true requires multi-worktree-parallel execution mode.');
  }
  if (execution.syncMaterials && !execution.worktree) {
    throw new Error('--sync-materials true requires worktree execution.');
  }
}

function validatePlanVisualDecision(workbench, state, options) {
  const triggers = state.artifacts?.triggers || {};
  const uiRequired = hasUiManifest(workbench) || triggers.ui === true;
  if (!isStrict(state) || !uiRequired) return null;

  const decision = String(options.visualDecision || '').trim().toLowerCase();
  if (!VALID_VISUAL_DECISIONS.has(decision)) {
    throw new Error(
      `Strict UI planning requires --visual-decision ${Array.from(VALID_VISUAL_DECISIONS).join('|')}.`
    );
  }
  const reason = String(options.visualReason || '').trim();
  if (decision === 'required' && triggers.visual !== true) {
    throw new Error('Visual decision "required" needs scaffold --visual true and a completed validation contract.');
  }
  if (decision !== 'required' && triggers.visual === true) {
    throw new Error(`Visual trigger is active and cannot be combined with --visual-decision ${decision}.`);
  }
  if (decision !== 'required' && reason.length < 6) {
    throw new Error(`Visual decision "${decision}" requires --visual-reason "<原因>".`);
  }
  return {
    decision,
    reason,
    confirmedBy: String(options.confirmedBy || options.by || '').trim(),
    confirmation: String(options.confirmation || '').trim(),
    decidedAt: now()
  };
}

function validatePlanWorkbench(workbench) {
  const required = [
    'plans/task-plan.md',
    'plans/progress.md',
    'reviews/review-packs.md',
    'reports/validation.md'
  ];
  const missing = required.filter(file => !hasNonEmptyFile(path.join(workbench, file)));
  if (missing.length) {
    throw new Error(`Plan gate check failed. Missing or empty: ${missing.join(', ')}`);
  }
  const taskPlan = fs.readFileSync(path.join(workbench, 'plans', 'task-plan.md'), 'utf8');
  if (/(?:\bpending\b|TODO|待补|待确认)/i.test(taskPlan)) {
    throw new Error('Plan gate check failed. plans/task-plan.md still contains unresolved template placeholders.');
  }
}

function validatePlanWorktreeContract(
  workbench,
  state,
  { worktree, executionMode }
) {
  if (!worktree) return null;
  const ref = 'specs/machine/worktree-contract.json';
  const file = resolveWorkbenchRef(workbench, ref);
  if (!hasNonEmptyFile(file)) {
    throw new Error(`Plan gate worktree contract is missing or empty: ${ref}`);
  }
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Plan gate worktree contract must be a regular non-symlink file: ${ref}`);
  }
  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`Plan gate worktree contract is invalid JSON: ${ref}`);
  }
  if (contract.version !== 1 || !Array.isArray(contract.worktrees)) {
    throw new Error(
      'Worktree contract requires version 1 and a worktrees array.'
    );
  }
  const expectedCount = executionMode === 'single-worktree-serial' ? 1 : 2;
  if (
    contract.worktrees.length < expectedCount ||
    (executionMode === 'single-worktree-serial' && contract.worktrees.length !== 1)
  ) {
    throw new Error(
      `${executionMode} requires ${
        executionMode === 'single-worktree-serial'
          ? 'exactly one'
          : 'at least two'
      } planned worktree target(s).`
    );
  }

  const sourceRoot = requireWorktreeSourceRoot(state);
  const seenTargets = new Set();
  const seenBranches = new Set();
  const entries = contract.worktrees.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Worktree contract entry ${index + 1} must be an object.`);
    }
    const task = String(entry.task || '').trim();
    const rawTarget = String(entry.target || '').trim();
    const branch = String(entry.branch || '').trim();
    const base = String(entry.base || '').trim();
    if (!task || !rawTarget || !branch || !base) {
      throw new Error(
        `Worktree contract entry ${index + 1} requires task, target, branch, and base.`
      );
    }
    if (/(?:\bpending\b|TODO|待补|待确认|<[^>]+>)/i.test(
      `${task}\n${rawTarget}\n${branch}\n${base}`
    )) {
      throw new Error(
        `Worktree contract entry ${index + 1} contains an unresolved placeholder.`
      );
    }
    const target = normalizeWorktreeTarget({ target: rawTarget }, sourceRoot);
    const normalizedBranch = normalizeWorktreeBranch(sourceRoot, branch);
    const baseCommit = resolveBaseCommit(sourceRoot, base);
    if (seenTargets.has(target)) {
      throw new Error(`Worktree contract contains duplicate target: ${target}`);
    }
    if (seenBranches.has(normalizedBranch)) {
      throw new Error(
        `Worktree contract contains duplicate branch: ${normalizedBranch}`
      );
    }
    seenTargets.add(target);
    seenBranches.add(normalizedBranch);
    return {
      task,
      target,
      branch: normalizedBranch,
      base,
      baseCommit
    };
  });

  const rawIntegrationTarget = String(contract.integrationTarget || '').trim();
  if (!rawIntegrationTarget) {
    throw new Error('Worktree contract requires integrationTarget.');
  }
  const integrationTarget = normalizeWorktreeTarget(
    { target: rawIntegrationTarget },
    sourceRoot
  );
  if (!seenTargets.has(integrationTarget)) {
    throw new Error(
      'Worktree contract integrationTarget must match exactly one planned target.'
    );
  }

  const planFile = resolveWorkbenchRef(workbench, 'worktrees/plan.md');
  if (!hasNonEmptyFile(planFile)) {
    throw new Error('Plan gate worktree plan is missing or empty.');
  }
  const plan = fs.readFileSync(planFile, 'utf8');
  for (const entry of contract.worktrees) {
    for (const value of [entry.task, entry.target, entry.branch, entry.base]) {
      if (!plan.includes(String(value))) {
        throw new Error(
          `worktrees/plan.md does not reflect the machine contract value: ${value}`
        );
      }
    }
  }

  return {
    version: 1,
    integrationTarget,
    entries
  };
}

function validatePlanApiContract(workbench) {
  const state = requireState(workbench);
  const apiRequired = hasApiMaterial(workbench) || state.artifacts?.triggers?.api === true;
  if (!apiRequired) return;

  const issues = [];
  if (requireNonEmpty(issues, workbench, 'specs/api-contract.md', 'API contract markdown is missing or empty.')) {
    validateApiContractContent(issues, workbench);
  }
  requireJsonAny(
    issues,
    workbench,
    ['specs/machine/api-contract.json', 'specs/api-contract.json'],
    'API contract JSON is missing or invalid.'
  );
  if (issues.length) {
    throw new Error(`Plan gate API contract check failed. ${issues.map(item => item.message).join('; ')}`);
  }
}

function validateCompletionReadiness(workbench, state, refs) {
  const validationFailures = [];
  const reviewFailures = [];
  const validationFile = resolveWorkbenchRef(workbench, refs.validation);
  if (hasNonEmptyFile(validationFile)) {
    const content = fs.readFileSync(validationFile, 'utf8');
    if (hasUnresolvedTemplatePlaceholder(content)) {
      validationFailures.push(`${refs.validation} still contains unresolved template placeholders.`);
    }
    if (!hasResolvedTddDecision(content)) {
      validationFailures.push(`${refs.validation} must record a resolved TDD applicability decision or skip reason.`);
    }
    if (!hasCompletedVerificationRecord(content)) {
      validationFailures.push(`${refs.validation} must contain one executed completion-verification record with its command or manual check and a passing result.`);
    }
  }

  if (!isLite(state)) {
    const reviewPackFile = resolveWorkbenchRef(workbench, refs.reviewPack);
    if (hasNonEmptyFile(reviewPackFile)) {
      const content = fs.readFileSync(reviewPackFile, 'utf8');
      if (hasUnresolvedTemplatePlaceholder(content)) {
        reviewFailures.push(`${refs.reviewPack} still contains unresolved template placeholders.`);
      }
      if (!hasConcreteReviewArtifact(content, workbench, state, refs.sourceRoot)) {
        reviewFailures.push(`${refs.reviewPack} must point to a concrete diff command, existing patch or branch, or numbered pull request.`);
      }
    }
    reviewFailures.push(
      ...collectCoordinationReviewability(
        workbench,
        state,
        refs.reviewPack,
        refs.sourceRoot
      ).failures
    );
  }

  return { validationFailures, reviewFailures };
}

function collectCoordinationReviewability(
  workbench,
  state,
  reviewPackRef,
  sourceRoot = ''
) {
  const failures = [];
  const warnings = [];
  const reviewPackFile = resolveWorkbenchRef(workbench, reviewPackRef);
  const reviewContent = hasNonEmptyFile(reviewPackFile)
    ? fs.readFileSync(reviewPackFile, 'utf8')
    : '';
  const reviewEntries = extractReviewPackEntries(reviewContent);

  if (!reviewEntries.length) {
    failures.push(`${reviewPackRef} does not contain a recognizable RP heading or table row.`);
  } else {
    for (const entry of reviewEntries) {
      if (!hasConcreteReviewArtifact(entry.content, workbench, state, sourceRoot)) {
        failures.push(`${reviewPackRef} review pack ${entry.id} lacks a verifiable non-empty diff, patch, branch, or fetched PR ref.`);
      }
    }
  }

  const patchDir = resolveWorkbenchRef(workbench, 'reviews/patches');
  const patchCount = fs.existsSync(patchDir)
    ? fs.readdirSync(patchDir).filter(name => name.endsWith('.patch') && hasNonEmptyFile(path.join(patchDir, name))).length
    : 0;
  const diffCount = reviewEntries.filter(entry => /\bgit\s+(?:diff|show)\b/i.test(entry.content)).length;

  if (state.execution?.worktree === true) {
    const plan = resolveWorkbenchRef(workbench, 'worktrees/plan.md');
    if (!hasNonEmptyFile(plan)) {
      failures.push('Gate 2 authorized worktrees, but worktrees/plan.md is missing or empty.');
    }
  } else if (fs.existsSync(resolveWorkbenchRef(workbench, 'worktrees'))) {
    warnings.push('Gate 2 did not authorize worktrees, but worktrees/ exists; confirm that it is not stale workflow state.');
  }

  if (state.execution?.subagents === true) {
    const index = resolveWorkbenchRef(workbench, 'agents/agent-index.md');
    if (!hasNonEmptyFile(index)) {
      failures.push('Gate 2 authorized subagents, but agents/agent-index.md is missing or empty.');
    }
  } else if (fs.existsSync(resolveWorkbenchRef(workbench, 'agents'))) {
    warnings.push('Gate 2 did not authorize subagents, but agents/ exists; confirm that it is not stale workflow state.');
  }

  const staleStatuses = new Set([
    'running',
    'assigned',
    'pending',
    'ready-for-agent-review',
    'changes-requested'
  ]);
  for (const [ref, label] of [
    ['plans/progress.md', 'plans/progress.md'],
    ['agents/agent-index.md', 'agents/agent-index.md'],
    ['worktrees/plan.md', 'worktrees/plan.md']
  ]) {
    const file = resolveWorkbenchRef(workbench, ref);
    if (!hasNonEmptyFile(file)) continue;
    failures.push(...collectStaleTableStatuses(
      fs.readFileSync(file, 'utf8'),
      staleStatuses,
      label
    ));
  }

  const codeReviewDir = resolveWorkbenchRef(workbench, 'reviews/code-review');
  if (fs.existsSync(codeReviewDir)) {
    const markdownFiles = fs.readdirSync(codeReviewDir).filter(name => name.endsWith('.md'));
    let sawConclusion = false;
    for (const name of markdownFiles) {
      const content = fs.readFileSync(path.join(codeReviewDir, name), 'utf8');
      if (/(?:agent-approved|not-needed)(?:\s*:\s*yes|\s*\|)|(?:status|状态)\s*[:：]\s*(?:agent-approved|not-needed)/i.test(content)) {
        sawConclusion = true;
      }
      if (/(?:changes-requested|pending)(?:\s*:\s*yes|\s*\|)|(?:status|状态)\s*[:：]\s*(?:changes-requested|pending)/i.test(content)) {
        failures.push(`reviews/code-review/${name} still contains pending or changes-requested findings.`);
      }
    }
    if (state.execution?.reviewAgent === true && !sawConclusion) {
      failures.push('Review-agent execution is enabled, but no agent-approved or not-needed conclusion was found.');
    }
  }

  if (fs.existsSync(resolveWorkbenchRef(workbench, 'tasks/state.json'))) {
    warnings.push('tasks/state.json is a legacy secondary task state; plans/progress.md and state.json must remain authoritative.');
  }

  return {
    failures: Array.from(new Set(failures)),
    warnings: Array.from(new Set(warnings)),
    metrics: {
      reviewPacks: reviewEntries.length,
      diffCommands: diffCount,
      patches: patchCount
    }
  };
}

function extractReviewPackEntries(content) {
  const entries = [];
  const headingRe = /^###\s+(RP(?:\d+|-[A-Za-z0-9][A-Za-z0-9_-]*))\b/gim;
  const headings = Array.from(content.matchAll(headingRe));
  for (let index = 0; index < headings.length; index += 1) {
    const match = headings[index];
    const end = headings[index + 1]?.index ?? content.length;
    entries.push({
      id: match[1],
      content: content.slice(match.index, end)
    });
  }
  if (entries.length) return entries;

  for (const table of parseMarkdownTables(content)) {
    if (table.length < 2) continue;
    const rpIndex = table[0].findIndex(header => /^RP$/i.test(header));
    if (rpIndex < 0) continue;
    for (const row of table.slice(1)) {
      const id = String(row[rpIndex] || '').trim();
      if (!/^RP(?:\d+|-[A-Za-z0-9][A-Za-z0-9_-]*)$/i.test(id)) continue;
      entries.push({ id, content: row.join(' | ') });
    }
  }
  return entries;
}

function parseMarkdownTables(content) {
  const groups = [];
  let current = [];
  for (const line of String(content || '').split(/\r?\n/)) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      current.push(line);
    } else if (current.length) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups.map(lines => lines
    .filter(line => !markdownCells(line).every(cell => /^:?-{3,}:?$/.test(cell)))
    .map(markdownCells)
  );
}

function collectStaleTableStatuses(content, staleStatuses, label) {
  const failures = [];
  for (const table of parseMarkdownTables(content)) {
    if (table.length < 2) continue;
    const statusIndex = table[0].findIndex(header => /^(?:状态|status)$/i.test(header));
    if (statusIndex < 0) continue;
    for (const row of table.slice(1)) {
      const status = String(row[statusIndex] || '').trim().toLowerCase();
      if (!staleStatuses.has(status)) continue;
      failures.push(
        `${label} item ${row[0] || 'unnamed'} is still ${status}; fan-in handoff, diff, and validation before review.`
      );
    }
  }
  return failures;
}

function validateVerificationFreshness(workbench, state, refs) {
  try {
    const binding = refs.binding ||
      requireVerificationBinding(workbench, state, refs);
    const sourceRoot = binding.sourceRoot;
    const sourceRevision = fingerprintGitWorkingTree(sourceRoot, { excludePaths: [workbench] });
    const validationFile = resolveWorkbenchRef(workbench, refs.validation);
    const reviewPackFile = isLite(state) ? '' : resolveWorkbenchRef(workbench, refs.reviewPack);
    const reviewPackContent = reviewPackFile && hasNonEmptyFile(reviewPackFile)
      ? fs.readFileSync(reviewPackFile, 'utf8')
      : '';
    return {
      failures: [],
      snapshot: {
        sourceRoot,
        sourceRevision,
        validation: refs.validation,
        validationHash: hasNonEmptyFile(validationFile) ? sha256File(validationFile) : '',
        reviewPack: isLite(state) ? '' : refs.reviewPack,
        reviewPackHash: reviewPackFile && hasNonEmptyFile(reviewPackFile)
          ? sha256File(reviewPackFile)
          : '',
        reviewArtifactHashes: isLite(state)
          ? {}
          : Object.fromEntries(
              collectReviewArtifactFingerprints(
                reviewPackContent,
                workbench,
                state,
                sourceRoot
              )
                .map(item => [item.key, item.hash])
                .sort(([left], [right]) => left.localeCompare(right))
            ),
        evidenceHash: hashCompletionEvidence(workbench),
        verificationTarget: deepClone(binding.identity),
        verificationTargetHash: binding.identityHash,
        fanIn: deepClone(binding.fanIn),
        fanInHash: binding.fanInHash,
        strict: refs.strict === true,
        verifiedAt: now()
      }
    };
  } catch (error) {
    return { failures: [error.message], snapshot: null };
  }
}

function hasUnresolvedTemplatePlaceholder(content) {
  let resultColumns = [];
  const lines = content.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const value = line.trim();
    if (!value) {
      resultColumns = [];
      continue;
    }
    if (/^(?:[-*]\s*)?(?:[A-Za-z\u4e00-\u9fff _/-]+\s*[:：]\s*)?(?:pending|TODO|待补|待确认)[。.]*$/i.test(value)) {
      return true;
    }
    const cells = markdownCells(value);
    if (cells.length < 2) continue;
    if (cells.every(cell => /^:?-{3,}:?$/.test(cell))) continue;
    const nextCells = markdownCells(lines[lineIndex + 1] || '');
    const followedBySeparator = nextCells.length === cells.length &&
      nextCells.every(cell => /^:?-{3,}:?$/.test(cell));
    if (followedBySeparator) {
      resultColumns = cells
        .map((cell, index) => /^(?:结果|result|状态|status)$/i.test(cell) ? index : -1)
        .filter(index => index >= 0);
      continue;
    }
    if (resultColumns.some(index => /^(?:pending|TODO|待补|待确认)[。.]*$/i.test(cells[index] || ''))) {
      return true;
    }
    const placeholders = cells.filter(cell => /^(?:pending|TODO|待补|待确认)[。.]*$/i.test(cell)).length;
    if (placeholders >= 2 && placeholders >= Math.ceil(cells.length / 2)) return true;
  }
  return false;
}

function hasResolvedTddDecision(content) {
  return content.split(/\r?\n/).some(line => {
    if (!/(?:TDD|测试驱动)/i.test(line)) return false;
    if (/(?:未评估|未决定|待评估|待确认)/i.test(line)) return false;
    if (/(?:TDD|测试驱动)[^：:\n]{0,20}[:：]\s*(?:未评估|未决定|待评估|待确认|pending|TODO)/i.test(line)) return false;
    return /(?:适用|不适用|跳过|延后|RED|GREEN|required|not[- ]applicable|skipped|deferred)/i.test(line);
  });
}

function hasCompletedVerificationRecord(content) {
  const negative = /(?:未执行|未运行|没有执行|未完成|未通过|预期通过|expected\s+to\s+pass|not\s+passed|not\s+successful|\bunsuccessful\b|\bblocked\b|\bskipped\b|\bfailed\b|失败)/i;
  const passing = /(?:\bpassed\b|\bpass\b|\bsuccess(?:ful)?\b|通过|成功|exit\s*(?:code)?\s*[:=]?\s*0|0\s+failed|无失败)/i;
  const completion = /(?:完成前验证|fresh verification|completion verification|verification before completion)/i;

  return content.split(/\r?\n/).some(line => {
    const value = line.trim();
    if (!value || negative.test(value)) return false;

    if (completion.test(value)) {
      const actionMatch = value.match(/(?:运行|执行|命令|command|manual\s+(?:check|review|verification))\s*[:：]?\s*([^，,；;|]+)/i);
      return Boolean(actionMatch && actionMatch[1].trim().length >= 3 && passing.test(value));
    }

    const cells = markdownCells(value);
    if (cells.length < 2 || cells.some(cell => negative.test(cell))) return false;
    const resultIndex = cells.findIndex(cell => passing.test(cell));
    if (resultIndex <= 0) return false;
    const command = cells.slice(0, resultIndex).find(cell => {
      return cell.length >= 3 &&
        !/^(?:命令|command|验证项|类型|状态|结果|result)$/i.test(cell) &&
        !/^[-:]+$/.test(cell);
    });
    return Boolean(command);
  });
}

function markdownCells(line) {
  if (!line.includes('|')) return [];
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.replace(/`/g, '').trim());
}

function hasConcreteReviewArtifact(content, workbench, state, sourceRoot = '') {
  return collectReviewArtifactFingerprints(
    content,
    workbench,
    state,
    sourceRoot
  ).length > 0;
}

function collectReviewArtifactFingerprints(
  content,
  workbench,
  state,
  sourceRootOverride = ''
) {
  const sourceRoot = resolveReviewSourceRoot(state, sourceRootOverride);
  const artifacts = new Map();
  for (const line of content.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;
    const commandMatch = value.match(/\bgit\s+(diff|show)\s+([^|`]+)/i);
    if (commandMatch && sourceRoot) {
      const commandArgs = parseSafeGitReviewArgs(commandMatch[1], commandMatch[2]);
      const output = commandArgs ? readGitPatchOutput(sourceRoot, commandArgs) : '';
      if (output) {
        artifacts.set(`git:${commandArgs.join(' ')}`, sha256Text(output));
      }
    }
    const patchMatch = value.match(/(?:^|[\s|`])([^|\s`]+\.patch)(?:[\s|`]|$)/i);
    if (patchMatch) {
      const patchFile = resolveReviewPatchFile(workbench, patchMatch[1]);
      if (patchFile && isValidPatchFile(patchFile)) {
        artifacts.set(
          `patch:${path.relative(workbench, patchFile).split(path.sep).join('/')}`,
          sha256File(patchFile)
        );
      }
    }
    const pullRequestMatch = value.match(/https?:\/\/\S+\/(?:pull|pulls)\/(\d+)\b|\bPR\s*#(\d+)\b/i);
    const pullRequestNumber = pullRequestMatch?.[1] || pullRequestMatch?.[2];
    if (pullRequestNumber && sourceRoot) {
      const pullRequestRef = `refs/pull/${pullRequestNumber}/head`;
      if (gitRefExists(sourceRoot, pullRequestRef)) {
        const args = ['diff', '--binary', `HEAD...${pullRequestRef}`];
        const output = readGitPatchOutput(sourceRoot, args);
        if (output) artifacts.set(`pr:${pullRequestNumber}`, sha256Text(output));
      }
    }
    const branchMatch = value.match(/\bbranch\s*[:=]\s*([A-Za-z0-9._/-]+)/i);
    if (branchMatch && sourceRoot && gitRefExists(sourceRoot, branchMatch[1])) {
      const args = ['diff', '--binary', `HEAD...${branchMatch[1]}`];
      const output = readGitPatchOutput(sourceRoot, args);
      if (output) artifacts.set(`branch:${branchMatch[1]}`, sha256Text(output));
    }
  }
  return Array.from(artifacts, ([key, hash]) => ({ key, hash }));
}

function parseSafeGitReviewArgs(subcommand, rawArgs) {
  const tokens = String(rawArgs || '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.some(token => /[;&|><$(){}[\]\\'"]/.test(token))) return null;
  const allowedOptions = new Set([
    '--binary',
    '--cached',
    '--staged',
    '--merge-base',
    '--no-color',
    '--no-ext-diff',
    '--patch',
    '-p',
    '--full-index',
    '--'
  ]);
  if (tokens.some(token => token.startsWith('-') && !allowedOptions.has(token))) return null;
  return [subcommand.toLowerCase(), ...tokens];
}

function readGitPatchOutput(sourceRoot, args) {
  const [subcommand, ...rest] = Array.isArray(args) ? args : [];
  if (!['diff', 'show'].includes(subcommand)) return '';
  const result = spawnSync(
    'git',
    [
      '--no-pager',
      '-C',
      sourceRoot,
      subcommand,
      '--no-ext-diff',
      '--no-textconv',
      ...rest
    ],
    {
      env: createIsolatedGitPatchEnvironment(),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    }
  );
  const output = result.status === 0 ? String(result.stdout || '') : '';
  return isValidPatchContent(output) ? output : '';
}

function createIsolatedGitPatchEnvironment() {
  const env = { ...process.env };
  const blocked = new Set([
    'GIT_EXTERNAL_DIFF',
    'GIT_PAGER',
    'GIT_PAGER_IN_USE',
    'GIT_DIFF_OPTS',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_PARAMETERS',
    'GIT_EXEC_PATH',
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_NAMESPACE',
    'GIT_ATTR_SOURCE',
    'PAGER',
    'LESS',
    'LV'
  ]);
  for (const key of Object.keys(env)) {
    const normalizedKey = key.toUpperCase();
    if (
      blocked.has(normalizedKey) ||
      /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(normalizedKey)
    ) {
      delete env[key];
    }
  }
  return env;
}

function resolveReviewPatchFile(workbench, ref) {
  const value = String(ref || '').trim();
  if (!value || path.isAbsolute(value) || path.win32.isAbsolute(value)) return '';
  const root = path.resolve(workbench);
  const file = path.resolve(root, value);
  if (file === root || !file.startsWith(`${root}${path.sep}`)) return '';
  if (!hasNonEmptyFile(file) || fs.lstatSync(file).isSymbolicLink()) return '';
  const realRoot = fs.realpathSync(root);
  const realFile = fs.realpathSync(file);
  if (realFile === realRoot || !realFile.startsWith(`${realRoot}${path.sep}`)) return '';
  return realFile;
}

function isValidPatchFile(file) {
  return isValidPatchContent(fs.readFileSync(file, 'utf8'));
}

function isValidPatchContent(content) {
  if (!/^diff --git (?:"a\/[^"\r\n]+"|a\/\S+) (?:"b\/[^"\r\n]+"|b\/\S+)\r?$/m.test(content)) return false;
  return (
    /^@@\s+/m.test(content) ||
    /^GIT binary patch$/m.test(content) ||
    /^Binary files .+ differ$/m.test(content) ||
    /^(?:new file mode|deleted file mode|old mode|new mode|rename from|rename to)\s+/m.test(content)
  );
}

function hashCompletionEvidence(workbench) {
  const entries = readEvidence(workbench).filter(entry => entry.type !== 'verification.snapshot');
  return sha256Text(`${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function gitRefExists(sourceRoot, ref) {
  const result = spawnSync('git', ['-C', sourceRoot, 'rev-parse', '--verify', `${ref}^{commit}`], {
    encoding: 'utf8',
    stdio: 'ignore'
  });
  return result.status === 0;
}

function readEvidence(workbench) {
  const file = path.join(workbench, 'reports', 'evidence.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line, index) => ({ raw: line.trim(), line: index + 1 }))
    .filter(item => item.raw)
    .map(item => {
      try {
        return JSON.parse(item.raw);
      } catch {
        return { type: 'parse-error', raw: item.raw, line: item.line };
      }
    });
}

function appendEvidence(workbench, entry) {
  appendWorkbenchText(workbench, 'reports/evidence.jsonl', `${JSON.stringify(entry)}\n`);
}

function recommendNext(state) {
  const mode = normalizeMode(state.mode || DEFAULT_MODE);
  if (state.gates.gate1 !== 'approved') {
    return mode === 'lite'
      ? 'Next: complete brief.md, run check-workbench, then approve-scope.'
      : 'Next: complete scope/contract alignment, run check-workbench, then approve-scope.';
  }
  if (mode === 'lite') {
    if (state.gates.gate4 !== 'approved') return 'Next: implement the small change, record validation/evidence, then request-final/approve-final.';
    return 'Next: final actions may run only after explicit checks.';
  }
  if (state.gates.gate2 !== 'approved') {
    return 'Next: complete task plan, review strategy, validation skeleton and approve-plan.';
  }
  if (state.gates.gate3 !== 'approved') {
    return 'Next: execute approved tasks, fan-in review packs and validation, then run verify/request-review.';
  }
  if (state.gates.gate4 !== 'approved') {
    return 'Next: human reviews Gate Review artifacts, then request/approve Final gate.';
  }
  return 'Next: final actions may run only after explicit checks.';
}

function requireGate(state, gate) {
  if (state.gates[gate] !== 'approved') {
    throw new Error(`${GATE_ALIASES[gate] || gate} gate is not approved.`);
  }
  if (!hasGateHumanConfirmation(state, gate)) {
    throw new Error(
      `${GATE_ALIASES[gate]} gate is approved but missing explicit user confirmation. Re-run approval with --confirmed-by user --confirmation "<用户确认原话或摘要>".`
    );
  }
  const confirmation = state.humanConfirmations[gate];
  const currentContext = gateApprovalContext(state, gate);
  if (
    !confirmation.approvalContext ||
    JSON.stringify(confirmation.approvalContext) !== JSON.stringify(currentContext)
  ) {
    throw new Error(
      `${GATE_ALIASES[gate]} gate approval no longer matches current workflow state. Reinitialize or repeat the gate workflow with explicit user confirmation.`
    );
  }
}

function hasGateHumanConfirmation(state, gate) {
  const confirmation = state.humanConfirmations && state.humanConfirmations[gate];
  return (
    confirmation &&
    confirmation.confirmedBy === 'user' &&
    String(confirmation.confirmationText || '').trim().length >= 6
  );
}

function gateApprovalContext(state, gate) {
  const context = {
    mode: normalizeMode(state.mode || DEFAULT_MODE)
  };
  if (gate === 'gate1' || gate === 'gate2') {
    context.scopeArtifacts = gateArtifactSnapshot(state, 'gate1');
  }
  if (gate === 'gate2') {
    context.planArtifacts = gateArtifactSnapshot(state, 'gate2');
    context.scopeApprovalHash = sha256Text(JSON.stringify(
      state.humanConfirmations?.gate1?.approvalContext || null
    ));
    context.triggers = deepClone(state.artifacts?.triggers || {});
    context.execution = deepClone(state.execution || {});
    context.visualDecision = deepClone(state.validationDecisions?.visual || null);
  }
  if (gate === 'gate3' || gate === 'gate4') {
    context.verification = bindVerificationSnapshot(state.verificationSnapshot);
  }
  if (gate === 'gate4') {
    context.finalActions = deepClone(state.finalActions || {});
    context.finalActionTargets = deepClone(state.finalActionTargets || {});
  }
  return context;
}

function gateArtifactSnapshot(state, gate) {
  const workbench = path.resolve(String(state.workbench || '').trim());
  if (!state.workbench || !fs.existsSync(workbench)) {
    throw new Error(`${GATE_ALIASES[gate]} gate cannot snapshot a missing workbench.`);
  }
  const refs = gate === 'gate1'
    ? [
        'brief.md',
        'context.md',
        'specs/requirement-alignment.md',
        'specs/api-spec.md',
        'specs/ui-material-index.md',
        'ui/manifest.json',
        'specs/gate-1-brainstorming-questions.md'
      ]
    : [
        'plans/task-plan.md',
        'specs/api-contract.md',
        'specs/machine/api-contract.json',
        'specs/api-contract.json',
        'specs/ui-contract.md',
        'specs/machine/ui-contract.json',
        'specs/ui-contract.json',
        'specs/page-contract-matrix.md',
        'specs/behavior-contract.md',
        'specs/machine/review-contract.json',
        'specs/machine/validation-contract.json',
        'specs/machine/worktree-contract.json'
      ];
  const files = {};
  for (const ref of refs) {
    const file = path.resolve(workbench, ref);
    if (file !== workbench && !file.startsWith(`${workbench}${path.sep}`)) {
      throw new Error(`Gate artifact path escapes the workbench: ${ref}`);
    }
    if (!fs.existsSync(file)) {
      files[ref] = null;
      continue;
    }
    if (fs.lstatSync(file).isSymbolicLink()) {
      throw new Error(`Gate artifact must not be a symlink: ${ref}`);
    }
    if (!fs.statSync(file).isFile()) {
      throw new Error(`Gate artifact must be a regular file: ${ref}`);
    }
    const realWorkbench = fs.realpathSync(workbench);
    const realFile = fs.realpathSync(file);
    if (!realFile.startsWith(`${realWorkbench}${path.sep}`)) {
      throw new Error(`Gate artifact resolves outside the workbench: ${ref}`);
    }
    files[ref] = hashGateArtifactFile(ref, file);
  }
  return {
    files,
    sourceMaterialsHash: gate === 'gate1'
      ? fingerprintRequirementMaterials(workbench)
      : undefined
  };
}

function hashGateArtifactFile(ref, file) {
  if (!ref.endsWith('.json')) return sha256File(file);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return sha256File(file);
  }
  if (ref === 'specs/machine/validation-contract.json') {
    value = deepClone(value);
    delete value.sourceRevision;
  }
  return sha256Text(JSON.stringify(sortJsonValue(value)));
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, sortJsonValue(value[key])])
  );
}

function fingerprintRequirementMaterials(workbench) {
  const requirementDir = requirementRoot(workbench);
  const roots = ['source', 'input']
    .map(name => path.join(requirementDir, name))
    .filter(candidate => fs.existsSync(candidate));
  const workbenchUi = path.join(workbench, 'ui');
  if (fs.existsSync(workbenchUi)) roots.push(workbenchUi);
  const hash = crypto.createHash('sha256');
  let fileCount = 0;
  let byteCount = 0;
  const maxFiles = 10000;
  const maxBytes = 512 * 1024 * 1024;

  const visit = (root, current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const file = path.join(current, entry.name);
      const relative = path.relative(root, file).split(path.sep).join('/');
      if (entry.isSymbolicLink()) {
        throw new Error(`Requirement materials must not contain symlinks: ${file}`);
      }
      if (entry.isDirectory()) {
        hash.update(`dir\0${path.basename(root)}/${relative}\0`);
        visit(root, file);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`Requirement material is not a regular file: ${file}`);
      }
      fileCount += 1;
      const size = fs.statSync(file).size;
      byteCount += size;
      if (fileCount > maxFiles || byteCount > maxBytes) {
        throw new Error(
          `Requirement materials exceed the Gate snapshot limit (${maxFiles} files / ${maxBytes} bytes).`
        );
      }
      hash.update(`file\0${path.basename(root)}/${relative}\0${size}\0`);
      const descriptor = fs.openSync(file, 'r');
      try {
        const buffer = Buffer.allocUnsafe(1024 * 1024);
        let offset = 0;
        while (offset < size) {
          const read = fs.readSync(
            descriptor,
            buffer,
            0,
            Math.min(buffer.length, size - offset),
            offset
          );
          if (read <= 0) break;
          hash.update(buffer.subarray(0, read));
          offset += read;
        }
      } finally {
        fs.closeSync(descriptor);
      }
    }
  };

  for (const root of roots.sort()) {
    if (fs.lstatSync(root).isSymbolicLink()) {
      throw new Error(`Requirement material root must not be a symlink: ${root}`);
    }
    hash.update(`root\0${path.basename(root)}\0`);
    visit(root, root);
  }
  return `sha256:${hash.digest('hex')}`;
}

function bindVerificationSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    sourceRoot: snapshot.sourceRoot || '',
    sourceRevision: snapshot.sourceRevision || '',
    validation: snapshot.validation || '',
    validationHash: snapshot.validationHash || '',
    reviewPack: snapshot.reviewPack || '',
    reviewPackHash: snapshot.reviewPackHash || '',
    reviewArtifactHashes: deepClone(snapshot.reviewArtifactHashes || {}),
    evidenceHash: snapshot.evidenceHash || '',
    verificationTarget: deepClone(snapshot.verificationTarget || null),
    verificationTargetHash: snapshot.verificationTargetHash || '',
    fanIn: deepClone(snapshot.fanIn || []),
    fanInHash: snapshot.fanInHash || '',
    strict: snapshot.strict === true
  };
}

function validateUiSchemaExtract(workbench, schemaExtract) {
  const file = resolveWorkbenchRef(workbench, schemaExtract);
  if (!hasNonEmptyFile(file)) {
    throw new Error(`UI schema extract is missing or empty: ${schemaExtract}`);
  }
  const content = fs.readFileSync(file, 'utf8');
  if (!/资源映射|资源引用|图片图层|image-backed|oss|url\(|https?:\/\//i.test(content)) {
    throw new Error('UI schema extract must include resource mapping evidence for image-backed nodes.');
  }
}

function validateUiSchemaMapping(workbench, schemaExtractRef, schemaMapRef) {
  const extractFile = resolveWorkbenchRef(workbench, schemaExtractRef);
  const extractContent = hasNonEmptyFile(extractFile) ? fs.readFileSync(extractFile, 'utf8') : '';
  if (hasSchemaMapHeaders(extractContent)) return;

  const legacyMapFile = resolveWorkbenchRef(workbench, schemaMapRef);
  if (!hasNonEmptyFile(legacyMapFile)) {
    throw new Error(`UI schema extract must include the standard Schema-to-implementation mapping table. Legacy fallback is missing or empty: ${schemaMapRef}`);
  }
  const content = fs.readFileSync(legacyMapFile, 'utf8');
  if (!hasSchemaMapHeaders(content)) {
    throw new Error('UI schema extract or legacy UI schema map must include Schema 节点/路径, 设计值, 代码文件/组件/样式选择器, 实现值, 偏差说明.');
  }
}

function hasSchemaMapHeaders(content) {
  return [
    /Schema\s*节点\/路径|Schema\s*节点|schema_path/i,
    /设计值|design/i,
    /代码文件\/组件\/样式选择器|实现位置|selector|component/i,
    /实现值|implemented|actual/i,
    /偏差说明|deviation|notes/i
  ].every(pattern => pattern.test(content));
}

function hasReviewContractHeaders(content) {
  return [
    /\bRP\b|Review\s*Pack|审查包/i,
    /Scope|范围/i,
    /Diff\s*command|git\s+diff|patch|branch|PR|pull request|差异/i,
    /Files|文件/i,
    /Validation|验证/i,
    /Review\s*Focus|审查重点/i,
    /Risk|风险/i
  ].every(pattern => pattern.test(content));
}

function validateStrictReviewReadiness(workbench, sourceRoot = '') {
  const failures = [];
  const state = requireState(workbench);
  const reviewText = [
    path.join(workbench, 'specs', 'review-contract.md'),
    path.join(workbench, 'reviews', 'review-packs.md')
  ]
    .filter(file => fs.existsSync(file))
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n\n');
  if (!hasConcreteReviewArtifact(reviewText, workbench, state, sourceRoot)) {
    failures.push('strict Review gate requires review pack to point to a real diff, patch, branch, or PR.');
  }

  const codeReviewDir = path.join(workbench, 'reviews', 'code-review');
  if (state.execution?.reviewAgent === true || fs.existsSync(codeReviewDir)) {
    const reportFiles = fs.existsSync(codeReviewDir)
      ? fs.readdirSync(codeReviewDir).filter(name => name.endsWith('.md') && name !== 'README.md')
      : [];
    if (!reportFiles.length) {
      failures.push('strict Review gate requires a review-agent report with agent-approved or not-needed status.');
    } else {
      const reports = reportFiles.map(name => fs.readFileSync(path.join(codeReviewDir, name), 'utf8')).join('\n\n');
      if (/(?:status|状态)\s*[:：]\s*(?:pending|changes-requested)|(?:pending|changes-requested)\s*:\s*yes/i.test(reports)) {
        failures.push('strict Review gate has unresolved pending or changes-requested review-agent findings.');
      }
      if (!/(?:agent-approved|not-needed)(?:\s*:\s*yes|\s*\|)|(?:status|状态)\s*[:：]\s*(?:agent-approved|not-needed)/i.test(reports)) {
        failures.push('strict Review gate requires a structured agent-approved or not-needed review-agent conclusion.');
      }
    }
  }

  return failures;
}

function validateVisualEvidence(workbench, validationRef, state = requireState(workbench)) {
  const visualDecision = state.validationDecisions?.visual?.decision;
  if (visualDecision === 'not-applicable') return;
  if (visualDecision === 'blocked') {
    throw new Error('Verify failed. Visual validation remains blocked; resolve it or re-plan with explicit evidence.');
  }
  if (state.artifacts?.triggers?.visual === true) return;
  if (!hasUiManifest(workbench)) return;
  const file = resolveWorkbenchRef(workbench, validationRef);
  const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const hasVisualEvidence = /(截图|actual|expected|视觉|逐块|人工核对|像素|render|screenshot|ui-review|schema-only)/i.test(content);
  const blocked = /visual-validation-blocked|视觉验证阻塞|无法截图|无法启动页面|无法核对/i.test(content);
  const acceptedSkip = /用户.*(接受|同意|确认).*(跳过|暂不).*视觉|接受跳过视觉|同意跳过视觉/i.test(content);
  if (!hasVisualEvidence) {
    throw new Error('Verify failed. UI materials detected, but validation report lacks visual validation evidence.');
  }
  if (blocked && !acceptedSkip) {
    throw new Error('Verify failed. UI visual validation is blocked without explicit user acceptance to skip it.');
  }
}

function writeProjection(workbench, state) {
  writeWorkbenchJson(workbench, 'mission.state.json', projectState(state, workbench));
}

function projectState(state, workbench) {
  return {
    workflowVersion: state.workflowVersion,
    name: state.name,
    mode: state.mode || DEFAULT_MODE,
    phase: state.phase,
    gates: state.gates,
    gateNames: GATE_ALIASES,
    execution: state.execution,
    sourceRoot: state.sourceRoot || '',
    artifacts: state.artifacts || {},
    validationDecisions: state.validationDecisions || {},
    finalActions: state.finalActions || {},
    finalActionTargets: state.finalActionTargets || {},
    finalActionChecks: state.finalActionChecks || {},
    worktrees: normalizeWorktreeState(state.worktrees),
    verificationSnapshot: state.verificationSnapshot || null,
    humanConfirmations: state.humanConfirmations || {},
    checks: state.checks,
    recommendedNext: recommendNext(state),
    workbench,
    updatedAt: state.updatedAt
  };
}

function writeGateDecision(workbench, gate, state, options, name) {
  writeWorkbenchJson(workbench, path.join('gates', `gate-${gate}-decision.json`), {
    gate,
    name: name || GATE_ALIASES[`gate${gate}`],
    phase: state.phase,
    mode: state.mode || DEFAULT_MODE,
    gates: state.gates,
    execution: state.execution,
    options,
    decidedAt: now()
  });
}

function loadState(workbench, fallback) {
  const file = statePath(workbench);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function requireState(workbench) {
  const state = loadState(workbench, null);
  if (!state) throw new Error(`No state found. Run init first: ${workbench}`);
  if (state.workflowVersion !== WORKFLOW_VERSION) {
    if (MIGRATABLE_WORKFLOW_VERSIONS.has(state.workflowVersion)) {
      throw new Error(
        `Workflow state v${state.workflowVersion} must be migrated to v${WORKFLOW_VERSION}. Run init again with the original --source-root when required.`
      );
    }
    throw new Error(
      `Unsupported workflowVersion ${state.workflowVersion ?? 'missing'}; expected ${WORKFLOW_VERSION}.`
    );
  }
  state.mode = normalizeMode(state.mode || DEFAULT_MODE);
  state.workbench = workbench;
  state.checks = state.checks || deepClone(DEFAULT_STATE.checks);
  state.artifacts = state.artifacts || {};
  state.worktrees = normalizeWorktreeState(state.worktrees);
  state.sourceRoot = state.sourceRoot || '';
  if (state.mode !== 'lite' && !state.sourceRoot) {
    throw new Error(
      'Workflow state is missing sourceRoot. Run init again with --source-root <git-worktree>.'
    );
  }
  delete state.policies;
  delete state.checks.policy;
  delete state.checks.policyMissing;
  return state;
}

function saveState(workbench, state) {
  ensureDir(workbench);
  writeWorkbenchJson(workbench, 'state.json', state);
}

function statePath(workbench) {
  return path.join(workbench, 'state.json');
}

function appendEvent(workbench, type, payload) {
  appendWorkbenchText(
    workbench,
    'events.jsonl',
    `${JSON.stringify({ type, payload, at: now() })}\n`
  );
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--') || arg === '--') {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    const key = toCamel(arg.slice(2));
    if (!key || !/^[A-Za-z][A-Za-z0-9]*$/.test(key)) {
      throw new Error(`Invalid option name: ${arg}`);
    }
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      throw new Error(`Duplicate option: ${arg}`);
    }
    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      i += 1;
    }
  }
  return options;
}

function validateCommandOptions(command, options) {
  const allowed = COMMAND_OPTIONS.get(command);
  if (!allowed) return;
  for (const [key, value] of Object.entries(options)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown option for ${command}: --${toKebab(key)}`);
    }
    if (value === true && !BOOLEAN_OPTIONS.has(key)) {
      throw new Error(`Option --${toKebab(key)} requires a value.`);
    }
    if (BOOLEAN_OPTIONS.has(key)) {
      readBoolean(value, false);
    }
  }
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function toKebab(value) {
  return value.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
}

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true' || value === '1' || value === 'yes') return true;
  if (value === false || value === 'false' || value === '0' || value === 'no') return false;
  throw new Error(`Invalid boolean value: ${value}. Expected true or false.`);
}

function hasNonEmptyFile(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile() && fs.readFileSync(file, 'utf8').trim().length > 0;
}

function writeWorkbenchFileIfMissing(workbench, ref, content) {
  const file = resolveSafeWorkbenchWritePath(workbench, ref);
  if (fs.existsSync(file)) return;
  atomicWriteText(file, content);
}

function requiredWorkbenchFiles(workbench, state) {
  if (isLite(state)) {
    return ['brief.md', 'reports/validation.md'];
  }
  const files = [
    'context.md',
    'specs/requirement-alignment.md'
  ];
  const triggers = state.artifacts?.triggers || {};
  const uiRequired = triggers.ui === true || hasUiManifest(workbench);
  const apiRequired = triggers.api === true || hasApiMaterial(workbench);
  if (uiRequired) {
    files.push('specs/ui-contract.md');
    files.push('specs/ui-material-index.md');
  }
  if (apiRequired && uiRequired) files.push('specs/page-contract-matrix.md');
  return files;
}

function validateLiteBrief(workbench) {
  const file = path.join(workbench, 'brief.md');
  const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const confirmed = /(状态|结论|确认|scope).{0,30}(已确认|确认通过|approved|accepted)/i.test(content);
  const confirmedByUser = /(确认人|confirmedBy|confirmed by|用户|user)/i.test(content);
  if (!confirmed || !confirmedByUser) {
    throw new Error('Lite brief is not confirmed. Update brief.md with scope, non-scope, validation, and user confirmation summary.');
  }
}

function validateRequirementAlignment(workbench) {
  const file = path.join(workbench, 'specs', 'requirement-alignment.md');
  const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const confirmed = /(状态|结论|确认).{0,20}(已确认|确认通过|approved|accepted)/i.test(content);
  const confirmedByUser = /(确认人|confirmedBy|confirmed by|用户|user)/i.test(content);
  const hasBlockingOpen = /(阻塞|blocking|blocker).{0,40}(待确认|未确认|open|pending|TODO)/i.test(content);
  const explicitPending = /(状态|结论|确认).{0,20}(待确认|未确认|pending|not[- ]?approved)/i.test(content);
  if (!confirmed || !confirmedByUser || hasBlockingOpen || explicitPending) {
    throw new Error('Requirement alignment is not confirmed. Update specs/requirement-alignment.md with user-confirmed understanding, scope, rules, examples, contracts, and confirmation summary.');
  }
}

function validateGate1BrainstormingFanIn(workbench) {
  const questionFile = path.join(workbench, 'specs', 'gate-1-brainstorming-questions.md');
  if (!fs.existsSync(questionFile)) return;

  const questions = fs.readFileSync(questionFile, 'utf8');
  const hasEmptyAnswer = /你的答案：\s*(?:\r?\n)+\s*>\s*(?:\r?\n|$)/.test(questions);
  if (hasEmptyAnswer) {
    throw new Error('Gate 1 brainstorming questions are not fully answered. Fill specs/gate-1-brainstorming-questions.md or remove it before approving Scope gate.');
  }

  const fanInRefs = ['context.md', 'specs/requirement-alignment.md', 'plans/progress.md'];
  if (hasApiMaterial(workbench) && hasUiManifest(workbench)) fanInRefs.push('specs/page-contract-matrix.md');

  const fanInEvidenceRe = /(Brainstorming|问题清单|答案回填|已回填|已同步|澄清问题|fan-?in)/i;
  const missingFanIn = fanInRefs.filter(ref => {
    const file = resolveWorkbenchRef(workbench, ref);
    if (!hasNonEmptyFile(file)) return true;
    return !fanInEvidenceRe.test(fs.readFileSync(file, 'utf8'));
  });

  if (missingFanIn.length) {
    throw new Error(`Scope brainstorming answers are not fan-in to main workbench docs. Missing evidence in: ${missingFanIn.join(', ')}`);
  }
}

function requiredWorkbenchAlternatives(workbench, state) {
  if (isLite(state)) return [];
  const alternatives = [
    { label: 'context.md', refs: ['context.md', 'specs/context.md'] }
  ];
  if (hasApiMaterial(workbench)) {
    alternatives.push({ label: 'API contract', refs: ['specs/api-contract.md', 'specs/api-spec.md'] });
  }
  if (hasUiManifest(workbench)) {
    alternatives.push({ label: 'UI manifest', refs: ['ui/manifest.json', '../source/ui/manifest.json', '../input/ui/manifest.json'] });
  }
  return alternatives;
}

function hasApiMaterial(workbench) {
  return scanApiMaterial(workbench) || sourceCandidateDirs(workbench).some(candidate => scanApiMaterial(candidate));
}

function scanApiMaterial(rootDir) {
  if (!fs.existsSync(rootDir)) return false;
  const scan = (currentDir, depth) => {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      const name = entry.name;
      const lowerName = name.toLowerCase();
      if (name.startsWith('.') || GENERATED_WORKBENCH_DIRS.has(lowerName)) continue;
      if (API_MATERIAL_NAME_RE.test(name)) return true;
      if (entry.isDirectory() && depth < 2) {
        if (scan(path.join(currentDir, name), depth + 1)) return true;
      }
    }
    return false;
  };
  return scan(rootDir, 0);
}

function hasUiManifest(workbench) {
  return (
    fs.existsSync(path.join(workbench, 'ui', 'manifest.json')) ||
    sourceCandidateDirs(workbench).some(candidate => fs.existsSync(path.join(candidate, 'ui', 'manifest.json')))
  );
}

function sourceCandidateDirs(workbench) {
  const root = requirementRoot(workbench);
  const candidates = [path.join(root, 'source'), path.join(root, 'input')];
  return candidates.filter((entry, index, list) => list.indexOf(entry) === index);
}

function requirementRoot(workbench) {
  if (path.basename(workbench) === 'workbench') return path.dirname(workbench);
  return workbench;
}

function resolveWorkbenchRef(workbench, ref) {
  const clean = String(ref || '').split('#')[0].trim();
  if (!clean) return '';
  if (path.isAbsolute(clean)) return clean;
  return path.join(workbench, clean);
}

function resolveSafeWorkbenchReadRef(workbench, ref, options = {}) {
  const label = String(options.label || 'Workbench input').trim();
  const value = String(ref || '').split('#')[0].trim();
  if (!value || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new Error(`${label} must be a relative path inside the workbench.`);
  }

  const root = path.resolve(workbench);
  const file = path.resolve(root, value);
  if (file === root || !file.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} must stay inside the workbench: ${value}.`);
  }

  const relative = path.relative(root, file);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) break;
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} must not traverse a symlink: ${value}.`);
    }
  }

  if (fs.existsSync(file)) {
    if (!fs.statSync(file).isFile()) {
      throw new Error(`${label} must reference a regular file: ${value}.`);
    }
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(file);
    if (!realFile.startsWith(`${realRoot}${path.sep}`)) {
      throw new Error(`${label} resolves outside the workbench: ${value}.`);
    }
  } else if (options.mustExist || options.requireNonEmpty) {
    throw new Error(`${label} is missing: ${value}.`);
  }

  if (options.requireNonEmpty && !hasNonEmptyFile(file)) {
    throw new Error(`${label} is empty: ${value}.`);
  }
  return file;
}

function normalizeProjectSourceRoot(value) {
  const requested = path.resolve(String(value || '').trim());
  const root = discoverGitRoot(requested);
  if (!root) throw new Error(`Source root is not inside a Git repository: ${value || '-'}.`);
  return root;
}

function canonicalPath(value) {
  const resolved = path.resolve(String(value || '').trim());
  return fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
}

function discoverGitRoot(start) {
  const requested = path.resolve(String(start || '').trim() || '.');
  if (!fs.existsSync(requested)) return '';
  const cwd = fs.statSync(requested).isDirectory() ? requested : path.dirname(requested);
  const result = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  if (result.status !== 0) return '';
  const root = String(result.stdout || '').trim();
  return root && fs.existsSync(root) ? fs.realpathSync(root) : '';
}

function validationContractSourceRoot(workbench, state) {
  const triggers = state.artifacts?.triggers || {};
  if (triggers.e2e !== true && triggers.visual !== true) return '';
  const file = resolveWorkbenchRef(workbench, 'specs/machine/validation-contract.json');
  if (!hasNonEmptyFile(file)) return '';
  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error('Validation contract JSON is invalid.');
  }
  if (!String(contract.sourceRoot || '').trim()) return '';
  return resolveValidationSourceRoot(workbench, contract.sourceRoot);
}

function requireVerificationBinding(
  workbench,
  state,
  options = {},
  { requireExplicitWorktreeTarget = false, requireFanIn = true } = {}
) {
  const contractRoot = validationContractSourceRoot(workbench, state);
  const stateRoot = state.sourceRoot
    ? normalizeProjectSourceRoot(state.sourceRoot)
    : '';
  const requestedTarget = String(options.target || '').trim();

  if (state.execution?.worktree === true) {
    if (requireExplicitWorktreeTarget && !requestedTarget) {
      throw new Error(
        'Worktree verification requires --target to identify the registered integration target.'
      );
    }
    const selectedTarget = requestedTarget ||
      contractRoot ||
      state.verificationSnapshot?.sourceRoot ||
      '';
    if (!selectedTarget) {
      throw new Error(
        'Worktree verification requires a registered integration target via --target or validation contract sourceRoot.'
      );
    }
    const verified = inspectRegisteredWorktree(
      state,
      { target: selectedTarget },
      'verification'
    );
    if (
      contractRoot &&
      canonicalPath(contractRoot) !== canonicalPath(verified.entry.target)
    ) {
      throw new Error(
        'Validation contract sourceRoot must match the selected registered integration target.'
      );
    }
    const fanIn = requireFanIn
      ? validateRegisteredWorktreeFanIn(state, verified)
      : [];
    const identity = {
      kind: 'owned-worktree',
      registryKey: worktreeStateKey(verified.entry.target),
      target: verified.entry.target,
      branch: verified.entry.branch,
      baseCommit: verified.entry.baseCommit,
      gitCommonDir: verified.entry.gitCommonDir,
      intentNonce: verified.entry.intentNonce,
      head: verified.head
    };
    const fanInHash = sha256Text(JSON.stringify(fanIn));
    return {
      sourceRoot: verified.entry.target,
      identity,
      identityHash: sha256Text(JSON.stringify({ identity, fanIn })),
      fanIn,
      fanInHash
    };
  }

  const requestedMainRoot = requestedTarget
    ? canonicalPath(path.isAbsolute(requestedTarget)
      ? requestedTarget
      : path.resolve(stateRoot || workbench, requestedTarget))
    : '';
  const candidate = stateRoot ||
    requestedMainRoot ||
    discoverGitRoot(workbench) ||
    discoverGitRoot(requirementRoot(workbench));
  if (!candidate) {
    throw new Error(
      'Completion verification requires a Git source root; re-init with --source-root <git-worktree>.'
    );
  }
  const resolvedMainRoot = normalizeProjectSourceRoot(candidate);
  if (
    requestedMainRoot &&
    canonicalPath(requestedMainRoot) !== canonicalPath(resolvedMainRoot)
  ) {
    throw new Error(
      'Verification --target must match state.sourceRoot in main-serial execution.'
    );
  }
  if (
    contractRoot &&
    canonicalPath(contractRoot) !== canonicalPath(resolvedMainRoot)
  ) {
    throw new Error(
      'Validation contract sourceRoot must match state.sourceRoot in main-serial execution; multi-repository verification is not supported.'
    );
  }
  const identity = {
    kind: 'main-worktree',
    target: resolvedMainRoot,
    gitCommonDir: resolveGitCommonDir(resolvedMainRoot),
    head: resolveBaseCommit(resolvedMainRoot, 'HEAD')
  };
  return {
    sourceRoot: resolvedMainRoot,
    identity,
    identityHash: sha256Text(JSON.stringify({ identity, fanIn: [] })),
    fanIn: [],
    fanInHash: sha256Text('[]')
  };
}

function validateRegisteredWorktreeFanIn(state, selected) {
  const entries = Object.values(normalizeWorktreeState(state.worktrees).registry);
  if (state.execution?.mode === 'single-worktree-serial' && entries.length !== 1) {
    throw new Error(
      `single-worktree-serial verification requires exactly one registered target; found ${entries.length}.`
    );
  }
  const results = [];
  for (const entry of entries.sort((left, right) =>
    String(left.target).localeCompare(String(right.target))
  )) {
    const verified = inspectRegisteredWorktree(
      state,
      { target: entry.target },
      'verification fan-in'
    );
    const item = {
      registryKey: worktreeStateKey(verified.entry.target),
      target: verified.entry.target,
      branch: verified.entry.branch,
      baseCommit: verified.entry.baseCommit,
      gitCommonDir: verified.entry.gitCommonDir,
      intentNonce: verified.entry.intentNonce,
      head: verified.head,
      integrated: verified.entry.target === selected.entry.target
    };
    if (!item.integrated) {
      if (readWorktreeStatus(verified.entry.target).trim()) {
        throw new Error(
          `Multi-worktree fan-in is incomplete: ${verified.entry.target} is not clean.`
        );
      }
      const ancestor = spawnSync(
        'git',
        [
          '-C',
          selected.entry.target,
          'merge-base',
          '--is-ancestor',
          verified.head,
          selected.head
        ],
        { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] }
      );
      if (ancestor.status !== 0) {
        throw new Error(
          `Multi-worktree fan-in is incomplete: ${verified.entry.branch}@${verified.head} is not an ancestor of integration target ${selected.entry.branch}@${selected.head}.`
        );
      }
      item.integrated = true;
    }
    results.push(item);
  }
  return results;
}

function requireVerificationSourceRoot(workbench, state, options = {}, config = {}) {
  return requireVerificationBinding(workbench, state, options, config).sourceRoot;
}

function resolveReviewSourceRoot(state, override = '') {
  const candidate = override || state?.sourceRoot || '';
  if (!candidate) return '';
  try {
    return normalizeProjectSourceRoot(candidate);
  } catch {
    return '';
  }
}

function resolveExecutionCwd(sourceRoot, requestedCwd) {
  const candidate = requestedCwd === undefined
    ? sourceRoot
    : path.resolve(sourceRoot, String(requestedCwd || '').trim());
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) {
    throw new Error(`run-verification cwd does not exist: ${candidate}.`);
  }
  const root = fs.realpathSync(sourceRoot);
  const resolved = fs.realpathSync(candidate);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('run-verification --cwd must stay inside the source Git worktree.');
  }
  return resolved;
}

function resolveWritableWorkbenchRef(workbench, ref) {
  const value = String(ref || '').trim();
  if (!value) throw new Error('run-verification requires --report.');
  if (path.isAbsolute(value)) {
    throw new Error('run-verification --report must be relative to the workbench.');
  }
  const root = path.resolve(workbench);
  const file = path.resolve(root, value);
  if (file === root || !file.startsWith(`${root}${path.sep}`)) {
    throw new Error('run-verification --report must stay inside the workbench.');
  }
  ensureDir(path.dirname(file));
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) {
    throw new Error('run-verification --report cannot overwrite a symlink.');
  }
  const realRoot = fs.realpathSync(root);
  const realParent = fs.realpathSync(path.dirname(file));
  if (realParent !== realRoot && !realParent.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error('run-verification --report resolves outside the workbench.');
  }
  return file;
}

function readNonNegativeInteger(value, label) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing --${label}.`);
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`--${label} must be a non-negative integer.`);
  }
  return number;
}

function readPositiveInteger(value, label) {
  const number = readNonNegativeInteger(value, label);
  if (number === 0) throw new Error(`--${label} must be greater than zero.`);
  return number;
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function atomicWriteText(file, content) {
  ensureDir(path.dirname(file));
  const temp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  );
  try {
    fs.writeFileSync(temp, content);
    fs.renameSync(temp, file);
  } catch (error) {
    try {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
}

function writeWorkbenchJson(workbench, ref, value) {
  const file = resolveSafeWorkbenchWritePath(workbench, ref);
  atomicWriteText(file, `${JSON.stringify(value, null, 2)}\n`);
}

function appendWorkbenchText(workbench, ref, content) {
  const file = resolveSafeWorkbenchWritePath(workbench, ref);
  fs.appendFileSync(file, content, { encoding: 'utf8', mode: 0o600 });
}

function resolveSafeWorkbenchWritePath(workbench, ref) {
  const value = String(ref || '').trim();
  if (!value || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new Error(`Workbench output must be a relative path: ${ref || '-'}.`);
  }

  const root = path.resolve(workbench);
  ensureDir(root);
  const file = path.resolve(root, value);
  if (file === root || !file.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Workbench output must stay inside the workbench: ${value}.`);
  }

  const relativeParent = path.relative(root, path.dirname(file));
  let current = root;
  for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`Workbench output directory must not be a symlink: ${current}.`);
      }
      if (!stat.isDirectory()) {
        throw new Error(`Workbench output parent is not a directory: ${current}.`);
      }
    } else {
      fs.mkdirSync(current, { mode: 0o700 });
    }
  }

  const realRoot = fs.realpathSync(root);
  const realParent = fs.realpathSync(path.dirname(file));
  if (realParent !== realRoot && !realParent.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`Workbench output directory resolves outside the workbench: ${value}.`);
  }
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      throw new Error(`Workbench output file must not be a symlink: ${value}.`);
    }
    if (!stat.isFile()) {
      throw new Error(`Workbench output target is not a file: ${value}.`);
    }
  }
  return file;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function now() {
  return new Date().toISOString();
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function liteBriefTemplate(state) {
  return `# Lite Brief\n\n## 状态\n\n状态：待确认\n确认人：-\n\n## 本次要做\n\n- TODO\n\n## 本次不做\n\n- TODO\n\n## 验证方式\n\n- TODO\n\n## 用户确认摘要\n\n- TODO\n`;
}

function validationTemplate(_state, triggers = {}) {
  const structured = triggers.e2e || triggers.visual
    ? `\n## 结构化 E2E / Visual Evidence\n\n- Contract: \`specs/machine/validation-contract.json\`\n- E2E required: ${triggers.e2e === true}\n- Visual required: ${triggers.visual === true}\n- Evidence: \`reports/evidence.jsonl\`（\`test.e2e\` / \`test.visual\`）\n`
    : '';
  return `${readMissionAsset('report-template.md').trimEnd()}\n${structured}`;
}

function validationContractJsonTemplate(_state, triggers = {}) {
  return `${JSON.stringify(createValidationContract(triggers), null, 2)}\n`;
}

function contextTemplate(state) {
  return readMissionAsset('context-template.md')
    .replace('- 目标：', `- 目标：${state.name || '-'}`)
    .replace('- 需求工作台：', `- 需求工作台：${state.workbench || '-'}`)
    .replace('## 需求摘要\n', `## 需求摘要\n\n- 工作流模式：${state.mode || DEFAULT_MODE}`);
}

function requirementAlignmentTemplate() {
  return readMissionAsset('requirement-alignment-template.md');
}

function taskPlanTemplate() {
  return readMissionAsset('plan-template.md');
}

function progressTemplate() {
  return readMissionAsset('progress-template.md');
}

function reviewPacksTemplate() {
  return readMissionAsset('review-template.md');
}

function apiContractTemplate() {
  return `# API Contract\n\n## 接口清单\n\n| 接口 | Method | Path | 范围 | 状态 |\n| --- | --- | --- | --- | --- |\n| pending | pending | pending | pending | pending |\n\n## 字段映射\n\n| 字段 | 来源 | 类型 | 用途 | 风险 |\n| --- | --- | --- | --- | --- |\n| pending | pending | pending | pending | pending |\n\n## Loading / Empty / Error\n\n- pending\n`;
}

function apiContractJsonTemplate() {
  return `${JSON.stringify({ version: 1, apis: [], fields: [], states: { loading: [], empty: [], error: [] } }, null, 2)}\n`;
}

function uiContractTemplate() {
  return `# UI Contract\n\n## 画板绑定\n\n| 画板 | 版本 | Schema | 图片基线 | 状态 |\n| --- | --- | --- | --- | --- |\n| pending | pending | pending | optional | pending |\n\n## 强视觉节点\n\n- pending\n\n## 资源映射\n\n- pending\n\n## 可接受偏差\n\n- pending\n\n## 不可接受偏差\n\n- pending\n`;
}

function uiContractJsonTemplate() {
  return `${JSON.stringify({ version: 1, boards: [], assets: [], tolerances: { accepted: [], rejected: [] } }, null, 2)}\n`;
}

function uiMaterialIndexTemplate() {
  return `# UI 物料索引\n\n请优先运行：\n\n\`\`\`bash\nnode <plugin-root>/skills/mission-control/scripts/inspect-ui.js <workbench> --write-index true\n\`\`\`\n\n## 摘要\n\n- pending\n`;
}

function uiSchemaExtractTemplate() {
  return `# UI Schema Extract\n\n## 节点级提取\n\n- pending\n\n## Schema 到实现映射表\n\n| Schema 节点/路径 | 设计值 | 代码文件/组件/样式选择器 | 实现值 | 偏差说明 |\n| --- | --- | --- | --- | --- |\n| pending | pending | pending | pending | pending |\n\n## 资源映射\n\n- 图片图层 / image-backed nodes: pending\n- OSS / URL: pending\n`;
}

function pageContractMatrixTemplate() {
  return readMissionAsset('page-contract-matrix-template.md');
}

function behaviorContractTemplate() {
  return `# Behavior Contract\n\n结论：无状态机、权限、缓存、并发行为变更。\n\n## 复杂行为变更\n\n如存在状态机、权限、跳转、缓存、并发或异常分支，请把结论改为 blocked / partial / open，并在下表展开。\n\n| 行为 | 触发条件 | 预期结果 | 风险 | 验证 |\n| --- | --- | --- | --- | --- |\n`;
}

function reviewContractJsonTemplate() {
  return `${JSON.stringify({ version: 1, reviewPacks: [] }, null, 2)}\n`;
}

function gate1BrainstormingQuestionsTemplate() {
  return `# Gate 1 Brainstorming Questions\n\n> 仅在明确启用 \`--brainstorming true\` 或确实存在待确认问题时生成。用户回答后必须 fan-in 回 \`context.md\`、\`specs/requirement-alignment.md\` 和 \`plans/progress.md\`。\n\n## Questions\n\n### Q1\n\n问题：pending\n\n你的答案：\n>\n\nFan-in targets: context.md / specs/requirement-alignment.md / plans/progress.md\n`;
}

function worktreePlanTemplate() {
  return readMissionAsset('worktree-plan-template.md');
}

function worktreeContractJsonTemplate() {
  return `${JSON.stringify({
    version: 1,
    integrationTarget: '',
    worktrees: []
  }, null, 2)}\n`;
}

function agentIndexTemplate() {
  return `# Agent Index\n\n编码 worker 不得直接更新主控工作台；只写自己的 handoff 和验证记录。\n\n| Agent | RP | Worktree | Status | Handoff |\n| --- | --- | --- | --- | --- |\n| pending | pending | pending | pending | pending |\n`;
}

function codeReviewReadmeTemplate() {
  return `# Code Review Agent Outputs\n\n只读 review agent 的输出放在这里。输出必须 findings first。\n`;
}

function contractChangesTemplate() {
  return readMissionAsset('contract-change-template.md');
}

function integrationPlanTemplate() {
  return readMissionAsset('integration-plan-template.md');
}

function readMissionAsset(name) {
  const file = path.join(MISSION_ASSETS_DIR, name);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing mission-control asset: ${name}`);
  }
  return fs.readFileSync(file, 'utf8');
}

function printHelp() {
  console.log(`Usage:
  node scripts/supermaestro.js init <workbench> --name <name> --mode <lite|standard|strict> [--source-root <git-worktree>]
  node scripts/supermaestro.js scaffold <workbench> [--api true] [--ui true] [--e2e true] [--visual true] [--brainstorming true] [--worktree true] [--subagents true]
  node scripts/supermaestro.js status <workbench> [--json true]
  node scripts/supermaestro.js next <workbench> [--json true]
  node scripts/supermaestro.js resume <workbench> [--json true]
  node scripts/supermaestro.js check-workbench <workbench>
  node scripts/supermaestro.js check-contracts <workbench> [--strict true]
  node scripts/supermaestro.js check-reviewability <workbench> [--strict true] [--json true]
  node scripts/supermaestro.js source-revision <workbench> [--source-root <git-worktree>]
  node scripts/supermaestro.js run-verification <workbench> --program npm --args-json '["test"]' --report reports/npm-test.log [--artifacts <paths>]
  node scripts/supermaestro.js check <workbench> --action <create-worktree|create-branch> --target <path> --branch <branch> --base <git-ref>
  node scripts/supermaestro.js register-worktree <workbench> --target <path> --branch <branch> --base <git-ref>
  node scripts/supermaestro.js approve-scope <workbench> --confirmed-by user --confirmation <text>
  node scripts/supermaestro.js approve-plan <workbench> --execution-mode <main-serial|single-worktree-serial|multi-worktree-parallel> --confirmed-by user --confirmation <text> --worktree false --subagents false --checkpoint false [--sync-materials false] [--visual-decision <required|not-applicable|blocked> --visual-reason <reason>]
  node scripts/supermaestro.js evidence <workbench> --type test.e2e --platform weapp --data-mode uat --command <command> --result passed --required 1 --executed 1 --passed 1 --failed 0 --case-ids E2E-1 --artifacts <paths> --report <path> --exit-code 0 --source-revision <revision>
  node scripts/supermaestro.js evidence <workbench> --type test.visual --platform weapp --data-mode fixture --purpose design-conformance --command <command> --result passed --required 1 --executed 1 --passed 1 --failed 0 --case-ids VIS-1 --artifacts <paths> --report <path> --baseline-manifest <path> --baseline-hash <sha256> --expected <path> --actual <path> --diff <path> --diff-ratio 0 --max-diff-ratio 0.05 --exit-code 0 --source-revision <revision>
  node scripts/supermaestro.js check <workbench> --action code --ui true --schema-extract specs/ui-schema-extract.md
  node scripts/supermaestro.js check <workbench> --action code --non-ui true --reason <reason>
  node scripts/supermaestro.js check <workbench> --action <sync-materials|dispatch-subagent|checkpoint-commit> --target <registered-worktree>
  node scripts/supermaestro.js verify <workbench> --strict true
  node scripts/supermaestro.js request-review <workbench>
  node scripts/supermaestro.js approve-review <workbench> --review-accepted true --validation-accepted true --confirmed-by user --confirmation <text> [--validation <path>]
  node scripts/supermaestro.js request-final <workbench>
  node scripts/supermaestro.js approve-final <workbench> --confirmed-by user --confirmation <text> --merge false --commit false --push false --cleanup true --target <registered-worktree>
  node scripts/supermaestro.js check <workbench> --action <merge|commit|push>
  node scripts/supermaestro.js check <workbench> --action <cleanup|cleanup-worktree> --target <final-authorized-worktree>

Compatible aliases:
  approve-gate1 -> approve-scope
  approve-gate2 -> approve-plan
  request-gate3 -> request-review
  approve-gate3 -> approve-review
  request-gate4 -> request-final
  approve-gate4 -> approve-final
`);
}
