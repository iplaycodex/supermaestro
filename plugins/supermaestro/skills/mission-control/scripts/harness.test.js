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
write(path.join(wb, 'specs/requirement-alignment.md'), [
  '# 需求对齐',
  '',
  '## 用户确认',
  '',
  '状态：已确认',
  '确认人：user',
  '确认摘要：测试用户确认 AI 对需求理解一致',
  '',
].join('\n'))

result = run(['check-workbench', wb], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

const alignmentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-harness-alignment-'))
const alignmentWb = path.join(alignmentRoot, 'workbench')
result = run(['init', alignmentWb, '--name', '需求对齐测试'], alignmentRoot)
assert.strictEqual(result.status, 0, result.stderr)
write(path.join(alignmentWb, 'context.md'), '# 上下文\n\n已整理。\n')
result = run(['check-workbench', alignmentWb], alignmentRoot)
assert.notStrictEqual(result.status, 0, 'Gate 1 should require requirement alignment document')
assert.match(result.stderr, /requirement-alignment\.md/)

write(path.join(alignmentWb, 'specs/requirement-alignment.md'), [
  '# 需求对齐',
  '',
  '## 用户确认',
  '',
  '状态：待确认',
  '',
].join('\n'))
result = run(['check-workbench', alignmentWb], alignmentRoot)
assert.notStrictEqual(result.status, 0, 'Gate 1 should require confirmed requirement alignment')
assert.match(result.stderr, /需求对齐/)

write(path.join(alignmentWb, 'specs/requirement-alignment.md'), [
  '# 需求对齐',
  '',
  '## 用户确认',
  '',
  '状态：已确认',
  '确认人：user',
  '确认摘要：测试用户确认需求理解一致',
  '',
].join('\n'))
result = run(['check-workbench', alignmentWb], alignmentRoot)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

const brainstormingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-harness-brainstorming-'))
const brainstormingWb = path.join(brainstormingRoot, 'workbench')
result = run(['init', brainstormingWb, '--name', '澄清问题测试'], brainstormingRoot)
assert.strictEqual(result.status, 0, result.stderr)
write(path.join(brainstormingWb, 'context.md'), '# 上下文\n\n已整理。\n')
write(path.join(brainstormingWb, 'specs/requirement-alignment.md'), '# 需求对齐\n\n状态：已确认\n确认人：user\n确认摘要：用户确认需求理解一致\n')
write(path.join(brainstormingWb, 'specs/gate-1-brainstorming-questions.md'), [
  '# Gate 1 Brainstorming Questions',
  '',
  '### Q1. 范围边界',
  '',
  '你的答案：',
  '',
  '>',
  '',
].join('\n'))
result = run(['check-workbench', brainstormingWb], brainstormingRoot)
assert.notStrictEqual(result.status, 0, 'Gate 1 should require answered brainstorming questions')
assert.match(result.stderr, /brainstorming questions are not fully answered/)
write(path.join(brainstormingWb, 'specs/gate-1-brainstorming-questions.md'), [
  '# Gate 1 Brainstorming Questions',
  '',
  '### Q1. 范围边界',
  '',
  '你的答案：',
  '',
  '> 本期只做主流程。',
  '',
].join('\n'))
result = run(['check-workbench', brainstormingWb], brainstormingRoot)
assert.notStrictEqual(result.status, 0, 'Gate 1 should require brainstorming fan-in evidence')
assert.match(result.stderr, /not fan-in/)
write(path.join(brainstormingWb, 'context.md'), '# 上下文\n\n## Gate 1 Brainstorming Answer Fan-In\n\nQ1 已同步：本期只做主流程。\n')
write(path.join(brainstormingWb, 'specs/requirement-alignment.md'), '# 需求对齐\n\n状态：已确认\n确认人：user\n确认摘要：用户确认需求理解一致\n\n## Brainstorming 问题清单答案回填\n\nQ1 已同步。\n')
write(path.join(brainstormingWb, 'plans/progress.md'), '# 进度同步\n\n## Gate 1 Brainstorming\n\n| Question File | Status | Fan-In Targets | Evidence |\n| --- | --- | --- | --- |\n| gate-1-brainstorming-questions.md | synced | context.md / requirement-alignment.md | Q1 已同步 |\n')
result = run(['check-workbench', brainstormingWb], brainstormingRoot)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

result = run([
  'approve-gate1',
  wb,
  '--confirmed-by',
  'user',
  '--confirmation',
  '测试用户确认需求理解一致',
], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

result = run(['check', wb, '--action', 'code', '--non-ui', 'true', '--reason', '测试'], root)
assert.notStrictEqual(result.status, 0, 'Gate 2 plan approval should be required before coding')
assert.match(result.stderr, /Gate 2/)

write(path.join(wb, 'plans/task-plan.md'), '# 任务计划\n\npending\n')
write(path.join(wb, 'plans/progress.md'), '# 进度同步\n\n## Review Agent\n\n')
write(path.join(wb, 'reviews/review-packs.md'), '# 审查包\n\n### RP-P1-demo\n\nDiff: `git diff`\n')
const validationReport = [
  '# 验证报告',
  '',
  '| 验证项 | 类型 | 状态 | 证据/备注 |',
  '| --- | --- | --- | --- |',
  '| 静态检查 | static | passed | PASS 示例检查通过 |',
  '',
].join('\n')
write(path.join(wb, 'reports/validation.md'), validationReport)

result = run([
  'approve-gate2',
  wb,
  '--mode',
  'main-serial',
  '--confirmed-by',
  'user',
  '--confirmation',
  '测试用户确认继续',
], root)
assert.notStrictEqual(result.status, 0, 'Gate 2 plan approval should reject unresolved plan placeholders')
assert.match(result.stderr, /模板占位/)

write(path.join(wb, 'plans/task-plan.md'), '# 任务计划\n\n### RP-P1-demo\n\n验证：运行 npm test。\n')
result = run([
  'approve-gate2',
  wb,
  '--mode',
  'main-serial',
  '--confirmed-by',
  'user',
  '--confirmation',
  '测试用户确认继续',
], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

write(path.join(wb, 'reports/validation.md'), validationReport)

result = run(['verify', wb, '--strict', 'true'], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)
assert.match(result.stdout, /PASS mission-control verify/)

state = JSON.parse(fs.readFileSync(path.join(wb, 'mission.state.json'), 'utf8'))
assert.match(state.nextAction.command, /request-gate3/)

fs.rmSync(path.join(wb, 'reports/validation.md'))
result = run(['request-gate3', wb], root)
assert.notStrictEqual(result.status, 0, 'request-gate3 should fail when validation becomes stale after verify')
assert.match(result.stderr, /现场复验失败/)
write(path.join(wb, 'reports/validation.md'), validationReport)

result = run(['request-gate3', wb], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

fs.rmSync(path.join(wb, 'reports/validation.md'))
result = run(['approve-gate3', wb, '--review', 'true', '--validation', 'true'], root)
assert.notStrictEqual(result.status, 0, 'approve-gate3 should fail when validation becomes stale after request')
assert.match(result.stderr, /现场复验失败/)
write(path.join(wb, 'reports/validation.md'), validationReport)

result = run(['approve-gate3', wb, '--review', 'true', '--validation', 'true'], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

fs.rmSync(path.join(wb, 'reports/validation.md'))
result = run(['request-gate4', wb], root)
assert.notStrictEqual(result.status, 0, 'request-gate4 should fail when validation becomes stale after Gate 3')
assert.match(result.stderr, /现场复验失败/)
write(path.join(wb, 'reports/validation.md'), validationReport)

result = run(['request-gate4', wb], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

fs.rmSync(path.join(wb, 'reports/validation.md'))
result = run(['approve-gate4', wb, '--commit', 'true'], root)
assert.notStrictEqual(result.status, 0, 'approve-gate4 should fail when validation becomes stale after request')
assert.match(result.stderr, /现场复验失败/)
write(path.join(wb, 'reports/validation.md'), validationReport)

result = run(['approve-gate4', wb, '--commit', 'true'], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

fs.rmSync(path.join(wb, 'reports/validation.md'))
result = run(['check', wb, '--action', 'commit'], root)
assert.notStrictEqual(result.status, 0, 'final action check should fail when validation becomes stale after Gate 4')
assert.match(result.stderr, /现场复验失败/)
write(path.join(wb, 'reports/validation.md'), validationReport)

result = run(['check', wb, '--action', 'commit'], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

result = run(['resume', wb, '--json'], root)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)
state = JSON.parse(result.stdout)
assert.match(state.nextAction.command, /check/)

const matrixRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-harness-matrix-'))
const matrixWb = path.join(matrixRoot, '需求A', 'workbench')
result = run(['init', matrixWb, '--name', '矩阵需求'], matrixRoot)
assert.strictEqual(result.status, 0, result.stderr)

write(path.join(matrixRoot, '需求A', 'source', 'api', '接口文档.md'), '# 接口文档\n')
write(path.join(matrixRoot, '需求A', 'source', 'ui', 'manifest.json'), '{"boards":[]}\n')
write(path.join(matrixWb, 'context.md'), '# 上下文\n\n已整理。\n')
write(path.join(matrixWb, 'specs', 'requirement-alignment.md'), '# 需求对齐\n\n状态：已确认\n确认人：user\n确认摘要：用户确认需求理解一致\n')
write(path.join(matrixWb, 'specs', 'api-spec.md'), '# API 规格\n\n已整理。\n')
write(path.join(matrixWb, 'specs', 'ui-material-index.md'), '# UI 物料索引\n\n已整理。\n')
write(path.join(matrixWb, 'specs', 'ui-schema-extract.md'), '# UI Schema 提取\n\n已整理。\n')
write(path.join(matrixWb, 'plans', 'task-plan.md'), '# 任务计划\n\n### RP-P1-demo\n')
write(path.join(matrixWb, 'plans', 'progress.md'), '# 进度同步\n\n')
write(path.join(matrixWb, 'reviews', 'review-packs.md'), '# 审查包\n\n### RP-P1-demo\n')
write(path.join(matrixWb, 'reports', 'validation.md'), [
  '# 验证报告',
  '',
  '| 验证项 | 类型 | 状态 | 证据/备注 |',
  '| --- | --- | --- | --- |',
  '| 工作台检查 | static | passed | PASS 示例检查通过 |',
  '',
].join('\n'))

result = run(['check-workbench', matrixWb], matrixRoot)
assert.notStrictEqual(result.status, 0, 'API+UI workbench should require page-contract-matrix.md')
assert.match(result.stderr, /page-contract-matrix\.md/)

write(path.join(matrixWb, 'specs', 'page-contract-matrix.md'), '# 页面契约矩阵\n\n已整理。\n')
result = run(['check-workbench', matrixWb], matrixRoot)
assert.strictEqual(result.status, 0, result.stdout + result.stderr)

console.log('PASS harness tests')
