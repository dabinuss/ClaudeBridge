'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const server=path.resolve(__dirname,'../server/v2.js');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'claudebridge-ui-'));
const proc=spawn(process.execPath,[server],{env:{...process.env,HOME:base,USERPROFILE:base},stdio:['pipe','pipe','pipe']});
let buf='',count=0;const waiting=new Map();
proc.stdout.on('data',c=>{
 buf+=c;
 for(;;){const n=buf.indexOf('\n');if(n<0)break;const line=buf.slice(0,n);buf=buf.slice(n+1);if(!line)continue;
  const response=JSON.parse(line);if(waiting.has(response.id)){waiting.get(response.id)(response.result||response.error);waiting.delete(response.id);}
 }
});
function request(method,params={}){
 return new Promise((resolve,reject)=>{const id=++count;waiting.set(id,resolve);proc.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 setTimeout(()=>{if(waiting.has(id)){waiting.delete(id);reject(Error('Timeout '+method));}},7000).unref();});
}
(async()=>{
 const init=await request('initialize');
 assert(init.capabilities.resources);
 assert(init.capabilities.prompts,'MCP prompts must be discoverable');
 const prompts=await request('prompts/list');
 assert(prompts.prompts.some(x=>x.name==='claudebridge-settings'));
 assert(prompts.prompts.some(x=>x.name==='claudebridge-dual'));
 const settingsPrompt=await request('prompts/get',{name:'claudebridge-settings'});
 assert.match(settingsPrompt.messages[0].content.text,/bridge_health/);
 const dualPrompt=await request('prompts/get',{name:'claudebridge-dual',arguments:{task:'Review this worktree'}});
 assert.match(dualPrompt.messages[0].content.text,/Review this worktree/);
 // The regular Chat client must never gain a second Claude Desktop launcher.
 const blocked=await request('tools/call',{name:'bridge_native_picker',arguments:{action:'install'}});
 assert.equal(blocked.isError,true,'Legacy alternate launcher must be disabled');
 assert.match(blocked.content[0].text,/disabled/i);
 const list=await request('tools/list');
 assert(list.tools.some(x=>x.name==='bridge_control_panel'&&x._meta?.ui?.resourceUri));
 const resources=await request('resources/list');
 assert(resources.resources.some(x=>x.uri==='ui://claudebridge/control-panel.html'));
 const data=await request('resources/read',{uri:'ui://claudebridge/control-panel.html'});
 assert.equal(data.contents[0].mimeType,'text/html;profile=mcp-app');
 assert.match(data.contents[0].text,/ClaudeBridge/);
 assert.match(data.contents[0].text,/Dual agents/);
 assert(!data.contents[0].text.includes('/*__CLAUDEBRIDGE_APP_BUNDLE__*/'),'UI must contain the real compiled runtime');
 assert.match(data.contents[0].text,/ClaudeBridge Settings/,'Compiled MCP UI must include app initialization');
 const set=await request('tools/call',{name:'bridge_settings',arguments:{action:'set',mode:'dual'}});
 assert.equal(JSON.parse(set.content[0].text).mode,'dual');
 const get=await request('tools/call',{name:'bridge_settings',arguments:{action:'get'}});
 assert.equal(JSON.parse(get.content[0].text).mode,'dual');
 console.log('PASS: MCP app UI, settings tools and resources');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 proc.kill();await new Promise(r=>{if(proc.exitCode!==null)return r();proc.once('exit',r);setTimeout(r,1500);});
 fs.rmSync(base,{recursive:true,force:true,maxRetries:10,retryDelay:100});
});
