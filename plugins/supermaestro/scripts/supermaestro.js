#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORKFLOW_VERSION = 2;
const VALID_MODES = new Set(['lite', 'standard', 'strict']);
const DEFAULT_MODE = 'standard';
const DEFAULT_POLICY = 'superpowers';
const POLICY_DIR = path.join(__dirname, '..', 'policies');
const GENERATED_WORKBENCH_DIRS = new Set(['gates', 'plans', 'reports', 'reviews', 'specs', 'ui', 'workbench']);
const API_MATERIAL_NAME_RE = /(api|swagger|openapi|postman|mock|interface|interfaces|接口|后端|联调|knife4j)/i;
const SUPERPOWER_EVIDENCE_RE = /(已读取|已调用|已使用|已吸收|已执行|已完成|used|loaded|applied|executed|completed)/i;

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
    checkpoint: false
  },
  policies: {
    [DEFAULT_POLICY]: {
      enabled: true,
      enforcement: 'hard'
    }
  },
  checks: {
    workbench: 'unknown',
    reviewability: 'unknown',
    validation: 'unknown',
    policy: 'unknown'
  },
  artifacts: {}
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
    const options = parseArgs(args);
    const normalized = normalizeCommand(command);

    switch (normalized) {
      case 'init':
        init(workbench, options);
        break;
      case 'status':
        status(workbench);
        break;
      case 'next':
        next(workbench);
        break;
      case 'resume':
        resume(workbench);
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
    'approve-gate4': 'approve-final'
  };
  return aliases[command] || command;
}

function init(workbench, options) {
  ensureDir(workbench);
  ensureDir(path.join(workbench, 'gates'));

  const mode = normalizeMode(options.mode || DEFAULT_MODE);
  const state = loadState(workbench, {
    ...deepClone(DEFAULT_STATE),
    workflowVersion: WORKFLOW_VERSION,
    mode,
    gates: initialGatesForMode(mode),
    name: options.name || path.basename(requirementRoot(workbench)),
    workbench,
    createdAt: now(),
    updatedAt: now()
  });

  state.workflowVersion = state.workflowVersion || WORKFLOW_VERSION;
  state.mode = normalizeMode(options.mode || state.mode || DEFAULT_MODE);
  state.policies = normalizePolicies(options, state.policies);
  state.artifacts = state.artifacts || {};
  state.checks = state.checks || deepClone(DEFAULT_STATE.checks);
  state.updatedAt = now();

  saveState(workbench, state);
  writeProjection(workbench, state);
  appendEvent(workbench, 'init', { name: state.name, mode: state.mode, policies: state.policies });

  if (readBoolean(options.scaffold, false)) {
    scaffold(workbench, options);
  }

  console.log(`Initialized SuperMaestro workbench: ${workbench}`);
  console.log(`Mode: ${state.mode}`);
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

function normalizePolicies(options, existingPolicies) {
  const policies = { ...(existingPolicies || {}) };
  const names = String(options.policies || options.policy || DEFAULT_POLICY)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const enforcement = options.policyEnforcement || options.enforcement || 'hard';
  for (const name of names) {
    policies[name] = {
      enabled: !['false', 'off', 'disabled'].includes(String(options[`${name}Enabled`] || 'true').toLowerCase()),
      enforcement: ['hard', 'warn', 'off'].includes(String(enforcement).toLowerCase()) ? String(enforcement).toLowerCase() : 'hard'
    };
  }
  if (!Object.keys(policies).length) {
    policies[DEFAULT_POLICY] = { enabled: true, enforcement: 'hard' };
  }
  return policies;
}

function status(workbench) {
  const state = requireState(workbench);
  console.log(`Name: ${state.name}`);
  console.log(`Mode: ${state.mode || DEFAULT_MODE}`);
  console.log(`Phase: ${state.phase}`);
  console.log(`Scope: ${state.gates.gate1}`);
  console.log(`Plan: ${state.gates.gate2}`);
  console.log(`Review: ${state.gates.gate3}`);
  console.log(`Final: ${state.gates.gate4}`);
  console.log(`Mode: ${state.execution?.mode || '-'}`);
  console.log(`Policies: ${enabledPolicyNames(state).join(', ') || '-'}`);
  console.log(`Workbench: ${workbench}`);
}

function next(workbench) {
  const state = requireState(workbench);
  writeProjection(workbench, state);
  console.log(recommendNext(state));
}

function resume(workbench) {
  const state = requireState(workbench);
  writeProjection(workbench, state);
  console.log(`Resume ${state.name}: ${state.phase}`);
  console.log(`Mode: ${state.mode || DEFAULT_MODE}`);
  console.log(recommendNext(state));
}

function scaffold(workbench, options) {
  const state = requireState(workbench);
  const mode = normalizeMode(options.mode || state.mode || DEFAULT_MODE);
  const triggers = detectArtifactTriggers(workbench, options, mode);
  const artifacts = requiredArtifactsFor(mode, triggers);
  const created = [];

  for (const artifact of artifacts) {
    const file = path.join(workbench, artifact.path);
    if (!hasNonEmptyFile(file)) {
      writeIfMissing(file, artifact.content(state, triggers));
      created.push(artifact.path);
    }
  }

  state.mode = mode;
  state.artifacts = {
    ...(state.artifacts || {}),
    triggers,
    files: Array.from(new Set([...(state.artifacts?.files || []), ...artifacts.map(item => item.path)])).sort(),
    scaffoldedAt: now()
  };
  state.updatedAt = now();
  saveState(workbench, state);
  writeProjection(workbench, state);
  appendEvent(workbench, 'scaffold', { mode, triggers, created });
  console.log(`Scaffolded ${created.length} artifact(s) for ${mode} mode.`);
  if (created.length) {
    for (const file of created) console.log(`- ${file}`);
  }
}

function detectArtifactTriggers(workbench, options, mode) {
  const api = readBoolean(options.api, hasApiMaterial(workbench));
  const ui = readBoolean(options.ui, hasUiManifest(workbench));
  return {
    mode,
    api,
    ui,
    uiCoding: readBoolean(options.uiCoding || options.uiCode || options.ui, ui && mode === 'strict'),
    behavior: readBoolean(options.behavior, mode !== 'lite'),
    review: readBoolean(options.review, mode !== 'lite'),
    worktree: readBoolean(options.worktree, false),
    subagents: readBoolean(options.subagents, false),
    reviewAgent: readBoolean(options.reviewAgent || options.reviewAgentCheckpoint, false),
    contractChanges: readBoolean(options.contractChanges, false),
    integration: readBoolean(options.integration, false)
  };
}

function requiredArtifactsFor(mode, triggers) {
  const artifacts = [
    artifact('reports/evidence.jsonl', () => ''),
    artifact('reports/validation.md', validationTemplate),
  ];

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

  if (triggers.review) {
    artifacts.push(artifact('specs/review-contract.md', reviewContractTemplate));
    artifacts.push(artifact('specs/review-contract.json', reviewContractJsonTemplate));
  }

  if (triggers.api) {
    artifacts.push(artifact('specs/api-contract.md', apiContractTemplate));
    artifacts.push(artifact('specs/api-contract.json', apiContractJsonTemplate));
  }

  if (triggers.ui) {
    artifacts.push(artifact('specs/ui-contract.md', uiContractTemplate));
    artifacts.push(artifact('specs/ui-contract.json', uiContractJsonTemplate));
    artifacts.push(artifact('specs/ui-material-index.md', uiMaterialIndexTemplate));
  }

  if (triggers.uiCoding) {
    artifacts.push(artifact('specs/ui-schema-extract.md', uiSchemaExtractTemplate));
    artifacts.push(artifact('specs/ui-schema-map.md', uiSchemaMapTemplate));
  }

  if (triggers.api && triggers.ui) {
    artifacts.push(artifact('specs/page-contract-matrix.md', pageContractMatrixTemplate));
  }

  if (triggers.behavior) {
    artifacts.push(artifact('specs/behavior-contract.md', behaviorContractTemplate));
  }

  if (triggers.worktree) artifacts.push(artifact('worktrees/plan.md', worktreePlanTemplate));
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

function checkContracts(workbench, options = {}) {
  const state = requireState(workbench);
  const mode = normalizeMode(state.mode || DEFAULT_MODE);
  const hard = mode === 'strict' || readBoolean(options.strict, false);
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
  const issues = [];

  if (uiRequired) {
    requireNonEmpty(issues, workbench, 'specs/ui-contract.md', 'UI contract markdown is missing or empty.');
    requireJson(issues, workbench, 'specs/ui-contract.json', 'UI contract JSON is missing or invalid.');
    requireNonEmpty(issues, workbench, 'specs/ui-material-index.md', 'UI material index is missing or empty.');
  }

  if (uiCodingRequired) {
    requireNonEmpty(issues, workbench, 'specs/ui-schema-extract.md', 'UI schema extract is missing or empty.');
    if (requireNonEmpty(issues, workbench, 'specs/ui-schema-map.md', 'UI schema map is missing or empty.')) {
      const schemaMap = fs.readFileSync(path.join(workbench, 'specs/ui-schema-map.md'), 'utf8');
      if (!hasSchemaMapHeaders(schemaMap)) {
        issues.push({ level: 'FAIL', message: 'UI schema map must include Schema 节点/路径, 设计值, 代码文件/组件/样式选择器, 实现值, 偏差说明.' });
      }
    }
  }

  if (apiRequired) {
    if (requireNonEmpty(issues, workbench, 'specs/api-contract.md', 'API contract markdown is missing or empty.')) {
      validateApiContractContent(issues, workbench);
    }
    requireJson(issues, workbench, 'specs/api-contract.json', 'API contract JSON is missing or invalid.');
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

  return issues;
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
  const candidates = ['specs/review-contract.md', 'reviews/review-packs.md']
    .map(ref => resolveWorkbenchRef(workbench, ref))
    .filter(file => hasNonEmptyFile(file));
  if (!candidates.length) {
    issues.push({ level: 'FAIL', message: 'Review contract or review packs are missing.' });
    return;
  }
  const content = candidates.map(file => fs.readFileSync(file, 'utf8')).join('\n\n');
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
  if (state.gates.gate1 !== 'approved') {
    throw new Error('Cannot approve Plan gate before Scope gate is approved.');
  }
  if (state.gates.gate2 === 'approved') {
    console.log('Plan gate is already approved.');
    return;
  }
  requireUserConfirmation(options, 'Plan gate');
  checkWorkbench(workbench);
  validatePlanWorkbench(workbench);
  if (isStrict(state)) {
    checkContracts(workbench, { strict: true, phase: 'plan' });
  }
  validatePolicyEvidence(workbench, 'gate.plan.approve', 'approve-plan');

  const nextState = requireState(workbench);
  nextState.phase = 'plan_approved';
  nextState.gates.gate2 = 'approved';
  nextState.gates.gate3 = 'pending';
  nextState.execution = {
    mode: options.mode || options.executionMode || 'main-serial',
    worktree: readBoolean(options.worktree, false),
    subagents: readBoolean(options.subagents, false),
    checkpoint: readBoolean(options.checkpoint, false)
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
  const action = options.action;
  if (!action) throw new Error('Missing --action.');

  if (action === 'code') {
    requireCodingGate(state);
    if (hasUiManifest(workbench) && options.ui !== 'true') {
      const nonUi = options.nonUi === true || options.nonUi === 'true';
      const reason = String(options.reason || '').trim();
      if (!nonUi || reason.length < 6) {
        throw new Error('UI materials detected. Non-UI code checks require --non-ui true --reason "<原因>"; UI code checks require --ui true and --schema-extract.');
      }
    }
    if (options.ui === 'true' && !options.schemaExtract) {
      throw new Error('UI coding requires --schema-extract.');
    }
    if (options.ui === 'true') {
      validateUiSchemaExtract(workbench, options.schemaExtract);
      if (isStrict(state)) {
        validateUiSchemaMap(workbench, options.schemaMap || 'specs/ui-schema-map.md');
      }
    }
    validatePolicyEvidence(workbench, 'action.code', 'code');
    console.log('ALLOW code');
    return;
  }

  if (action === 'dispatch-subagent') {
    requireGate(state, 'gate2');
    if (state.execution?.subagents !== true) {
      throw new Error('Gate 2 execution mode did not enable subagents.');
    }
    validatePolicyEvidence(workbench, 'action.dispatch-subagent', 'dispatch-subagent');
    console.log('ALLOW dispatch-subagent');
    return;
  }

  if (['commit', 'merge', 'push', 'cleanup'].includes(action)) {
    requireGate(state, 'gate4');
    validatePolicyEvidence(workbench, 'action.final', action);
    console.log(`ALLOW ${action}`);
    return;
  }

  throw new Error(`Unknown action: ${action}`);
}

function verify(workbench, options) {
  const state = requireState(workbench);
  requireCodingGate(state);

  const reviewPack = options.reviewPack || 'reviews/review-packs.md';
  const validation = options.validation || 'reports/validation.md';
  const required = [validation];
  if (!isLite(state)) required.unshift(reviewPack);
  const missing = required.filter(file => !hasNonEmptyFile(path.join(workbench, file)));

  const policyResult = checkPolicyEvidence(workbench, 'gate.review.request');
  const hardPolicyFailures = policyResult.failures.filter(item => item.enforcement === 'hard');
  const strictContractFailures = isStrict(state) ? checkContracts(workbench, { strict: true, phase: 'review', silent: true }).failures : [];
  const strictReviewFailures = isStrict(state) ? validateStrictReviewReadiness(workbench) : [];

  state.checks.reviewability = missing.length ? 'failed' : 'passed';
  state.checks.validation = missing.length || hardPolicyFailures.length || strictContractFailures.length || strictReviewFailures.length ? 'failed' : 'passed';
  state.checks.verifyMissing = missing;
  state.checks.policyMissing = policyResult.failures;
  state.checks.contractMissing = strictContractFailures;
  state.checks.strictReviewMissing = strictReviewFailures;

  if (missing.length || hardPolicyFailures.length || strictContractFailures.length || strictReviewFailures.length) {
    state.updatedAt = now();
    saveState(workbench, state);
    appendEvent(workbench, 'verify', {
      strict: readBoolean(options.strict, false),
      result: 'failed',
      missing,
      policyMissing: policyResult.failures,
      contractMissing: strictContractFailures,
      strictReviewMissing: strictReviewFailures
    });
    const fileText = missing.length ? `Missing or empty: ${missing.join(', ')}` : '';
    const policyText = hardPolicyFailures.length
      ? `Missing policy evidence: ${hardPolicyFailures.map(item => item.label).join(', ')}`
      : '';
    const contractText = strictContractFailures.length
      ? `Contract failures: ${strictContractFailures.map(item => item.message).join(', ')}`
      : '';
    const reviewText = strictReviewFailures.length
      ? `Strict review failures: ${strictReviewFailures.join(', ')}`
      : '';
    throw new Error(`Verify failed. ${[fileText, policyText, contractText, reviewText].filter(Boolean).join('; ')}`);
  }

  validateVisualEvidence(workbench, validation);
  state.updatedAt = now();
  saveState(workbench, state);
  appendEvent(workbench, 'verify', {
    strict: readBoolean(options.strict, false),
    result: 'passed',
    missing,
    warnings: policyResult.failures.filter(item => item.enforcement === 'warn')
  });

  console.log('Verify passed.');
  if (policyResult.failures.some(item => item.enforcement === 'warn')) {
    console.log(`Warnings: ${policyResult.failures.map(item => item.label).join(', ')}`);
  }
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
  nextState.updatedAt = now();
  saveState(workbench, nextState);
  writeGateDecision(workbench, 3, nextState, options, 'review');
  writeProjection(workbench, nextState);
  appendEvent(workbench, 'gate.requested', { gate: 'review' });
  console.log('Review gate requested.');
}

function approveReview(workbench, options) {
  const state = requireState(workbench);
  if (isLite(state)) {
    console.log('Review gate is skipped in lite mode.');
    return;
  }
  if (state.gates.gate3 !== 'review_requested') {
    throw new Error('Review gate is not pending. Run request-review first.');
  }
  const reviewAccepted = readBoolean(options.review, true);
  const validationAccepted = readBoolean(options.validation, true);
  if (!reviewAccepted || !validationAccepted) {
    throw new Error('Review gate approval requires review and validation to be accepted.');
  }
  state.phase = 'review_approved';
  state.gates.gate3 = 'approved';
  state.gates.gate4 = 'pending';
  state.updatedAt = now();
  saveState(workbench, state);
  writeGateDecision(workbench, 3, state, options, 'review');
  writeProjection(workbench, state);
  appendEvent(workbench, 'gate.approved', { gate: 'review' });
  console.log('Review gate approved.');
}

function requestFinal(workbench, options) {
  const state = requireState(workbench);
  if (isLite(state)) {
    requireGate(state, 'gate1');
    verify(workbench, options);
  } else {
    requireGate(state, 'gate3');
  }
  validatePolicyEvidence(workbench, 'gate.final.request', 'request-final');
  state.phase = 'final_pending';
  state.gates.gate4 = 'final_requested';
  state.updatedAt = now();
  saveState(workbench, state);
  writeGateDecision(workbench, 4, state, options, 'final');
  writeProjection(workbench, state);
  appendEvent(workbench, 'gate.requested', { gate: 'final' });
  console.log('Final gate requested.');
}

function approveFinal(workbench, options) {
  const state = requireState(workbench);
  if (state.gates.gate4 !== 'final_requested') {
    throw new Error('Final gate is not pending. Run request-final first.');
  }
  requireUserConfirmation(options, 'Final gate');
  validatePolicyEvidence(workbench, 'gate.final.approve', 'approve-final');
  state.phase = 'final_approved';
  state.gates.gate4 = 'approved';
  state.finalActions = {
    merge: readBoolean(options.merge, false),
    commit: readBoolean(options.commit, false),
    push: readBoolean(options.push, false),
    cleanup: readBoolean(options.cleanup, false)
  };
  state.updatedAt = now();
  saveState(workbench, state);
  writeGateDecision(workbench, 4, state, options, 'final');
  writeProjection(workbench, state);
  appendEvent(workbench, 'gate.approved', { gate: 'final', finalActions: state.finalActions });
  console.log('Final gate approved.');
}

function addEvidenceCommand(workbench, options) {
  requireState(workbench);
  const type = options.type || 'skill.used';
  const entry = {
    type,
    at: now(),
    phase: options.phase || '',
    skill: options.skill || '',
    command: options.command || '',
    result: options.result || '',
    summary: options.summary || options.reason || '',
    source: options.source || 'agent'
  };
  if (type.startsWith('skill.') && !entry.skill) {
    throw new Error('Skill evidence requires --skill.');
  }
  if (type === 'skill.skipped' && !entry.summary) {
    throw new Error('Skipped skill evidence requires --summary or --reason.');
  }
  appendEvidence(workbench, entry);
  appendEvent(workbench, 'evidence.added', { type: entry.type, skill: entry.skill, phase: entry.phase });
  console.log(`Evidence added: ${entry.type}${entry.skill ? ` ${entry.skill}` : ''}`);
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
  state.humanConfirmations = {
    ...(state.humanConfirmations || {}),
    [gate]: {
      confirmedBy: String(options.confirmedBy || options.by || '').trim(),
      confirmationText: String(options.confirmation || '').trim(),
      confirmedAt: now()
    }
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
}

function enabledPolicyNames(state) {
  return Object.entries(state.policies || {})
    .filter(([, config]) => config && config.enabled !== false && config.enforcement !== 'off')
    .map(([name]) => name);
}

function loadPolicy(name) {
  const file = path.join(POLICY_DIR, `${name}.policy.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Policy not found: ${name} (${file})`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function checkPolicyEvidence(workbench, eventName) {
  const state = requireState(workbench);
  const failures = [];
  const warnings = [];
  for (const [name, config] of Object.entries(state.policies || {})) {
    if (!config || config.enabled === false || config.enforcement === 'off') continue;
    const policy = loadPolicy(name);
    const requirements = requirementsForEvent(policy, eventName, state);
    for (const requirement of requirements) {
      if (!matchesWhen(requirement.when, state)) continue;
      const result = checkRequirementEvidence(workbench, requirement);
      if (result.ok) continue;
      const enforcement = requirement.enforcement || config.enforcement || policy.defaultEnforcement || 'hard';
      const item = {
        policy: name,
        event: eventName,
        label: result.label,
        enforcement
      };
      failures.push(item);
      if (enforcement === 'warn') warnings.push(item);
    }
  }
  return { failures, warnings };
}

function validatePolicyEvidence(workbench, eventName, action) {
  const result = checkPolicyEvidence(workbench, eventName);
  const hardFailures = result.failures.filter(item => item.enforcement === 'hard');
  const warnFailures = result.failures.filter(item => item.enforcement === 'warn');
  const state = requireState(workbench);
  state.checks = { ...(state.checks || {}) };
  state.checks.policy = hardFailures.length ? 'failed' : 'passed';
  state.checks.policyMissing = result.failures;
  state.updatedAt = now();
  saveState(workbench, state);
  appendEvent(workbench, 'policy.check', { event: eventName, result: hardFailures.length ? 'failed' : 'passed', failures: result.failures });
  if (hardFailures.length) {
    throw new Error(
      `DENY ${action}: 缺少 policy evidence：${hardFailures.map(item => item.label).join(', ')}。请先实际读取/调用对应 skill，并记录到 reports/evidence.jsonl；迁移期也兼容 reports/validation.md。`
    );
  }
  if (warnFailures.length) {
    console.log(`Policy warnings: ${warnFailures.map(item => item.label).join(', ')}`);
  }
}

function requirementsForEvent(policy, eventName, state) {
  const requirements = policy.requirements || {};
  const mode = normalizeMode(state.mode || DEFAULT_MODE);
  const common = asArray(requirements[eventName]);
  const byMode = asArray(requirements[`${eventName}#${mode}`]);
  return common.concat(byMode);
}

function checkRequirementEvidence(workbench, requirement) {
  if (requirement.skill) {
    const ok = hasSkillEvidence(workbench, requirement.skill, requirement.allowSkipWithReason);
    return { ok, label: requirement.skill };
  }
  if (requirement.oneOf) {
    const skills = asArray(requirement.oneOf);
    const ok = skills.some(skill => hasSkillEvidence(workbench, skill, requirement.allowSkipWithReason));
    return { ok, label: `one of ${skills.join(' | ')}` };
  }
  return { ok: true, label: 'unknown requirement' };
}

function hasSkillEvidence(workbench, skill, allowSkipWithReason) {
  const evidence = readEvidence(workbench);
  const structured = evidence.some(entry => {
    if (entry.skill !== skill) return false;
    if (['skill.used', 'skill.applied', 'skill.loaded'].includes(entry.type)) return true;
    if (allowSkipWithReason && entry.type === 'skill.skipped' && String(entry.summary || entry.reason || '').trim().length >= 6) return true;
    return false;
  });
  if (structured) return true;
  return hasLegacySuperpowerEvidence(superpowerEvidenceText(workbench), skill, allowSkipWithReason);
}

function readEvidence(workbench) {
  const file = path.join(workbench, 'reports', 'evidence.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { type: 'parse-error', raw: line };
      }
    });
}

function appendEvidence(workbench, entry) {
  const file = path.join(workbench, 'reports', 'evidence.jsonl');
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

function superpowerEvidenceText(workbench) {
  return [
    path.join(workbench, 'reports', 'validation.md'),
    path.join(workbench, 'plans', 'task-plan.md'),
    path.join(workbench, 'plans', 'progress.md'),
    path.join(workbench, 'reviews', 'review-packs.md')
  ]
    .filter(file => fs.existsSync(file))
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n\n');
}

function hasLegacySuperpowerEvidence(content, skill, allowSkipWithReason) {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (allowSkipWithReason) {
    const skipRe = new RegExp(`${escaped}[\\s\\S]{0,240}(跳过|skip|skipped)[\\s\\S]{0,240}(原因|reason)`, 'i');
    if (skipRe.test(content)) return true;
  }
  const sameLineEvidence = content.split(/\r?\n/).some(line => {
    return line.includes(skill) && !/pending\s*\//i.test(line) && SUPERPOWER_EVIDENCE_RE.test(line);
  });
  if (sameLineEvidence) return true;

  const skillEvidence = new RegExp(`${escaped}[\\s\\S]{0,240}${SUPERPOWER_EVIDENCE_RE.source}`, 'i');
  const evidenceSkill = new RegExp(`${SUPERPOWER_EVIDENCE_RE.source}[\\s\\S]{0,240}${escaped}`, 'i');
  const match = content.match(skillEvidence) || content.match(evidenceSkill);
  return Boolean(match && !/pending\s*\//i.test(match[0]));
}

function matchesWhen(when, state) {
  if (!when) return true;
  for (const [key, expected] of Object.entries(when)) {
    const actual = key.split('.').reduce((node, part) => node?.[part], state);
    if (actual !== expected) return false;
  }
  return true;
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
  if ((gate === 'gate1' || gate === 'gate2') && !hasGateHumanConfirmation(state, gate)) {
    throw new Error(
      `${GATE_ALIASES[gate]} gate is approved but missing explicit user confirmation. Re-run approval with --confirmed-by user --confirmation "<用户确认原话或摘要>".`
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

function validateUiSchemaExtract(workbench, schemaExtract) {
  const file = resolveWorkbenchRef(workbench, schemaExtract);
  if (!hasNonEmptyFile(file)) {
    throw new Error(`UI schema extract is missing or empty: ${schemaExtract}`);
  }
  const content = fs.readFileSync(file, 'utf8');
  if (!/\|\s*Schema 节点\/路径\s*\|\s*设计值\s*\|\s*代码文件\/组件\/样式选择器\s*\|\s*实现值\s*\|\s*偏差说明\s*\|/i.test(content)) {
    throw new Error('UI schema extract must include the standard Schema-to-implementation mapping table.');
  }
  if (!/资源映射|资源引用|图片图层|image-backed|oss|url\(|https?:\/\//i.test(content)) {
    throw new Error('UI schema extract must include resource mapping evidence for image-backed nodes.');
  }
}

function validateUiSchemaMap(workbench, schemaMapRef) {
  const file = resolveWorkbenchRef(workbench, schemaMapRef);
  if (!hasNonEmptyFile(file)) {
    throw new Error(`UI schema map is missing or empty: ${schemaMapRef}`);
  }
  const content = fs.readFileSync(file, 'utf8');
  if (!hasSchemaMapHeaders(content)) {
    throw new Error('UI schema map must include Schema 节点/路径, 设计值, 代码文件/组件/样式选择器, 实现值, 偏差说明.');
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

function validateStrictReviewReadiness(workbench) {
  const failures = [];
  const reviewText = [
    path.join(workbench, 'specs', 'review-contract.md'),
    path.join(workbench, 'reviews', 'review-packs.md')
  ]
    .filter(file => fs.existsSync(file))
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n\n');
  if (!/(git diff|diff command|patch|branch|PR|pull request)/i.test(reviewText)) {
    failures.push('strict Review gate requires review pack to point to a real diff, patch, branch, or PR.');
  }

  const state = requireState(workbench);
  if (state.artifacts?.triggers?.reviewAgent === true || fs.existsSync(path.join(workbench, 'reviews', 'code-review'))) {
    if (!hasSkillEvidence(workbench, 'superpowers:requesting-code-review', false)) {
      failures.push('strict Review gate requires superpowers:requesting-code-review evidence when review agent is enabled.');
    }
  }

  if (/changes-requested|changes requested/i.test(superpowerEvidenceText(workbench))) {
    const handled = hasSkillEvidence(workbench, 'superpowers:receiving-code-review', false) ||
      /(技术性驳回|technical rejection|not applicable|超范围)/i.test(superpowerEvidenceText(workbench));
    if (!handled) {
      failures.push('changes-requested review findings require receiving-code-review evidence or explicit technical rejection.');
    }
  }

  return failures;
}

function validateVisualEvidence(workbench, validationRef) {
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
  writeJson(path.join(workbench, 'mission.state.json'), {
    workflowVersion: state.workflowVersion,
    name: state.name,
    mode: state.mode || DEFAULT_MODE,
    phase: state.phase,
    gates: state.gates,
    gateNames: GATE_ALIASES,
    execution: state.execution,
    policies: state.policies || {},
    artifacts: state.artifacts || {},
    humanConfirmations: state.humanConfirmations || {},
    checks: state.checks,
    recommendedNext: recommendNext(state),
    updatedAt: state.updatedAt
  });
}

function writeGateDecision(workbench, gate, state, options, name) {
  writeJson(path.join(workbench, 'gates', `gate-${gate}-decision.json`), {
    gate,
    name: name || GATE_ALIASES[`gate${gate}`],
    phase: state.phase,
    mode: state.mode || DEFAULT_MODE,
    gates: state.gates,
    execution: state.execution,
    policies: state.policies || {},
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
  state.mode = normalizeMode(state.mode || DEFAULT_MODE);
  state.policies = normalizePolicies({}, state.policies);
  state.checks = state.checks || deepClone(DEFAULT_STATE.checks);
  state.artifacts = state.artifacts || {};
  return state;
}

function saveState(workbench, state) {
  ensureDir(workbench);
  writeJson(statePath(workbench), state);
}

function statePath(workbench) {
  return path.join(workbench, 'state.json');
}

function appendEvent(workbench, type, payload) {
  const file = path.join(workbench, 'events.jsonl');
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify({ type, payload, at: now() })}\n`);
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = toCamel(arg.slice(2));
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

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true' || value === '1' || value === 'yes') return true;
  if (value === false || value === 'false' || value === '0' || value === 'no') return false;
  return fallback;
}

function hasNonEmptyFile(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile() && fs.readFileSync(file, 'utf8').trim().length > 0;
}

function writeIfMissing(file, content) {
  if (fs.existsSync(file)) return;
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
}

function requiredWorkbenchFiles(workbench, state) {
  if (isLite(state)) {
    return ['brief.md', 'reports/validation.md'];
  }
  const files = [
    'context.md',
    'specs/requirement-alignment.md'
  ];
  if (hasApiMaterial(workbench)) files.push('specs/api-contract.md');
  if (hasUiManifest(workbench)) {
    files.push('specs/ui-contract.md');
    files.push('specs/ui-material-index.md');
  }
  if (hasApiMaterial(workbench) && hasUiManifest(workbench)) files.push('specs/page-contract-matrix.md');
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

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
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

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function liteBriefTemplate(state) {
  return `# Lite Brief\n\n## 状态\n\n状态：待确认\n确认人：-\n\n## 本次要做\n\n- TODO\n\n## 本次不做\n\n- TODO\n\n## 验证方式\n\n- TODO\n\n## 用户确认摘要\n\n- TODO\n`;
}

function validationTemplate() {
  return `# 验证报告\n\n## Superpowers / Policy Evidence\n\n结构化证据优先记录到 \`reports/evidence.jsonl\`。迁移期可在此保留人工可读摘要。\n\n## 命令\n\n| 命令 | 结果 | 摘要 |\n| --- | --- | --- |\n| pending | pending | pending |\n\n## UI / Visual Validation\n\n- pending\n\n## 风险与阻塞\n\n- pending\n`;
}

function contextTemplate(state) {
  return `# 共享上下文\n\n需求：${state.name || '-'}\n模式：${state.mode || DEFAULT_MODE}\n\n## 导航\n\n- source: ../source\n- specs: specs/\n- plans: plans/\n- reviews: reviews/\n- reports: reports/\n\n## 已确认事实\n\n- pending\n\n## AI 推断\n\n- pending\n\n## 待确认问题\n\n- pending\n`;
}

function requirementAlignmentTemplate() {
  return `# Scope & Contract Alignment\n\n## 状态\n\n状态：待确认\n确认人：-\n\n## 本次范围\n\n- pending\n\n## 非范围\n\n- pending\n\n## 需求事实\n\n- pending\n\n## AI 推断\n\n- pending\n\n## Contract 摘要\n\n- UI Contract：按需见 \`specs/ui-contract.md\`\n- API Contract：按需见 \`specs/api-contract.md\`\n- Behavior Contract：按需见 \`specs/behavior-contract.md\`\n\n## 验收场景\n\n- pending\n\n## 用户确认摘要\n\n- pending\n`;
}

function taskPlanTemplate() {
  return `# Plan & Review Strategy\n\n## Execution Mode\n\n- mode: pending\n- worktree: false\n- subagents: false\n- checkpoint: false\n\n## Superpowers\n\n- pending: superpowers:writing-plans\n\n## RP DAG\n\n- RP1: pending\n\n## Review Strategy\n\n- 每个 RP 必须指向真实 diff、patch、branch 或 PR。\n\n## Validation Strategy\n\n- pending\n`;
}

function progressTemplate() {
  return `# Progress\n\n## 当前阶段\n\n- pending\n\n## 阻塞项\n\n- pending\n\n## 日志\n\n- pending\n`;
}

function reviewPacksTemplate() {
  return `# Review Packs\n\n## 规则\n\n每个 RP 必须指向真实 diff、patch、branch 或 PR，不能只列 Markdown 摘要。\n\n## RP1\n\n- Scope: pending\n- Diff command: pending\n- Files: pending\n- Validation: pending\n- Risk: pending\n`;
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

function uiSchemaMapTemplate() {
  return `# UI Schema Map\n\n| Schema 节点/路径 | 设计值 | 代码文件/组件/样式选择器 | 实现值 | 偏差说明 |\n| --- | --- | --- | --- | --- |\n| pending | pending | pending | pending | pending |\n`;
}

function pageContractMatrixTemplate() {
  return `# Page Contract Matrix\n\n| 页面/模块 | PRD source_ref | UI 画板/schema | API/mock | 公共契约 | RP |\n| --- | --- | --- | --- | --- | --- |\n| pending | pending | pending | pending | pending | pending |\n`;
}

function behaviorContractTemplate() {
  return `# Behavior Contract\n\n## 状态机\n\n- pending\n\n## 交互规则\n\n- pending\n\n## 跳转 / 权限 / 缓存 / 并发\n\n- pending\n\n## 埋点\n\n- pending\n`;
}

function reviewContractTemplate() {
  return `# Review Contract\n\n| RP | Scope | Diff command | Files | Validation | Review Focus | Risk |\n| --- | --- | --- | --- | --- | --- | --- |\n| RP1 | pending | pending | pending | pending | pending | pending |\n`;
}

function reviewContractJsonTemplate() {
  return `${JSON.stringify({ version: 1, reviewPacks: [] }, null, 2)}\n`;
}

function worktreePlanTemplate() {
  return `# Worktree Plan\n\n- base: pending\n- location: pending\n- branch naming: pending\n- cleanup: requires Final gate\n`;
}

function agentIndexTemplate() {
  return `# Agent Index\n\n编码 worker 不得直接更新主控工作台；只写自己的 handoff 和验证记录。\n\n| Agent | RP | Worktree | Status | Handoff |\n| --- | --- | --- | --- | --- |\n| pending | pending | pending | pending | pending |\n`;
}

function codeReviewReadmeTemplate() {
  return `# Code Review Agent Outputs\n\n只读 review agent 的输出放在这里。输出必须 findings first。\n`;
}

function contractChangesTemplate() {
  return `# Contract Changes\n\n只有发生或预计发生公共契约变更时使用。\n`;
}

function integrationPlanTemplate() {
  return `# Integration Plan\n\n仅当需要独立集成分支或集成计划时使用。\n`;
}

function printHelp() {
  console.log(`Usage:
  node scripts/supermaestro.js init <workbench> --name <name> --mode <lite|standard|strict>
  node scripts/supermaestro.js scaffold <workbench> [--api true] [--ui true] [--worktree true] [--subagents true]
  node scripts/supermaestro.js status <workbench>
  node scripts/supermaestro.js next <workbench>
  node scripts/supermaestro.js resume <workbench>
  node scripts/supermaestro.js check-workbench <workbench>
  node scripts/supermaestro.js check-contracts <workbench> [--strict true]
  node scripts/supermaestro.js approve-scope <workbench> --confirmed-by user --confirmation <text>
  node scripts/supermaestro.js approve-plan <workbench> --mode main-serial --confirmed-by user --confirmation <text> --worktree false --subagents false --checkpoint false
  node scripts/supermaestro.js evidence <workbench> --type skill.used --skill superpowers:writing-plans --phase plan --summary <text>
  node scripts/supermaestro.js check <workbench> --action code --non-ui true --reason <reason>
  node scripts/supermaestro.js check <workbench> --action dispatch-subagent
  node scripts/supermaestro.js verify <workbench> --strict true
  node scripts/supermaestro.js request-review <workbench>
  node scripts/supermaestro.js approve-review <workbench> --review true --validation true
  node scripts/supermaestro.js request-final <workbench>
  node scripts/supermaestro.js approve-final <workbench> --confirmed-by user --confirmation <text> --merge false --commit false --push false --cleanup false

Compatible aliases:
  approve-gate1 -> approve-scope
  approve-gate2 -> approve-plan
  request-gate3 -> request-review
  approve-gate3 -> approve-review
  request-gate4 -> request-final
  approve-gate4 -> approve-final
`);
}
