#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const SCHEMA_VERSION = 3
const MISSION_STATE_VERSION = 1
const VALID_MODES = new Set(['main-serial', 'single-worktree-serial', 'multi-worktree-parallel'])
const BASE_ACTIONS = new Set(['read-docs', 'edit-plan-docs', 'update-plan-docs', 'validate'])
const GATE1_ACTIONS = new Set([
  'code',
  'create-worktree',
  'create-branch',
  'dispatch-subagent',
  'sync-materials',
  'checkpoint-commit'
])
const GATE3_ACTIONS = new Set(['merge', 'commit', 'push', 'cleanup-worktree'])
const KNOWN_ACTIONS = new Set([...BASE_ACTIONS, ...GATE1_ACTIONS, ...GATE3_ACTIONS])
const WORKTREE_ACTIONS = new Set(['create-worktree', 'create-branch', 'sync-materials'])
const GENERATED_WORKBENCH_DIRS = new Set(['gates', 'plans', 'reports', 'reviews', 'specs', 'ui', 'workbench'])
const API_MATERIAL_NAME_RE = /(api|swagger|openapi|postman|mock|interface|interfaces|接口|后端|联调|knife4j)/i
const SUPERPOWER_EVIDENCE_RE = /(已读取|已调用|已使用|已吸收|已执行|已完成|used|loaded|applied|executed|completed)/i
const SUPERPOWER_SKILLS = {
  writingPlans: 'superpowers:writing-plans',
  subagentDrivenDevelopment: 'superpowers:subagent-driven-development',
  executingPlans: 'superpowers:executing-plans',
  testDrivenDevelopment: 'superpowers:test-driven-development',
  systematicDebugging: 'superpowers:systematic-debugging',
  requestingCodeReview: 'superpowers:requesting-code-review',
  receivingCodeReview: 'superpowers:receiving-code-review',
  verificationBeforeCompletion: 'superpowers:verification-before-completion',
  finishingDevelopmentBranch: 'superpowers:finishing-a-development-branch'
}

function now() {
  return new Date().toISOString()
}

function usage(exitCode = 1) {
  const text = `
Usage:
  node scripts/harness.js init <requirement-dir> [--name <name>] [--target-branch <branch>]
  node scripts/harness.js status <requirement-dir> [--json]
  node scripts/harness.js next <requirement-dir> [--json]
  node scripts/harness.js resume <requirement-dir> [--json]
  node scripts/harness.js check-workbench <requirement-dir>
  node scripts/harness.js verify <requirement-dir> [--strict true|false]
  node scripts/harness.js approve-gate1 <requirement-dir> --mode <main-serial|single-worktree-serial|multi-worktree-parallel> --confirmed-by user --confirmation <text> [--worktree true|false] [--subagents true|false] [--checkpoint true|false] [--notes <text>]
  node scripts/harness.js request-gate2 <requirement-dir> [--review-pack <path>] [--validation <path>] [--notes <text>] [--force true|false]
  node scripts/harness.js approve-gate2 <requirement-dir> [--review true|false] [--validation true|false] [--notes <text>]
  node scripts/harness.js request-gate3 <requirement-dir> [--notes <text>] [--force true|false]
  node scripts/harness.js approve-gate3 <requirement-dir> [--merge true|false] [--commit true|false] [--push true|false] [--cleanup true|false] [--notes <text>]
  node scripts/harness.js check <requirement-dir> --action <action> [--ui true] [--schema-only true] [--non-ui true --reason <text>] [--boards <names>] [--schemas <paths>] [--schema-extract <path>] [--baselines <paths>]
`
  console.error(text.trim())
  process.exit(exitCode)
}

function parseArgs(argv) {
  const command = argv[2]
  const requirementDir = argv[3]
  const flags = {}

  for (let i = 4; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue

    const eqIndex = arg.indexOf('=')
    if (eqIndex !== -1) {
      flags[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1)
      continue
    }

    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i += 1
    }
  }

  return { command, requirementDir, flags }
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 'true' || value === '1' || value === 'yes') return true
  if (value === false || value === 'false' || value === '0' || value === 'no') return false
  throw new Error(`Invalid boolean value: ${value}`)
}

function requirementPath(input) {
  if (!input) usage()
  return path.resolve(process.cwd(), input)
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function paths(dir) {
  return {
    harness: path.join(dir, 'harness.json'),
    state: path.join(dir, 'harness.state.json'),
    missionState: path.join(dir, 'mission.state.json'),
    gate1: path.join(dir, 'gates', 'gate-1-decision.json'),
    gate2: path.join(dir, 'gates', 'gate-2-decision.json'),
    gate3: path.join(dir, 'gates', 'gate-3-decision.json')
  }
}

function defaultHarness(dir, flags) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'requirement-harness',
    requirementName: flags.name || path.basename(dir),
    requirementDir: dir,
    targetBranch: flags['target-branch'] || null,
    createdAt: now(),
    updatedAt: now()
  }
}

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    phase: 'gate-1-pending',
    executionMode: null,
    allowWorktree: null,
    allowSubagents: null,
    allowCheckpointCommit: null,
    uiInspection: null,
    updatedAt: now()
  }
}

function defaultGateDecision(gate) {
  if (gate === 'gate-1') {
    return {
      schemaVersion: SCHEMA_VERSION,
      gate: 'gate-1',
      title: '任务拆分与执行模式确认',
      status: 'pending',
      executionMode: null,
      allowWorktree: null,
      allowSubagents: null,
      allowCheckpointCommit: null,
      approvedAt: null,
      approvedBy: null,
      humanConfirmed: false,
      confirmedBy: null,
      confirmationText: '',
      notes: ''
    }
  }

  if (gate === 'gate-2') {
    return {
      schemaVersion: SCHEMA_VERSION,
      gate: 'gate-2',
      title: 'Review Pack 与验证结果确认',
      status: 'not-requested',
      reviewPack: 'reviews/review-packs.md',
      validationReport: 'reports/validation.md',
      reviewAccepted: false,
      validationAccepted: false,
      requestedAt: null,
      approvedAt: null,
      approvedBy: null,
      notes: ''
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    gate: 'gate-3',
    title: '集成、提交、推送与清理确认',
    status: 'not-requested',
    allowMerge: false,
    allowCommit: false,
    allowPush: false,
    allowCleanup: false,
    requestedAt: null,
    approvedAt: null,
    approvedBy: null,
    notes: ''
  }
}

function migrateState(state) {
  const base = defaultState()
  return {
    ...base,
    phase: state?.phase || base.phase,
    executionMode: state?.executionMode ?? base.executionMode,
    allowWorktree: state?.allowWorktree ?? base.allowWorktree,
    allowSubagents: state?.allowSubagents ?? base.allowSubagents,
    allowCheckpointCommit: state?.allowCheckpointCommit ?? base.allowCheckpointCommit,
    uiInspection: state?.uiInspection || base.uiInspection,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now()
  }
}

function isLegacyFinalGate2(gate2) {
  return Boolean(
    gate2 &&
      gate2.gate === 'gate-2' &&
      (Object.prototype.hasOwnProperty.call(gate2, 'allowMerge') ||
        Object.prototype.hasOwnProperty.call(gate2, 'allowCommit') ||
        Object.prototype.hasOwnProperty.call(gate2, 'allowPush') ||
        Object.prototype.hasOwnProperty.call(gate2, 'allowCleanup'))
  )
}

function migrateGate2Decision(gate2) {
  const base = defaultGateDecision('gate-2')
  if (!gate2) return base

  if (isLegacyFinalGate2(gate2)) {
    return {
      ...base,
      status: gate2.status === 'approved' ? 'approved' : 'not-requested',
      reviewAccepted: gate2.status === 'approved',
      validationAccepted: gate2.status === 'approved',
      requestedAt: gate2.requestedAt || null,
      approvedAt: gate2.approvedAt || null,
      approvedBy: gate2.approvedBy || null,
      notes: gate2.status === 'approved' ? `legacy gate-2 migrated; ${gate2.notes || ''}`.trim() : gate2.notes || ''
    }
  }

  return {
    ...base,
    ...gate2,
    schemaVersion: SCHEMA_VERSION,
    gate: 'gate-2',
    title: base.title,
    reviewPack: gate2.reviewPack || base.reviewPack,
    validationReport: gate2.validationReport || base.validationReport,
    reviewAccepted: gate2.reviewAccepted === true,
    validationAccepted: gate2.validationAccepted === true
  }
}

function migrateGate3Decision(gate3, legacyGate2) {
  const base = defaultGateDecision('gate-3')
  if (gate3) {
    return {
      ...base,
      ...gate3,
      schemaVersion: SCHEMA_VERSION,
      gate: 'gate-3',
      title: base.title,
      allowMerge: gate3.allowMerge === true,
      allowCommit: gate3.allowCommit === true,
      allowPush: gate3.allowPush === true,
      allowCleanup: gate3.allowCleanup === true
    }
  }

  if (isLegacyFinalGate2(legacyGate2)) {
    return {
      ...base,
      status: legacyGate2.status || base.status,
      allowMerge: legacyGate2.allowMerge === true,
      allowCommit: legacyGate2.allowCommit === true,
      allowPush: legacyGate2.allowPush === true,
      allowCleanup: legacyGate2.allowCleanup === true,
      requestedAt: legacyGate2.requestedAt || null,
      approvedAt: legacyGate2.approvedAt || null,
      approvedBy: legacyGate2.approvedBy || null,
      notes: legacyGate2.notes || ''
    }
  }

  return base
}

function requireState(dir) {
  const p = paths(dir)
  const harness = readJson(p.harness, {})
  const state = readJson(p.state)
  const gate1 = readJson(p.gate1)
  const rawGate2 = readJson(p.gate2)
  const rawGate3 = readJson(p.gate3)
  if (!state || !gate1 || !rawGate2 || !rawGate3) {
    console.error('Harness state is missing. Run init first.')
    process.exit(2)
  }
  return {
    p,
    harness,
    state: migrateState(state),
    gate1,
    gate2: migrateGate2Decision(rawGate2),
    gate3: migrateGate3Decision(rawGate3, rawGate2)
  }
}

function saveState(p, state) {
  const nextState = {
    ...state,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now()
  }
  writeJson(p.state, nextState)
  return nextState
}

function missionStateSourceRefs() {
  return {
    gateState: 'harness.state.json',
    taskState: path.join('plans', 'progress.md'),
    reviewPacks: path.join('reviews', 'review-packs.md'),
    validation: path.join('reports', 'validation.md')
  }
}

function missionStatusLabel(status) {
  return status || 'unknown'
}

function safeValidateWorkbench(dir) {
  try {
    validateWorkbench(dir)
    return { ok: true, problems: [] }
  } catch (error) {
    return { ok: false, problems: [error.message] }
  }
}

function readMissionText(filePath) {
  if (!fs.existsSync(filePath)) return ''
  return fs.readFileSync(filePath, 'utf8')
}

function reviewPackCount(dir) {
  const content = readMissionText(path.join(dir, 'reviews', 'review-packs.md'))
  return (content.match(/^###\s+RP(?:\d+|-[A-Za-z0-9][A-Za-z0-9_-]*)/gm) || []).length
}

function validationEvidence(dir) {
  const file = path.join(dir, 'reports', 'validation.md')
  const content = readMissionText(file)
  const problems = []
  const warnings = []

  if (!fileExistsAndHasContent(file)) {
    problems.push('reports/validation.md 缺失或为空。')
    return { ok: false, problems, warnings }
  }

  if (/\|\s*[^|\n]+\s*\|\s*(?:static|behavior|build|ui-review)[^|\n]*\|\s*pending\s*\|/i.test(content)) {
    problems.push('reports/validation.md 仍存在 pending 验证项。')
  }

  if (!/(PASS|ALLOW|通过|完成|已执行|成功|截图|actual|diff|构建|测试|联调)/i.test(content)) {
    warnings.push('reports/validation.md 未发现明显验证证据关键词，请确认不是模板占位。')
  }

  if (hasUiManifest(dir)) {
    const hasVisualEvidence = /(截图|actual|expected|视觉|逐块|人工核对|像素|render|screenshot|ui-review)/i.test(content)
    const blocked = /visual-validation-blocked|视觉验证阻塞|无法截图|无法启动页面|无法核对/i.test(content)
    const acceptedSkip = /用户.*(接受|同意|确认).*(跳过|暂不).*视觉|接受跳过视觉|同意跳过视觉/i.test(content)
    if (!hasVisualEvidence) {
      problems.push('检测到 UI 物料，但 reports/validation.md 缺少视觉还原证据。')
    }
    if (blocked && !acceptedSkip) {
      problems.push('UI 视觉验证仍处于 blocked，且没有记录用户接受跳过视觉验收，不能进入 Gate 2。')
    }
  }

  return { ok: problems.length === 0, problems, warnings }
}

function superpowerEvidenceText(dir) {
  return [
    path.join(dir, 'reports', 'validation.md'),
    path.join(dir, 'plans', 'task-plan.md'),
    path.join(dir, 'plans', 'progress.md'),
    path.join(dir, 'reviews', 'review-packs.md')
  ]
    .map(readMissionText)
    .filter(Boolean)
    .join('\n\n')
}

function hasSuperpowerEvidence(content, skill) {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sameLineEvidence = content.split(/\r?\n/).some(line => {
    return line.includes(skill) && !/pending\s*\//i.test(line) && SUPERPOWER_EVIDENCE_RE.test(line)
  })
  if (sameLineEvidence) return true

  const skillEvidence = new RegExp(`${escaped}[\\s\\S]{0,240}${SUPERPOWER_EVIDENCE_RE.source}`, 'i')
  const evidenceSkill = new RegExp(`${SUPERPOWER_EVIDENCE_RE.source}[\\s\\S]{0,240}${escaped}`, 'i')
  const match = content.match(skillEvidence) || content.match(evidenceSkill)
  return Boolean(match && !/pending\s*\//i.test(match[0]))
}

function missingSuperpowers(content, skills) {
  return skills.filter(skill => !hasSuperpowerEvidence(content, skill))
}

function validateSuperpowerEvidence(dir, skills, action) {
  const content = superpowerEvidenceText(dir)
  const missing = missingSuperpowers(content, skills)
  if (!missing.length) return

  deny(
    action,
    `缺少 Superpowers 调用证据：${missing.join(', ')}。请先实际读取/调用对应 skill，并在 reports/validation.md 的“Superpowers 调用证据”中记录已读取、已调用或已吸收的证据。`
  )
}

function hasFailureOrReviewFinding(dir) {
  const content = superpowerEvidenceText(dir)
  return /(bug|测试失败|构建失败|联调异常|review finding|changes-requested|changes requested|根因|失败)/i.test(content)
}

function hasReviewAgentWork(dir) {
  const content = superpowerEvidenceText(dir)
  return /(reviews\/code-review|agent-approved|changes-requested|findings)/i.test(content)
}

function runReviewability(dir, strict) {
  const script = path.join(__dirname, 'check-reviewability.js')
  if (!fs.existsSync(script)) {
    return {
      ok: false,
      problems: ['缺少 scripts/check-reviewability.js，无法执行 reviewability 检查。'],
      output: ''
    }
  }

  const result = spawnSync(process.execPath, [script, dir, '--strict', strict ? 'true' : 'false'], {
    encoding: 'utf8'
  })
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  return {
    ok: result.status === 0,
    problems: result.status === 0 ? [] : [output || `check-reviewability exited with ${result.status}`],
    output
  }
}

function verifySummary(dir, flags = {}) {
  const strict = parseBoolean(flags.strict, true)
  const { gate1 } = requireState(dir)
  const problems = []
  const warnings = []

  const workbench = safeValidateWorkbench(dir)
  if (!workbench.ok) problems.push(...workbench.problems)

  if (gate1.status !== 'approved') {
    problems.push('Gate 1 尚未 approved；不能进入 Gate 2 前关门检查。')
  }

  if (!reviewPackCount(dir)) {
    problems.push('reviews/review-packs.md 未发现 RP 标题。')
  }

  const superpowerContent = superpowerEvidenceText(dir)
  const requiredSuperpowers = [
    SUPERPOWER_SKILLS.testDrivenDevelopment,
    SUPERPOWER_SKILLS.verificationBeforeCompletion
  ]
  requiredSuperpowers.push(
    gate1.allowSubagents === true
      ? SUPERPOWER_SKILLS.subagentDrivenDevelopment
      : SUPERPOWER_SKILLS.executingPlans
  )
  if (hasFailureOrReviewFinding(dir)) requiredSuperpowers.push(SUPERPOWER_SKILLS.systematicDebugging)
  if (gate1.allowSubagents === true || hasReviewAgentWork(dir)) {
    requiredSuperpowers.push(SUPERPOWER_SKILLS.requestingCodeReview)
  }
  if (/changes-requested|changes requested/i.test(superpowerContent)) {
    requiredSuperpowers.push(SUPERPOWER_SKILLS.receivingCodeReview)
  }
  const missingSuperpowerEvidence = missingSuperpowers(superpowerContent, Array.from(new Set(requiredSuperpowers)))
  if (missingSuperpowerEvidence.length) {
    problems.push(`缺少 Superpowers 调用证据：${missingSuperpowerEvidence.join(', ')}。`)
  }

  const reviewability = runReviewability(dir, strict)
  if (!reviewability.ok) problems.push(...reviewability.problems)

  const validation = validationEvidence(dir)
  if (!validation.ok) problems.push(...validation.problems)
  warnings.push(...validation.warnings)

  return {
    ok: problems.length === 0,
    strict,
    reviewabilityOutput: reviewability.output,
    problems,
    warnings
  }
}

function recommendNext(dir, state, gate1, gate2, gate3) {
  const workbench = safeValidateWorkbench(dir)
  if (!workbench.ok) {
    return {
      summary: '补齐工作台标准文档，再进入 Gate 1。',
      command: 'node <skill-dir>/scripts/harness.js check-workbench <需求工作台>',
      requiresHuman: false,
      blockedBy: workbench.problems
    }
  }

  if (gate1.status !== 'approved') {
    return {
      summary: '输出 Gate 1 Decision Brief，让用户确认计划和执行模式。',
      command: 'node <skill-dir>/scripts/harness.js approve-gate1 <需求工作台> --mode <main-serial|single-worktree-serial|multi-worktree-parallel> --confirmed-by user --confirmation "<用户确认原话或摘要>"',
      requiresHuman: true,
      blockedBy: []
    }
  }

  if (gate2.status === 'not-requested') {
    const verify = verifySummary(dir, { strict: true })
    if (!verify.ok) {
      return {
        summary: '继续执行/修复任务，并补齐 Gate 2 前 review 与验证材料。',
        command: 'node <skill-dir>/scripts/harness.js verify <需求工作台> --strict true',
        requiresHuman: false,
        blockedBy: verify.problems
      }
    }
    return {
      summary: 'Gate 2 前关门检查已满足，可以请求用户 review。',
      command: 'node <skill-dir>/scripts/harness.js request-gate2 <需求工作台> --review-pack reviews/review-packs.md --validation reports/validation.md',
      requiresHuman: false,
      blockedBy: []
    }
  }

  if (gate2.status === 'pending') {
    return {
      summary: '等待用户确认 Gate 2 Review Pack 与验证结果。',
      command: 'node <skill-dir>/scripts/harness.js approve-gate2 <需求工作台> --review true --validation true',
      requiresHuman: true,
      blockedBy: []
    }
  }

  if (gate3.status === 'not-requested') {
    return {
      summary: 'Gate 2 已确认，可以请求 Gate 3 最终动作授权。',
      command: 'node <skill-dir>/scripts/harness.js request-gate3 <需求工作台>',
      requiresHuman: false,
      blockedBy: []
    }
  }

  if (gate3.status === 'pending') {
    return {
      summary: '等待用户确认 Gate 3 最终动作组合。',
      command: 'node <skill-dir>/scripts/harness.js approve-gate3 <需求工作台> --merge false --commit false --push false --cleanup false',
      requiresHuman: true,
      blockedBy: []
    }
  }

  return {
    summary: 'Gate 3 已确认；执行前仍需按具体动作运行 harness check。',
    command: 'node <skill-dir>/scripts/harness.js check <需求工作台> --action <merge|commit|push|cleanup-worktree>',
    requiresHuman: false,
    blockedBy: []
  }
}

function buildMissionState(dir, extra = {}) {
  const { harness, state, gate1, gate2, gate3 } = requireState(dir)
  const nextAction = extra.nextAction || recommendNext(dir, state, gate1, gate2, gate3)
  return {
    schemaVersion: MISSION_STATE_VERSION,
    kind: 'mission-flow-state',
    requirementName: harness.requirementName || path.basename(dir),
    requirementDir: dir,
    phase: state.phase,
    mode: state.executionMode,
    worktree: state.allowWorktree,
    subagents: state.allowSubagents,
    checkpoint: state.allowCheckpointCommit,
    gates: {
      gate1: missionStatusLabel(gate1.status),
      gate2: missionStatusLabel(gate2.status),
      gate3: missionStatusLabel(gate3.status)
    },
    reviewStatus: gate2.status === 'approved' ? 'accepted' : gate2.status,
    validationStatus: gate2.validationAccepted ? 'accepted' : gate2.status,
    finalActions: {
      merge: gate3.allowMerge === true,
      commit: gate3.allowCommit === true,
      push: gate3.allowPush === true,
      cleanup: gate3.allowCleanup === true
    },
    nextAction,
    sourceOfTruth: missionStateSourceRefs(),
    updatedAt: now()
  }
}

function syncMissionState(dir, extra = {}) {
  const p = paths(dir)
  const snapshot = buildMissionState(dir, extra)
  writeJson(p.missionState, snapshot)
  return snapshot
}

function printNextSnapshot(snapshot, title = 'Mission Control Next') {
  console.log(title)
  console.log(`需求: ${snapshot.requirementName}`)
  console.log(`阶段: ${snapshot.phase}`)
  console.log(`模式: ${snapshot.mode || '-'}`)
  console.log(`Gate 1: ${snapshot.gates.gate1}`)
  console.log(`Gate 2: ${snapshot.gates.gate2}`)
  console.log(`Gate 3: ${snapshot.gates.gate3}`)
  console.log(`下一步: ${snapshot.nextAction.summary}`)
  console.log(`建议命令: ${snapshot.nextAction.command}`)
  console.log(`需要人工确认: ${snapshot.nextAction.requiresHuman}`)
  if (snapshot.nextAction.blockedBy.length) {
    console.log('阻塞项:')
    snapshot.nextAction.blockedBy.forEach(item => console.log(`- ${item}`))
  }
}

function csv(value) {
  if (!value || value === true) return []
  return String(value)
    .split(/[,\s]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => item !== 'true')
}

function deny(action, reason) {
  const error = new Error(`DENY ${action}: ${reason}`)
  error.exitCode = 2
  throw error
}

function validateKnownAction(action) {
  if (!KNOWN_ACTIONS.has(action)) {
    deny(action, `未知 action；请使用 ${Array.from(KNOWN_ACTIONS).join(', ')}。`)
  }
}

function splitPathRef(ref) {
  const clean = String(ref || '').trim()
  if (!clean) return ''
  return clean.split('#')[0].trim()
}

function resolveRequirementRef(dir, ref) {
  const clean = splitPathRef(ref)
  if (!clean) return ''
  if (path.isAbsolute(clean)) return clean

  const direct = path.join(dir, clean)
  if (fs.existsSync(direct)) return direct

  if (clean.startsWith('ui/')) {
    for (const materialDir of sourceCandidateDirs(dir)) {
      const materialRef = path.join(materialDir, clean)
      if (fs.existsSync(materialRef)) return materialRef
    }
  }

  return direct
}

function fileExistsAndHasContent(filePath) {
  return Boolean(filePath && fs.existsSync(filePath) && fs.statSync(filePath).size > 0)
}

function readText(filePath) {
  if (!fileExistsAndHasContent(filePath)) return ''
  return fs.readFileSync(filePath, 'utf8')
}

function requirementRoot(dir) {
  if (path.basename(dir) === 'workbench') return path.dirname(dir)
  return dir
}

function sourceDir(dir) {
  const root = requirementRoot(dir)
  const source = path.join(root, 'source')
  if (fs.existsSync(source)) return source

  const legacyInput = path.join(root, 'input')
  if (fs.existsSync(legacyInput)) return legacyInput

  return source
}

function sourceCandidateDirs(dir) {
  const root = requirementRoot(dir)
  return [sourceDir(dir), path.join(root, 'source'), path.join(root, 'input')].filter((entry, index, list) => {
    return list.indexOf(entry) === index
  })
}

function scanApiMaterial(rootDir) {
  if (!fs.existsSync(rootDir)) return false

  const scan = (currentDir, depth) => {
    let entries = []
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return false
    }

    for (const entry of entries) {
      const name = entry.name
      const lowerName = name.toLowerCase()
      if (name.startsWith('.') || GENERATED_WORKBENCH_DIRS.has(lowerName)) continue
      if (API_MATERIAL_NAME_RE.test(name)) return true

      if (entry.isDirectory() && depth < 2) {
        if (scan(path.join(currentDir, name), depth + 1)) return true
      }
    }

    return false
  }

  return scan(rootDir, 0)
}

function hasApiMaterial(dir) {
  return scanApiMaterial(dir) || sourceCandidateDirs(dir).some(candidate => scanApiMaterial(candidate))
}

function requiredWorkbenchFiles(dir) {
  const files = [
    'harness.json',
    'harness.state.json',
    path.join('gates', 'gate-1-decision.json'),
    path.join('gates', 'gate-2-decision.json'),
    path.join('gates', 'gate-3-decision.json'),
    path.join('plans', 'task-plan.md'),
    path.join('plans', 'progress.md'),
    path.join('reviews', 'review-packs.md'),
    path.join('reports', 'validation.md')
  ]

  if (hasApiMaterial(dir)) {
    files.push(path.join('specs', 'api-spec.md'))
  }

  if (hasUiManifest(dir)) {
    files.push(path.join('specs', 'ui-material-index.md'))
    files.push(path.join('specs', 'ui-schema-extract.md'))
  }

  if (needsPageContractMatrix(dir)) {
    files.push(path.join('specs', 'page-contract-matrix.md'))
  }

  return files
}

function requiredWorkbenchAlternatives(dir) {
  const alternatives = [
    {
      label: 'context.md',
      refs: ['context.md', path.join('specs', 'context.md')]
    }
  ]

  if (hasUiManifest(dir)) {
    alternatives.push({
      label: 'UI manifest',
      refs: [
        path.join('ui', 'manifest.json'),
        path.join('..', 'source', 'ui', 'manifest.json'),
        path.join('..', 'input', 'ui', 'manifest.json')
      ]
    })
  }

  return alternatives
}

function validateWorkbench(dir) {
  const missing = requiredWorkbenchFiles(dir).filter(ref => {
    return !fileExistsAndHasContent(resolveRequirementRef(dir, ref))
  })
  const missingAlternatives = requiredWorkbenchAlternatives(dir)
    .filter(entry => !entry.refs.some(ref => fileExistsAndHasContent(resolveRequirementRef(dir, ref))))
    .map(entry => `${entry.label}（兼容旧路径 ${entry.refs.slice(1).join(' 或 ')}）`)

  if (missing.length || missingAlternatives.length) {
    const missingText = missing.concat(missingAlternatives).join(', ')
    deny(
      'check-workbench',
      `工作台标准文档缺失或为空：${missingText}。Gate 1 前必须先补齐占位文档，不能只创建目录。`
    )
  }
}

function checkRefs(dir, refs) {
  return refs.map(ref => ({
    ref,
    filePath: resolveRequirementRef(dir, ref),
    ok: fileExistsAndHasContent(resolveRequirementRef(dir, ref))
  }))
}

function validateSchemaExtractContent(dir, boards, schemas, schemaExtract) {
  const filePath = resolveRequirementRef(dir, schemaExtract)
  const content = readText(filePath)
  const lowerContent = content.toLowerCase()
  const problems = []

  const requiredEvidence = [
    { label: 'Sketch Data 来源', patterns: [/Sketch Data/i, /sketch/i, /蓝湖导出/] },
    { label: '坐标', patterns: [/坐标/, /\bx\b/, /\by\b/, /left|top/] },
    { label: '尺寸', patterns: [/尺寸/, /宽/, /高/, /width/, /height/] },
    { label: '颜色', patterns: [/颜色/, /背景/, /color/, /background/, /#[0-9a-f]{3,8}/i, /rgba?\(/i] },
    { label: '字体', patterns: [/字号/, /字体/, /字重/, /行高/, /font/, /line-height/] },
    { label: '圆角/边框/阴影', patterns: [/圆角/, /边框/, /阴影/, /radius/, /border/, /shadow/] },
    { label: 'Schema 到实现映射', patterns: [/schema.*实现/i, /实现.*schema/i, /Sketch Data.*实现/i, /实现.*Sketch Data/i, /映射表/, /选择器/, /组件/, /selector/] },
    { label: '资源映射', patterns: [/资源映射/, /资源引用/, /图片图层/, /image-backed/i, /oss/i, /url\(/i, /https?:\/\//i] }
  ]

  for (const item of requiredEvidence) {
    if (!item.patterns.some(pattern => pattern.test(content))) {
      problems.push(`schema 提取缺少${item.label}证据`)
    }
  }

  for (const board of boards) {
    if (board && !content.includes(board)) {
      problems.push(`schema 提取未提及绑定画板：${board}`)
    }
  }

  for (const schema of schemas) {
    const schemaBase = path.basename(schema)
    const schemaName = schemaBase.replace(/\.json$/i, '')
    if (!content.includes(schemaBase) && !content.includes(schemaName)) {
      problems.push(`schema 提取未提及绑定 schema：${schemaBase}`)
    }

    const schemaPath = resolveRequirementRef(dir, schema)
    try {
      const json = readJson(schemaPath, {})
      const rootStyle = json?.style || {}
      const width = Number(rootStyle.width || json?.width) || null
      const height = Number(rootStyle.height || json?.height) || null
      if (width && !lowerContent.includes(String(width))) {
        problems.push(`schema 提取未记录根宽度：${schemaBase} width=${width}`)
      }
      if (height && !lowerContent.includes(String(height))) {
        problems.push(`schema 提取未记录根高度：${schemaBase} height=${height}`)
      }
    } catch (error) {
      problems.push(`schema JSON 解析失败：${schemaBase}，${error.message}`)
    }
  }

  if (/编码前必须补充|节点级提取.*pending|schema 提取.*pending/i.test(content)) {
    problems.push('schema 提取仍包含“编码前必须补充/pending”类占位，不能开始 UI 编码')
  }

  if (!/\|\s*Schema 节点\/路径\s*\|\s*设计值\s*\|\s*代码文件\/组件\/样式选择器\s*\|\s*实现值\s*\|\s*偏差说明\s*\|/i.test(content)) {
    problems.push('schema 提取缺少标准 Schema 到实现映射表表头')
  }

  return problems
}

function hasGate1HumanConfirmation(gate1) {
  return (
    gate1.humanConfirmed === true &&
    String(gate1.confirmedBy || gate1.approvedBy || '').trim().length > 0 &&
    String(gate1.confirmationText || '').trim().length >= 6
  )
}

function validateGate1(action, gate1) {
  if (!GATE1_ACTIONS.has(action)) return

  if (gate1.status !== 'approved') {
    deny(action, 'Gate 1 尚未确认；不能开始编码、创建隔离环境或派发实现任务。')
  }

  if (!hasGate1HumanConfirmation(gate1)) {
    deny(
      action,
      'Gate 1 缺少明确用户确认凭证；请先输出 Gate 1 Decision Brief，并由用户确认后用 approve-gate1 --confirmed-by user --confirmation "<用户确认原话或摘要>" 记录。'
    )
  }

  if (WORKTREE_ACTIONS.has(action) && gate1.allowWorktree !== true) {
    deny(action, 'Gate 1 未授权 worktree、分支或物料同步。')
  }
  if (action === 'dispatch-subagent' && gate1.allowSubagents !== true) {
    deny(action, 'Gate 1 未授权派发子 agent。')
  }
  if (action === 'checkpoint-commit' && gate1.allowCheckpointCommit !== true) {
    deny(action, 'Gate 1 未授权 checkpoint commit。')
  }
}

function validateGate3(action, gate3) {
  if (!GATE3_ACTIONS.has(action)) return
  if (gate3.status !== 'approved') {
    deny(action, 'Gate 3 尚未确认；不能 merge、commit、push 或清理 worktree。')
  }

  const allowedByAction = {
    merge: gate3.allowMerge,
    commit: gate3.allowCommit,
    push: gate3.allowPush,
    'cleanup-worktree': gate3.allowCleanup
  }
  if (!allowedByAction[action]) {
    deny(action, `Gate 3 未授权 ${action}。`)
  }
}

function validateUiSchemaFirst(dir, flags) {
  const boards = csv(flags.boards)
  const schemas = csv(flags.schemas)
  const schemaExtract = splitPathRef(flags['schema-extract'])
  const baselines = csv(flags.baselines)
  const schemaOnly = parseBoolean(flags['schema-only'], false)
  const problems = []
  const warnings = []

  if (!boards.length) problems.push('缺少绑定画板；请提供 --boards。')
  if (!schemas.length) problems.push('缺少 schema 路径；请提供 --schemas。')

  const missingSchemas = checkRefs(dir, schemas).filter(item => !item.ok)
  if (missingSchemas.length) {
    problems.push(`schema 文件不可读取或为空：${missingSchemas.map(item => item.ref).join(', ')}。`)
  }

  if (!schemaExtract) {
    problems.push('缺少 schema 提取证据；请提供 --schema-extract specs/ui-schema-extract.md。')
  } else if (!fileExistsAndHasContent(resolveRequirementRef(dir, schemaExtract))) {
    problems.push(`schema 提取文件不可读取或为空：${schemaExtract}。`)
  } else {
    problems.push(...validateSchemaExtractContent(dir, boards, schemas, schemaExtract))
  }

  const missingBaselines = checkRefs(dir, baselines).filter(item => !item.ok)
  if (!baselines.length) {
    if (schemaOnly) {
      warnings.push('schema-only 模式：未提供图片基线，将按 Sketch Data JSON 和 Schema 到实现映射表验收。')
    } else {
      problems.push('未提供 --baselines 且未声明 --schema-only true；图片缺失时必须显式进入 schema-only 模式。')
    }
  } else if (missingBaselines.length) {
    if (schemaOnly) {
      warnings.push(`schema-only 模式忽略不可读取基线图：${missingBaselines.map(item => item.ref).join(', ')}。`)
    } else {
      problems.push(`基线图不可读取或为空：${missingBaselines.map(item => item.ref).join(', ')}；若图片已删除，请使用 --schema-only true。`)
    }
  }

  if (problems.length) {
    deny('code', `UI schema-first 检查失败：${problems.join(' ')}`)
  }

  return warnings
}

function hasUiManifest(dir) {
  return (
    fs.existsSync(path.join(dir, 'ui', 'manifest.json')) ||
    sourceCandidateDirs(dir).some(candidate => fs.existsSync(path.join(candidate, 'ui', 'manifest.json')))
  )
}

function needsPageContractMatrix(dir) {
  return hasApiMaterial(dir) && hasUiManifest(dir)
}

function validateCodeMode(dir, flags) {
  const uiRequested = Boolean(
    parseBoolean(flags.ui, false) ||
      flags.boards ||
      flags.schemas ||
      flags['schema-extract'] ||
      flags.baselines
  )
  const nonUiRequested = parseBoolean(flags['non-ui'], false)

  if (uiRequested && nonUiRequested) {
    deny('code', 'UI 编码和非 UI 编码标记不能同时使用。')
  }

  if (hasUiManifest(dir) && !uiRequested && !nonUiRequested) {
    deny(
      'code',
      '检测到 UI manifest；编码前必须显式声明 --ui true --boards --schemas --schema-extract，或使用 --non-ui true --reason <原因> 说明本任务不涉及 UI。'
    )
  }

  if (nonUiRequested && !String(flags.reason || '').trim()) {
    deny('code', '非 UI 编码需要提供 --reason 说明为什么不需要 UI schema 检查。')
  }

  return uiRequested ? validateUiSchemaFirst(dir, flags) : []
}

function init(dir, flags) {
  ensureDir(dir)
  for (const child of ['specs', 'plans', 'reviews', 'reports', 'gates']) {
    ensureDir(path.join(dir, child))
  }

  const p = paths(dir)
  const existingHarness = readJson(p.harness)
  const harness = existingHarness
    ? { ...existingHarness, schemaVersion: SCHEMA_VERSION, requirementDir: dir, updatedAt: now() }
    : defaultHarness(dir, flags)
  writeJson(p.harness, harness)

  const existingState = readJson(p.state)
  writeJson(p.state, existingState ? migrateState(existingState) : defaultState())
  if (!fs.existsSync(p.gate1)) writeJson(p.gate1, defaultGateDecision('gate-1'))
  const rawGate2 = readJson(p.gate2)
  if (rawGate2) {
    writeJson(p.gate2, migrateGate2Decision(rawGate2))
  } else {
    writeJson(p.gate2, defaultGateDecision('gate-2'))
  }
  const rawGate3 = readJson(p.gate3)
  writeJson(p.gate3, migrateGate3Decision(rawGate3, rawGate2))

  console.log(`Initialized requirement harness at ${dir}`)
  console.log(`Phase: ${readJson(p.state).phase}`)
  syncMissionState(dir)
}

function status(dir, flags) {
  const { harness, state, gate1, gate2, gate3 } = requireState(dir)
  const missionState = syncMissionState(dir)
  const payload = {
    requirementName: harness.requirementName || path.basename(dir),
    phase: state.phase,
    gate1Status: gate1.status,
    gate2Status: gate2.status,
    gate3Status: gate3.status,
    executionMode: state.executionMode,
    allowWorktree: state.allowWorktree,
    allowSubagents: state.allowSubagents,
    allowCheckpointCommit: state.allowCheckpointCommit,
    gate2: {
      reviewPack: gate2.reviewPack,
      validationReport: gate2.validationReport,
      reviewAccepted: gate2.reviewAccepted,
      validationAccepted: gate2.validationAccepted
    },
    gate3: {
      allowMerge: gate3.allowMerge,
      allowCommit: gate3.allowCommit,
      allowPush: gate3.allowPush,
      allowCleanup: gate3.allowCleanup
    },
    uiInspection: state.uiInspection || null,
    nextAction: missionState.nextAction
  }

  if (flags.json) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  console.log(`需求: ${payload.requirementName}`)
  console.log(`阶段: ${payload.phase}`)
  console.log(`Gate 1: ${payload.gate1Status}`)
  console.log(`Gate 2 Review: ${payload.gate2Status}`)
  console.log(`Gate 3 Final: ${payload.gate3Status}`)
  console.log(`执行模式: ${payload.executionMode || '-'}`)
  console.log(`允许 worktree: ${payload.allowWorktree}`)
  console.log(`允许子 agent: ${payload.allowSubagents}`)
  console.log(`允许 checkpoint commit: ${payload.allowCheckpointCommit}`)
  if (payload.uiInspection) {
    console.log(`UI 体检: ${payload.uiInspection.total} 个画板，${payload.uiInspection.ok} 个正常，${payload.uiInspection.schemaFound} 个 schema 可读`)
    if (payload.uiInspection.indexPath) console.log(`UI 索引: ${payload.uiInspection.indexPath}`)
  }
  console.log(`下一步: ${payload.nextAction.summary}`)
  console.log(`建议命令: ${payload.nextAction.command}`)
}

function next(dir, flags, title = 'Mission Control Next') {
  requireState(dir)
  const snapshot = syncMissionState(dir)
  if (flags.json) {
    console.log(JSON.stringify(snapshot, null, 2))
    return
  }
  printNextSnapshot(snapshot, title)
}

function resume(dir, flags) {
  return next(dir, flags, 'Mission Control Resume')
}

function checkWorkbench(dir) {
  requireState(dir)
  validateWorkbench(dir)
  validateSuperpowerEvidence(dir, [SUPERPOWER_SKILLS.writingPlans], 'check-workbench')
  console.log('ALLOW check-workbench')
}

function approveGate1(dir, flags) {
  const mode = flags.mode
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid --mode. Expected one of: ${Array.from(VALID_MODES).join(', ')}`)
  }
  const confirmedBy = String(flags['confirmed-by'] || flags.by || '').trim()
  const confirmationText = String(flags.confirmation || '').trim()
  if (confirmedBy !== 'user') {
    throw new Error('Gate 1 approval requires --confirmed-by user after explicit user confirmation.')
  }
  if (confirmationText.length < 6) {
    throw new Error('Gate 1 approval requires --confirmation "<用户确认原话或摘要>".')
  }

  const defaultWorktree = mode !== 'main-serial'
  const defaultSubagents = mode === 'multi-worktree-parallel'
  const allowWorktree = parseBoolean(flags.worktree, defaultWorktree)
  const allowSubagents = parseBoolean(flags.subagents, defaultSubagents)
  const allowCheckpointCommit = parseBoolean(flags.checkpoint, false)
  const { p, state, gate1 } = requireState(dir)
  validateWorkbench(dir)
  validateSuperpowerEvidence(dir, [SUPERPOWER_SKILLS.writingPlans], 'approve-gate1')
  const approvedAt = now()

  writeJson(p.gate1, {
    ...gate1,
    schemaVersion: SCHEMA_VERSION,
    status: 'approved',
    executionMode: mode,
    allowWorktree,
    allowSubagents,
    allowCheckpointCommit,
    approvedAt,
    approvedBy: confirmedBy,
    humanConfirmed: true,
    confirmedBy,
    confirmationText,
    notes: flags.notes || ''
  })
  saveState(p, {
    ...state,
    phase: 'gate-1-approved',
    executionMode: mode,
    allowWorktree,
    allowSubagents,
    allowCheckpointCommit
  })

  console.log('Gate 1 approved.')
  console.log(`Execution mode: ${mode}`)
  console.log(`Allow worktree: ${allowWorktree}`)
  console.log(`Allow subagents: ${allowSubagents}`)
  console.log(`Allow checkpoint commit: ${allowCheckpointCommit}`)
  syncMissionState(dir)
}

function requestGate2(dir, flags) {
  const { p, state, gate1, gate2 } = requireState(dir)
  const force = parseBoolean(flags.force, false)
  if (gate1.status !== 'approved') {
    throw new Error('Cannot request Gate 2 before Gate 1 is approved.')
  }
  if (gate2.status === 'approved' && !force) {
    throw new Error('Gate 2 is already approved. Use --force true only when intentionally re-requesting it.')
  }

  writeJson(p.gate2, {
    ...gate2,
    schemaVersion: SCHEMA_VERSION,
    status: 'pending',
    reviewPack: flags['review-pack'] || gate2.reviewPack || 'reviews/review-packs.md',
    validationReport: flags.validation || gate2.validationReport || 'reports/validation.md',
    reviewAccepted: false,
    validationAccepted: false,
    requestedAt: now(),
    notes: flags.notes || gate2.notes || ''
  })
  saveState(p, { ...state, phase: 'gate-2-pending' })
  console.log('Gate 2 review requested.')
  syncMissionState(dir)
}

function approveGate2(dir, flags) {
  const { p, state, gate2 } = requireState(dir)
  if (gate2.status !== 'pending') {
    throw new Error('Gate 2 is not pending. Run request-gate2 first.')
  }

  const reviewAccepted = parseBoolean(flags.review, true)
  const validationAccepted = parseBoolean(flags.validation, true)
  if (!reviewAccepted || !validationAccepted) {
    throw new Error('Gate 2 approval requires review and validation to be accepted. Use notes to record concerns, or keep Gate 2 pending.')
  }

  const nextGate2 = {
    ...gate2,
    schemaVersion: SCHEMA_VERSION,
    status: 'approved',
    reviewAccepted,
    validationAccepted,
    approvedAt: now(),
    approvedBy: flags.by || 'user',
    notes: flags.notes || gate2.notes || ''
  }

  writeJson(p.gate2, nextGate2)
  saveState(p, { ...state, phase: 'gate-2-approved' })
  console.log('Gate 2 review approved.')
  syncMissionState(dir)
}

function requestGate3(dir, flags) {
  const { p, state, gate1, gate2, gate3 } = requireState(dir)
  const force = parseBoolean(flags.force, false)
  if (gate1.status !== 'approved') {
    throw new Error('Cannot request Gate 3 before Gate 1 is approved.')
  }
  if (gate2.status !== 'approved') {
    throw new Error('Cannot request Gate 3 before Gate 2 review is approved.')
  }
  validateSuperpowerEvidence(
    dir,
    [SUPERPOWER_SKILLS.verificationBeforeCompletion, SUPERPOWER_SKILLS.finishingDevelopmentBranch],
    'request-gate3'
  )
  if (gate3.status === 'approved' && !force) {
    throw new Error('Gate 3 is already approved. Use --force true only when intentionally re-requesting it.')
  }

  writeJson(p.gate3, {
    ...gate3,
    schemaVersion: SCHEMA_VERSION,
    status: 'pending',
    requestedAt: now(),
    notes: flags.notes || gate3.notes || ''
  })
  saveState(p, { ...state, phase: 'gate-3-pending' })
  console.log('Gate 3 final-action requested.')
  syncMissionState(dir)
}

function approveGate3(dir, flags) {
  const { p, state, gate3 } = requireState(dir)
  if (gate3.status !== 'pending') {
    throw new Error('Gate 3 is not pending. Run request-gate3 first.')
  }
  validateSuperpowerEvidence(
    dir,
    [SUPERPOWER_SKILLS.verificationBeforeCompletion, SUPERPOWER_SKILLS.finishingDevelopmentBranch],
    'approve-gate3'
  )

  const nextGate3 = {
    ...gate3,
    schemaVersion: SCHEMA_VERSION,
    status: 'approved',
    allowMerge: parseBoolean(flags.merge, false),
    allowCommit: parseBoolean(flags.commit, false),
    allowPush: parseBoolean(flags.push, false),
    allowCleanup: parseBoolean(flags.cleanup, false),
    approvedAt: now(),
    approvedBy: flags.by || 'user',
    notes: flags.notes || gate3.notes || ''
  }

  writeJson(p.gate3, nextGate3)
  saveState(p, { ...state, phase: 'gate-3-approved' })
  console.log('Gate 3 final-action approved.')
  syncMissionState(dir)
}

function check(dir, flags) {
  const action = flags.action
  if (!action) throw new Error('Missing --action')

  validateKnownAction(action)
  const { gate1, gate3 } = requireState(dir)
  validateGate1(action, gate1)
  validateGate3(action, gate3)

  const warnings = action === 'code' ? validateCodeMode(dir, flags) : []
  if (action === 'code') {
    validateSuperpowerEvidence(
      dir,
      [
        SUPERPOWER_SKILLS.testDrivenDevelopment,
        gate1.allowSubagents === true
          ? SUPERPOWER_SKILLS.subagentDrivenDevelopment
          : SUPERPOWER_SKILLS.executingPlans
      ],
      'code'
    )
  }
  if (action === 'dispatch-subagent') {
    validateSuperpowerEvidence(
      dir,
      [SUPERPOWER_SKILLS.subagentDrivenDevelopment],
      'dispatch-subagent'
    )
  }
  if (GATE3_ACTIONS.has(action)) {
    validateSuperpowerEvidence(
      dir,
      [SUPERPOWER_SKILLS.verificationBeforeCompletion, SUPERPOWER_SKILLS.finishingDevelopmentBranch],
      action
    )
  }

  console.log(`ALLOW ${action}`)
  for (const warning of warnings) console.log(`WARN ${warning}`)
}

function verify(dir, flags) {
  const result = verifySummary(dir, flags)
  const nextAction = result.ok
    ? {
        summary: 'Gate 2 前关门检查已通过，可以请求 Gate 2 Review。',
        command: 'node <skill-dir>/scripts/harness.js request-gate2 <需求工作台> --review-pack reviews/review-packs.md --validation reports/validation.md',
        requiresHuman: false,
        blockedBy: []
      }
    : {
        summary: 'Gate 2 前关门检查未通过，先修复 review/validation 材料。',
        command: 'node <skill-dir>/scripts/harness.js verify <需求工作台> --strict true',
        requiresHuman: false,
        blockedBy: result.problems
      }
  syncMissionState(dir, { nextAction })

  if (result.reviewabilityOutput) console.log(result.reviewabilityOutput)
  result.warnings.forEach(item => console.log(`WARN ${item}`))
  result.problems.forEach(item => console.log(`FAIL ${item}`))
  if (!result.ok) {
    process.exit(result.strict ? 2 : 0)
  }
  console.log('PASS mission-control verify')
}

function main() {
  const { command, requirementDir, flags } = parseArgs(process.argv)
  if (!command || !requirementDir) usage()
  const dir = requirementPath(requirementDir)

  try {
    if (command === 'init') return init(dir, flags)
    if (command === 'status') return status(dir, flags)
    if (command === 'next') return next(dir, flags)
    if (command === 'resume') return resume(dir, flags)
    if (command === 'check-workbench') return checkWorkbench(dir)
    if (command === 'verify') return verify(dir, flags)
    if (command === 'approve-gate1') return approveGate1(dir, flags)
    if (command === 'request-gate2') return requestGate2(dir, flags)
    if (command === 'approve-gate2') return approveGate2(dir, flags)
    if (command === 'request-gate3') return requestGate3(dir, flags)
    if (command === 'approve-gate3') return approveGate3(dir, flags)
    if (command === 'check') return check(dir, flags)
    usage()
  } catch (error) {
    console.error(error.message)
    process.exit(error.exitCode || 1)
  }
}

main()
