#!/usr/bin/env node

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const script = path.join(__dirname, 'check-reviewability.js')

function makeWorkbench({ staleFanIn = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-reviewability-'))
  const wb = path.join(root, 'workbench')
  for (const dir of ['gates', 'plans', 'reviews/code-review', 'agents', 'worktrees']) {
    fs.mkdirSync(path.join(wb, dir), { recursive: true })
  }

  fs.writeFileSync(path.join(wb, 'harness.state.json'), JSON.stringify({
    schemaVersion: 3,
    phase: 'gate-2-pending',
    executionMode: 'multi-worktree-parallel',
    allowWorktree: true,
    allowSubagents: true,
    allowCheckpointCommit: true,
  }, null, 2))
  fs.writeFileSync(path.join(wb, 'gates/gate-1-decision.json'), JSON.stringify({ status: 'approved' }, null, 2))
  fs.writeFileSync(path.join(wb, 'gates/gate-2-decision.json'), JSON.stringify({ status: 'pending' }, null, 2))
  fs.writeFileSync(path.join(wb, 'reviews/review-packs.md'), '# 审查包\n\n### RP-P1-demo\n\nDiff: `git diff`\n')
  fs.writeFileSync(path.join(wb, 'reviews/code-review/index.md'), [
    '# Review Agent 记录',
    '',
    '| RP | Review agent | 输入 artifact | 状态 | Findings | 输出 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| RP-P1-demo | demo | git diff | agent-approved | 0 findings | reviews/code-review/RP-P1-demo.md |',
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(wb, 'reviews/code-review/RP-P1-demo.md'), [
    'agent-approved: yes',
    '',
    '## Residual risk',
    '',
    '- operate.type 仍待联调确认。',
    '',
  ].join('\n'))

  const reviewStatus = staleFanIn ? 'pending' : 'agent-approved'
  const workerStatus = staleFanIn ? 'running' : 'agent-approved'
  const worktreeStatus = staleFanIn ? 'running' : 'ready-for-human-review'

  fs.writeFileSync(path.join(wb, 'plans/progress.md'), [
    '# 进度同步',
    '',
    '## Review Agent',
    '',
    '| RP | Review agent | 状态 | Findings | 输出 | 下一步 |',
    '| --- | --- | --- | --- | --- | --- |',
    `| RP-P1-demo | demo | ${reviewStatus} | 0 findings | reviews/code-review/RP-P1-demo.md | human review |`,
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(wb, 'agents/agent-index.md'), [
    '# Agent 索引',
    '',
    '| 任务 | Agent/Thread | Brief | Handoff | 状态 |',
    '| --- | --- | --- | --- | --- |',
    `| P1 demo | demo | brief.md | handoff.md | ${workerStatus} |`,
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(wb, 'worktrees/plan.md'), [
    '# Worktree 计划',
    '',
    '| 任务 | Worktree | Branch | Base | 状态 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    `| P1 demo | /tmp/demo | branch | base | ${worktreeStatus} | synced |`,
    '',
  ].join('\n'))

  return wb
}

function runCheck(wb) {
  return spawnSync('node', [script, wb, '--strict', 'true'], { encoding: 'utf8' })
}

const stale = runCheck(makeWorkbench({ staleFanIn: true }))
assert.notStrictEqual(stale.status, 0, 'stale fan-in should fail reviewability')
assert.match(stale.stdout, /fan-in/, 'stale fan-in failure should name fan-in')

const clean = runCheck(makeWorkbench({ staleFanIn: false }))
assert.strictEqual(clean.status, 0, clean.stdout + clean.stderr)
assert.match(clean.stdout, /PASS reviewability/)

console.log('PASS check-reviewability tests')
