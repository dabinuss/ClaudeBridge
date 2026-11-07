'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const store=require('../server/db');
const project=fs.mkdtempSync(path.join(os.tmpdir(),'claudebridge-mailbox-'));
const id=crypto.randomUUID(),db=store.openDb({path:project});
store.addTask(db,{id,mode:'review',prompt:'Check messages',project_path:project});
store.message(db,'claude','codex','Please check the schema',id);db.close();
const child=spawn(process.execPath,[path.resolve(__dirname,'../server/agent-mcp.js'),project,id],{stdio:['pipe','pipe','pipe']});
const pending=new Map();let next=0,buf='';
child.stdout.on('data',b=>{
 buf+=b;
 for(;;){let n=buf.indexOf('\n');if(n<0)break;let raw=buf.slice(0,n);buf=buf.slice(n+1);if(!raw)continue;
  let event=JSON.parse(raw);if(pending.has(event.id)){pending.get(event.id)(event.result);pending.delete(event.id);}
 }
});
function req(method,params={}){
 return new Promise((res,rej)=>{const id=++next;pending.set(id,res);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 setTimeout(()=>{if(pending.has(id)){pending.delete(id);rej(Error('Timeout: '+method));}},5000).unref();});
}
async function call(name,args={}){
 const r=await req('tools/call',{name,arguments:args});
 if(r.isError)throw Error(r.content[0].text);
 return JSON.parse(r.content[0].text);
}
(async()=>{
 assert.equal((await req('initialize')).serverInfo.name,'claudebridge-mailbox');
 assert.equal((await req('tools/list')).tools.length,3);
 assert((await call('read_messages')).messages.some(m=>m.body==='Please check the schema'));
 await call('send_message',{body:'I found the issue. Working on the fix.'});
 const db2=store.openDb({path:project});assert(store.messages(db2).some(m=>m.sender==='codex'));db2.close();
 console.log('PASS: Codex MCP mailbox receives and sends project messages');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 child.kill();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,1500);});
 try{fs.rmSync(project,{recursive:true,force:true,maxRetries:10,retryDelay:150});}catch(e){console.error('Cleanup warning',e.message);}
});