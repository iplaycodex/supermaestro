#!/usr/bin/env node

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const script = path.join(__dirname, 'harness.js')

function run(args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' })
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-harness-'))
const wb = path.join(root, 'workbench')

let result = run(['init', wb, '--name', '测试需求'], root)
assert.strictEqual(result.status, 0, result.stderr)
assert.ok(fs.existsSync(path.join(wb, 'mission.state.json')), 'init should create mission.state.json')

result = run(['next', wb, '--json'], root)
assert.strictEqual(result.status, 0, result.stderr)
let state = JSON.parse(result.stdout)
assert.match(state.nextAction.summary, /补齐工作台/)

write(path.join(wb, 'context.md'), '# 上下文\n\n已整理。\n')
write(path.join(wb, 'specs/material-index.md'), '# 物料索引\n\n无 API/UI 物料。\n')
write(path.join(wb, 'plans/task-plan.md'), '# 任务计划\n\n### RP-P1-demo\n')
write(path.join(wb, 'plans/progress.md'), '# 进度同步\n\n## Review Agent\n\n')
write(path.join(wb, 'reviews/review-packs.md'), '# 审查包\n\n### RP-P1-demo\n\nDiff: `git diff`\n')
write(path.join(wb, 'reports/validation.md'), [
  '# 验证报告',
  '',
  '| 验证项 | 类型 | 状态 | 证据/备注 |',
  '| --- | --- | --- | --- |',
  '| 静态检查 | static | passed | PASS 示例检查通过 |',
  '',
].join('\n'))

result = run(['approve-gate1', wb, '--mode', 'main-serial'], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

result = run(['verify', wb, '--strict', 'true'], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)
assert.match(result.stdout, /PASS mission-control verify/)

state = JSON.parse(fs.readFileSync(path.join(wb, 'mission.state.json'), 'utf8'))
assert.match(state.nextAction.command, /request-gate2/)

result = run(['request-gate2', wb], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

result = run(['resume', wb, '--json'], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)
state = JSON.parse(result.stdout)
assert.match(state.nextAction.command, /approve-gate2/)

console.log('PASS harness tests')
