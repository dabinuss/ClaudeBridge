'use strict';
// Explicit, reversible user-level Ripple integration lifecycle.
// This changes only Claude's managed egressProxyUrl and our own user autostart.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');
const {createIdentity}=require('./certs');
const trust=require('./trust');
const desktop=require('./desktop-config');
const service=require('./service');
const {PORT}=require('./daemon');
function root(){return path.join(os.homedir(),'.claudebridge','ripple-lite');}
function paths(installed){
 const node=path.join(installed,'integrations','native-ui',process.platform==='win32'?'node.exe':'node');
 const script=path.join(installed,'integrations','ripple-lite','daemon.js');
 if(!fs.existsSync(node)||!fs.existsSync(script))throw Error('Complete private ClaudeBridge install is required');
 return {node,script};
}
async function control(action,{port=PORT}={}){
 const file=path.join(root(),'daemon.json');
 let saved;
 try{saved=JSON.parse(fs.readFileSync(file,'utf8'));}catch{return false;}
 if(saved.port!==port||typeof saved.token!=='string'||saved.token.length!==64)return false;
 return new Promise(resolve=>{
  const req=http.request({hostname:'127.0.0.1',port,
   path:action==='stop'?'/__claudebridge/stop':'/__claudebridge/health',
   method:action==='stop'?'POST':'GET',
   headers:{'x-claudebridge-token':saved.token},timeout:1000},res=>{
    res.resume();res.once('end',()=>resolve(res.statusCode===200));
   });
  req.on('timeout',()=>{req.destroy();resolve(false);});
  req.on('error',()=>resolve(false));req.end();
 });
}
async function isAlive(port=PORT){return control('health',{port});}

async function enable({installed,consent=false}={}){
 if(consent!==true)throw Error('User must explicitly approve the local TLS CA and HTTPS proxy');
 if(!path.isAbsolute(installed))throw Error('Installed directory must be absolute');
 const {node,script}=paths(installed);
 const dir=root();
 const enabledFile=path.join(dir,'enabled.json');
 if(fs.existsSync(enabledFile)){
  const previous=JSON.parse(fs.readFileSync(enabledFile,'utf8'));
  if(previous.installed!==installed)throw Error('A different ClaudeBridge installation already owns the proxy');
  if(await isAlive())return {enabled:true,alreadyEnabled:true,port:PORT,
   fingerprint:previous.fingerprint,restartClaude:false};
  throw Error('An existing proxy installation is not healthy; disable and repair it before reinstalling');
 }
 const identity=createIdentity(path.join(dir,'certs'));
 const spec=service.serviceSpec({exe:node,script});
 let trusted=false,started=false,configured=false;
 try{
  trust.apply('trust',identity.ca,{confirm:true});trusted=true;
  service.install(spec);started=true;
  if(process.platform==='win32'){
   const proc=spawn(node,[script],{detached:true,windowsHide:true,stdio:'ignore',shell:false});
   proc.on('error',()=>{});proc.unref();
  }
  let alive=false;
  for(let n=0;n<25;n++){
   if(await isAlive()){alive=true;break;}
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!alive)throw Error('ClaudeBridge proxy did not become reachable; refusing to configure Claude');
  desktop.apply({proxyUrl:'http://127.0.0.1:'+PORT,owner:installed});configured=true;
  fs.writeFileSync(path.join(dir,'enabled.json'),JSON.stringify({installed,fingerprint:identity.fingerprint}),{mode:0o600});
  return {enabled:true,port:PORT,fingerprint:identity.fingerprint,restartClaude:true};
 }catch(error){
  if(configured){try{desktop.remove({owner:installed});}catch{}}
  if(started){try{service.uninstall(spec);}catch{}}
  if(trusted){try{trust.apply('untrust',identity.ca,{confirm:true});}catch{}}
  throw error;
 }
}
async function disable({installed}={}){
 if(!path.isAbsolute(installed))throw Error('Installed directory must be absolute');
 const {node,script}=paths(installed);
 const spec=service.serviceSpec({exe:node,script});
 const dir=root();
 // Restore the preexisting Claude config before stopping the service.
 const configRemoved=desktop.remove({owner:installed});
 const serviceRemoved=service.uninstall(spec);
 await control('stop');
 let trustRemoved=false;
 const ca=path.join(dir,'certs','ca.pem');
 if(fs.existsSync(ca)){trust.apply('untrust',ca,{confirm:true});trustRemoved=true;}
 fs.rmSync(path.join(dir,'enabled.json'),{force:true});
 return {enabled:false,configRemoved,serviceRemoved,trustRemoved};
}
function status(){
 const enabled=fs.existsSync(path.join(root(),'enabled.json'));
 return {enabled,proxyPort:PORT,desktop:desktop.state().active?.egressProxyUrl||null};
}
module.exports={enable,disable,status,isAlive,control};
