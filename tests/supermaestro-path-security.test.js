#!/usr/bin/env node

'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { spawnSync } = require('node:child_process')

const repoRoot = path.resolve(__dirname, '..')
const cli = path.join(repoRoot, 'plugins/supermaestro/scripts/supermaestro.js')

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: 'utf8'
  })
}

function symlinkOrSkip(t, target, link, type) {
  try {
    fs.symlinkSync(target, link, type)
    return true
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`symlink is unavailable: ${error.code}`)
      return false
    }
    throw error
  }
}

test('init 拒绝通过 events.jsonl symlink 追加到工作台外', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supermaestro-event-link-'))
  const workbench = path.join(root, 'workbench')
  const outside = path.join(root, 'outside-events.jsonl')
  fs.mkdirSync(workbench, { recursive: true })
  fs.writeFileSync(outside, 'sentinel\n')
  if (!symlinkOrSkip(t, outside, path.join(workbench, 'events.jsonl'), 'file')) return

  const result = run(['init', workbench, '--name', '事件边界', '--mode', 'lite'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /output file must not be a symlink/i)
  assert.equal(fs.readFileSync(outside, 'utf8'), 'sentinel\n')
})

test('scaffold 拒绝通过 reports 目录 symlink 写到工作台外', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supermaestro-report-link-'))
  const workbench = path.join(root, 'workbench')
  const outside = path.join(root, 'outside-reports')
  fs.mkdirSync(outside, { recursive: true })

  let result = run(['init', workbench, '--name', '报告边界', '--mode', 'lite'])
  assert.equal(result.status, 0, result.stdout + result.stderr)
  if (!symlinkOrSkip(t, outside, path.join(workbench, 'reports'), 'dir')) return

  result = run(['scaffold', workbench])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /output directory must not be a symlink/i)
  assert.deepEqual(fs.readdirSync(outside), [])
})
