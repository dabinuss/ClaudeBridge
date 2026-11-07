'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-cancel-'));
const project=path.join(base,'project');fs.mkdirSync(project);
const home=path.join(base,'home');fs.mkdirSync(home);
const env={...process.env,HOME:home,USERPROFILE:home,CODEX_BIN:path.resolve(__dirname,'mock-codex.js')};
const proc=spawn(process.execPath,[path.resolve(__dirname,'../server/v2.js')],{env,stdio:['pipe','pipe','pipe'],windowsHide:true});
let buf='',next=0;const waiting=new Map();
proc.stdout.on('data',chunk=>{
 buf+=chunk;
 for(;;){
  const idx=buf.indexOf('\n');if(idx<0)break;
  const line=buf.slice(0,idx);buf=buf.slice(idx+1);
  if(!line)continue;
  const data=JSON.parse(line);
  const resolver=waiting.get(data.id);if(resolver){waiting.delete(data.id);resolver(data.result||data.error);}
 }
});
function request(method,params={}){
 return new Promise((resolve,reject)=>{
  const id=++next;waiting.set(id,resolve);
  proc.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  setTimeout(()=>{if(waiting.has(id)){waiting.delete(id);reject(Error('MCP timeout '+method));}},7000).unref();
 });
}
async function tool(name,args={}){
 const r=await request('tools/call',{name,arguments:args});
 if(r.isError)throw Error(r.content?.[0]?.text);
 return JSON.parse(r.content[0].text);
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function alive(pid){
 try{process.kill(pid,0);return true;}catch{return false;}
}
(async()=>{
 await request('initialize');
 await tool('bridge_project',{action:'register',path:project});
 const launched=await tool('bridge_delegate',{task:'DELAY_FOR_CANCEL_TEST',mode:'review'});
 let row;
 const {openDb}=require('../server/db');
 for(let i=0;i<80;i++){
  await pause(100);
  const db=openDb({path:project});row=db.prepare('SELECT * FROM tasks WHERE id=?').get(launched.id);db.close();
  if(row?.status==='running'&&row.child_pid)break;
 }
 assert.equal(row?.status,'running','mock worker must be running before cancellation');
 assert(row.child_pid>0);
 await tool('bridge_cancel',{task_id:launched.id});
 for(let i=0;i<50;i++){if(!alive(row.child_pid))break;await pause(100);}
 assert(!alive(row.child_pid),'Codex child process must be terminated');
 assert.equal((await tool('bridge_status',{task_id:launched.id})).status,'cancelled');
 console.log('PASS: cancelled tasks terminate Codex child process and preserve cancelled state');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 proc.kill();
 await new Promise(resolve=>{if(proc.exitCode!==null)return resolve();proc.once('exit',resolve);setTimeout(resolve,2000);});
 for(let i=0;i<10;i++){try{fs.rmSync(base,{force:true,recursive:true,maxRetries:5,retryDelay:150});break;}
 catch(e){if(i===9)console.error('Cleanup:',e.message);await pause(200);}}
});
