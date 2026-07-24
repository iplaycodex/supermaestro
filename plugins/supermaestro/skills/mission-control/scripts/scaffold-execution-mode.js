#!/usr/bin/env node

'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT_CLI = path.resolve(__dirname, '../../../scripts/supermaestro.js')
const ALLOWED_FLAGS = new Set([
  'agents',
  'review-agents',
  'contract',
  'integration'
])

main()

/**
 * 旧版可选模块脚手架兼容入口。
 *
 * 不再读取 harness.state.json，也不直接维护另一份模板。它只检查主状态
 * 中已经由 Plan Gate 授权的执行能力，再转发给根 supermaestro CLI。
 */
function main() {
  const [workbenchArg, ...args] = process.argv.slice(2)
  if (!workbenchArg || workbenchArg === '--help') {
    usage(workbenchArg === '--help' ? 0 : 1)
  }

  const workbench = path.resolve(process.cwd(), workbenchArg)
  const stateFile = path.join(workbench, 'state.json')
  if (!fs.existsSync(stateFile)) {
    fail('缺少 state.json；请先运行主 CLI init 并完成 Plan Gate。')
  }

  const flags = parseFlags(args)
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  if (state.gates?.gate2 !== 'approved') {
    fail('Plan Gate 尚未批准，不能生成执行模式相关文件。')
  }

  const execution = state.execution || {}
  if (flags.agents === true && execution.subagents !== true) {
    fail('Plan Gate 未授权 subagents。')
  }
  if (flags['review-agents'] === true && execution.subagents !== true) {
    fail('Plan Gate 未授权 subagents，不能启用 review agent。')
  }
  if (execution.worktree !== true && state.artifacts?.triggers?.worktree === true) {
    fail('当前工作台声明了 worktree，但 Plan Gate 未授权 worktree。')
  }

  const forwarded = [
    'scaffold',
    workbench,
    '--mode',
    state.mode,
    '--worktree',
    String(execution.worktree === true),
    '--subagents',
    String(flags.agents === true || execution.subagents === true),
    '--review-agent',
    String(flags['review-agents'] === true),
    '--contract-changes',
    String(flags.contract === true),
    '--integration',
    String(flags.integration === true)
  ]
  const result = spawnSync(process.execPath, [ROOT_CLI, ...forwarded], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) fail(`启动主 CLI 失败：${result.error.message}`)
  process.exit(result.status == null ? 1 : result.status)
}

function parseFlags(args) {
  const flags = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) fail(`不支持的位置参数：${arg}`)

    const separator = arg.indexOf('=')
    const key = separator === -1 ? arg.slice(2) : arg.slice(2, separator)
    if (!ALLOWED_FLAGS.has(key)) fail(`不支持的参数：--${key}`)

    let value
    if (separator !== -1) {
      value = arg.slice(separator + 1)
    } else {
      const next = args[index + 1]
      if (!next || next.startsWith('--')) {
        value = true
      } else {
        value = next
        index += 1
      }
    }
    flags[key] = parseBoolean(value)
  }
  return flags
}

function parseBoolean(value) {
  if (value === true || value === 'true' || value === '1' || value === 'yes') return true
  if (value === false || value === 'false' || value === '0' || value === 'no') return false
  fail(`无效布尔值：${value}`)
}

function usage(exitCode) {
  const text = `
兼容入口（已弃用）：
  node scripts/scaffold-execution-mode.js <workbench> \
    [--agents true] [--review-agents true] \
    [--contract true] [--integration true]

新调用请直接使用：
  node <plugin-root>/scripts/supermaestro.js scaffold <workbench> ...
`
  const target = exitCode === 0 ? process.stdout : process.stderr
  target.write(text.trimStart())
  process.exit(exitCode)
}

function fail(message) {
  process.stderr.write(`scaffold-execution-mode adapter: ${message}\n`)
  process.exit(1)
}
