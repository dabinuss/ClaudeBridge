const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const project=fs.mkdtempSync(path.join(os.tmpdir(),'codex-bridge-test-'));
const server=path.join(__dirname,'../server/index.js');
const mock=path.join(__dirname,'mock-codex.js');
const p=spawn(process.execPath,[server],{env:{...process.env,BRIDGE_PROJECT:project,CODEX_BIN:mock},stdio:['pipe','pipe','pipe']});
const pending=new Map();let buf='';
p.stdout.on('data',c=>{buf+=c;for(;;){let i=buf.indexOf('\n');if(i<0)break;let line=buf.slice(0,i);buf=buf.slice(i+1);if(!line)continue;let msg=JSON.parse(line);if(pending.has(msg.id)){pending.get(msg.id)(msg.result);pending.delete(msg.id);}}});
let counter=0;
function request(method,params){const id=++counter;return new Promise((resolve,reject)=>{pending.set(id,resolve);p.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('Timed out '+method));}},5000);});}
const tool=async(name,args={})=>{let r=await request('tools/call',{name,arguments:args}); if(r.isError)throw Error(r.content[0].text);return JSON.parse(r.content[0].text);};
(async()=>{
  assert.equal((await request('initialize',{protocolVersion:'2025-06-18'})).serverInfo.name,'claudebridge');
  assert.equal((await request('tools/list')).tools.length,7);
  assert.equal((await tool('bridge_health')).codexAvailable,true);
  await tool('bridge_checkpoint',{note:'The backend schema is v1.'});
  assert.match((await tool('bridge_context')).notes,/backend schema/);
  const created=await tool('bridge_delegate',{task:'Test summary',mode:'review'});
  assert.equal(created.status,'running');
  let t;
  for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,50));t=await tool('bridge_status',{task_id:created.id});if(t.status!=='running')break;}
  assert.equal(t.status,'completed',JSON.stringify(t));
  assert.match(t.lastMessage,/Mock completed/);
  const resumed=await tool('bridge_resume',{task_id:created.id,task:'Continue the analysis'});
  assert(resumed.id!==created.id);
  console.log('PASS: MCP init/list, Codex discovery, notes, job lifecycle, JSONL parsing, session resume');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{p.kill();fs.rmSync(project,{force:true,recursive:true});});
