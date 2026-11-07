'use strict';
// Only the four ClaudeBridge menu actions exposed to the first-party Claude renderer.
// No generic command execution, arbitrary file access, or network proxy configuration.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,spawnSync}=require('node:child_process');
const settings=require('../../server/settings');
const {codexPath}=require('./codex-model');
const home=path.join(os.homedir(),'.claudebridge');
function project(){
 try{
  const registry=JSON.parse(fs.readFileSync(path.join(home,'projects.json'),'utf8'));
  const active=registry.projects?.[registry.active];
  if(active&&typeof active.id==='string')return {id:active.id,name:String(active.name||'')};
 }catch{}
 return null;
}
function codex(){
 let binary;
 try{binary=codexPath(path.resolve(__dirname,'../..'));}catch{return {codexInstalled:false,codexLogin:'missing'};}
 const result=spawnSync(process.execPath,[binary,'login','status'],{
  timeout:4000,encoding:'utf8',maxBuffer:32768,windowsHide:true,shell:false
 });
 return {codexInstalled:true,codexLogin:result.status===0?'signed_in':'not_signed_in'};
}
function status(){
 const p=project(),cfg=settings.read(p?.id||null);
 const log=path.join(home,'ripple-login.log');
 let instructions='';
 try{instructions=fs.readFileSync(log,'utf8').slice(-1600);}catch{}
 return {...cfg,...codex(),project:p,instructions};
}
function login(){
 const binary=codexPath(path.resolve(__dirname,'../..'));
 const current=codex();
 if(current.codexLogin==='signed_in')return status();
 fs.mkdirSync(home,{recursive:true,mode:0o700});
 const file=path.join(home,'ripple-login.log'),pidfile=path.join(home,'ripple-login.pid');
 let running=false;
 try{const pid=Number(fs.readFileSync(pidfile,'utf8'));if(pid>0){process.kill(pid,0);running=true;}}catch{}
 if(!running){
  fs.writeFileSync(file,'Starting Codex device sign-in. Follow the URL and code here.\n',{mode:0o600});
  const fd=fs.openSync(file,'a',0o600);
  try{
   const child=spawn(process.execPath,[binary,'login','--device-auth'],{
    cwd:home,detached:true,windowsHide:true,stdio:['ignore',fd,fd],shell:false
   });
   child.on('error',()=>{});child.unref();
   fs.writeFileSync(pidfile,String(child.pid||0),{mode:0o600});
  }finally{fs.closeSync(fd);}
 }
 return {...status(),nextStep:'Complete the device login in your browser, then refresh status.'};
}
function dispatch(data){
 if(!data||typeof data!=='object'||!Number.isSafeInteger(data.id)||
   data.id<1||data.id>100000000)throw Error('Invalid RPC request');
 switch(data.action){
  case 'status':return status();
  case 'set-mode':{
   if(!['off','manual','fallback','dual'].includes(data.mode))throw Error('Invalid mode');
   const p=project();
   settings.write({mode:data.mode},p?.id||null);
   return status();
  }
  case 'login':return login();
  case 'repair':return {...status(),nextStep:'Run the ClaudeBridge installer again to repair dependencies.'};
  default:throw Error('Unknown ClaudeBridge action');
 }
}
function buildScript(renderer,token){
 if(typeof renderer!=='string'||!renderer.includes('__claudebridgePickerInjected'))throw Error('Invalid UI renderer');
 if(!/^[a-f0-9]{64}$/i.test(token))throw Error('Invalid UI token');
 const prelude=`(()=>{
  'use strict';
  if(location.origin!=='https://claude.ai')return;
  const TOKEN=${JSON.stringify(token)};
  Object.defineProperty(window,'__claudebridgeHost',{configurable:false,value:raw=>{
   let request;
   try{request=JSON.parse(raw);}catch{return;}
   fetch('/__claudebridge/rpc',{method:'POST',credentials:'same-origin',
    headers:{'content-type':'application/json','x-claudebridge-token':TOKEN},
    body:JSON.stringify(request)}).then(async response=>{
     const packet=await response.json();
     window.dispatchEvent(new CustomEvent('claudebridge-response',{
      detail:{id:request.id,data:packet.data,error:packet.error||(!response.ok?'Bridge unavailable':undefined)}
     }));
    }).catch(error=>{
     window.dispatchEvent(new CustomEvent('claudebridge-response',{
      detail:{id:request.id,error:String(error.message||error)}
     }));
    });
  }});
 })();\n`;
 return prelude+renderer;
}
module.exports={dispatch,buildScript,status,codex};
