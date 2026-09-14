import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { main } from './lanhu-export.mjs'

function response(value, status = 200) {
  const text = JSON.stringify(value)
  return { ok: status < 400, status, headers: { get: () => 'application/json' }, text: async () => text, arrayBuffer: async () => Buffer.from(text) }
}

function setup(t) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lanhu-resume-'))
  const originalFetch = globalThis.fetch
  const originalCookie = process.env.LANHU_COOKIE
  const originalLog = console.log
  process.env.LANHU_COOKIE = 'sid=fixture'
  console.log = () => {}
  t.after(() => {
    globalThis.fetch = originalFetch
    console.log = originalLog
    if (originalCookie === undefined) delete process.env.LANHU_COOKIE
    else process.env.LANHU_COOKIE = originalCookie
  })
  const args = ['--url', 'https://lanhuapp.com/web/?tid=t&pid=p', '--group', 'G', '--out', out]
  const controls = { version: 'v1', failed: '', delay: 0, attempts: {}, downloads: [], active: 0, maximum: 0 }
  globalThis.fetch = async url => {
    const value = new URL(url)
    const id = value.searchParams.get('image_id')
    controls.active++
    controls.maximum = Math.max(controls.maximum, controls.active)
    try {
      if (controls.delay) await new Promise(resolve => setTimeout(resolve, controls.delay))
      if (value.pathname.includes('project_sectors')) return response({ data: { sectors: [{ id: 'g', name: 'G', images: [{ image_id: 'a', name: 'A' }, { image_id: 'b', name: 'B' }] }] } })
      if (value.pathname.endsWith('/image')) {
        if (id === 'b' && controls.inspectCheckpoint) controls.inspectCheckpoint()
        if (id === controls.failed) return response({}, 401)
        return response({ data: { version_id: `${id}-${controls.version}`, image_url: `https://assets.lanhuapp.com/${id}.png` } })
      }
      if (value.pathname.endsWith('store_schema_revise')) return response({ data: { data_resource_url: `https://assets.lanhuapp.com/${value.searchParams.get('version_id')}.json?token=private` } })
      controls.attempts[value.pathname] = (controls.attempts[value.pathname] || 0) + 1
      if (controls.transient && controls.attempts[value.pathname] === 1) return response({}, 503)
      controls.downloads.push(value.pathname)
      return response({ layers: [], resource: value.pathname })
    } finally { controls.active-- }
  }
  const read = () => JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'))
  return { out, args, controls, read }
}

test('逐画板保存进度；续传只下载失败、缺失、变化或损坏的产物', async t => {
  const f = setup(t)
  f.controls.failed = 'b'
  f.controls.inspectCheckpoint = () => {
    const manifest = f.read()
    assert.equal(manifest.complete, false)
    assert.equal(manifest.images[0].status, 'completed')
    assert.equal(manifest.images[1].status, 'pending')
  }
  await assert.rejects(main(f.args), error => error.exitCode === 2)
  assert.deepEqual(f.controls.downloads, ['/a-v1.json'])
  delete f.controls.inspectCheckpoint
  f.controls.failed = ''
  f.controls.downloads = []
  await main([...f.args, '--resume'])
  assert.deepEqual(f.controls.downloads, ['/b-v1.json'])
  assert.equal(f.read().complete, true)
  f.controls.downloads = []
  await main([...f.args, '--resume'])
  assert.deepEqual(f.controls.downloads, [])
  fs.writeFileSync(path.join(f.out, f.read().images[0].schema_path), '{}')
  await main([...f.args, '--resume'])
  assert.deepEqual(f.controls.downloads, ['/a-v1.json'])
  f.controls.version = 'v2'
  f.controls.downloads = []
  await main([...f.args, '--resume'])
  assert.deepEqual(f.controls.downloads, ['/a-v2.json', '/b-v2.json'])
  f.controls.downloads = []
  await main([...f.args, '--resume', '--with-images'])
  assert.deepEqual(f.controls.downloads, ['/a.png', '/b.png'])
});

test('进程在第二个画板中断后，manifest 保留第一个画板且可续传', async t => {
  const f = setup(t)
  const moduleUrl = new URL('./lanhu-export.mjs', import.meta.url).href
  const script = `
    const response = ${response.toString()};
    process.env.LANHU_COOKIE='sid=fixture';
    globalThis.fetch=async url => {
      const u=new URL(url);
      if(u.pathname.includes('project_sectors')) return response({data:{sectors:[{id:'g',name:'G',images:[{image_id:'a',name:'A'},{image_id:'b',name:'B'}]}]}});
      if(u.pathname.endsWith('/image')) {if(u.searchParams.get('image_id')==='b') process.exit(21); return response({data:{version_id:'a-v1'}});}
      if(u.pathname.endsWith('store_schema_revise')) return response({data:{data_resource_url:'https://assets.lanhuapp.com/a-v1.json'}});
      return response({layers:[]});
    };
    import(${JSON.stringify(moduleUrl)}).then(({main})=>main(${JSON.stringify(f.args)}));
  `
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' })
  assert.equal(result.status, 21, result.stderr)
  assert.equal(f.read().images[0].status, 'completed')
  assert.equal(f.read().complete, false)
  await main([...f.args, '--resume'])
  assert.deepEqual(f.controls.downloads, ['/b-v1.json'])
});

test('有限并发保持 manifest 顺序；临时错误有界重试', async t => {
  const f = setup(t)
  f.controls.delay = 5
  f.controls.transient = true
  await main([...f.args, '--concurrency', '2'])
  assert.equal(f.controls.maximum, 2)
  assert.deepEqual(f.read().images.map(item => item.image_id), ['a', 'b'])
  assert.equal(f.controls.attempts['/a-v1.json'], 2)
  assert.equal(f.controls.attempts['/b-v1.json'], 2)
  await assert.rejects(main([...f.args, '--concurrency', '5']), /integer from 1 to 4/)
});

test('不同项目续传被拒绝且不覆盖原 manifest', async t => {
  const f = setup(t)
  await main(f.args)
  const previous = fs.readFileSync(path.join(f.out, 'manifest.json'), 'utf8')
  const args = [...f.args, '--resume']
  args[1] = 'https://lanhuapp.com/web/?tid=t&pid=another'
  await assert.rejects(main(args), /different project or group/)
  assert.equal(fs.readFileSync(path.join(f.out, 'manifest.json'), 'utf8'), previous)
});

test('缓存越界路径失败关闭，不读取或覆盖输出目录外文件', async t => {
  const f = setup(t)
  await main(f.args)
  const manifest = f.read()
  const outside = path.join(f.out, '..', `${path.basename(f.out)}-outside.json`)
  fs.writeFileSync(outside, 'sentinel')
  manifest.images[0].schema_path = outside
  fs.writeFileSync(path.join(f.out, 'manifest.json'), JSON.stringify(manifest))
  await assert.rejects(main([...f.args, '--resume']), error => error.exitCode === 2)
  assert.match(f.read().images[0].errors[0], /inside the output directory/)
  assert.equal(fs.readFileSync(outside, 'utf8'), 'sentinel')
});

test('鉴权错误不重试；永久服务错误最多请求三次', async t => {
  const f = setup(t)
  let attempts = 0
  globalThis.fetch = async () => { attempts++; return response({}, 401) }
  await assert.rejects(main(f.args), /HTTP 401/)
  assert.equal(attempts, 1)
  attempts = 0
  globalThis.fetch = async () => { attempts++; return response({}, 503) }
  await assert.rejects(main(f.args), /HTTP 503/)
  assert.equal(attempts, 3)
});
