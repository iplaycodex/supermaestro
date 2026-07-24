#!/usr/bin/env node

'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pluginRoot = path.join(root, 'plugins', 'supermaestro')
const pkg = readJson(path.join(root, 'package.json'))
const manifest = readJson(path.join(pluginRoot, '.codex-plugin', 'plugin.json'))
const marketplace = readJson(path.join(root, '.agents', 'plugins', 'marketplace.json'))

assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/)
assert.strictEqual(manifest.name, pkg.name, 'package 与 plugin manifest 名称必须一致')
assert.strictEqual(manifest.version, pkg.version, 'package 与 plugin manifest 版本必须一致')
assert.strictEqual(manifest.license, pkg.license, 'package 与 plugin manifest license 必须一致')

const marketplaceEntry = marketplace.plugins.find(entry => entry.name === manifest.name)
assert.ok(marketplaceEntry, 'marketplace 必须包含当前插件')
assert.strictEqual(marketplaceEntry.source?.source, 'local')
assert.strictEqual(marketplaceEntry.source?.path, './plugins/supermaestro')
assert.ok(['AVAILABLE', 'INSTALLED_BY_DEFAULT'].includes(marketplaceEntry.policy?.installation))
assert.ok(['ON_INSTALL', 'ON_USE'].includes(marketplaceEntry.policy?.authentication))

assert.ok(Array.isArray(manifest.interface?.defaultPrompt))
assert.ok(manifest.interface.defaultPrompt.length > 0 && manifest.interface.defaultPrompt.length <= 3)
for (const prompt of manifest.interface.defaultPrompt) {
  assert.ok(Array.from(prompt).length <= 128, 'defaultPrompt 每项不能超过 128 个字符')
}

const skillsRoot = path.join(pluginRoot, 'skills')
const skillDirs = fs.readdirSync(skillsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()
assert.ok(skillDirs.length > 0, '插件至少包含一个 Skill')

for (const skillName of skillDirs) {
  const skillDir = path.join(skillsRoot, skillName)
  const skillText = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
  const frontmatter = skillText.match(/^---\n([\s\S]*?)\n---/)
  assert.ok(frontmatter, `${skillName} 缺少合法 frontmatter`)
  assert.match(frontmatter[1], new RegExp(`^name:\\s*${escapeRegExp(skillName)}\\s*$`, 'm'))
  assert.match(frontmatter[1], /^description:\s*.*[\u3400-\u9fff].*$/m, `${skillName} description 应为中文`)
  for (const heading of ['触发条件', '输入', '异常', '边界']) {
    assert.match(skillText, new RegExp(`^##\\s+.*${heading}`, 'm'), `${skillName} 缺少“${heading}”章节`)
  }
  assert.match(skillText, /^##\s+.*(?:输出|完成标准)/m, `${skillName} 缺少输出或完成标准章节`)
  for (const link of markdownLinks(skillText)) {
    if (/^(?:https?:|#|mailto:|<)/i.test(link)) continue
    const target = path.resolve(skillDir, link.split('#')[0])
    assert.ok(fs.existsSync(target), `${skillName} 包含失效相对链接：${link}`)
  }
  const referencesDir = path.join(skillDir, 'references')
  if (fs.existsSync(referencesDir)) {
    for (const reference of fs.readdirSync(referencesDir).filter(name => name.endsWith('.md'))) {
      assert.match(
        skillText,
        new RegExp(`references/${escapeRegExp(reference)}`),
        `${skillName} 未从 SKILL.md 渐进披露引用 ${reference}`
      )
    }
  }

  const openaiYaml = fs.readFileSync(path.join(skillDir, 'agents', 'openai.yaml'), 'utf8')
  assert.match(openaiYaml, new RegExp(`default_prompt:\\s*".*\\$${escapeRegExp(skillName)}.*"`))
  assert.match(openaiYaml, /display_name:\s*".*[\u3400-\u9fff].*"/)
  const shortDescription = openaiYaml.match(/short_description:\s*"([^"]+)"/)?.[1] || ''
  const shortLength = Array.from(shortDescription).length
  assert.ok(
    shortLength >= 25 && shortLength <= 64,
    `${skillName} short_description 长度应为 25-64，当前为 ${shortLength}`
  )
}

for (const removedPath of [
  'plugins/supermaestro/references',
  'plugins/supermaestro/templates',
  'write-access-probe.txt'
]) {
  const target = path.join(root, removedPath)
  const absentOrEmptyDirectory = !fs.existsSync(target) ||
    (fs.statSync(target).isDirectory() && listFiles(target).length === 0)
  assert.ok(absentOrEmptyDirectory, `遗留路径应已移除：${removedPath}`)
}

for (const file of listFiles(root)) {
  if (file.includes(`${path.sep}.git${path.sep}`)) continue
  const relative = path.relative(root, file)
  const content = fs.readFileSync(file)
  if (content.includes(0)) continue
  assert.doesNotMatch(
    content.toString('utf8'),
    new RegExp(`\\b${['super', 'powers'].join('')}\\b`, 'i'),
    `当前源码不应保留已移除的外部流程依赖或说明：${relative}`
  )
}

if (process.env.GITHUB_REF_TYPE === 'tag') {
  assert.strictEqual(
    process.env.GITHUB_REF_NAME,
    `v${pkg.version}`,
    '发布标签必须与 package/plugin 版本一致'
  )
}

console.log(`PASS repository integrity: ${skillDirs.length} skills, version ${pkg.version}`)

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function listFiles(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue
    const target = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(target))
    if (entry.isFile()) files.push(target)
  }
  return files
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function markdownLinks(content) {
  return Array.from(content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g), match => match[1].trim())
}
