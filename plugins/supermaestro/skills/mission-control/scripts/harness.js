#!/usr/bin/env node

'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT_CLI = path.resolve(__dirname, '../../../scripts/supermaestro.js')
const LEGACY_COMMANDS = new Set([
  'init',
  'status',
  'next',
  'resume',
  'check-workbench',
  'check-reviewability',
  'verify',
  'approve-gate1',
  'approve-gate2',
  'request-gate3',
  'approve-gate3',
  'request-gate4',
  'approve-gate4',
  'check'
])

main()

/**
 * 兼容旧版 mission-control 命令，但不再维护 harness.json /
 * harness.state.json。所有状态变更都转发给插件根目录的唯一 CLI。
 */
function main() {
  const [command, workbenchArg, ...rawArgs] = process.argv.slice(2)
  if (!command || command === 'help' || command === '--help') {
    printHelp(command ? 0 : 1)
    return
  }
  if (!workbenchArg) {
    fail('缺少工作台路径。')
  }
  if (!LEGACY_COMMANDS.has(command)) {
    fail(`未知兼容命令：${command}`)
  }
  if (!fs.existsSync(ROOT_CLI)) {
    fail(`找不到主 CLI：${ROOT_CLI}`)
  }

  const workbench = path.resolve(process.cwd(), workbenchArg)
  const args = normalizeLegacyArgs(command, rawArgs)
  const wantsJson = takeBooleanFlag(args, '--json')
  const result = spawnSync(
    process.execPath,
    [ROOT_CLI, command, workbench, ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env
    }
  )

  if (result.error) {
    fail(`启动主 CLI 失败：${result.error.message}`)
  }
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    process.exit(result.status == null ? 1 : result.status)
  }

  if (wantsJson && ['status', 'next', 'resume'].includes(command)) {
    const projection = path.join(workbench, 'mission.state.json')
    if (!fs.existsSync(projection)) {
      fail('主 CLI 未生成 mission.state.json。')
    }
    process.stdout.write(`${JSON.stringify(JSON.parse(fs.readFileSync(projection, 'utf8')), null, 2)}\n`)
    return
  }

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
}

function normalizeLegacyArgs(command, args) {
  const normalized = [...args]
  if (command !== 'check') return normalized

  const actionIndex = normalized.findIndex(item => item === '--action')
  if (actionIndex !== -1 && normalized[actionIndex + 1] === 'cleanup-worktree') {
    normalized[actionIndex + 1] = 'cleanup'
  }
  return normalized
}

function takeBooleanFlag(args, flag) {
  const index = args.findIndex(item => item === flag || item.startsWith(`${flag}=`))
  if (index === -1) return false

  const current = args[index]
  if (current.includes('=')) {
    const value = current.slice(current.indexOf('=') + 1)
    args.splice(index, 1)
    return parseBoolean(value)
  }

  const next = args[index + 1]
  if (next && !next.startsWith('--')) {
    args.splice(index, 2)
    return parseBoolean(next)
  }
  args.splice(index, 1)
  return true
}

function parseBoolean(value) {
  if (value === true || value === 'true' || value === '1' || value === 'yes') return true
  if (value === false || value === 'false' || value === '0' || value === 'no') return false
  fail(`无效布尔值：${value}`)
}

function printHelp(exitCode) {
  const text = `
兼容入口（已弃用）：
  node scripts/harness.js <command> <workbench> [options]

状态唯一事实源：
  <workbench>/state.json
  <workbench>/events.jsonl
  <workbench>/mission.state.json

新调用请直接使用：
  node <plugin-root>/scripts/supermaestro.js <command> <workbench> [options]

旧命令 approve-gate1..4 仍会转发到主 CLI；不会再创建或更新
harness.json / harness.state.json。
`
  const target = exitCode === 0 ? process.stdout : process.stderr
  target.write(text.trimStart())
  process.exit(exitCode)
}

function fail(message) {
  process.stderr.write(`mission-control harness adapter: ${message}\n`)
  process.exit(1)
}
