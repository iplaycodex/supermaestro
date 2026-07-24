#!/usr/bin/env node

'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT_CLI = path.resolve(__dirname, '../../../scripts/supermaestro.js')

main()

/**
 * 旧版独立检查器的兼容入口。
 *
 * Review Pack、fan-in、agent/worktree 状态与真实 diff 的判断已经统一到
 * 根 CLI；这里不再读取 harness.state.json，也不保留第二套实现。
 */
function main() {
  const [workbenchArg, ...args] = process.argv.slice(2)
  if (!workbenchArg || workbenchArg === 'help' || workbenchArg === '--help') {
    printHelp(workbenchArg ? 0 : 1)
    return
  }
  if (!fs.existsSync(ROOT_CLI)) {
    fail(`找不到主 CLI：${ROOT_CLI}`)
  }

  const workbench = path.resolve(process.cwd(), workbenchArg)
  const result = spawnSync(
    process.execPath,
    [ROOT_CLI, 'check-reviewability', workbench, ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env
    }
  )

  if (result.error) {
    fail(`启动主 CLI 失败：${result.error.message}`)
  }
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.status == null ? 1 : result.status)
}

function printHelp(exitCode) {
  const text = `
兼容入口（已弃用）：
  node scripts/check-reviewability.js <workbench> [--strict true] [--json true] [--review-pack <path>]

新调用请直接使用：
  node <plugin-root>/scripts/supermaestro.js check-reviewability <workbench> [options]

检查器只读取根 CLI 的 state.json，不再读取或创建 harness.state.json。
`
  const target = exitCode === 0 ? process.stdout : process.stderr
  target.write(text.trimStart())
  process.exit(exitCode)
}

function fail(message) {
  process.stderr.write(`mission-control reviewability adapter: ${message}\n`)
  process.exit(1)
}
