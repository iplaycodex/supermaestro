#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  main,
  makeHeaders,
  normalizeUrl,
  parseLanhuStageUrl,
  trustedLanhuUrl
} from './lanhu-export.mjs'

function response(body, status = 200, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  )
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        return normalizedHeaders[String(name).toLowerCase()] || null
      }
    },
    async text() {
      return text
    },
    async arrayBuffer() {
      return Buffer.from(text)
    }
  }
}

function exporterArgs(outDir, extra = []) {
  return [
    '--url',
    'https://lanhuapp.com/web/#/item/project/stage?tid=team-1&pid=project-1',
    '--group',
    '目标分组',
    '--out',
    outDir,
    '--dry-run',
    ...extra
  ]
}

test('Cookie 只会发往受信任的 HTTPS 蓝湖域名', () => {
  assert.equal(makeHeaders('sid=secret', 'https://lanhuapp.com/api').Cookie, 'sid=secret')
  assert.equal(makeHeaders('sid=secret', 'https://dds.lanhuapp.com/api').Cookie, 'sid=secret')

  assert.throws(
    () => makeHeaders('sid=secret', 'http://lanhuapp.com/api'),
    /must use HTTPS/
  )
  assert.throws(
    () => makeHeaders('sid=secret', 'https://evil-lanhuapp.com/api'),
    /dot-delimited subdomain/
  )
  assert.throws(
    () => makeHeaders('sid=secret', 'https://notlanhuapp.com/api'),
    /dot-delimited subdomain/
  )
  assert.throws(
    () => makeHeaders('sid=secret', 'https://lanhuapp.com.evil.example/api'),
    /dot-delimited subdomain/
  )
})

test('stage 和资源 URL 拒绝 HTTP、恶意后缀与跨域来源', () => {
  assert.equal(
    normalizeUrl('//dds.lanhuapp.com/api/schema'),
    'https://dds.lanhuapp.com/api/schema'
  )
  assert.equal(
    trustedLanhuUrl('https://assets.lanhuapp.com/image.png').hostname,
    'assets.lanhuapp.com'
  )
  assert.throws(() => normalizeUrl('http://dds.lanhuapp.com/schema'), /must use HTTPS/)
  assert.throws(() => normalizeUrl('https://cdn.example.com/schema'), /dot-delimited subdomain/)
  assert.throws(
    () => parseLanhuStageUrl('https://evil-lanhuapp.com/web/?tid=t&pid=p'),
    /dot-delimited subdomain/
  )
})

test('CLI 拒绝未知、重复、缺值 option 和额外 positional', async () => {
  await assert.rejects(
    main(['--allow-partal', 'true']),
    /Unknown option: --allow-partal/
  )
  await assert.rejects(
    main(['--dry-run', '--dry-run']),
    /Duplicate option: --dry-run/
  )
  await assert.rejects(
    main(['--url']),
    /Missing value for --url/
  )
  await assert.rejects(
    main(['unexpected']),
    /Unexpected argument: unexpected/
  )
})

test('画板失败默认返回失败，--allow-partial 才允许成功', async () => {
  const originalFetch = globalThis.fetch
  const originalCookie = process.env.LANHU_COOKIE
  const originalLog = console.log
  const output = []
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lanhu-security-'))

  process.env.LANHU_COOKIE = 'sid=test'
  console.log = value => output.push(String(value))
  globalThis.fetch = async url => {
    if (String(url).includes('/project/project_sectors?')) {
      return response({
        code: '00000',
        data: {
          sectors: [
            {
              id: 'group-1',
              name: '目标分组',
              images: [{ image_id: 'board-1', name: '测试画板' }]
            }
          ]
        }
      })
    }
    return response({ message: 'board detail failed' }, 500)
  }

  try {
    const defaultOut = path.join(root, 'default')
    await assert.rejects(
      main(exporterArgs(defaultOut)),
      error => error.exitCode === 2 && /1 of 1 board/.test(error.message)
    )
    const defaultManifest = JSON.parse(
      fs.readFileSync(path.join(defaultOut, 'manifest.json'), 'utf8')
    )
    assert.equal(defaultManifest.images.length, 1)
    assert.equal(defaultManifest.images[0].errors.length, 1)
    assert.equal(defaultManifest.source.url, undefined)
    assert.doesNotMatch(JSON.stringify(defaultManifest), /stage\?tid=/)

    const partialOut = path.join(root, 'partial')
    const summary = await main(exporterArgs(partialOut, ['--allow-partial']))
    assert.equal(summary.failed, 1)
    assert.equal(summary.partialAllowed, true)
  } finally {
    globalThis.fetch = originalFetch
    console.log = originalLog
    if (originalCookie === undefined) {
      delete process.env.LANHU_COOKIE
    } else {
      process.env.LANHU_COOKIE = originalCookie
    }
  }
})

test('manifest 不落盘 stage 或带签名参数的资源 URL', async () => {
  const originalFetch = globalThis.fetch
  const originalCookie = process.env.LANHU_COOKIE
  const originalLog = console.log
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lanhu-manifest-redaction-'))

  process.env.LANHU_COOKIE = 'sid=test'
  console.log = () => {}
  globalThis.fetch = async url => {
    const value = String(url)
    if (value.includes('/project/project_sectors?')) {
      return response({
        data: {
          sectors: [{
            id: 'group-1',
            name: '目标分组',
            images: [{ image_id: 'board-1', name: '测试画板' }]
          }]
        }
      })
    }
    if (value.includes('/project/image?')) {
      return response({
        data: {
          name: '测试画板',
          version_id: 'version-1',
          image_url: 'https://assets.lanhuapp.com/board.png?token=image-secret'
        }
      })
    }
    if (value.includes('/store_schema_revise?')) {
      return response({
        data: {
          data_resource_url: 'https://assets.lanhuapp.com/schema.json?token=schema-secret'
        }
      })
    }
    if (value.includes('/schema.json?')) {
      return response({ layers: [] })
    }
    if (value.includes('/board.png?')) {
      return response('png-bytes', 200, { 'content-type': 'image/png' })
    }
    return response({ message: 'unexpected URL' }, 500)
  }

  try {
    const out = path.join(root, 'export')
    await main([
      '--url',
      'https://lanhuapp.com/web/#/item/project/stage?tid=team-1&pid=project-1',
      '--group',
      '目标分组',
      '--out',
      out,
      '--with-images'
    ])
    const manifestText = fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')
    const manifest = JSON.parse(manifestText)
    assert.doesNotMatch(manifestText, /image-secret|schema-secret|stage\?tid=/)
    assert.equal(manifest.images[0].schema_url, undefined)
    assert.equal(manifest.images[0].image_url, undefined)
    assert.match(manifest.images[0].schema_path, /^schemas\//)
    assert.match(manifest.images[0].image_path, /^images\//)
  } finally {
    globalThis.fetch = originalFetch
    console.log = originalLog
    if (originalCookie === undefined) {
      delete process.env.LANHU_COOKIE
    } else {
      process.env.LANHU_COOKIE = originalCookie
    }
  }
})

test('带签名资源下载失败时，错误与 manifest 仍不泄露查询参数', async () => {
  const originalFetch = globalThis.fetch
  const originalCookie = process.env.LANHU_COOKIE
  const originalLog = console.log
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lanhu-error-redaction-'))

  process.env.LANHU_COOKIE = 'sid=test'
  console.log = () => {}
  globalThis.fetch = async url => {
    const value = String(url)
    if (value.includes('/project/project_sectors?')) {
      return response({
        data: {
          sectors: [{
            id: 'group-1',
            name: '目标分组',
            images: [{ image_id: 'board-1', name: '测试画板' }]
          }]
        }
      })
    }
    if (value.includes('/project/image?')) {
      return response({
        data: {
          name: '测试画板',
          version_id: 'version-1',
          image_url: 'https://assets.lanhuapp.com/board.png?token=image-failure-secret'
        }
      })
    }
    if (value.includes('/store_schema_revise?')) {
      return response({
        data: {
          data_resource_url:
            'https://assets.lanhuapp.com/schema.json?token=schema-failure-secret'
        }
      })
    }
    if (value.includes('/schema.json?')) {
      return response({ message: 'signed resource failed' }, 500)
    }
    return response({ message: 'unexpected URL' }, 500)
  }

  try {
    const out = path.join(root, 'export')
    await assert.rejects(
      main([
        '--url',
        'https://lanhuapp.com/web/#/item/project/stage?tid=team-secret&pid=project-secret',
        '--group',
        '目标分组',
        '--out',
        out
      ]),
      error => {
        assert.equal(error.exitCode, 2)
        assert.doesNotMatch(
          error.message,
          /schema-failure-secret|image-failure-secret|team-secret|project-secret/
        )
        return true
      }
    )
    const manifestText = fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')
    const manifest = JSON.parse(manifestText)
    assert.doesNotMatch(
      manifestText,
      /schema-failure-secret|image-failure-secret|stage\?tid=/
    )
    assert.match(manifest.images[0].errors[0], /HTTP 500/)
    assert.match(manifest.images[0].errors[0], /https:\/\/assets\.lanhuapp\.com\/schema\.json/)
    assert.doesNotMatch(manifest.images[0].errors[0], /\?/)
  } finally {
    globalThis.fetch = originalFetch
    console.log = originalLog
    if (originalCookie === undefined) {
      delete process.env.LANHU_COOKIE
    } else {
      process.env.LANHU_COOKIE = originalCookie
    }
  }
})
