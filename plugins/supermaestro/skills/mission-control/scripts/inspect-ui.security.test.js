#!/usr/bin/env node

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { spawnSync } = require('node:child_process')

const script = path.join(__dirname, 'inspect-ui.js')

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function writePng(file, width = 750, height = 1200) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const buffer = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer)
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  fs.writeFileSync(file, buffer)
}

function makeRequirement(imagePath = 'images/board.png') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inspect-ui-security-'))
  const workbench = path.join(root, 'workbench')
  const uiDir = path.join(root, 'source', 'ui')
  fs.mkdirSync(workbench, { recursive: true })
  writeJson(path.join(workbench, 'state.json'), {
    workflowVersion: 2,
    name: '安全测试',
    phase: 'scope_pending',
    preserved: 'yes'
  })
  writeJson(path.join(uiDir, 'manifest.json'), {
    source: { group_name: '测试分组' },
    images: [
      {
        image_id: 'board-1',
        name: '测试画板',
        schema_path: 'schemas/board.json',
        image_path: imagePath,
        errors: []
      }
    ]
  })
  writeJson(path.join(uiDir, 'schemas', 'board.json'), {
    name: 'Root',
    style: { width: 375, height: 600 }
  })
  if (imagePath === 'images/board.png') {
    writePng(path.join(uiDir, imagePath))
  }
  return { root, workbench, uiDir }
}

function run(args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8'
  })
}

test('只读取 source/ui，并原子更新主 state.json', () => {
  const fixture = makeRequirement()
  const result = run([fixture.workbench, '--json'], fixture.root)
  assert.equal(result.status, 0, result.stderr)

  const report = JSON.parse(result.stdout)
  assert.equal(report.summary.total, 1)
  assert.equal(report.summary.ok, 1)
  assert.equal(report.boards[0].image.width, 750)

  const state = JSON.parse(
    fs.readFileSync(path.join(fixture.workbench, 'state.json'), 'utf8')
  )
  assert.equal(state.preserved, 'yes')
  assert.equal(state.uiInspection.total, 1)
  assert.equal(state.uiInspection.ok, 1)
  assert.ok(state.uiInspection.inspectedAt)
  assert.equal(fs.existsSync(path.join(fixture.workbench, 'harness.state.json')), false)

  const temporaryStateFiles = fs
    .readdirSync(fixture.workbench)
    .filter(name => name.startsWith('.state.json.') && name.endsWith('.tmp'))
  assert.deepEqual(temporaryStateFiles, [])
})

test('拒绝绝对 manifest 路径和包含 .. 的 CLI 路径', () => {
  const fixture = makeRequirement()

  const absolute = run(
    [fixture.workbench, '--manifest', path.join(fixture.uiDir, 'manifest.json')],
    fixture.root
  )
  assert.notEqual(absolute.status, 0)
  assert.match(absolute.stderr, /must not be an absolute path/)

  const traversal = run(
    [fixture.workbench, '--manifest', '../source/ui/manifest.json'],
    fixture.root
  )
  assert.notEqual(traversal.status, 0)
  assert.match(traversal.stderr, /must not contain "\.\." traversal/)

  const escapedUiDir = run(
    [fixture.workbench, '--ui-dir', '../source/ui'],
    fixture.root
  )
  assert.notEqual(escapedUiDir.status, 0)
  assert.match(escapedUiDir.stderr, /must not contain "\.\." traversal/)
})

test('拒绝未知、重复、缺值 flag 和额外 positional', () => {
  const fixture = makeRequirement()

  const unknown = run(
    [fixture.workbench, '--write-indx', 'true'],
    fixture.root
  )
  assert.notEqual(unknown.status, 0)
  assert.match(unknown.stderr, /Unknown option: --write-indx/)

  const duplicate = run(
    [fixture.workbench, '--json', '--json'],
    fixture.root
  )
  assert.notEqual(duplicate.status, 0)
  assert.match(duplicate.stderr, /Duplicate option: --json/)

  const missingValue = run(
    [fixture.workbench, '--manifest'],
    fixture.root
  )
  assert.notEqual(missingValue.status, 0)
  assert.match(missingValue.stderr, /Missing value for --manifest/)

  const positional = run(
    [fixture.workbench, 'unexpected'],
    fixture.root
  )
  assert.notEqual(positional.status, 0)
  assert.match(positional.stderr, /Unexpected positional argument/)

  const invalidBoolean = run(
    [fixture.workbench, '--json', 'maybe'],
    fixture.root
  )
  assert.notEqual(invalidBoolean.status, 0)
  assert.match(invalidBoolean.stderr, /Invalid boolean value/)

  const help = run(['--help'], fixture.root)
  assert.equal(help.status, 0, help.stderr)
})

test('拒绝 manifest 中的绝对路径和 .. 越界引用', () => {
  const traversalFixture = makeRequirement('../outside.png')
  writePng(path.join(traversalFixture.root, 'source', 'outside.png'))
  const traversal = run([traversalFixture.workbench, '--json'], traversalFixture.root)
  assert.notEqual(traversal.status, 0)
  assert.match(traversal.stderr, /Image path.*must not contain "\.\." traversal/)

  const absoluteFixture = makeRequirement(path.join(os.tmpdir(), 'outside.png'))
  const absolute = run([absoluteFixture.workbench, '--json'], absoluteFixture.root)
  assert.notEqual(absolute.status, 0)
  assert.match(absolute.stderr, /Image path.*must not be an absolute path/)
})

test('拒绝通过 UI 目录内 symlink 读取根外文件', t => {
  const fixture = makeRequirement('images/link.png')
  const outside = path.join(fixture.root, '..', `${path.basename(fixture.root)}-outside.png`)
  writePng(outside)
  fs.mkdirSync(path.join(fixture.uiDir, 'images'), { recursive: true })
  try {
    fs.symlinkSync(outside, path.join(fixture.uiDir, 'images', 'link.png'))
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`symlink is unavailable: ${error.code}`)
      return
    }
    throw error
  }

  const result = run([fixture.workbench, '--json'], fixture.root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /resolves outside the allowed UI roots/)
})

test('拒绝通过输出文件 symlink 覆写工作台外文件', t => {
  const fixture = makeRequirement()
  const outside = path.join(fixture.root, 'outside-index.md')
  const specsDir = path.join(fixture.workbench, 'specs')
  const indexPath = path.join(specsDir, 'ui-material-index.md')
  fs.mkdirSync(specsDir, { recursive: true })
  fs.writeFileSync(outside, 'sentinel\n')
  try {
    fs.symlinkSync(outside, indexPath)
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`symlink is unavailable: ${error.code}`)
      return
    }
    throw error
  }

  const result = run([fixture.workbench, '--write-index', 'true'], fixture.root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Output file must not be a symlink/)
  assert.equal(fs.readFileSync(outside, 'utf8'), 'sentinel\n')
})

test('拒绝通过输出目录 symlink 写出工作台', t => {
  const fixture = makeRequirement()
  const outsideDir = path.join(fixture.root, 'outside-specs')
  const specsDir = path.join(fixture.workbench, 'specs')
  fs.mkdirSync(outsideDir, { recursive: true })
  try {
    fs.symlinkSync(outsideDir, specsDir)
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`symlink is unavailable: ${error.code}`)
      return
    }
    throw error
  }

  const result = run([fixture.workbench, '--write-index', 'true'], fixture.root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Output directory must not be a symlink/)
  assert.equal(fs.existsSync(path.join(outsideDir, 'ui-material-index.md')), false)
})
