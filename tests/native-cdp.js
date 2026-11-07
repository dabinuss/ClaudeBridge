'use strict';
const assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const {CDPPipe}=require('../integrations/native-ui/cdp');
const incoming=new PassThrough(),outgoing=new PassThrough();
const child={stdio:[null,null,null,outgoing,incoming]};
const seen=[];
let pending=Buffer.alloc(0),mode='manual';
outgoing.on('data',bytes=>{
 pending=Buffer.concat([pending,bytes]);
 let cursor;
 while((cursor=pending.indexOf(0))>=0){
  const text=pending.subarray(0,cursor).toString('utf8');pending=pending.subarray(cursor+1);
  if(!text)continue;
  const request=JSON.parse(text);seen.push(request);
  let result={};
  if(request.method==='Target.getTargets')result={targetInfos:[
   {type:'page',url:'https://claude.ai/desktop',targetId:'claude'},
   {type:'page',url:'https://example.com/login',targetId:'foreign'}
  ]};
  if(request.method==='Target.attachToTarget')result={sessionId:'s-1'};
  setImmediate(()=>incoming.write(Buffer.from(JSON.stringify({id:request.id,result})+'\0')));
 }
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const pipe=new CDPPipe(child,{renderer:'window.__claudebridgePickerInjected=true;',handleAction:req=>{
  if(req.action==='set-mode')mode=req.mode;
  return {mode,codexInstalled:true,codexLogin:'signed_in'};
 }});
 await pipe.init();
 assert(seen.some(p=>p.method==='Target.attachToTarget'&&p.params.targetId==='claude'));
 assert(!seen.some(p=>p.method==='Target.attachToTarget'&&p.params.targetId==='foreign'));
 assert(seen.some(p=>p.method==='Runtime.addBinding'&&p.sessionId==='s-1'));
 assert(seen.some(p=>p.method==='Page.addScriptToEvaluateOnNewDocument'));
 incoming.write(JSON.stringify({method:'Runtime.bindingCalled',sessionId:'s-1',params:{
  name:'__claudebridgeHost',payload:JSON.stringify({id:7,action:'set-mode',mode:'dual'})
 }})+'\0');
 await delay(50);
 assert.equal(mode,'dual');
 const response=seen.find(p=>p.method==='Runtime.evaluate'&&p.params.expression.includes('claudebridge-response'));
 assert(response);
 assert(response.params.expression.includes('"dual"'));
 incoming.write(JSON.stringify({method:'Target.targetDestroyed',params:{targetId:'claude'}})+'\0');
 await delay(20);
 assert(!pipe.sessions.has('s-1'),'destroyed targets must lose their authorization');
 console.log('PASS: CDP pipe attaches only Claude, runs renderer, dispatches mode requests, cleans sessions');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
 incoming.destroy();outgoing.destroy();
});
