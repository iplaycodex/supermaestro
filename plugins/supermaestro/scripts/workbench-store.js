const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const JOURNAL = '.supermaestro-transaction.json';
const LOCK = '.supermaestro-lock.json';
let activeSession = null;

function beginTransaction() {
  if (!activeSession) throw new Error('State transitions require a workbench session.');
  activeSession.transactional = true;
}

function atomicWriteText(file, content) {
  captureWrite(file, content);
  replaceFile(file, content);
}

function replaceFile(file, content, mode = 0o600) {
  ensureDir(path.dirname(file));
  const temp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  );
  try {
    fs.writeFileSync(temp, content, { mode });
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
  if (activeSession?.transactional) {
    const previous = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
    atomicWriteText(file, Buffer.concat([previous, Buffer.from(content)]));
    return;
  }
  fs.appendFileSync(file, content, { encoding: 'utf8', mode: 0o600 });
}

function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// 每次写入前持久化回滚信息；中断后必须恢复事务才能再次使用门禁。
function captureWrite(file, content) {
  const session = activeSession;
  if (!session?.transactional) return;
  const ref = path.relative(session.workbench, path.resolve(file));
  const safeFile = resolveSafeWorkbenchWritePath(session.workbench, ref);
  if ([JOURNAL, LOCK].includes(ref)) throw new Error('Reserved workbench transaction path.');
  let entry = session.journal.entries.find(item => item.ref === ref);
  if (!entry) {
    const exists = fs.existsSync(safeFile);
    entry = {
      ref,
      before: exists ? fs.readFileSync(safeFile).toString('base64') : null,
      mode: exists ? fs.statSync(safeFile).mode & 0o777 : 0o600,
      writtenHashes: []
    };
    session.journal.entries.push(entry);
  }
  entry.writtenHashes.push(hash(content));
  replaceFile(resolveSafeWorkbenchWritePath(session.workbench, JOURNAL), JSON.stringify(session.journal));
}

function assertWorkbenchReady(workbench) {
  if (activeSession?.workbench === path.resolve(workbench)) return;
  for (const ref of [JOURNAL, LOCK]) {
    if (fs.existsSync(path.join(workbench, ref))) {
      throw new Error('Workbench has an active or interrupted transaction. Run recover-workbench after the writer exits.');
    }
  }
}

function acquireLock(workbench, recover = false) {
  const file = resolveSafeWorkbenchWritePath(workbench, LOCK);
  if (recover && fs.existsSync(file)) {
    const owner = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error('Invalid workbench lock owner; inspect the lock before recovery.');
    try {
      process.kill(owner.pid, 0);
      throw new Error('Workbench writer is still active; recovery refused.');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    fs.unlinkSync(file);
  }
  try {
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Workbench writer is active or interrupted. Run recover-workbench after it exits.');
    throw error;
  }
  return () => fs.unlinkSync(file);
}

function rollback(workbench, journal) {
  if (journal.version !== 1 || !Array.isArray(journal.entries) || !['pending', 'committed'].includes(journal.phase)) {
    throw new Error('Invalid workbench transaction journal.');
  }
  if (journal.phase === 'committed') return;
  const seen = new Set();
  const entries = journal.entries.map(entry => {
    if (!entry || typeof entry.ref !== 'string') {
      throw new Error('Invalid transaction output reference.');
    }
    const file = resolveSafeWorkbenchWritePath(workbench, entry.ref);
    const relative = path.relative(path.resolve(workbench), file);
    const identity = process.platform === 'win32' ? relative.toLowerCase() : relative;
    if ([JOURNAL, LOCK].includes(identity) || seen.has(identity)) throw new Error('Invalid transaction output reference.');
    seen.add(identity);
    if (entry.before !== null && typeof entry.before !== 'string') throw new Error('Invalid transaction before-image.');
    if (!Array.isArray(entry.writtenHashes)) throw new Error('Invalid transaction hashes.');
    const before = entry.before === null ? null : Buffer.from(entry.before, 'base64');
    if (before !== null && before.toString('base64') !== entry.before) throw new Error('Invalid transaction before-image encoding.');
    const currentHash = fs.existsSync(file) ? hash(fs.readFileSync(file)) : null;
    const beforeHash = before === null ? null : hash(before);
    if (currentHash !== beforeHash && !entry.writtenHashes.includes(currentHash)) {
      throw new Error(`Recovery refused: ${entry.ref} changed outside the transaction. Preserve and resolve those changes first.`);
    }
    return { ...entry, file, before, unchanged: currentHash === beforeHash };
  });
  // 先核验所有文件，避免恢复到一半才发现用户修改。
  for (const entry of entries.reverse()) {
    if (entry.unchanged) continue;
    if (entry.before === null) fs.unlinkSync(entry.file);
    else replaceFile(entry.file, entry.before, Number.isInteger(entry.mode) ? entry.mode & 0o777 : 0o600);
  }
}

function recoverWorkbench(workbench) {
  const release = acquireLock(workbench, true);
  try {
    const file = resolveSafeWorkbenchWritePath(workbench, JOURNAL);
    if (fs.existsSync(file)) {
      rollback(workbench, JSON.parse(fs.readFileSync(file, 'utf8')));
      fs.unlinkSync(file);
    }
    console.log('Workbench transaction recovered. Run status/resume before continuing.');
  } finally {
    release();
  }
}

function withWorkbenchSession(workbench, { transactional = false } = {}, callback) {
  const root = path.resolve(workbench);
  const release = acquireLock(root);
  try {
    if (fs.existsSync(path.join(root, JOURNAL))) {
      throw new Error('Workbench has an interrupted transaction. Run recover-workbench before continuing.');
    }
    activeSession = {
      workbench: root,
      transactional,
      journal: { version: 1, id: crypto.randomUUID(), phase: 'pending', entries: [] }
    };
    try {
      const result = callback();
      if (activeSession.journal.entries.length) {
        replaceFile(resolveSafeWorkbenchWritePath(root, JOURNAL), JSON.stringify({ ...activeSession.journal, phase: 'committed' }));
        activeSession.journal.phase = 'committed';
        fs.unlinkSync(path.join(root, JOURNAL));
      }
      return result;
    } catch (error) {
      if (activeSession.journal.entries.length) {
        if (activeSession.journal.phase === 'committed') {
          throw new Error(`${error.message} Transaction committed but cleanup is pending; run recover-workbench.`);
        }
        try {
          rollback(root, activeSession.journal);
          const journalPath = resolveSafeWorkbenchWritePath(root, JOURNAL);
          if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath);
        } catch (recoveryError) {
          throw new Error(`${error.message} Transaction remains blocked: ${recoveryError.message}`);
        }
      }
      throw error;
    } finally {
      activeSession = null;
    }
  } finally {
    release();
  }
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


module.exports = { atomicWriteText, writeWorkbenchJson, appendWorkbenchText, resolveSafeWorkbenchWritePath, ensureDir, withWorkbenchSession, recoverWorkbench, assertWorkbenchReady, beginTransaction };
