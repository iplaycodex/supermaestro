#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

function usage() {
  console.error('Usage: node scripts/scaffold-execution-mode.js <workbench-dir> [--force true|false] [--tasks true|false] [--agents true|false] [--review-agents true|false] [--contract true|false] [--integration true|false]')
  process.exit(1)
}

function parseArgs(argv) {
  const workbench = argv[2]
  const flags = {}
  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i += 1
    }
  }
  return { workbench, flags }
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return value === true || value === 'true' || value === '1' || value === 'yes'
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function writeIfNeeded(file, content, force, created) {
  ensureDir(path.dirname(file))
  if (fs.existsSync(file) && !force) return
  fs.writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`)
  created.push(path.relative(process.cwd(), file))
}

function countReviewPacks(workbench) {
  const reviewFile = path.join(workbench, 'reviews', 'review-packs.md')
  if (!fs.existsSync(reviewFile)) return 0
  const content = fs.readFileSync(reviewFile, 'utf8')
  return (content.match(/^###\s+RP\d+/gm) || []).length
}

function main() {
  const { workbench, flags } = parseArgs(process.argv)
  if (!workbench) usage()
  const dir = path.resolve(process.cwd(), workbench)
  const stateFile = path.join(dir, 'harness.state.json')
  if (!fs.existsSync(stateFile)) {
    console.error('Missing harness.state.json. Run harness init/approve-gate1 first.')
    process.exit(2)
  }

  const state = readJson(stateFile)
  const force = bool(flags.force, false)
  const created = []
  const rpCount = countReviewPacks(dir)
  const allowWorktree = state.allowWorktree === true
  const allowSubagents = state.allowSubagents === true
  const allowCheckpointCommit = state.allowCheckpointCommit === true
  const generateTasks = bool(flags.tasks, false)
  const generateAgents = bool(flags.agents, false)
  const generateReviewAgents = bool(flags['review-agents'], false)
  const generateContract = bool(flags.contract, false)
  const generateIntegration = bool(flags.integration, false)

  if (allowWorktree) {
    writeIfNeeded(path.join(dir, 'worktrees', 'plan.md'), '# Worktree 计划\n\n默认使用主仓库同级目录 `<repo>.worktrees/<task-id>`；任务状态由主控维护在主工作台 `plans/progress.md`。worker worktree 内的工作台文件不是全局状态源，必须由主控 fan-in 回本文件。\n\n| 任务 | Worktree | Branch | Base | 状态 | 备注 |\n| --- | --- | --- | --- | --- | --- |\n', force, created)
    if (generateTasks) {
      writeIfNeeded(path.join(dir, 'tasks', 'index.md'), '# 任务卡索引\n\n任务状态维护在 `plans/progress.md`；这里只放确实需要独立任务卡的链接。\n\n| 任务 | 任务卡 | 用途 |\n| --- | --- | --- |\n', force, created)
    }
    if (generateIntegration) {
    writeIfNeeded(path.join(dir, 'integration', 'plan.md'), '# 集成计划\n\n请从 `assets/integration-plan-template.md` 复制并补齐。\n', force, created)
    }
  }

  if (allowSubagents && generateAgents) {
    writeIfNeeded(path.join(dir, 'agents', 'agent-index.md'), '# Agent 索引\n\n本索引只由主控更新。worker 只写自己 worktree 内的 handoff；主控读取 handoff 后 fan-in 状态。\n\n| 任务 | Agent/Thread | Brief | Handoff | 状态 |\n| --- | --- | --- | --- | --- |\n', force, created)
  }

  if (allowSubagents && generateReviewAgents) {
    writeIfNeeded(path.join(dir, 'reviews', 'code-review', 'index.md'), '# Review Agent 记录\n\nReview agent 只读审查，不修改代码、不暂存、不提交、不清理 worktree，也不直接更新主控 progress/review pack。主控读取 review 输出后 fan-in 到 `reviews/review-packs.md` 和 `plans/progress.md`。\n\n| RP | Review agent | 输入 artifact | 状态 | Findings | 输出 |\n| --- | --- | --- | --- | --- | --- |\n', force, created)
  }

  if (generateContract) {
    writeIfNeeded(path.join(dir, 'contract-changes', 'index.md'), '# Contract Change Requests\n\n| CCR | 状态 | 发起任务 | 影响契约 | 决策 |\n| --- | --- | --- | --- | --- |\n', force, created)
  }

  if (!allowCheckpointCommit && rpCount > 1) {
    writeIfNeeded(path.join(dir, 'reviews', 'patches', 'index.md'), '# Review Patches\n\nGate 1 未授权 checkpoint commit，不能自动提交；Gate 2 前每个 RP 应提供 worktree 未提交 diff 或一个 `.patch` 文件，包含 tracked 与 untracked 新文件。\n\n| RP | Patch / Worktree diff | 状态 |\n| --- | --- | --- |\n', force, created)
  }

  console.log(`executionMode=${state.executionMode || 'unknown'} worktree=${allowWorktree} subagents=${allowSubagents} checkpoint=${allowCheckpointCommit} reviewPacks=${rpCount} tasks=${generateTasks} agents=${generateAgents} reviewAgents=${generateReviewAgents} contract=${generateContract} integration=${generateIntegration}`)
  if (created.length) {
    console.log('Created/updated:')
    created.forEach(item => console.log(`- ${item}`))
  } else {
    console.log('No optional execution-mode files needed or files already exist.')
  }
}

main()
