#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORKFLOW_VERSION = 1;
const DEFAULT_STATE = {
  phase: 'initialized',
  gates: {
    gate1: 'pending',
    gate2: 'locked',
    gate3: 'locked'
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
      case 'check':
        checkAction(workbench, options);
        break;
      case 'verify':
        verify(workbench, options);
        break;
      case 'request-gate2':
        requestGate2(workbench, options);
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
  const required = [
    'context.md',
    'plans/task-plan.md',
    'plans/progress.md',
    'reviews/review-packs.md',
    'reports/validation.md'
  ];
  const missing = required.filter(file => !hasNonEmptyFile(path.join(workbench, file)));

  state.checks.workbench = missing.length ? 'failed' : 'passed';
  state.checks.workbenchMissing = missing;
  state.updatedAt = now();
  saveState(workbench, state);
  appendEvent(workbench, 'check-workbench', { result: state.checks.workbench, missing });

  if (missing.length) {
    throw new Error(`Workbench check failed. Missing or empty: ${missing.join(', ')}`);
  }

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

  checkWorkbench(workbench);
  const nextState = requireState(workbench);
  nextState.phase = 'gate1_approved';
  nextState.gates.gate1 = 'approved';
  nextState.gates.gate2 = 'pending';
  nextState.execution = {
    mode: options.mode || 'main-serial',
    worktree: readBoolean(options.worktree, false),
    subagents: readBoolean(options.subagents, false),
    checkpoint: readBoolean(options.checkpoint, false)
  };
  nextState.updatedAt = now();
  saveState(workbench, nextState);
  writeGateDecision(workbench, 1, nextState, options);
  writeProjection(workbench, nextState);
  appendEvent(workbench, 'approve-gate1', nextState.execution);
  console.log('Gate 1 approved.');
}

function checkAction(workbench, options) {
  const state = requireState(workbench);
  const action = options.action;
  if (!action) throw new Error('Missing --action.');

  if (action === 'code') {
    requireGate(state, 'gate1');
    if (options.ui === 'true' && !options.schemaExtract) {
      throw new Error('UI coding requires --schema-extract.');
    }
    console.log('ALLOW code');
    return;
  }

  if (['commit', 'merge', 'push', 'cleanup'].includes(action)) {
    requireGate(state, 'gate3');
    console.log(`ALLOW ${action}`);
    return;
  }

  throw new Error(`Unknown action: ${action}`);
}

function verify(workbench, options) {
  const state = requireState(workbench);
  requireGate(state, 'gate1');

  const reviewPack = options.reviewPack || 'reviews/review-packs.md';
  const validation = options.validation || 'reports/validation.md';
  const missing = [reviewPack, validation].filter(file => !hasNonEmptyFile(path.join(workbench, file)));

  state.checks.reviewability = missing.length ? 'failed' : 'passed';
  state.checks.validation = missing.length ? 'failed' : 'passed';
  state.checks.verifyMissing = missing;
  state.updatedAt = now();
  saveState(workbench, state);
  appendEvent(workbench, 'verify', {
    strict: readBoolean(options.strict, false),
    result: missing.length ? 'failed' : 'passed',
    missing
  });

  if (missing.length) {
    throw new Error(`Verify failed. Missing or empty: ${missing.join(', ')}`);
  }

  console.log('Verify passed.');
}

function requestGate2(workbench, options) {
  const state = requireState(workbench);
  requireGate(state, 'gate1');
  verify(workbench, options);

  const nextState = requireState(workbench);
  nextState.phase = 'gate2_pending';
  nextState.gates.gate2 = 'review_requested';
  nextState.updatedAt = now();
  saveState(workbench, nextState);
  writeGateDecision(workbench, 2, nextState, options);
  writeProjection(workbench, nextState);
  appendEvent(workbench, 'request-gate2', {});
  console.log('Gate 2 requested.');
}

function recommendNext(state) {
  if (state.gates.gate1 !== 'approved') {
    return 'Next: complete workbench docs, run check-workbench, then approve-gate1.';
  }
  if (state.gates.gate2 !== 'review_requested') {
    return 'Next: execute approved tasks, fan-in review packs and validation, then run verify/request-gate2.';
  }
  if (state.gates.gate3 !== 'approved') {
    return 'Next: human reviews Gate 2 artifacts before any final action.';
  }
  return 'Next: final actions may run only after explicit checks.';
}

function requireGate(state, gate) {
  if (state.gates[gate] !== 'approved') {
    throw new Error(`${gate} is not approved.`);
  }
}

function writeProjection(workbench, state) {
  writeJson(path.join(workbench, 'mission.state.json'), {
    workflowVersion: state.workflowVersion,
    name: state.name,
    phase: state.phase,
    gates: state.gates,
    execution: state.execution,
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
  node scripts/supermaestro.js approve-gate1 <workbench> --mode main-serial --worktree false --subagents false --checkpoint false
  node scripts/supermaestro.js check <workbench> --action code
  node scripts/supermaestro.js verify <workbench> --strict true
  node scripts/supermaestro.js request-gate2 <workbench>
`);
}
