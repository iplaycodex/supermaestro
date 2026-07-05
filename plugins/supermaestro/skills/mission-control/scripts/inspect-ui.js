#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

function usage(exitCode = 1) {
  const text = `
Usage:
  node scripts/inspect-ui.js <requirement-dir> [--manifest <path>] [--ui-dir <path>] [--json] [--write-index true|false]
`
  console.error(text.trim())
  process.exit(exitCode)
}

function parseArgs(argv) {
  const requirementDir = argv[2]
  const flags = {}

  for (let i = 3; i < argv.length; i += 1) {
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

  return { requirementDir, flags }
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 'true' || value === '1' || value === 'yes') return true
  if (value === false || value === 'false' || value === '0' || value === 'no') return false
  throw new Error(`Invalid boolean value: ${value}`)
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

function maybeRelative(baseDir, targetPath) {
  if (!targetPath) return ''
  const relative = path.relative(baseDir, targetPath)
  if (!path.isAbsolute(relative)) {
    if (!relative.startsWith('..')) return relative || '.'

    const rootRelative = path.relative(requirementRoot(baseDir), targetPath)
    if (!rootRelative.startsWith('..') && !path.isAbsolute(rootRelative)) return relative
  }
  return targetPath
}

function requirementRoot(dir) {
  if (path.basename(dir) === 'workbench') return path.dirname(dir)
  return dir
}

function defaultUiDir(dir) {
  const workbenchUi = path.join(dir, 'ui')
  if (fs.existsSync(path.join(workbenchUi, 'manifest.json'))) return workbenchUi

  const root = requirementRoot(dir)
  const sourceUi = path.join(root, 'source', 'ui')
  if (fs.existsSync(path.join(sourceUi, 'manifest.json'))) return sourceUi

  const legacyInputUi = path.join(root, 'input', 'ui')
  if (fs.existsSync(path.join(legacyInputUi, 'manifest.json'))) return legacyInputUi

  return workbenchUi
}

function readImageSize(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  let buffer
  try {
    buffer = fs.readFileSync(filePath)
  } catch (error) {
    return null
  }
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      type: 'png'
    }
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break
      const marker = buffer[offset + 1]
      const length = buffer.readUInt16BE(offset + 2)
      if (length < 2) break
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
          type: 'jpeg'
        }
      }
      offset += 2 + length
    }
  }

  return null
}

function readSchemaMeta(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {}
  try {
    const json = readJson(filePath, {})
    const style = json?.style || {}
    return {
      width: Number(style.width || json?.width) || null,
      height: Number(style.height || json?.height) || null,
      rootName: json?.eleName || json?.componentName || json?.name || ''
    }
  } catch (error) {
    return {
      parseError: error.message
    }
  }
}

function pickRecordPath(record, keys) {
  for (const key of keys) {
    const value = key.split('.').reduce((node, part) => node?.[part], record)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function resolveManifestFile(ref, uiDir, fallbackDir) {
  const result = {
    ref: ref || '',
    actualPath: '',
    exists: false,
    relocated: false
  }

  if (!ref) return result

  const manifestPath = path.isAbsolute(ref) ? ref : path.resolve(uiDir, ref)
  if (fs.existsSync(manifestPath)) {
    result.exists = true
    result.actualPath = manifestPath
    return result
  }

  const basename = path.basename(ref)
  const fallbackPath = fallbackDir && basename ? path.join(fallbackDir, basename) : ''
  if (fallbackPath && fs.existsSync(fallbackPath)) {
    result.exists = true
    result.actualPath = fallbackPath
    result.relocated = true
  }

  return result
}

function inferUiStatus(record, schemaInfo, imageInfo, imageSize) {
  const errors = Array.isArray(record.errors) ? record.errors.filter(Boolean) : []
  if (errors.length) return 'error'
  if (!schemaInfo.ref && !imageInfo.ref) return 'missing-path'
  if (!schemaInfo.exists) return 'missing-file'
  if (!imageInfo.ref || !imageInfo.exists) return 'schema-only'
  if (imageInfo.exists && !imageSize) return 'image-unreadable'
  if (schemaInfo.relocated || imageInfo.relocated) return 'relocated'
  return 'ok'
}

function buildWarnings(summary, boards) {
  const warnings = []
  if (summary.dryRun) warnings.push('Manifest 是 dry-run；schema 或图片基线可能缺失。')
  if (summary.absolutePathRefs) warnings.push('Manifest 包含 schema/image 绝对路径；如果资料包会移动，建议重新导出为相对路径。')
  if (summary.relocated) warnings.push('部分 manifest 路径不存在，但已在当前 UI 物料目录下找到匹配文件。')
  if (summary.missingFile || summary.missingPath || summary.errored) warnings.push('部分画板不完整；不得声称 UI 基线完整。')
  if (summary.schemaOnly) warnings.push(`${summary.schemaOnly} 个画板没有可用图片基线；仍可按 schema-only 开发，但必须用节点级 Sketch Data 提取和 Schema 到实现映射表验收。`)
  if (summary.imageUnreadable) warnings.push(`${summary.imageUnreadable} 个图片文件存在但无法解析尺寸；视觉基线可能不可用。`)
  if (summary.designWidths.length > 1) warnings.push(`检测到多个设计宽度：${summary.designWidths.join(', ')}。`)
  if (summary.imageWidths.length > 1) warnings.push(`检测到多个图片宽度：${summary.imageWidths.join(', ')}。`)
  const backupCount = boards.filter(board => /备份|copy|backup/i.test(board.name)).length
  if (backupCount) warnings.push(`${backupCount} 个画板疑似备份或复制版本；绑定任务前必须确认范围。`)
  return warnings
}

function buildInspection(dir, flags) {
  const uiDir = path.resolve(dir, flags['ui-dir'] || defaultUiDir(dir))
  const manifestPath = flags.manifest
    ? path.resolve(dir, flags.manifest)
    : path.join(uiDir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`UI manifest not found: ${manifestPath}`)
  }

  const manifest = readJson(manifestPath)
  if (!manifest || typeof manifest !== 'object') {
    throw new Error(`Invalid UI manifest: ${manifestPath}`)
  }

  const records = Array.isArray(manifest.images)
    ? manifest.images
    : Array.isArray(manifest.boards)
      ? manifest.boards
      : []

  const boards = records.map((record, index) => {
    const schemaRef = pickRecordPath(record, ['schema_path', 'schema.path', 'schemaPath'])
    const imageRef = pickRecordPath(record, [
      'image_path',
      'image.path',
      'imagePath',
      'preview_path',
      'preview.path'
    ])
    const schemaInfo = resolveManifestFile(schemaRef, uiDir, path.join(uiDir, 'schemas'))
    const imageInfo = resolveManifestFile(imageRef, uiDir, path.join(uiDir, 'images'))
    const imageSize = readImageSize(imageInfo.actualPath)
    const schemaMeta = readSchemaMeta(schemaInfo.actualPath)
    const designWidth = schemaMeta.width || null
    const dpr =
      imageSize?.width && designWidth ? Number((imageSize.width / designWidth).toFixed(2)) : null

    return {
      order: index + 1,
      name: record.name || record.title || record.image_name || record.imageName || '',
      imageId: record.image_id || record.imageId || record.id || '',
      versionId: record.version_id || record.versionId || '',
      versionCount: Array.isArray(record.versions) ? record.versions.length : 0,
      schema: {
        ref: schemaInfo.ref,
        actualPath: schemaInfo.actualPath,
        exists: schemaInfo.exists,
        relocated: schemaInfo.relocated,
        rootWidth: schemaMeta.width || null,
        rootHeight: schemaMeta.height || null,
        parseError: schemaMeta.parseError || ''
      },
      image: {
        ref: imageInfo.ref,
        actualPath: imageInfo.actualPath,
        exists: imageInfo.exists,
        readable: Boolean(imageSize),
        relocated: imageInfo.relocated,
        width: imageSize?.width || null,
        height: imageSize?.height || null,
        type: imageSize?.type || ''
      },
      designWidth,
      dpr,
      errors: Array.isArray(record.errors) ? record.errors.filter(Boolean) : [],
      status: inferUiStatus(record, schemaInfo, imageInfo, imageSize)
    }
  })

  const summary = {
    manifest: manifestPath,
    uiDir,
    source: manifest.source || {},
    exportedAt: manifest.exported_at || manifest.generatedAt || '',
    dryRun: Boolean(manifest.dry_run || manifest.dryRun),
    total: boards.length,
    ok: boards.filter(board => board.status === 'ok').length,
    schemaOnly: boards.filter(board => board.status === 'schema-only').length,
    relocated: boards.filter(board => board.status === 'relocated').length,
    missingFile: boards.filter(board => board.status === 'missing-file').length,
    missingPath: boards.filter(board => board.status === 'missing-path').length,
    imageUnreadable: boards.filter(board => board.status === 'image-unreadable').length,
    errored: boards.filter(board => board.status === 'error').length,
    schemaFound: boards.filter(board => board.schema.exists).length,
    imageFound: boards.filter(board => board.image.exists).length,
    absolutePathRefs: boards.filter(board => board.schema.ref.startsWith('/') || board.image.ref.startsWith('/')).length,
    designWidths: Array.from(new Set(boards.map(board => board.designWidth).filter(Boolean))),
    imageWidths: Array.from(new Set(boards.map(board => board.image.width).filter(Boolean)))
  }

  return {
    summary,
    boards,
    warnings: buildWarnings(summary, boards)
  }
}

function markdownCell(value) {
  const text = value === undefined || value === null || value === '' ? '-' : String(value)
  return text.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
}

function renderIndex(report, dir) {
  const lines = []
  const { summary, boards, warnings } = report
  lines.push('# UI 物料索引')
  lines.push('')
  lines.push('## 摘要')
  lines.push('')
  lines.push(`- Manifest: \`${maybeRelative(dir, summary.manifest)}\``)
  lines.push(`- UI 目录：\`${maybeRelative(dir, summary.uiDir)}\``)
  lines.push(`- 来源分组：${summary.source.group_name || summary.source.group || '-'}`)
  lines.push(`- 导出时间：${summary.exportedAt || '-'}`)
  lines.push(`- dry-run：${summary.dryRun}`)
  lines.push(`- 画板：共 ${summary.total} 个，正常 ${summary.ok} 个，路径重定位 ${summary.relocated} 个，文件缺失 ${summary.missingFile} 个，路径缺失 ${summary.missingPath} 个，图片不可解析 ${summary.imageUnreadable} 个，错误 ${summary.errored} 个`)
  lines.push(`- schema-only 画板：${summary.schemaOnly}`)
  lines.push(`- 可读取 schema 文件：${summary.schemaFound}`)
  lines.push(`- 可读取图片文件：${summary.imageFound}`)
  lines.push(`- 设计宽度：${summary.designWidths.join(', ') || '-'}`)
  lines.push(`- 图片宽度：${summary.imageWidths.join(', ') || '-'}`)
  lines.push('')
  lines.push('## 警告')
  lines.push('')
  if (warnings.length) {
    for (const warning of warnings) lines.push(`- ${warning}`)
  } else {
    lines.push('- 无')
  }
  lines.push('')
  lines.push('## 画板')
  lines.push('')
  lines.push('| # | 画板 | 状态 | 版本 | Schema | 图片 | 尺寸 | 备注 |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const board of boards) {
    const notes = [
      board.schema.relocated || board.image.relocated ? 'manifest 路径已重定位' : '',
      board.status === 'image-unreadable' ? '图片文件存在但无法解析尺寸' : '',
      board.status === 'schema-only' ? '无可用图片基线，按 schema-only 开发' : '',
      board.versionCount > 1 ? `${board.versionCount} 个版本` : '',
      board.schema.parseError ? `schema 解析错误：${board.schema.parseError}` : '',
      board.errors.join('; ')
    ].filter(Boolean).join('; ')
    const size = [
      board.image.width && board.image.height ? `${board.image.width}x${board.image.height}` : '',
      board.designWidth ? `设计宽度 ${board.designWidth}` : '',
      board.dpr ? `DPR ${board.dpr}` : ''
    ].filter(Boolean).join(' / ') || '-'
    lines.push(
      `| ${board.order} | ${markdownCell(board.name)} | ${markdownCell(board.status)} | ${markdownCell(board.versionId || '-')} | ${markdownCell(board.schema.actualPath ? maybeRelative(dir, board.schema.actualPath) : '-')} | ${markdownCell(board.image.actualPath ? maybeRelative(dir, board.image.actualPath) : '-')} | ${markdownCell(size)} | ${markdownCell(notes || '-')} |`
    )
  }
  lines.push('')
  lines.push('## 任务绑定说明')
  lines.push('')
  lines.push('- Gate 2 前必须在任务卡中标明每个 UI 任务使用哪些画板。')
  lines.push('- 备份/复制画板默认视为范围问题；除非 PRD 或用户明确选择，不得直接绑定实现。')
  const schemaDir = path.join(maybeRelative(dir, summary.uiDir), 'schemas')
  lines.push(`- UI 编码必须 Sketch Data first：先读取对应 \`${schemaDir}/*.json\` 原文，并逐节点提取层级、坐标、尺寸、颜色、字体、圆角、阴影、图层和资源，再写实现。`)
  lines.push('- 导出图片只作为可选视觉基线 expected；图片缺失时不得跳过 UI 还原，必须进入 schema-only 模式。')
  lines.push('- 每个 UI 任务必须维护 Schema 到实现映射表：Sketch Data 节点/路径、设计值、代码组件/选择器、实现值和偏差说明。')
  lines.push('')
  return `${lines.join('\n')}\n`
}

function updateHarnessState(dir, report) {
  const statePath = path.join(dir, 'harness.state.json')
  const state = readJson(statePath)
  if (!state) return
  writeJson(statePath, {
    ...state,
    uiInspection: {
      total: report.summary.total,
      ok: report.summary.ok,
      relocated: report.summary.relocated,
      missingFile: report.summary.missingFile,
      missingPath: report.summary.missingPath,
      schemaOnly: report.summary.schemaOnly,
      imageUnreadable: report.summary.imageUnreadable,
      errored: report.summary.errored,
      schemaFound: report.summary.schemaFound,
      imageFound: report.summary.imageFound,
      designWidths: report.summary.designWidths,
      imageWidths: report.summary.imageWidths,
      warnings: report.warnings,
      indexPath: report.summary.indexPath || null,
      inspectedAt: new Date().toISOString()
    },
    updatedAt: new Date().toISOString()
  })
}

function main() {
  const { requirementDir, flags } = parseArgs(process.argv)
  if (!requirementDir) usage()
  const dir = path.resolve(process.cwd(), requirementDir)

  try {
    const report = buildInspection(dir, flags)
    if (parseBoolean(flags['write-index'], false)) {
      const specsDir = path.join(dir, 'specs')
      ensureDir(specsDir)
      const indexPath = path.join(specsDir, 'ui-material-index.md')
      fs.writeFileSync(indexPath, renderIndex(report, dir))
      report.summary.indexPath = indexPath
    }

    updateHarnessState(dir, report)

    if (flags.json) {
      console.log(JSON.stringify(report, null, 2))
      return
    }

    const { summary, warnings } = report
    console.log(`UI manifest: ${summary.manifest}`)
    console.log(`Boards: ${summary.total} total, ${summary.ok} ok, ${summary.schemaOnly} schema-only, ${summary.relocated} relocated, ${summary.missingFile} missing file, ${summary.missingPath} missing path, ${summary.imageUnreadable} image unreadable, ${summary.errored} errored`)
    console.log(`Schema files found: ${summary.schemaFound}`)
    console.log(`Image files found: ${summary.imageFound}`)
    console.log(`Design widths: ${summary.designWidths.join(', ') || '-'}`)
    console.log(`Image widths: ${summary.imageWidths.join(', ') || '-'}`)
    if (summary.indexPath) console.log(`Wrote ${summary.indexPath}`)
    if (warnings.length) {
      console.log('Warnings:')
      for (const warning of warnings) console.log(`  - ${warning}`)
    }
  } catch (error) {
    console.error(error.message)
    process.exit(error.exitCode || 1)
  }
}

main()
