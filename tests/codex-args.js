'use strict';
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {buildExecArgs}=require('../server/codex-args');
const previousTask={session_id:'00000000-0000-0000-0000-000000000000'};
assert.deepEqual(buildExecArgs({mode:'review'}),['exec','--json','--sandbox','read-only']);
assert.deepEqual(buildExecArgs({mode:'code',worktree:true}),['exec','--json','--sandbox','workspace-write','--worktree']);
assert.deepEqual(buildExecArgs({mode:'review',previousTask}),
 ['exec','resume',previousTask.session_id,'--json','-c','sandbox_mode="read-only"']);
assert.deepEqual(buildExecArgs({mode:'code',previousTask,worktree:true}),
 ['exec','fork',previousTask.session_id,'--json','-c','sandbox_mode="workspace-write"','--worktree']);
assert.deepEqual(buildExecArgs({mode:'code',model:'gpt-6.1-sol'}),
 ['exec','--json','--sandbox','workspace-write','--model','gpt-6.1-sol']);
assert.deepEqual(buildExecArgs({mode:'review',previousTask,model:'gpt-6-astra'}),
 ['exec','resume',previousTask.session_id,'--json','-c','sandbox_mode="read-only"','--model','gpt-6-astra']);
for(const mode of ['review','code']){
 for(const worktree of [false,true]){
  const args=buildExecArgs({mode,worktree,previousTask});
  assert(!args.includes('--sandbox'),'Nested exec subcommands cannot accept --sandbox');
 }
}
assert.throws(()=>buildExecArgs({mode:'code',previousTask:{session_id:'bad'}}),/ID/);
assert.throws(()=>buildExecArgs({mode:'code',model:'bad model'}),/model/);
// Exercise the real bundled Codex CLI in CI without requiring authentication.
const cli=process.env.CLAUDEBRIDGE_CODEX_TEST_BIN;
if(cli){
 const {execFileSync}=require('node:child_process');
 const nodeArgs=cli.endsWith('.js')?[cli]:[];
 const executable=nodeArgs.length?process.execPath:cli;
 for(const sub of ['resume','fork']){
  const r=spawnSync(executable,[...nodeArgs,'exec',sub,'--help'],{encoding:'utf8',timeout:10000});
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/--config/);
  assert.doesNotMatch(r.stdout,/^\s+--sandbox\s/m);
 }
}
console.log('PASS: new, resumed and forked Codex commands obey CLI argument schema');
