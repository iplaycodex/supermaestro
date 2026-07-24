#!/usr/bin/env node

'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const script = path.join(__dirname, 'harness.js')

function run(args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8'
  })
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-harness-adapter-'))
const workbench = path.join(root, '需求A', 'workbench')

let result = run(['init', workbench, '--name', '兼容适配测试', '--mode', 'lite'], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)
assert.ok(fs.existsSync(path.join(workbench, 'state.json')), '主 state.json 应存在')
assert.ok(fs.existsSync(path.join(workbench, 'events.jsonl')), '主 events.jsonl 应存在')
assert.ok(fs.existsSync(path.join(workbench, 'mission.state.json')), '主投影应存在')
assert.ok(!fs.existsSync(path.join(workbench, 'harness.json')), '兼容入口不得创建 harness.json')
assert.ok(!fs.existsSync(path.join(workbench, 'harness.state.json')), '兼容入口不得创建第二套状态')

result = run(['status', workbench, '--json'], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)
const projection = JSON.parse(result.stdout)
assert.strictEqual(projection.mode, 'lite')
assert.strictEqual(projection.gates.gate1, 'pending')

write(path.join(workbench, 'brief.md'), [
  '# Lite Brief',
  '',
  '状态：已确认',
  '确认人：user',
  '',
  '本次只验证旧命令是否转发到主 CLI。',
  ''
].join('\n'))
write(path.join(workbench, 'reports', 'validation.md'), '# 验证报告\n\n待实现后记录真实验证。\n')

result = run([
  'approve-gate1',
  workbench,
  '--confirmed-by',
  'user',
  '--confirmation',
  '用户确认兼容适配测试范围',
], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

const state = JSON.parse(fs.readFileSync(path.join(workbench, 'state.json'), 'utf8'))
assert.strictEqual(state.gates.gate1, 'approved', '旧 Gate 1 命令应更新主状态')

result = run(['check', workbench, '--action', 'code'], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)
assert.match(result.stdout, /ALLOW code/)

result = run(['unknown-command', workbench], root)
assert.notStrictEqual(result.status, 0)
assert.match(result.stderr, /未知兼容命令/)

console.log('PASS mission-control harness compatibility adapter')
