const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

function fingerprintGitWorkingTree(sourceRoot, options = {}) {
  const requestedRoot = path.resolve(String(sourceRoot || '').trim());
  if (!String(sourceRoot || '').trim() || !fs.existsSync(requestedRoot)) {
    throw new Error(`Validation sourceRoot does not exist: ${sourceRoot || '-'}.`);
  }

  const repositoryRoot = normalizeExistingPath(
    runGit(requestedRoot, ['rev-parse', '--show-toplevel']).trim()
  );
  if (!repositoryRoot) throw new Error(`Validation sourceRoot is not in a Git repository: ${requestedRoot}.`);
  const visitedRepositories = new Set(options._visitedRepositories || []);
  if (visitedRepositories.has(repositoryRoot)) {
    throw new Error(`Cyclic Git repository traversal while fingerprinting: ${repositoryRoot}.`);
  }
  visitedRepositories.add(repositoryRoot);

  const excludedRoots = Array.from(
    new Set(
      (options.excludePaths || [])
        .flatMap(item => [path.resolve(String(item || '')), normalizeExistingPath(item)])
        .filter(Boolean)
    )
  );
  const listed = runGit(repositoryRoot, ['ls-files', '-co', '--exclude-standard', '-z']);
  const relativeFiles = Array.from(new Set(listed.split('\0').filter(Boolean))).sort();
  const indexEntries = readIndexEntries(repositoryRoot);
  const hash = crypto.createHash('sha256');
  updateHashField(hash, 'supermaestro-git-working-tree-v2');

  for (const relativeFile of relativeFiles) {
    const absoluteFile = path.resolve(repositoryRoot, relativeFile);
    if (isWithinAny(absoluteFile, excludedRoots)) continue;
    updateHashField(hash, relativeFile);

    let stat;
    try {
      stat = fs.lstatSync(absoluteFile);
    } catch {
      updateHashField(hash, 'deleted');
      continue;
    }

    if (stat.isSymbolicLink()) {
      updateHashField(hash, 'symlink');
      updateHashField(hash, fs.readlinkSync(absoluteFile));
      continue;
    }
    if (stat.isFile()) {
      updateHashField(hash, stat.mode & 0o111 ? 'file+x' : 'file');
      updateHashField(hash, fs.readFileSync(absoluteFile));
      continue;
    }
    if (stat.isDirectory()) {
      const indexEntry = indexEntries.get(relativeFile);
      if (indexEntry?.mode === '160000') {
        updateHashField(hash, 'gitlink');
        updateHashField(hash, indexEntry.oid);
        try {
          const nestedRoot = normalizeExistingPath(
            runGit(absoluteFile, ['rev-parse', '--show-toplevel']).trim()
          );
          if (nestedRoot !== repositoryRoot && !visitedRepositories.has(nestedRoot)) {
            updateHashField(
              hash,
              fingerprintGitWorkingTree(absoluteFile, {
                excludePaths: options.excludePaths || [],
                _visitedRepositories: Array.from(visitedRepositories)
              })
            );
          } else {
            updateHashField(hash, 'uninitialized-gitlink');
          }
        } catch {
          updateHashField(hash, 'uninitialized-gitlink');
        }
        continue;
      }
    }

    updateHashField(hash, `other:${stat.mode}`);
  }

  return `git-working-tree:${hash.digest('hex')}`;
}

function readIndexEntries(repositoryRoot) {
  const entries = new Map();
  const output = runGit(repositoryRoot, ['ls-files', '-s', '-z']);
  for (const record of output.split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab < 0) continue;
    const metadata = record.slice(0, tab).split(' ');
    const relativeFile = record.slice(tab + 1);
    const [mode, oid] = metadata;
    if (mode && oid && relativeFile) entries.set(relativeFile, { mode, oid });
  }
  return entries;
}

function updateHashField(hash, value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(buffer.length));
  hash.update(length);
  hash.update(buffer);
}

function resolveValidationSourceRoot(workbench, sourceRoot) {
  const value = String(sourceRoot || '').trim();
  if (!value) throw new Error('Validation contract sourceRoot is required.');
  const resolvedRoot = path.isAbsolute(value) ? path.normalize(value) : path.resolve(workbench, value);
  const normalizedRoot = normalizeExistingPath(resolvedRoot);
  const normalizedWorkbench = normalizeExistingPath(workbench);
  if (
    normalizedRoot === normalizedWorkbench ||
    normalizedRoot.startsWith(`${normalizedWorkbench}${path.sep}`)
  ) {
    throw new Error('Validation sourceRoot must not be the workbench or a path inside it.');
  }
  return resolvedRoot;
}

function runGit(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) {
    const message = String(result.stderr || result.stdout || '').trim();
    throw new Error(`Cannot fingerprint validation source with Git: ${message || 'unknown error'}`);
  }
  return result.stdout;
}

function normalizeExistingPath(value) {
  const resolved = path.resolve(String(value || ''));
  if (!fs.existsSync(resolved)) return resolved;
  return fs.realpathSync(resolved);
}

function isWithinAny(file, roots) {
  const normalizedFile = path.resolve(String(file || ''));
  return roots.some(root => normalizedFile === root || normalizedFile.startsWith(`${root}${path.sep}`));
}

module.exports = {
  fingerprintGitWorkingTree,
  resolveValidationSourceRoot
};
