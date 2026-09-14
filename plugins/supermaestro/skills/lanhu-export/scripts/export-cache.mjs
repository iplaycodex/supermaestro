import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

export function digest(content) {
  return createHash('sha256').update(content).digest('hex')
}

export async function safeOutputPath(root, ref) {
  const base = path.resolve(root)
  const target = path.resolve(base, ref)
  const relative = path.relative(base, target)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Export path must stay inside the output directory.')
  }
  let current = base
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part)
    let stat
    try { stat = await fs.lstat(current) } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    if (stat.isSymbolicLink()) throw new Error('Export output must not be a symlink.')
    if (current !== target && !stat.isDirectory()) throw new Error('Export output parent must be a directory.')
    if (current === target && !stat.isFile()) throw new Error('Export output must be a regular file.')
  }
  return target
}

export async function atomicExport(root, ref, content) {
  const target = await safeOutputPath(root, ref)
  await fs.mkdir(path.dirname(target), { recursive: true })
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`)
  try {
    await fs.writeFile(temporary, content, { flag: 'wx', mode: 0o600 })
    await fs.rename(temporary, target)
  } finally {
    await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
  return target
}

export async function reusableArtifact(root, record, kind) {
  const ref = record?.[`${kind}_path`]
  const expected = record?.[`${kind}_sha256`]
  if (typeof ref !== 'string' || !ref || typeof expected !== 'string' || !expected) return ''
  // 缓存路径来自旧 manifest，按不可信输入重新检查。
  const file = await safeOutputPath(root, ref)
  try {
    const content = await fs.readFile(file)
    return content.length && digest(content) === expected ? file : ''
  } catch (error) {
    if (error.code === 'ENOENT') return ''
    throw error
  }
}

export async function loadResumeManifest(root, source) {
  const file = await safeOutputPath(root, 'manifest.json')
  let previous
  try { previous = JSON.parse(await fs.readFile(file, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw new Error('Resume manifest is unreadable or invalid; inspect it before retrying.')
  }
  if (!Array.isArray(previous.images) || ['team_id', 'project_id', 'group_id', 'group_name'].some(key => previous.source?.[key] !== source[key])) {
    throw new Error('Resume manifest belongs to a different project or group; use another output directory.')
  }
  return previous
}
