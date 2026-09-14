const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { fingerprintGitWorkingTree } = require('./source-fingerprint');
module.exports = function createWorktreeRegistry({
  normalizeProjectSourceRoot,
  toKebab,
  now,
  saveState,
  writeProjection,
  appendEvent,
  requireState,
  requireGate
}) {
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

  return {
    normalizeWorktreeState,
    worktreeStateKey,
    requireWorktreeSourceRoot,
    requirePathOption,
    isPathInside,
    canonicalPotentialPath,
    systemTemporaryRoots,
    normalizeWorktreeTarget,
    normalizeWorktreeBranch,
    resolveBaseCommit,
    authorizeWorktreeIntent,
    parseGitWorktreeList,
    resolveGitCommonDir,
    findLiveWorktree,
    assertLiveWorktreeMatches,
    registerWorktree,
    verifyRegisteredWorktreeForAction,
    inspectRegisteredWorktree,
    readWorktreeStatus,
    createCleanupBinding,
    assertCleanupBindingUnchanged
  };
};
