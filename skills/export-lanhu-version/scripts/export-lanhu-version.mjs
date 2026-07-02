#!/usr/bin/env node

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const API_ORIGIN = 'https://lanhuapp.com'
const API_BASE = `${API_ORIGIN}/api`
const DDS_BASE = 'https://dds.lanhuapp.com/api'
const DEFAULT_COOKIE_FILES = [
  path.join(os.homedir(), '.codex/lanhu-cookie.txt'),
  path.join(os.homedir(), '.codex/skills/lanhu-to-page/assets/cookie.txt')
]

function usage() {
  return `Usage:
  node export-lanhu-version.mjs --url <lanhu-stage-url> --group <group-name> --out <output-dir> [--cookie-file <path>]

Options:
  --url                         Lanhu project stage URL with tid and pid.
  --group                       Exact Lanhu sector/group name to export.
  --out                         Output directory.
  --cookie-file                 File containing a Lanhu Cookie header value.
  --dry-run                     Build manifest only; skip schema and image downloads.
  --with-images                 Also download images and write image_url/image_path in manifest.
  --no-images                   Deprecated compatibility flag; images are skipped by default.
  --no-schema                   Skip schema downloads.
  --allow-fuzzy-group           Allow unique keyword match when exact group matching fails.
  --absolute-paths              Write absolute schema/image paths in manifest instead of relative paths.
  --include-all-if-group-empty  Allow whole-project export when group image lookup is empty.
  --help                        Show this message.
`
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const key = arg.slice(2)
    if (
      [
        'dry-run',
        'with-images',
        'no-images',
        'no-schema',
        'allow-fuzzy-group',
        'absolute-paths',
        'include-all-if-group-empty',
        'help'
      ].includes(key)
    ) {
      args[key] = true
      continue
    }

    const value = argv[i + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`)
    }
    args[key] = value
    i += 1
  }
  return args
}

function parseLanhuStageUrl(input) {
  const url = new URL(input)
  const hashQueryIndex = url.hash.indexOf('?')
  const hashParams = hashQueryIndex >= 0 ? new URLSearchParams(url.hash.slice(hashQueryIndex + 1)) : null
  const searchParams = url.searchParams
  const tid = searchParams.get('tid') || hashParams?.get('tid') || searchParams.get('team_id')
  const pid =
    searchParams.get('pid') ||
    hashParams?.get('pid') ||
    searchParams.get('project_id') ||
    hashParams?.get('project_id')

  if (!tid || !pid) {
    throw new Error('Lanhu URL must include tid and pid/project_id.')
  }

  return { tid, pid }
}

async function readCookie(args) {
  if (process.env.LANHU_COOKIE) {
    return pickCookieHeader(process.env.LANHU_COOKIE, 'LANHU_COOKIE')
  }

  const cookieFile = args['cookie-file'] || DEFAULT_COOKIE_FILES.find(file => existsSync(file))
  if (!cookieFile) {
    throw new Error(
      `Lanhu Cookie is required. Set LANHU_COOKIE or pass --cookie-file. Checked: ${DEFAULT_COOKIE_FILES.join(', ')}`
    )
  }

  const cookieText = await fs.readFile(cookieFile, 'utf8')
  if (!cookieText.trim()) {
    throw new Error(`Lanhu Cookie file is empty: ${cookieFile}`)
  }
  return pickCookieHeader(cookieText, cookieFile)
}

function normalizeCookieCandidate(value) {
  return value.trim().replace(/^cookie\s*:\s*/i, '').trim()
}

function isHeaderByteString(value) {
  return [...value].every(char => {
    const code = char.charCodeAt(0)
    return code === 9 || (code >= 32 && code <= 255)
  })
}

function looksLikeCookieHeader(value) {
  return value.includes('=') && /(^|;\s*)[^=;\s]+=[^;]*/.test(value)
}

function pickCookieHeader(raw, source) {
  const direct = normalizeCookieCandidate(String(raw || ''))
  if (direct && looksLikeCookieHeader(direct) && isHeaderByteString(direct)) {
    return direct
  }

  const candidates = String(raw || '')
    .split(/\r?\n/)
    .map(normalizeCookieCandidate)
    .filter(line => line && looksLikeCookieHeader(line) && isHeaderByteString(line))

  if (candidates.length) {
    return candidates.sort((a, b) => b.length - a.length)[0]
  }

  throw new Error(
    `Lanhu Cookie is missing or not a valid HTTP header value in ${source}. ` +
      'Put a raw Cookie header line in the file or set LANHU_COOKIE.'
  )
}

function makeHeaders(cookie, url) {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    Referer: `${API_ORIGIN}/web/`,
    'User-Agent': 'Mozilla/5.0 Codex Lanhu Exporter'
  }

  if (cookie && new URL(url).hostname.endsWith('lanhuapp.com')) {
    headers.Cookie = cookie
  }

  return headers
}

async function fetchText(url, { cookie, method = 'GET', body } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(url, {
      method,
      headers: makeHeaders(cookie, url),
      body,
      signal: controller.signal
    })
    const text = await res.text()
    if (!res.ok) {
      const excerpt = text.replace(/\s+/g, ' ').slice(0, 240)
      throw new Error(`HTTP ${res.status} for ${url}: ${excerpt}`)
    }
    return { text, contentType: res.headers.get('content-type') || '' }
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchBuffer(url, { cookie } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(url, {
      headers: makeHeaders(cookie, url),
      signal: controller.signal
    })
    const arrayBuffer = await res.arrayBuffer()
    if (!res.ok) {
      const excerpt = Buffer.from(arrayBuffer).toString('utf8').replace(/\s+/g, ' ').slice(0, 240)
      throw new Error(`HTTP ${res.status} for ${url}: ${excerpt}`)
    }
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: res.headers.get('content-type') || ''
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchJson(url, options = {}) {
  const { text } = await fetchText(url, options)
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error(`Empty response from ${url}`)
  }
  if (trimmed.startsWith('<')) {
    throw new Error(`Lanhu returned HTML instead of JSON for ${url}; refresh the Cookie.`)
  }

  let json
  try {
    json = JSON.parse(trimmed)
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${trimmed.slice(0, 240)}`)
  }

  if (typeof json === 'string') {
    throw new Error(`${json} (${url})`)
  }

  const code = json?.code || json?.status_code
  if (code && !['00000', '0', 0, 200, '200'].includes(code)) {
    const message = json.message || json.msg || json.error || 'Lanhu API error'
    throw new Error(`${message} (${code}) for ${url}`)
  }

  return json
}

function unwrapPayload(json) {
  if (!json || typeof json !== 'object') return json
  if (json.result && typeof json.result === 'object') return json.result
  if (json.data?.result && typeof json.data.result === 'object') return json.data.result
  if (json.data && typeof json.data === 'object') return json.data
  return json
}

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function compactName(value) {
  return normalizeName(value).replace(/\s+/g, '').toLowerCase()
}

function getObjectName(obj) {
  return normalizeName(obj?.name || obj?.title || obj?.sector_name || obj?.group_name || obj?.image_name)
}

function getObjectId(obj) {
  return obj?.id || obj?.sector_id || obj?.group_id || obj?.image_id || obj?.imageId
}

function getChildren(obj) {
  return [
    ...asArray(obj?.children),
    ...asArray(obj?.child),
    ...asArray(obj?.sectors),
    ...asArray(obj?.sector_list),
    ...asArray(obj?.groups),
    ...asArray(obj?.group_list),
    ...asArray(obj?.list),
    ...asArray(obj?.items),
    ...asArray(obj?.rows)
  ].filter(Boolean)
}

function collectGroupNames(root) {
  const names = []
  const stack = asArray(root)
  while (stack.length) {
    const node = stack.shift()
    if (!node || typeof node !== 'object') continue
    const name = getObjectName(node)
    if (name) names.push(name)
    stack.push(...getChildren(node))
  }
  return names
}

function collectNamedGroups(root) {
  const groups = []
  const stack = asArray(root)
  while (stack.length) {
    const node = stack.shift()
    if (!node || typeof node !== 'object') continue
    const name = getObjectName(node)
    if (name) groups.push({ name, node })
    stack.push(...getChildren(node))
  }
  return groups
}

function nameTokens(value) {
  return normalizeName(value)
    .split(/[^\p{L}\p{N}.]+/u)
    .map(token => token.trim())
    .filter(Boolean)
}

function scoreGroupName(candidate, queryTokens) {
  const compactCandidate = compactName(candidate)
  return queryTokens.reduce((score, token) => {
    const compactToken = compactName(token)
    if (!compactToken) return score
    if (compactCandidate.includes(compactToken)) return score + compactToken.length
    return score
  }, 0)
}

function findGroup(root, groupName, { allowFuzzy = false } = {}) {
  const exact = normalizeName(groupName)
  const compact = compactName(groupName)
  const namedGroups = collectNamedGroups(root)
  for (const { name, node } of namedGroups) {
    if (name === exact || compactName(name) === compact) {
      return {
        node,
        matchedName: name,
        matchType: 'exact',
        suggestions: []
      }
    }
  }

  const tokens = nameTokens(groupName)
  const scored = namedGroups
    .map(item => ({
      ...item,
      score: scoreGroupName(item.name, tokens)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-Hans-CN'))

  const bestScore = scored[0]?.score || 0
  const bestMatches = scored.filter(item => item.score === bestScore)
  if (allowFuzzy && bestMatches.length === 1) {
    return {
      node: bestMatches[0].node,
      matchedName: bestMatches[0].name,
      matchType: 'fuzzy',
      suggestions: scored.slice(0, 10).map(item => item.name)
    }
  }

  return {
    node: null,
    matchedName: '',
    matchType: 'none',
    suggestions: scored.slice(0, 10).map(item => item.name)
  }
}

function pickExpectedCount(group) {
  const keys = ['count', 'image_count', 'imageCount', 'item_count', 'itemCount', 'cnt', 'total']
  for (const key of keys) {
    const value = Number(group?.[key])
    if (Number.isFinite(value) && value > 0) return value
  }
  return null
}

function inferImageId(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.image_id || value.imageId || value.img_id || value.imgId || value.id || ''
}

function inferImageName(value) {
  if (!value || typeof value !== 'object') return ''
  return normalizeName(value.name || value.title || value.image_name || value.imageName || value.file_name)
}

function addImageRef(map, value, source = 'group') {
  const id = inferImageId(value)
  if (!id) return
  if (!map.has(id)) {
    map.set(id, {
      image_id: id,
      name: inferImageName(value),
      source
    })
  }
}

function collectImageRefsFromGroup(group) {
  const refs = new Map()
  const imageFieldPattern = /(image|img|item)/i

  function visit(node) {
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value) && imageFieldPattern.test(key)) {
        value.forEach(item => addImageRef(refs, item, `group.${key}`))
      } else if (value && typeof value === 'object' && imageFieldPattern.test(key)) {
        addImageRef(refs, value, `group.${key}`)
      }
    }

    for (const child of getChildren(node)) {
      visit(child)
    }
  }

  visit(group)
  return [...refs.values()]
}

function buildQuery(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value)
    }
  }
  return search.toString()
}

function collectImageObjects(payload) {
  const candidates = []

  function visit(node, keyPath = '') {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      const imageLike = node.filter(
        item => item && typeof item === 'object' && inferImageId(item) && !getChildren(item).length
      )
      if (imageLike.length) candidates.push({ keyPath, items: imageLike })
      node.forEach((item, index) => visit(item, `${keyPath}.${index}`))
      return
    }

    for (const [key, value] of Object.entries(node)) {
      visit(value, keyPath ? `${keyPath}.${key}` : key)
    }
  }

  visit(payload)
  candidates.sort((a, b) => b.items.length - a.items.length)
  return candidates[0]?.items || []
}

async function fetchGroupImages({ cookie, tid, pid, group, includeAllIfGroupEmpty }) {
  const groupId = getObjectId(group)
  const expectedCount = pickExpectedCount(group)
  const candidates = [
    { team_id: tid, project_id: pid, sector_id: groupId },
    { team_id: tid, project_id: pid, sector_ids: groupId },
    { team_id: tid, project_id: pid, group_id: groupId },
    { team_id: tid, project_id: pid, parent_id: groupId }
  ]

  if (includeAllIfGroupEmpty) {
    candidates.push({ team_id: tid, project_id: pid })
  }

  for (const params of candidates) {
    const url = `${API_BASE}/project/image?${buildQuery(params)}`
    try {
      const payload = unwrapPayload(await fetchJson(url, { cookie }))
      const items = collectImageObjects(payload)
      if (!items.length) continue
      if (
        expectedCount &&
        !includeAllIfGroupEmpty &&
        items.length > Math.max(expectedCount * 3, expectedCount + 20)
      ) {
        continue
      }
      return items.map(item => ({
        image_id: inferImageId(item),
        name: inferImageName(item),
        source: `project/image?${buildQuery(params)}`
      }))
    } catch (error) {
      // Try the next shape; Lanhu has changed these filters before.
    }
  }

  return []
}

function findFirstByKeys(obj, keys) {
  const seen = new Set()
  const stack = [obj]
  while (stack.length) {
    const node = stack.shift()
    if (!node || typeof node !== 'object' || seen.has(node)) continue
    seen.add(node)

    for (const key of keys) {
      const value = node[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number') return String(value)
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') stack.push(value)
    }
  }
  return ''
}

function collectUrls(obj) {
  const urls = []
  const seen = new Set()
  const stack = [obj]
  const imageHostPattern = /(lanhu|lhcdn|assets|alipic|oss-cn|SketchCover)/i
  const imageExtPattern = /\.(png|jpe?g|webp|gif|svg)(\?|$)/i

  while (stack.length) {
    const node = stack.shift()
    if (!node || typeof node !== 'object' || seen.has(node)) continue
    seen.add(node)

    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        const trimmed = value.trim()
        const keyLooksUseful = /(url|src|cover|image|img|preview|origin|thumbnail)/i.test(key)
        const valueLooksUseful = /^https?:\/\//.test(trimmed) || /^\/\w/.test(trimmed)
        const imageLooksUseful = imageExtPattern.test(trimmed) || imageHostPattern.test(trimmed)
        if (keyLooksUseful && valueLooksUseful && imageLooksUseful && !trimmed.startsWith('data:')) {
          urls.push(trimmed)
        }
      } else if (value && typeof value === 'object') {
        stack.push(value)
      }
    }
  }

  return urls
}

function normalizeUrl(url) {
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`
  return url
}

function extractImageUrl(detail) {
  const direct = findFirstByKeys(detail, [
    'origin_url',
    'originUrl',
    'original_url',
    'originalUrl',
    'image_url',
    'imageUrl',
    'preview_url',
    'previewUrl',
    'cover_url',
    'coverUrl',
    'url',
    'src'
  ])
  const directUrl = normalizeUrl(direct)
  if (directUrl) return directUrl

  return normalizeUrl(collectUrls(detail)[0] || '')
}

function extractVersionId(detail) {
  const direct = findFirstByKeys(detail, [
    'version_id',
    'versionId',
    'current_version_id',
    'currentVersionId',
    'latest_version_id',
    'latestVersionId',
    'selected_version_id',
    'selectedVersionId'
  ])
  if (direct) return direct

  const versionLike = [
    detail?.current_version,
    detail?.currentVersion,
    detail?.latest_version,
    detail?.latestVersion,
    detail?.version,
    detail?.versions?.[0],
    detail?.image_versions?.[0],
    detail?.imageVersions?.[0]
  ].filter(Boolean)

  for (const item of versionLike) {
    const id = item.version_id || item.versionId || item.id
    if (id) return String(id)
  }
  return ''
}

function extractVersions(detail) {
  const arrays = [
    detail?.versions,
    detail?.image_versions,
    detail?.imageVersions,
    detail?.history_versions,
    detail?.historyVersions
  ].filter(Array.isArray)

  const versions = arrays[0] || []
  return versions.slice(0, 20).map(item => ({
    id: item.id || item.version_id || item.versionId || '',
    name: item.name || item.title || item.version_name || item.versionName || '',
    created_at: item.created_at || item.create_time || item.updated_at || item.update_time || ''
  }))
}

function safeFilename(input, fallback) {
  const name = normalizeName(input || fallback)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return name || fallback
}

function extensionFromContentType(contentType, fallbackUrl) {
  if (/png/i.test(contentType)) return '.png'
  if (/jpe?g/i.test(contentType)) return '.jpg'
  if (/webp/i.test(contentType)) return '.webp'
  if (/svg/i.test(contentType)) return '.svg'
  const match = new URL(fallbackUrl).pathname.match(/\.(png|jpe?g|webp|gif|svg)$/i)
  return match ? `.${match[1].toLowerCase().replace('jpeg', 'jpg')}` : '.png'
}

async function downloadBinary(url, outputBase, cookie) {
  const normalized = normalizeUrl(url)
  const { buffer, contentType } = await fetchBuffer(normalized, { cookie })
  const extension = extensionFromContentType(contentType, normalized)
  const outputPath = outputBase.endsWith(extension) ? outputBase : `${outputBase}${extension}`
  await fs.writeFile(outputPath, buffer)
  return outputPath
}

async function downloadJson(url, outputPath, cookie) {
  const payload = await fetchJson(normalizeUrl(url), { cookie })
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return outputPath
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

function toManifestPath(filePath, outDir, absolutePaths) {
  if (!filePath) return ''
  if (absolutePaths) return filePath
  return path.relative(outDir, filePath).split(path.sep).join('/')
}

async function fetchImageDetail({ cookie, tid, pid, imageId }) {
  const query = buildQuery({ image_id: imageId, team_id: tid, project_id: pid })
  const url = `${API_BASE}/project/image?${query}`
  return unwrapPayload(await fetchJson(url, { cookie }))
}

async function fetchSchemaInfo({ cookie, versionId }) {
  const url = `${DDS_BASE}/dds/image/store_schema_revise?${buildQuery({ version_id: versionId })}`
  return unwrapPayload(await fetchJson(url, { cookie }))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  for (const key of ['url', 'group', 'out']) {
    if (!args[key]) {
      throw new Error(`Missing required --${key}.\n${usage()}`)
    }
  }

  if (typeof fetch !== 'function') {
    throw new Error('This script requires Node.js 18+ with global fetch.')
  }

  const { tid, pid } = parseLanhuStageUrl(args.url)
  const cookie = await readCookie(args)
  const outDir = path.resolve(args.out)
  const schemasDir = path.join(outDir, 'schemas')
  const imagesDir = path.join(outDir, 'images')
  const withImages = Boolean(args['with-images']) && !args['no-images']
  await ensureDir(outDir)
  if (!args['dry-run'] && !args['no-schema']) await ensureDir(schemasDir)
  if (!args['dry-run'] && withImages) await ensureDir(imagesDir)

  const sectorsUrl = `${API_BASE}/project/project_sectors?${buildQuery({ project_id: pid })}`
  const sectors = unwrapPayload(await fetchJson(sectorsUrl, { cookie }))
  const groupMatch = findGroup(sectors, args.group, {
    allowFuzzy: Boolean(args['allow-fuzzy-group'])
  })
  const group = groupMatch.node
  if (!group) {
    const names = collectGroupNames(sectors).slice(0, 50)
    const suggestions = groupMatch.suggestions.length
      ? `\nPossible groups:\n- ${groupMatch.suggestions.join('\n- ')}`
      : ''
    throw new Error(
      `Group not found: ${args.group}${suggestions}\nAvailable groups:\n- ${names.join('\n- ')}`
    )
  }

  if (groupMatch.matchType === 'fuzzy') {
    console.error(`Using fuzzy group match: "${args.group}" -> "${groupMatch.matchedName}"`)
  }

  let imageRefs = collectImageRefsFromGroup(group)
  if (!imageRefs.length) {
    imageRefs = await fetchGroupImages({
      cookie,
      tid,
      pid,
      group,
      includeAllIfGroupEmpty: Boolean(args['include-all-if-group-empty'])
    })
  }

  const dedupedRefs = [...new Map(imageRefs.map(item => [item.image_id, item])).values()]
  if (!dedupedRefs.length) {
    throw new Error(
      `No images found under group "${args.group}". Re-check Lanhu fields or use --include-all-if-group-empty deliberately.`
    )
  }

  const manifest = {
    source: {
      url: args.url,
      team_id: tid,
      project_id: pid,
      group_name: groupMatch.matchedName || args.group,
      requested_group_name: args.group,
      group_match_type: groupMatch.matchType,
      group_id: getObjectId(group) || '',
      expected_count: pickExpectedCount(group)
    },
    exported_at: new Date().toISOString(),
    dry_run: Boolean(args['dry-run']),
    images: []
  }

  for (let index = 0; index < dedupedRefs.length; index += 1) {
    const ref = dedupedRefs[index]
    const ordinal = String(index + 1).padStart(2, '0')
    const record = {
      image_id: ref.image_id,
      name: ref.name || '',
      source: ref.source,
      version_id: '',
      versions: [],
      schema_url: '',
      schema_path: '',
      errors: []
    }
    if (withImages) {
      record.image_url = ''
      record.image_path = ''
    }

    try {
      const detail = await fetchImageDetail({ cookie, tid, pid, imageId: ref.image_id })
      record.name = record.name || findFirstByKeys(detail, ['name', 'title', 'image_name', 'imageName'])
      record.version_id = extractVersionId(detail)
      record.versions = extractVersions(detail)
      if (withImages) {
        record.image_url = extractImageUrl(detail)
      }

      const baseName = `${ordinal}-${safeFilename(record.name, record.image_id)}`

      if (!args['dry-run'] && !args['no-schema']) {
        if (!record.version_id) {
          record.errors.push('Missing version_id; schema download skipped.')
        } else {
          const schemaInfo = await fetchSchemaInfo({ cookie, versionId: record.version_id })
          record.schema_url = schemaInfo.data_resource_url || schemaInfo.resource_url || schemaInfo.url || ''
          if (!record.schema_url) {
            record.errors.push('Missing data_resource_url from store_schema_revise.')
          } else {
            const schemaPath = await downloadJson(
              record.schema_url,
              path.join(schemasDir, `${baseName}.json`),
              cookie
            )
            record.schema_path = toManifestPath(schemaPath, outDir, Boolean(args['absolute-paths']))
          }
        }
      }

      if (!args['dry-run'] && withImages) {
        if (!record.image_url) {
          record.errors.push('Missing downloadable image URL; image download skipped.')
        } else {
          const imagePath = await downloadBinary(
            record.image_url,
            path.join(imagesDir, baseName),
            cookie
          )
          record.image_path = toManifestPath(imagePath, outDir, Boolean(args['absolute-paths']))
        }
      }
    } catch (error) {
      record.errors.push(error.message)
    }

    manifest.images.push(record)
  }

  const manifestPath = path.join(outDir, 'manifest.json')
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  const failed = manifest.images.filter(item => item.errors.length)
  console.log(
    JSON.stringify(
      {
        manifest: manifestPath,
        total: manifest.images.length,
        failed: failed.length,
        schemaDownloaded: manifest.images.filter(item => item.schema_path).length,
        imagesRequested: withImages,
        imageDownloaded: manifest.images.filter(item => item.image_path).length
      },
      null,
      2
    )
  )
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
