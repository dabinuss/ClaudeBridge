'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'claudebridge-v2-'));
const project=path.join(base,'my-project');fs.mkdirSync(project);
const home=path.join(base,'user-home');fs.mkdirSync(home);
const env={...process.env,HOME:home,USERPROFILE:home,CODEX_BIN:path.resolve(__dirname,'mock-codex.js')};
const srv=spawn(process.execPath,[path.resolve(__dirname,'../server/v2.js')],{env,stdio:['pipe','pipe','pipe'],windowsHide:true});
let buffer='',id=0;const pending=new Map();
srv.stdout.on('data',chunk=>{
  buffer+=chunk.toString();
  for(;;){const pos=buffer.indexOf('\n');if(pos<0)break;const line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);if(!line)continue;
    const result=JSON.parse(line);const p=pending.get(result.id);if(p){pending.delete(result.id);p(result.result||result.error);}
  }
});
srv.stderr.on('data',chunk=>process.stderr.write(chunk));
function request(method,params={}){
  return new Promise((resolve,reject)=>{
    const n=++id;pending.set(n,resolve);
    srv.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n');
    setTimeout(()=>{if(pending.has(n)){pending.delete(n);reject(Error('Timed out waiting for '+method));}},5000).unref();
  });
}
async function tool(name,args={}){
  const response=await request('tools/call',{name,arguments:args});
  if(response.isError)throw Error(response.content?.[0]?.text||'MCP error');
  return JSON.parse(response.content[0].text);
}
const pause=n=>new Promise(r=>setTimeout(r,n));
(async()=>{
  const initial=await request('initialize',{protocolVersion:'2025-06-18'});
  assert.equal(initial.serverInfo.name,'claudebridge');
  const tools=await request('tools/list');assert(tools.tools.length>=10);
  const p=await tool('bridge_project',{action:'register',path:project,name:'Mock Project'});
  assert.equal(p.name,'Mock Project');
  assert.equal((await tool('bridge_project',{action:'list'})).active,p.id);
  await tool('bridge_checkpoint',{note:'Use the existing test architecture'});
  const ctx=await tool('bridge_context');assert(ctx.recentMessages.some(m=>/existing test architecture/.test(m.body)));
  const job=await tool('bridge_delegate',{mode:'review',task:'Review the project'});
  let state;
  for(let i=0;i<70;i++){await pause(100);state=await tool('bridge_status',{task_id:job.id});if(!['queued','running'].includes(state.status))break;}
  assert.equal(state.status,'completed',JSON.stringify(state));
  assert.match(state.lastMessage,/Mock completed/);
  assert(fs.existsSync(path.join(project,'.agent-bridge','state.sqlite')));
  const resumed=await tool('bridge_resume',{task_id:job.id,task:'Follow up with improvements'});
  assert(resumed.id!==job.id);
  for(let i=0;i<70;i++){await pause(100);state=await tool('bridge_status',{task_id:resumed.id});if(!['queued','running'].includes(state.status))break;}
  assert.equal(state.status,'completed',JSON.stringify(state));
  console.log('PASS: v2 MCP, multi-project registry, SQLite, detached worker, messages, task status, resume');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  srv.kill();
  await new Promise(resolve=>{if(srv.exitCode!==null)return resolve();srv.once('exit',resolve);setTimeout(resolve,1500);});
  for(let i=0;i<10;i++){try{fs.rmSync(base,{force:true,recursive:true,maxRetries:5,retryDelay:100});break;}catch(e){if(i===9)console.error('Cleanup warning:',e.message);await pause(150);}}
});