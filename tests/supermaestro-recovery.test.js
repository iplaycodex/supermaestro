const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const cli = path.resolve(__dirname, '../plugins/supermaestro/scripts/supermaestro.js');
const storePath = path.resolve(__dirname, '../plugins/supermaestro/scripts/workbench-store.js');

function fixture(mode = 'lite') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supermaestro-recovery-'));
  const repo = path.join(root, 'repo');
  const wb = path.join(root, 'workbench');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'source.js'), 'module.exports = 1;\n');
  for (const args of [['init'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture']]) {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const run = (command, ...args) => spawnSync(process.execPath, [cli, command, wb, ...args], { cwd: repo, encoding: 'utf8' });
  const pass = (command, ...args) => {
    const result = run(command, ...args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result;
  };
  const fail = (pattern, command, ...args) => {
    const result = run(command, ...args);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, pattern);
    return result;
  };
  const write = (ref, content) => { fs.mkdirSync(path.dirname(path.join(wb, ref)), { recursive: true }); fs.writeFileSync(path.join(wb, ref), content); };
  const state = () => JSON.parse(fs.readFileSync(path.join(wb, 'state.json'), 'utf8'));
  const confirm = ['--confirmed-by', 'user', '--confirmation', '用户确认当前范围和计划'];
  pass('init', '--mode', mode, '--source-root', repo);
  pass('scaffold');
  if (mode === 'lite') write('brief.md', '状态：已确认\n确认人：user\n范围：验证 source.js。\n');
  else {
    write('context.md', '# Context\nBrainstorming：无待确认问题。\n');
    write('specs/requirement-alignment.md', '状态：已确认\n确认人：user\nBrainstorming：无待确认问题。\n');
    write('plans/task-plan.md', '# Plan\n任务：验证 source.js。\n');
    write('plans/progress.md', '# Progress\n执行：主控串行。\n');
    write('specs/behavior-contract.md', '# 行为契约\n验证当前导出值。\n');
    write('reviews/review-packs.md', '# Review\n| RP | Scope | Patch | Files | Validation | Review Focus | Risk |\n| --- | --- | --- | --- | --- | --- | --- |\n| RP1 | source | reviews/rp.patch | source.js | node | value | low |\n');
    write('reviews/rp.patch', 'diff --git a/source.js b/source.js\n--- a/source.js\n+++ b/source.js\n@@ -1 +1 @@\n-module.exports = 1;\n+module.exports = 2;\n');
  }
  write('reports/validation.md', '# 验证\n- TDD 决策：不适用，本次测试状态流程。\n- 完成前验证：实际命令执行通过，exit code 0。\n');
  return { root, repo, wb, run, pass, fail, write, state, confirm };
}

test('Scope 漂移可重新打开、审阅和批准，恢复提示不会误导执行', () => {
  const f = fixture();
  f.pass('approve-scope', ...f.confirm);
  f.write('brief.md', '状态：已确认\n确认人：user\n范围：新增验收条件。\n');
  f.fail(/approval no longer matches/, 'check', '--action', 'code');
  f.fail(/reopen-gate/, 'approve-scope', ...f.confirm);
  assert.match(f.pass('resume').stdout, /Blocked:.*reopen-gate/s);
  const status = JSON.parse(f.pass('status', '--json', 'true').stdout);
  assert.equal(status.gateValidity[0].valid, false);
  f.fail(/--reason/, 'reopen-gate', '--gate', 'scope');
  f.pass('reopen-gate', '--gate', 'scope', '--reason', '需求增加了验收条件');
  assert.equal(f.state().gates.gate1, 'pending');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.wb, 'gates/gate-1-decision.json'))).gates.gate1, 'pending');
  assert.equal(f.state().approvalHistory[0].previousConfirmations.gate1.confirmedBy, 'user');
  f.fail(/not approved/, 'check', '--action', 'code');
  f.pass('approve-scope', ...f.confirm);
  f.pass('check', '--action', 'code');
});

test('Plan 漂移只重开 Plan，保留 Scope；Scope 漂移必须先重开 Scope', () => {
  const f = fixture('standard');
  f.pass('approve-scope', ...f.confirm);
  f.pass('approve-plan', ...f.confirm, '--execution-mode', 'main-serial');
  f.write('plans/task-plan.md', '# Plan\n任务：追加第二项校验。\n');
  f.fail(/approval no longer matches/, 'approve-plan', ...f.confirm);
  f.pass('reopen-gate', '--gate', 'plan', '--reason', '计划增加了第二项校验');
  assert.equal(f.state().gates.gate1, 'approved');
  assert.equal(f.state().gates.gate3, 'locked');
  f.pass('approve-plan', ...f.confirm);
  f.pass('check', '--action', 'code');
  f.write('context.md', '# Context\n新增范围。\n');
  f.fail(/scope gate approval no longer matches/, 'reopen-gate', '--gate', 'plan', '--reason', '上游范围发生变化');
});

test('Review/Final 重开保留前置批准，重新完成审查和收尾', () => {
  const f = fixture('standard');
  f.pass('approve-scope', ...f.confirm);
  f.pass('approve-plan', ...f.confirm);
  fs.writeFileSync(path.join(f.repo, 'source.js'), 'module.exports = 2;\n');
  f.pass('run-verification', '--program', process.execPath, '--args-json', JSON.stringify(['-e', "require('assert').equal(require('./source.js'), 2)"]), '--report', 'reports/command.log');
  const review = () => {
    f.pass('request-review');
    f.pass('approve-review', ...f.confirm, '--review-accepted', 'true', '--validation-accepted', 'true');
  };
  const final = () => {
    f.pass('request-final');
    f.pass('approve-final', ...f.confirm, '--commit', 'false', '--merge', 'false', '--push', 'false', '--cleanup', 'false');
  };
  review();
  final();
  f.pass('reopen-gate', '--gate', 'final', '--reason', '重新审阅最终保留策略');
  assert.equal(f.state().gates.gate3, 'approved');
  assert.equal(f.state().finalActions, undefined);
  final();
  f.pass('reopen-gate', '--gate', 'review', '--reason', '重新审阅本次实现结果');
  assert.equal(f.state().gates.gate2, 'approved');
  assert.equal(f.state().gates.gate4, 'locked');
  review();
  final();
});

test('验证期间源码变化保留失败证据，稳定后重跑可以通过', () => {
  const f = fixture();
  f.pass('approve-scope', ...f.confirm);
  const mutation = "require('assert').equal(require('./source.js'), 1); require('fs').writeFileSync('source.js', 'module.exports = 2;\\n');";
  f.fail(/Source changed during verification/, 'run-verification', '--program', process.execPath, '--args-json', JSON.stringify(['-e', mutation]), '--report', 'reports/changed.log');
  const evidence = () => fs.readFileSync(path.join(f.wb, 'reports/evidence.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(evidence().at(-1).result, 'failed');
  assert.equal(evidence().at(-1).sourceChanged, true);
  assert.notEqual(evidence().at(-1).sourceRevision, evidence().at(-1).finishedSourceRevision);
  f.pass('run-verification', '--program', process.execPath, '--args-json', JSON.stringify(['-e', "require('assert').equal(require('./source.js'), 2)"]), '--report', 'reports/stable.log');
  assert.equal(evidence().at(-1).result, 'passed');
  assert.equal(evidence().at(-1).sourceChanged, false);
});

test('门禁记录写入失败时不放行；修正输出路径后可以重试', () => {
  const f = fixture();
  const decision = path.join(f.wb, 'gates/gate-1-decision.json');
  fs.mkdirSync(decision);
  f.fail(/not a file/, 'approve-scope', ...f.confirm);
  assert.equal(f.state().gates.gate1, 'pending');
  f.fail(/not approved/, 'check', '--action', 'code');
  assert.equal(fs.existsSync(path.join(f.wb, '.supermaestro-transaction.json')), false);
  fs.rmdirSync(decision);
  f.pass('approve-scope', ...f.confirm);
  f.pass('check', '--action', 'code');
});

function interruptTransaction(f) {
  const program = `const store=require(${JSON.stringify(storePath)}); store.withWorkbenchSession(${JSON.stringify(f.wb)}, {transactional:true}, () => { const fs=require('fs'); const state=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(f.wb, 'state.json'))},'utf8')); state.gates.gate1='approved'; store.writeWorkbenchJson(${JSON.stringify(f.wb)}, 'state.json', state); process.exit(19); });`;
  assert.equal(spawnSync(process.execPath, ['-e', program], { encoding: 'utf8' }).status, 19);
}

test('进程中断后阻止所有门禁；显式恢复回退本次事务', () => {
  const f = fixture();
  interruptTransaction(f);
  f.fail(/transaction|writer/, 'check', '--action', 'code');
  f.fail(/transaction/, 'status');
  f.pass('recover-workbench');
  assert.equal(f.state().gates.gate1, 'pending');
  f.pass('approve-scope', ...f.confirm);
});

test('恢复不覆盖事务之后的外部修改，不接管活跃 writer', () => {
  const f = fixture();
  interruptTransaction(f);
  const stateFile = path.join(f.wb, 'state.json');
  const state = f.state();
  state.name = '用户后来修改的名字';
  f.write('state.json', JSON.stringify(state));
  f.fail(/changed outside the transaction/, 'recover-workbench');
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).name, state.name);
  assert.equal(fs.existsSync(path.join(f.wb, '.supermaestro-transaction.json')), true);
  const live = fixture();
  live.write('.supermaestro-lock.json', JSON.stringify({ pid: process.pid }));
  live.fail(/still active/, 'recover-workbench');
  assert.equal(fs.existsSync(path.join(live.wb, '.supermaestro-lock.json')), true);
});

test('事务提交标记写入失败也必须回退，不能错误留下批准', () => {
  const f = fixture();
  const program = `
    const fs=require('fs'); const store=require(${JSON.stringify(storePath)});
    const original=fs.renameSync; let failed=false;
    fs.renameSync=(from,to)=>{
      if(!failed && to.endsWith('.supermaestro-transaction.json') && JSON.parse(fs.readFileSync(from,'utf8')).phase==='committed') {failed=true; throw new Error('simulated commit marker failure');}
      return original(from,to);
    };
    try {store.withWorkbenchSession(${JSON.stringify(f.wb)},{transactional:true},()=>{
      const state=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(f.wb, 'state.json'))},'utf8'));
      state.gates.gate1='approved'; store.writeWorkbenchJson(${JSON.stringify(f.wb)},'state.json',state);
    });} catch(error) {process.stderr.write(error.message);process.exitCode=1;}
  `;
  const result = spawnSync(process.execPath, ['-e', program], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /commit marker failure/);
  assert.equal(f.state().gates.gate1, 'pending');
  f.pass('approve-scope', ...f.confirm);
});

test('提交后清理标记中断，恢复只清理标记而不回退已提交数据', () => {
  const f = fixture();
  const program = `
    const fs=require('fs'); const store=require(${JSON.stringify(storePath)});
    const original=fs.unlinkSync;
    fs.unlinkSync=file=>{if(file.endsWith('.supermaestro-transaction.json')) process.exit(22); return original(file);};
    store.withWorkbenchSession(${JSON.stringify(f.wb)},{transactional:true},()=>store.writeWorkbenchJson(${JSON.stringify(f.wb)},'reports/committed.json',{saved:true}));
  `;
  assert.equal(spawnSync(process.execPath, ['-e', program], { encoding: 'utf8' }).status, 22);
  f.fail(/transaction/, 'status');
  f.pass('recover-workbench');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.wb, 'reports/committed.json'))), { saved: true });
});

test('恢复拒绝恶意事务路径，初始化失败不会留下半份状态', () => {
  const f = fixture();
  f.write('.supermaestro-transaction.json', JSON.stringify({version:1, phase:'pending', entries:[{ref:'../outside.json', before:null, writtenHashes:[]}]}));
  f.fail(/inside the workbench/, 'recover-workbench');
  assert.equal(fs.existsSync(path.join(f.root, 'outside.json')), false);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supermaestro-init-failure-'));
  fs.mkdirSync(path.join(root, 'events.jsonl'));
  const result = spawnSync(process.execPath, [cli, 'init', root, '--mode', 'lite'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(fs.existsSync(path.join(root, 'state.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'mission.state.json')), false);
});
