#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORKFLOW_VERSION = 1;
const GENERATED_WORKBENCH_DIRS = new Set(['gates', 'plans', 'reports', 'reviews', 'specs', 'ui', 'workbench']);
const API_MATERIAL_NAME_RE = /(api|swagger|openapi|postman|mock|interface|interfaces|接口|后端|联调|knife4j)/i;
const SUPERPOWER_EVIDENCE_RE = /(已读取|已调用|已使用|已吸收|已执行|已完成|used|loaded|applied|executed|completed)/i;
const SUPERPOWER_SKILLS = {
  writingPlans: 'superpowers:writing-plans',
  subagentDrivenDevelopment: 'superpowers:subagent-driven-development',
  executingPlans: 'superpowers:executing-plans',
  testDrivenDevelopment: 'superpowers:test-driven-development',
  systematicDebugging: 'superpowers:systematic-debugging',
  requestingCodeReview: 'superpowers:requesting-code-review',
  receivingCodeReview: 'superpowers:receiving-code-review',
  verificationBeforeCompletion: 'superpowers:verification-before-completion',
  finishingDevelopmentBranch: 'superpowers:finishing-a-development-branch'
};
const DEFAULT_STATE = {
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
  checks: {
    workbench: 'unknown',
    reviewability: 'unknown',
    validation: 'unknown'
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
    const options = parseArgs(args);

    switch (command) {
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
      case 'check-workbench':
        checkWorkbench(workbench);
        break;
      case 'approve-gate1':
        approveGate1(workbench, options);
        break;
      case 'approve-gate2':
        approveGate2(workbench, options);
        break;
      case 'check':
        checkAction(workbench, options);
        break;
      case 'verify':
        verify(workbench, options);
        break;
      case 'request-gate3':
        requestGate3(workbench, options);
        break;
      case 'approve-gate3':
        approveGate3(workbench, options);
        break;
      case 'request-gate4':
        requestGate4(workbench, options);
        break;
      case 'approve-gate4':
        approveGate4(workbench, options);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(`supermaestro: ${error.message}`);
    process.exit(1);
  }
}

function init(workbench, options) {
  ensureDir(workbench);
  ensureDir(path.join(workbench, 'events'));
  ensureDir(path.join(workbench, 'gates'));
  ensureDir(path.join(workbench, 'plans'));
  ensureDir(path.join(workbench, 'reviews'));
  ensureDir(path.join(workbench, 'reports'));
  ensureDir(path.join(workbench, 'specs'));

  const state = loadState(workbench, {
    ...DEFAULT_STATE,
    workflowVersion: WORKFLOW_VERSION,
    name: options.name || path.basename(path.dirname(workbench)),
    workbench,
    createdAt: now(),
    updatedAt: now()
  });

  saveState(workbench, state);
  writeProjection(workbench, state);
  appendEvent(workbench, 'init', { name: state.name });
  console.log(`Initialized SuperMaestro workbench: ${workbench}`);
}

function status(workbench) {
  const state = requireState(workbench);
  console.log(`Name: ${state.name}`);
  console.log(`Phase: ${state.phase}`);
  console.log(`Gate 1: ${state.gates.gate1}`);
  console.log(`Gate 2: ${state.gates.gate2}`);
  console.log(`Gate 3: ${state.gates.gate3}`);
  console.log(`Gate 4: ${state.gates.gate4}`);
  console.log(`Mode: ${state.execution.mode || '-'}`);
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
  console.log(recommendNext(state));
}

function checkWorkbench(workbench) {
  const state = requireState(workbench);
  const required = requiredWorkbenchFiles(workbench);
  const missing = required.filter(file => !hasNonEmptyFile(resolveWorkbenchRef(workbench, file)));
  const missingAlternatives = requiredWorkbenchAlternatives(workbench)
    .filter(entry => !entry.refs.some(ref => hasNonEmptyFile(resolveWorkbenchRef(workbench, ref))))
    .map(entry => entry.label);
  const allMissing = missing.concat(missingAlternatives);

  state.checks.workbench = allMissing.length ? 'failed' : 'passed';
  state.checks.workbenchMissing = allMissing;
  state.updatedAt = now();
  saveState(workbench, state);
  appendEvent(workbench, 'check-workbench', { result: state.checks.workbench, missing: allMissing });

  if (allMissing.length) {
    throw new Error(`Workbench check failed. Missing or empty: ${allMissing.join(', ')}`);
  }

  validateRequirementAlignment(workbench);
  validateGate1BrainstormingFanIn(workbench);
  console.log('Workbench check passed.');
}

function approveGate1(workbench, options) {
  const state = requireState(workbench);
  if (state.gates.gate1 === 'approved') {
    console.log('Gate 1 is already approved.');
    return;
  }
  if (!['initialized', 'gate1_pending'].includes(state.phase)) {
    throw new Error(`Cannot approve Gate 1 from phase: ${state.phase}`);
  }

  const confirmedBy = String(options.confirmedBy || options.by || '').trim();
  const confirmationText = String(options.confirmation || '').trim();
  if (confirmedBy !== 'user') {
    throw new Error('Gate 1 approval requires --confirmed-by user after explicit user confirmation.');
  }
  if (confirmationText.length < 6) {
    throw new Error('Gate 1 approval requires --confirmation "<用户确认原话或摘要>".');
  }

  checkWorkbench(workbench);
  const nextState = requireState(workbench);
  nextState.phase = 'gate1_approved';
  nextState.gates.gate1 = 'approved';
  nextState.gates.gate2 = 'pending';
  nextState.humanConfirmations = {
    ...(nextState.humanConfirmations || {}),
    gate1: {
      confirmedBy,
      confirmationText,
      confirmedAt: now()
    }
  };
  nextState.updatedAt = now();
  saveState(workbench, nextState);
  writeGateDecision(workbench, 1, nextState, options);
  writeProjection(workbench, nextState);
  appendEvent(workbench, 'approve-gate1', { confirmedBy });
  console.log('Gate 1 requirement-alignment approved.');
}

function approveGate2(workbench, options) {
  const state = requireState(workbench);
  if (state.gates.gate1 !== 'approved') {
    throw new Error('Cannot approve Gate 2 before Gate 1 requirement alignment is approved.');
  }
  if (state.gates.gate2 === 'approved') {
    console.log('Gate 2 is already approved.');
    return;
  }
  const confirmedBy = String(options.confirmedBy || options.by || '').trim();
  const confirmationText = String(options.confirmation || '').trim();
  if (confirmedBy !== 'user') {
    throw new Error('Gate 2 approval requires --confirmed-by user after explicit user confirmation.');
  }
  if (confirmationText.length < 6) {
    throw new Error('Gate 2 approval requires --confirmation "<用户确认原话或摘要>".');
  }

  checkWorkbench(workbench);
  validatePlanWorkbench(workbench);
  validateSuperpowerEvidence(workbench, [SUPERPOWER_SKILLS.writingPlans], 'approve-gate2');

  const nextState = requireState(workbench);
  nextState.phase = 'gate2_approved';
  nextState.gates.gate2 = 'approved';
  nextState.gates.gate3 = 'pending';
  nextState.execution = {
    mode: options.mode || 'main-serial',
    worktree: readBoolean(options.worktree, false),
    subagents: readBoolean(options.subagents, false),
    checkpoint: readBoolean(options.checkpoint, false)
  };
  nextState.humanConfirmations = {
    ...(nextState.humanConfirmations || {}),
    gate2: {
      confirmedBy,
      confirmationText,
      confirmedAt: now()
    }
  };
  nextState.updatedAt = now();
  saveState(workbench, nextState);
  writeGateDecision(workbench, 2, nextState, options);
  writeProjection(workbench, nextState);
  appendEvent(workbench, 'approve-gate2', nextState.execution);
  console.log('Gate 2 plan approved.');
}

function checkAction(workbench, options) {
  const state = requireState(workbench);
  const action = options.action;
  if (!action) throw new Error('Missing --action.');

  if (action === 'code') {
    requireGate(state, 'gate2');
    if (options.ui === 'true' && !options.schemaExtract) {
      throw new Error('UI coding requires --schema-extract.');
    }
    if (options.ui === 'true') {
      validateUiSchemaExtract(workbench, options.schemaExtract);
    }
    validateSuperpowerEvidence(
      workbench,
      [
        SUPERPOWER_SKILLS.testDrivenDevelopment,
        state.execution?.subagents === true
          ? SUPERPOWER_SKILLS.subagentDrivenDevelopment
          : SUPERPOWER_SKILLS.executingPlans
      ],
      'code'
    );
    console.log('ALLOW code');
    return;
  }

  if (['commit', 'merge', 'push', 'cleanup'].includes(action)) {
    requireGate(state, 'gate4');
    validateSuperpowerEvidence(
      workbench,
      [SUPERPOWER_SKILLS.verificationBeforeCompletion, SUPERPOWER_SKILLS.finishingDevelopmentBranch],
      action
    );
    console.log(`ALLOW ${action}`);
    return;
  }

  throw new Error(`Unknown action: ${action}`);
}

function verify(workbench, options) {
  const state = requireState(workbench);
  requireGate(state, 'gate2');

  const reviewPack = options.reviewPack || 'reviews/review-packs.md';
  const validation = options.validation || 'reports/validation.md';
  const missing = [reviewPack, validation].filter(file => !hasNonEmptyFile(path.join(workbench, file)));
  const requiredSuperpowers = [
    SUPERPOWER_SKILLS.testDrivenDevelopment,
    SUPERPOWER_SKILLS.verificationBeforeCompletion,
    state.execution?.subagents === true
      ? SUPERPOWER_SKILLS.subagentDrivenDevelopment
      : SUPERPOWER_SKILLS.executingPlans
  ];
  if (hasFailureOrReviewFinding(workbench)) requiredSuperpowers.push(SUPERPOWER_SKILLS.systematicDebugging);
  if (state.execution?.subagents === true || hasReviewAgentWork(workbench)) {
    requiredSuperpowers.push(SUPERPOWER_SKILLS.requestingCodeReview);
  }
  if (/changes-requested|changes requested/i.test(superpowerEvidenceText(workbench))) {
    requiredSuperpowers.push(SUPERPOWER_SKILLS.receivingCodeReview);
  }
  const missingSuperpowers = missingSuperpowerEvidence(workbench, Array.from(new Set(requiredSuperpowers)));

  state.checks.reviewability = missing.length ? 'failed' : 'passed';
  state.checks.validation = missing.length || missingSuperpowers.length ? 'failed' : 'passed';
  state.checks.verifyMissing = missing;

  if (missing.length || missingSuperpowers.length) {
    state.updatedAt = now();
    saveState(workbench, state);
    appendEvent(workbench, 'verify', {
      strict: readBoolean(options.strict, false),
      result: 'failed',
      missing,
      missingSuperpowers
    });
    const fileText = missing.length ? `Missing or empty: ${missing.join(', ')}` : '';
    const superpowerText = missingSuperpowers.length
      ? `Missing Superpowers evidence: ${missingSuperpowers.join(', ')}`
      : '';
    throw new Error(`Verify failed. ${[fileText, superpowerText].filter(Boolean).join('; ')}`);
  }

  validateVisualEvidence(workbench, validation);
  state.updatedAt = now();
  saveState(workbench, state);
  appendEvent(workbench, 'verify', {
    strict: readBoolean(options.strict, false),
    result: 'passed',
    missing
  });

  console.log('Verify passed.');
}

function requestGate3(workbench, options) {
  const state = requireState(workbench);
  requireGate(state, 'gate2');
  verify(workbench, options);

  const nextState = requireState(workbench);
  nextState.phase = 'gate3_pending';
  nextState.gates.gate3 = 'review_requested';
  nextState.updatedAt = now();
  saveState(workbench, nextState);
  writeGateDecision(workbench, 3, nextState, options);
  writeProjection(workbench, nextState);
  appendEvent(workbench, 'request-gate3', {});
  console.log('Gate 3 requested.');
}

function approveGate3(workbench, options) {
  const state = requireState(workbench);
  if (state.gates.gate3 !== 'review_requested') {
    throw new Error('Gate 3 is not pending. Run request-gate3 first.');
  }
  const reviewAccepted = readBoolean(options.review, true);
  const validationAccepted = readBoolean(options.validation, true);
  if (!reviewAccepted || !validationAccepted) {
    throw new Error('Gate 3 approval requires review and validation to be accepted.');
  }
  state.phase = 'gate3_approved';
  state.gates.gate3 = 'approved';
  state.gates.gate4 = 'pending';
  state.updatedAt = now();
  saveState(workbench, state);
  writeGateDecision(workbench, 3, state, options);
  writeProjection(workbench, state);
  appendEvent(workbench, 'approve-gate3', {});
  console.log('Gate 3 review approved.');
}

function requestGate4(workbench, options) {
  const state = requireState(workbench);
  requireGate(state, 'gate3');
  validateSuperpowerEvidence(
    workbench,
    [SUPERPOWER_SKILLS.verificationBeforeCompletion, SUPERPOWER_SKILLS.finishingDevelopmentBranch],
    'request-gate4'
  );
  state.phase = 'gate4_pending';
  state.gates.gate4 = 'final_requested';
  state.updatedAt = now();
  saveState(workbench, state);
  writeGateDecision(workbench, 4, state, options);
  writeProjection(workbench, state);
  appendEvent(workbench, 'request-gate4', {});
  console.log('Gate 4 requested.');
}

function approveGate4(workbench, options) {
  const state = requireState(workbench);
  if (state.gates.gate4 !== 'final_requested') {
    throw new Error('Gate 4 is not pending. Run request-gate4 first.');
  }
  validateSuperpowerEvidence(
    workbench,
    [SUPERPOWER_SKILLS.verificationBeforeCompletion, SUPERPOWER_SKILLS.finishingDevelopmentBranch],
    'approve-gate4'
  );
  state.phase = 'gate4_approved';
  state.gates.gate4 = 'approved';
  state.finalActions = {
    merge: readBoolean(options.merge, false),
    commit: readBoolean(options.commit, false),
    push: readBoolean(options.push, false),
    cleanup: readBoolean(options.cleanup, false)
  };
  state.updatedAt = now();
  saveState(workbench, state);
  writeGateDecision(workbench, 4, state, options);
  writeProjection(workbench, state);
  appendEvent(workbench, 'approve-gate4', state.finalActions);
  console.log('Gate 4 final-action approved.');
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

function hasSuperpowerEvidence(content, skill) {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sameLineEvidence = content.split(/\r?\n/).some(line => {
    return line.includes(skill) && !/pending\s*\//i.test(line) && SUPERPOWER_EVIDENCE_RE.test(line);
  });
  if (sameLineEvidence) return true;

  const skillEvidence = new RegExp(`${escaped}[\\s\\S]{0,240}${SUPERPOWER_EVIDENCE_RE.source}`, 'i');
  const evidenceSkill = new RegExp(`${SUPERPOWER_EVIDENCE_RE.source}[\\s\\S]{0,240}${escaped}`, 'i');
  const match = content.match(skillEvidence) || content.match(evidenceSkill);
  return Boolean(match && !/pending\s*\//i.test(match[0]));
}

function missingSuperpowerEvidence(workbench, skills) {
  const content = superpowerEvidenceText(workbench);
  return skills.filter(skill => !hasSuperpowerEvidence(content, skill));
}

function validateSuperpowerEvidence(workbench, skills, action) {
  const missing = missingSuperpowerEvidence(workbench, skills);
  if (!missing.length) return;
  throw new Error(
    `DENY ${action}: 缺少 Superpowers 调用证据：${missing.join(', ')}。请先实际读取/调用对应 skill，并在 reports/validation.md 的“Superpowers 调用证据”中记录已读取、已调用或已吸收的证据。`
  );
}

function hasFailureOrReviewFinding(workbench) {
  return /(bug|测试失败|构建失败|联调异常|review finding|changes-requested|changes requested|根因|失败)/i.test(
    superpowerEvidenceText(workbench)
  );
}

function hasReviewAgentWork(workbench) {
  return /(reviews\/code-review|agent-approved|changes-requested|findings)/i.test(
    superpowerEvidenceText(workbench)
  );
}

function recommendNext(state) {
  if (state.gates.gate1 !== 'approved') {
    return 'Next: complete requirement alignment, run check-workbench, then approve-gate1.';
  }
  if (state.gates.gate2 !== 'approved') {
    return 'Next: complete task plan docs and approve-gate2 with execution mode.';
  }
  if (state.gates.gate3 !== 'approved') {
    return 'Next: execute approved tasks, fan-in review packs and validation, then run verify/request-gate3.';
  }
  if (state.gates.gate4 !== 'approved') {
    return 'Next: human reviews Gate 3 artifacts, then request/approve Gate 4 final actions.';
  }
  return 'Next: final actions may run only after explicit checks.';
}

function requireGate(state, gate) {
  if (state.gates[gate] !== 'approved') {
    throw new Error(`${gate} is not approved.`);
  }
  if (gate === 'gate1' && !hasGateHumanConfirmation(state, 'gate1')) {
    throw new Error(
      'Gate 1 is approved but missing explicit user confirmation. Re-run approve-gate1 with --confirmed-by user --confirmation "<用户确认原话或摘要>".'
    );
  }
  if (gate === 'gate2' && !hasGateHumanConfirmation(state, 'gate2')) {
    throw new Error(
      'Gate 2 is approved but missing explicit user confirmation. Re-run approve-gate2 with --confirmed-by user --confirmation "<用户确认原话或摘要>".'
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

function validateVisualEvidence(workbench, validationRef) {
  if (!hasUiManifest(workbench)) return;
  const file = resolveWorkbenchRef(workbench, validationRef);
  const content = fs.readFileSync(file, 'utf8');
  const hasVisualEvidence = /(截图|actual|expected|视觉|逐块|人工核对|像素|render|screenshot|ui-review)/i.test(content);
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
    phase: state.phase,
    gates: state.gates,
    execution: state.execution,
    humanConfirmations: state.humanConfirmations || {},
    checks: state.checks,
    recommendedNext: recommendNext(state),
    updatedAt: state.updatedAt
  });
}

function writeGateDecision(workbench, gate, state, options) {
  writeJson(path.join(workbench, 'gates', `gate-${gate}-decision.json`), {
    gate,
    phase: state.phase,
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
  if (value === undefined || value === null) return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

function hasNonEmptyFile(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile() && fs.readFileSync(file, 'utf8').trim().length > 0;
}

function requiredWorkbenchFiles(workbench) {
  const files = [
    'specs/requirement-alignment.md'
  ];

  if (hasApiMaterial(workbench)) files.push('specs/api-spec.md');

  if (hasUiManifest(workbench)) {
    files.push('specs/ui-material-index.md');
    files.push('specs/ui-schema-extract.md');
  }

  if (needsPageContractMatrix(workbench)) {
    files.push('specs/page-contract-matrix.md');
  }

  return files;
}

function validateRequirementAlignment(workbench) {
  const file = path.join(workbench, 'specs', 'requirement-alignment.md');
  const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const confirmed = /(状态|结论|确认).{0,20}(已确认|确认通过|approved|accepted)/i.test(content);
  const confirmedByUser = /(确认人|confirmedBy|confirmed by|用户|user)/i.test(content);
  const hasBlockingOpen = /(阻塞|blocking|blocker).{0,40}(待确认|未确认|open|pending|TODO)/i.test(content);
  const explicitPending = /(状态|结论|确认).{0,20}(待确认|未确认|pending|not[- ]?approved)/i.test(content);
  if (!confirmed || !confirmedByUser || hasBlockingOpen || explicitPending) {
    throw new Error('Requirement alignment is not confirmed. Update specs/requirement-alignment.md with user-confirmed understanding, scope, rules, examples, and confirmation summary.');
  }
}

function validateGate1BrainstormingFanIn(workbench) {
  const questionFile = path.join(workbench, 'specs', 'gate-1-brainstorming-questions.md');
  if (!fs.existsSync(questionFile)) return;

  const questions = fs.readFileSync(questionFile, 'utf8');
  const hasEmptyAnswer = /你的答案：\s*(?:\r?\n)+\s*>\s*(?:\r?\n|$)/.test(questions);
  if (hasEmptyAnswer) {
    throw new Error('Gate 1 brainstorming questions are not fully answered. Fill specs/gate-1-brainstorming-questions.md or remove it before approving Gate 1.');
  }

  const fanInRefs = ['context.md', 'specs/requirement-alignment.md', 'plans/progress.md'];
  if (needsPageContractMatrix(workbench)) fanInRefs.push('specs/page-contract-matrix.md');

  const fanInEvidenceRe = /(Brainstorming|问题清单|答案回填|已回填|已同步|澄清问题|fan-?in)/i;
  const missingFanIn = fanInRefs.filter(ref => {
    const file = resolveWorkbenchRef(workbench, ref);
    if (!hasNonEmptyFile(file)) return true;
    return !fanInEvidenceRe.test(fs.readFileSync(file, 'utf8'));
  });

  if (missingFanIn.length) {
    throw new Error(`Gate 1 brainstorming answers are not fan-in to main workbench docs. Missing evidence in: ${missingFanIn.join(', ')}`);
  }
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
    throw new Error(`Gate 2 plan check failed. Missing or empty: ${missing.join(', ')}`);
  }
}

function requiredWorkbenchAlternatives(workbench) {
  const alternatives = [
    {
      label: 'context.md',
      refs: ['context.md', 'specs/context.md']
    }
  ];

  if (hasUiManifest(workbench)) {
    alternatives.push({
      label: 'UI manifest',
      refs: ['ui/manifest.json', '../source/ui/manifest.json', '../input/ui/manifest.json']
    });
  }

  return alternatives;
}

function needsPageContractMatrix(workbench) {
  return hasApiMaterial(workbench) && hasUiManifest(workbench);
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

function printHelp() {
  console.log(`Usage:
  node scripts/supermaestro.js init <workbench> --name <name>
  node scripts/supermaestro.js status <workbench>
  node scripts/supermaestro.js next <workbench>
  node scripts/supermaestro.js resume <workbench>
  node scripts/supermaestro.js check-workbench <workbench>
  node scripts/supermaestro.js approve-gate1 <workbench> --confirmed-by user --confirmation <text>
  node scripts/supermaestro.js approve-gate2 <workbench> --mode main-serial --confirmed-by user --confirmation <text> --worktree false --subagents false --checkpoint false
  node scripts/supermaestro.js check <workbench> --action code
  node scripts/supermaestro.js verify <workbench> --strict true
  node scripts/supermaestro.js request-gate3 <workbench>
  node scripts/supermaestro.js request-gate4 <workbench>
`);
}
