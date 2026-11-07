'use strict';
// Explicit, reversible user-level Ripple integration lifecycle.
// This changes only Claude's managed egressProxyUrl and our own user autostart.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
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
async function isAlive(port=PORT){
 return new Promise(resolve=>{
  const s=net.connect({host:'127.0.0.1',port});
  s.setTimeout(500,()=>{s.destroy();resolve(false)});
  s.once('connect',()=>{s.destroy();resolve(true)});
  s.once('error',()=>resolve(false));
 });
}
async function enable({installed,consent=false}={}){
 if(consent!==true)throw Error('User must explicitly approve the local TLS CA and HTTPS proxy');
 if(!path.isAbsolute(installed))throw Error('Installed directory must be absolute');
 const {node,script}=paths(installed);
 const dir=root();
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
function disable({installed}={}){
 if(!path.isAbsolute(installed))throw Error('Installed directory must be absolute');
 const {node,script}=paths(installed);
 const spec=service.serviceSpec({exe:node,script});
 const dir=root();
 // Restore the preexisting Claude config before stopping the service.
 const configRemoved=desktop.remove({owner:installed});
 const serviceRemoved=service.uninstall(spec);
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
module.exports={enable,disable,status,isAlive};
