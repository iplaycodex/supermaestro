#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

function usage() {
  console.error('Usage: node scripts/check-reviewability.js <workbench-dir> [--strict true|false]')
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

function readJson(file, fallback = {}) {
  if (!fs.existsSync(file)) return fallback
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function countReviewPacks(workbench) {
  const reviewFile = path.join(workbench, 'reviews', 'review-packs.md')
  if (!fs.existsSync(reviewFile)) return 0
  const content = fs.readFileSync(reviewFile, 'utf8')
  return (content.match(/^###\s+RP(?:\d+|-[A-Za-z0-9][A-Za-z0-9_-]*)/gm) || []).length
}

function countDiffCommands(workbench) {
  const reviewFile = path.join(workbench, 'reviews', 'review-packs.md')
  if (!fs.existsSync(reviewFile)) return 0
  const content = fs.readFileSync(reviewFile, 'utf8')
  return (content.match(/git\s+diff\b/g) || []).length
}

function listPatches(workbench) {
  const patchDir = path.join(workbench, 'reviews', 'patches')
  if (!fs.existsSync(patchDir)) return []
  return fs.readdirSync(patchDir).filter(name => name.endsWith('.patch'))
}

function readMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return ''
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.md'))
    .map(name => fs.readFileSync(path.join(dir, name), 'utf8'))
    .join('\n')
}

function fileHasContent(file) {
  return fs.existsSync(file) && fs.statSync(file).size > 0
}

function readText(file) {
  if (!fs.existsSync(file)) return ''
  return fs.readFileSync(file, 'utf8')
}

function getSection(content, heading) {
  const lines = content.split(/\r?\n/)
  const start = lines.findIndex(line => line.trim() === heading)
  if (start === -1) return ''
  const out = []
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^##\s+/.test(line)) break
    out.push(line)
  }
  return out.join('\n')
}

function parseMarkdownTables(content) {
  const tables = []
  let current = []
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      current.push(line)
      continue
    }
    if (current.length) {
      tables.push(current)
      current = []
    }
  }
  if (current.length) tables.push(current)
  return tables.map(lines => lines
    .filter(line => !/^\s*\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|\s*$/.test(line))
    .map(line => line.trim().slice(1, -1).split('|').map(cell => cell.trim())))
}

function findTableByHeaders(content, requiredHeaders) {
  return parseMarkdownTables(content).find(table => {
    if (!table.length) return false
    const headers = table[0]
    return requiredHeaders.every(header => headers.includes(header))
  })
}

function tableStatusProblems(content, requiredHeaders, statusHeader, blockedStatuses, label) {
  const table = findTableByHeaders(content, requiredHeaders)
  if (!table || table.length < 2) return []
  const headers = table[0]
  const statusIndex = headers.indexOf(statusHeader)
  const nameIndex = 0
  return table.slice(1).flatMap(row => {
    const status = (row[statusIndex] || '').trim()
    if (!blockedStatuses.some(item => new RegExp(`^${item}$`, 'i').test(status))) return []
    return `${label} 中 ${row[nameIndex] || '未命名项'} 仍为 ${status}`
  })
}

function reviewStatusProblems(codeReviewDir) {
  if (!fs.existsSync(codeReviewDir)) return []
  const problems = []
  let sawApproved = false

  const indexFile = path.join(codeReviewDir, 'index.md')
  const indexContent = readText(indexFile)
  const indexTable = findTableByHeaders(indexContent, ['RP', '状态'])
  if (indexTable && indexTable.length > 1) {
    const headers = indexTable[0]
    const rpIndex = headers.indexOf('RP')
    const statusIndex = headers.indexOf('状态')
    for (const row of indexTable.slice(1)) {
      const status = row[statusIndex] || ''
      if (/^(changes-requested|pending)$/i.test(status)) {
        problems.push(`Review Agent ${row[rpIndex] || '未命名 RP'} 仍为 ${status}，不能进入 Gate 2。`)
      }
      if (/^(agent-approved|not-needed)$/i.test(status)) sawApproved = true
    }
  }

  for (const name of fs.readdirSync(codeReviewDir).filter(item => item.endsWith('.md') && item !== 'index.md')) {
    const content = readText(path.join(codeReviewDir, name))
    const firstLines = content.split(/\r?\n/).slice(0, 8).join('\n')
    if (/^agent-approved:\s*yes\b/im.test(firstLines) || /^not-needed:\s*yes\b/im.test(firstLines)) {
      sawApproved = true
      continue
    }
    if (/^changes-requested:\s*yes\b/im.test(firstLines) || /^status:\s*changes-requested\b/im.test(firstLines)) {
      problems.push(`Review Agent ${name} 仍为 changes-requested，不能进入 Gate 2。`)
      continue
    }
    if (/^pending:\s*yes\b/im.test(firstLines) || /^status:\s*pending\b/im.test(firstLines)) {
      problems.push(`Review Agent ${name} 仍为 pending，不能进入 Gate 2。`)
    }
  }

  if (!sawApproved) {
    problems.push('已启用 reviews/code-review/，但未发现结构化 agent-approved 或 not-needed 结论。')
  }
  return problems
}

function gate2HasStarted(state, gate2) {
  return /gate-2/i.test(state.phase || '') || ['pending', 'approved'].includes(gate2.status)
}

function fanInProblems(dir) {
  const problems = []
  const staleStatuses = ['running', 'assigned', 'ready-for-agent-review', 'changes-requested']
  const pendingReviewStatuses = ['pending', 'changes-requested']

  const progress = readText(path.join(dir, 'plans', 'progress.md'))
  if (progress) {
    problems.push(...tableStatusProblems(
      getSection(progress, '## Review Agent'),
      ['RP', '状态'],
      '状态',
      pendingReviewStatuses,
      'plans/progress.md 的 Review Agent 表'
    ))
  }

  const agentIndex = readText(path.join(dir, 'agents', 'agent-index.md'))
  if (agentIndex) {
    problems.push(...tableStatusProblems(
      agentIndex,
      ['任务', '状态'],
      '状态',
      staleStatuses,
      'agents/agent-index.md'
    ))
  }

  const worktreePlan = readText(path.join(dir, 'worktrees', 'plan.md'))
  if (worktreePlan) {
    problems.push(...tableStatusProblems(
      worktreePlan,
      ['任务', '状态'],
      '状态',
      staleStatuses,
      'worktrees/plan.md'
    ))
  }

  return problems.map(item => `${item}；主控必须先从各 worktree handoff fan-in 回主工作台。`)
}

function main() {
  const { workbench, flags } = parseArgs(process.argv)
  if (!workbench) usage()
  const dir = path.resolve(process.cwd(), workbench)
  const strict = bool(flags.strict, false)
  const state = readJson(path.join(dir, 'harness.state.json'))
  const gate1 = readJson(path.join(dir, 'gates', 'gate-1-decision.json'))
  const gate2 = readJson(path.join(dir, 'gates', 'gate-2-decision.json'))
  const rpCount = countReviewPacks(dir)
  const patches = listPatches(dir)
  const diffCommands = countDiffCommands(dir)
  const codeReviewDir = path.join(dir, 'reviews', 'code-review')
  const problems = []
  const warnings = []

  if (!rpCount) {
    problems.push('reviews/review-packs.md 未发现 RP 标题，无法判断 review 粒度。')
  }

  if (rpCount > 1 && state.allowCheckpointCommit === false && patches.length < rpCount && diffCommands < rpCount) {
    problems.push(`Gate 1 未授权 checkpoint commit 且存在 ${rpCount} 个 RP；默认不能自动 commit。请在 review pack 中为每个 RP 提供 git diff 命令，或在 reviews/patches 下提供 per-RP .patch；当前有 ${diffCommands} 个 git diff 命令、${patches.length} 个 .patch。`)
  }

  if (state.allowWorktree === true) {
    if (!fileHasContent(path.join(dir, 'worktrees', 'plan.md'))) problems.push('allowWorktree=true 但缺少 worktrees/plan.md。')
  } else {
    if (fs.existsSync(path.join(dir, 'worktrees'))) warnings.push('allowWorktree=false 但存在 worktrees/，确认是否为旧遗留。')
  }

  if (state.allowSubagents !== true) {
    if (fs.existsSync(path.join(dir, 'agents'))) warnings.push('allowSubagents=false 但存在 agents/，确认是否为旧遗留。')
  }

  if (fs.existsSync(codeReviewDir)) {
    problems.push(...reviewStatusProblems(codeReviewDir))
  }

  if (gate2HasStarted(state, gate2)) {
    problems.push(...fanInProblems(dir))
  }

  if (fs.existsSync(path.join(dir, 'tasks', 'state.json'))) warnings.push('存在 tasks/state.json；任务状态应只维护在 plans/progress.md，确认是否为旧遗留。')

  console.log(`Reviewability: mode=${state.executionMode || gate1.executionMode || 'unknown'} rp=${rpCount} diffCommands=${diffCommands} patches=${patches.length}`)
  warnings.forEach(item => console.log(`WARN ${item}`))
  if (problems.length) {
    problems.forEach(item => console.log(`FAIL ${item}`))
    process.exit(strict ? 2 : 0)
  }
  console.log('PASS reviewability')
}

main()
