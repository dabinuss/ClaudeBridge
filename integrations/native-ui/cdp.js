'use strict';
// CDP pipe transport. No remote-debugging TCP port and no browser network interception.
class CDPPipe{
 constructor(child,{renderer,handleAction}){
  this.renderer=renderer;this.handleAction=handleAction;
  this.child=child;this.buffer=Buffer.alloc(0);this.id=0;
  this.callbacks=new Map();this.sessions=new Set();this.targets=new Set();this.sessionTargets=new Map();
  const incoming=child.stdio[4],outgoing=child.stdio[3];
  if(!incoming||!outgoing)throw Error('Electron did not supply the debugging pipe');
  this.input=incoming;this.output=outgoing;
  incoming.on('data',data=>this.feed(data));
  incoming.on('error',error=>process.stderr.write('CDP read: '+error.message+'\n'));
  outgoing.on('error',error=>process.stderr.write('CDP write: '+error.message+'\n'));
 }
 feed(bytes){
  this.buffer=Buffer.concat([this.buffer,bytes]);
  if(this.buffer.length>8*1024*1024){this.buffer=Buffer.alloc(0);return;}
  let position;
  while((position=this.buffer.indexOf(0))!==-1){
   const message=this.buffer.subarray(0,position).toString('utf8');
   this.buffer=this.buffer.subarray(position+1);
   if(!message)continue;
   let packet;try{packet=JSON.parse(message);}catch{continue;}
   if(packet.id&&this.callbacks.has(packet.id)){
    const cb=this.callbacks.get(packet.id);this.callbacks.delete(packet.id);
    if(packet.error)cb.reject(Error(packet.error.message||'CDP request failed'));
    else cb.resolve(packet.result||{});
   }else if(packet.method)this.event(packet).catch(e=>process.stderr.write('CDP event: '+e.message+'\n'));
  }
 }
 send(method,params={},sessionId){
  const id=++this.id;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{
    if(this.callbacks.delete(id))reject(Error('CDP timeout: '+method));
   },8000);
   timer.unref();
   this.callbacks.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
   const request={id,method,params};
   if(sessionId)request.sessionId=sessionId;
   const payload=Buffer.from(JSON.stringify(request)+'\0');
   this.output.write(payload);

  });
 }
 async init(){
  await this.send('Target.setDiscoverTargets',{discover:true});
  const all=await this.send('Target.getTargets');
  for(const target of all.targetInfos||[])await this.attach(target);
 }
 isClaudeTarget(info){
  if(!info||info.type!=='page')return false;
  const url=String(info.url||'');
  try{
   const parsed=new URL(url);
   if(parsed.protocol==='https:'&&(parsed.hostname==='claude.ai'||parsed.hostname.endsWith('.claude.ai')))return true;
   if(parsed.protocol==='file:'&&/claude/i.test(parsed.pathname))return true;
  }catch{}
  return false;
 }
 async attach(info){
  if(!this.isClaudeTarget(info)||this.targets.has(info.targetId))return;
  this.targets.add(info.targetId);
  try{
   const {sessionId}=await this.send('Target.attachToTarget',{targetId:info.targetId,flatten:true});
   this.sessions.add(sessionId);
   this.sessionTargets.set(info.targetId,sessionId);
   await this.send('Runtime.enable',{},sessionId);
   await this.send('Runtime.addBinding',{name:'__claudebridgeHost'},sessionId);
   try{await this.send('Page.enable',{},sessionId);}catch{}
   try{await this.send('Page.addScriptToEvaluateOnNewDocument',{source:this.renderer},sessionId);}catch{}
   await this.send('Runtime.evaluate',{expression:this.renderer,returnByValue:true},sessionId);
   process.stdout.write('ClaudeBridge native controls attached to Claude Desktop.\n');
  }catch(e){this.targets.delete(info.targetId);process.stderr.write('Unable to attach to Claude: '+e.message+'\n');}
 }
 async event(packet){
  if(packet.method==='Target.targetCreated')return this.attach(packet.params?.targetInfo);
  if(packet.method==='Target.targetDestroyed'){
   const id=packet.params?.targetId;
   this.targets.delete(id);
   if(this.sessionTargets.has(id)){this.sessions.delete(this.sessionTargets.get(id));this.sessionTargets.delete(id);}
   return;
  }
  if(packet.method!=='Runtime.bindingCalled'||packet.params?.name!=='__claudebridgeHost')return;
  const sessionId=packet.sessionId;
  if(!this.sessions.has(sessionId))return;
  let request;
  try{request=JSON.parse(packet.params.payload);}catch{return;}
  if(!Number.isSafeInteger(request.id)||request.id<0||request.id>100000000)return;
  let detail;
  try{detail={id:request.id,data:this.handleAction(request)};}
  catch(error){detail={id:request.id,error:String(error.message||error)};}
  const expression='window.dispatchEvent(new CustomEvent("claudebridge-response",{detail:'+JSON.stringify(detail)+'}));';
  try{await this.send('Runtime.evaluate',{expression},sessionId);}catch{}
 }
}

module.exports={CDPPipe};
