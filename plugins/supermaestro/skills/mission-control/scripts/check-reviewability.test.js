#!/usr/bin/env node

'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const adapter = path.join(__dirname, 'check-reviewability.js')
const rootCli = path.resolve(__dirname, '../../../scripts/supermaestro.js')

function run(script, args, cwd, env = process.env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env,
    encoding: 'utf8'
  })
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

function shellQuote(value) {
  const text = String(value)
  if (process.platform === 'win32') return `"${text.replace(/"/g, '""')}"`
  return `'${text.replace(/'/g, `'\\''`)}'`
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-reviewability-adapter-'))
const sourceRoot = path.join(root, 'source')
const workbench = path.join(root, '需求A', 'workbench')
const helperScript = path.join(root, 'fake-diff-helper.js')
const helperMarker = path.join(root, 'fake-diff-helper.called')
write(helperScript, [
  "const fs = require('fs')",
  'const marker = process.argv[2]',
  "fs.appendFileSync(marker, 'called\\n')",
  'const input = process.argv.slice(3).reverse().find(file => fs.existsSync(file) && fs.statSync(file).isFile())',
  "if (input) process.stdout.write(fs.readFileSync(input, 'utf8'))",
  ''
].join('\n'))
const helperCommand = [
  shellQuote(process.execPath),
  shellQuote(helperScript),
  shellQuote(helperMarker)
].join(' ')

fs.mkdirSync(sourceRoot, { recursive: true })
for (const args of [
  ['init'],
  ['config', 'user.email', 'test@example.com'],
  ['config', 'user.name', 'SuperMaestro Test'],
  ['config', 'commit.gpgsign', 'false'],
  ['config', 'diff.fake.textconv', helperCommand]
]) {
  const git = spawnSync('git', args, { cwd: sourceRoot, encoding: 'utf8' })
  assert.strictEqual(git.status, 0, git.stdout + git.stderr)
}
write(path.join(sourceRoot, 'feature.txt'), 'baseline\n')
write(path.join(sourceRoot, '.gitattributes'), '*.txt diff=fake\n')
for (const args of [
  ['add', 'feature.txt', '.gitattributes'],
  ['commit', '-m', 'test baseline']
]) {
  const git = spawnSync('git', args, { cwd: sourceRoot, encoding: 'utf8' })
  assert.strictEqual(git.status, 0, git.stdout + git.stderr)
}
write(path.join(sourceRoot, 'feature.txt'), 'baseline\nchanged\n')

let helperProbe = spawnSync('git', ['diff', '--ext-diff', 'HEAD', '--', 'feature.txt'], {
  cwd: sourceRoot,
  env: { ...process.env, GIT_EXTERNAL_DIFF: helperCommand },
  encoding: 'utf8'
})
assert.strictEqual(helperProbe.status, 0, helperProbe.stdout + helperProbe.stderr)
assert.ok(fs.existsSync(helperMarker), 'external diff probe must execute the fake helper')
fs.rmSync(helperMarker)

helperProbe = spawnSync('git', ['diff', '--textconv', 'HEAD', '--', 'feature.txt'], {
  cwd: sourceRoot,
  encoding: 'utf8'
})
assert.strictEqual(helperProbe.status, 0, helperProbe.stdout + helperProbe.stderr)
assert.ok(fs.existsSync(helperMarker), 'textconv probe must execute the fake helper')
fs.rmSync(helperMarker)

let result = run(rootCli, [
  'init',
  workbench,
  '--name',
  'Reviewability 兼容测试',
  '--mode',
  'standard',
  '--source-root',
  sourceRoot
], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

write(path.join(workbench, 'reviews', 'review-packs.md'), [
  '# Review Packs',
  '',
  '### RP1',
  '',
  'Artifact: `git diff --binary HEAD`',
  ''
].join('\n'))

const hostileGitEnv = {
  ...process.env,
  GIT_EXTERNAL_DIFF: helperCommand,
  GIT_PAGER: helperCommand,
  GIT_DIFF_OPTS: '--unified=0',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'diff.fake.textconv',
  GIT_CONFIG_VALUE_0: helperCommand
}
result = run(adapter, [workbench, '--strict', 'true'], root, hostileGitEnv)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)
assert.match(result.stdout, /PASS reviewability/)
assert.ok(
  !fs.existsSync(helperMarker),
  'review artifact inspection must not execute external diff or textconv helpers'
)
assert.ok(!fs.existsSync(path.join(workbench, 'harness.state.json')), '兼容检查器不得创建第二套状态')

write(path.join(workbench, 'plans', 'progress.md'), [
  '# Progress',
  '',
  '| RP | 状态 |',
  '| --- | --- |',
  '| RP1 | pending |',
  ''
].join('\n'))

result = run(adapter, [workbench, '--strict', 'true'], root)
assert.notStrictEqual(result.status, 0, '未 fan-in 的状态必须失败关闭')
assert.match(`${result.stdout}${result.stderr}`, /fan-in/)

result = run(adapter, [workbench, '--strict', 'false', '--json', 'true'], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)
const payload = JSON.parse(result.stdout)
assert.strictEqual(payload.passed, false)
assert.ok(payload.failures.some(item => /fan-in/.test(item)))

console.log('PASS check-reviewability compatibility adapter')
