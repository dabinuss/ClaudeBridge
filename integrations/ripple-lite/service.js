'use strict';
// User-login autostart for ONE lightweight loopback proxy process.
// Original Claude application paths and shortcuts are not modified.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync,spawn}=require('node:child_process');
const LABEL='claudebridge-ripple';
function escXml(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function serviceSpec({platform=process.platform,home=os.homedir(),exe,script,env=process.env}={}){
 if(!path.isAbsolute(exe)||!path.isAbsolute(script))throw Error('Absolute Node and daemon paths required');
 if(platform==='win32'){
  const command='"'+exe+'" "'+script+'"';
  return {platform,command,location:'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
   name:'ClaudeBridgeRipple',marker:path.join(home,'.claudebridge','ripple-lite','autostart.json')};
 }
 if(platform==='darwin'){
  const file=path.join(home,'Library','LaunchAgents','dev.claudebridge.ripple.plist');
  const content='<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'+
    '<plist version="1.0"><dict><key>Label</key><string>dev.claudebridge.ripple</string>'+
    '<key>ProgramArguments</key><array><string>'+escXml(exe)+'</string><string>'+escXml(script)+'</string></array>'+
    '<key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict></plist>\n';
  return {platform,file,content,marker:path.join(home,'.claudebridge','ripple-lite','autostart.json')};
 }
 if(platform==='linux'){
  const base=env.XDG_CONFIG_HOME||path.join(home,'.config');
  const file=path.join(base,'systemd','user',LABEL+'.service');
  const q=x=>'"'+x.replace(/["\\]/g,'\\$&')+'"';
  const content='[Unit]\nDescription=ClaudeBridge Ripple-lite proxy\n\n[Service]\nType=simple\nExecStart='+q(exe)+' '+q(script)+'\nRestart=on-failure\nRestartSec=3\n\n[Install]\nWantedBy=default.target\n';
  return {platform,file,content,marker:path.join(home,'.claudebridge','ripple-lite','autostart.json')};
 }
 throw Error('Unsupported platform');
}
function run(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:20000,windowsHide:true});
 if(r.error||r.status!==0)throw Error('User-service command failed: '+cmd+' '+String(r.stderr||r.error?.message).slice(0,200));}
function install(spec,{invoke=run,start=true}={}){
 if(fs.existsSync(spec.marker))throw Error('Existing ClaudeBridge auto-start must be removed first');
 fs.mkdirSync(path.dirname(spec.marker),{recursive:true,mode:0o700});
 if(spec.file){
  if(fs.existsSync(spec.file))throw Error('Refusing to replace an existing user service');
  fs.mkdirSync(path.dirname(spec.file),{recursive:true,mode:0o700});
  fs.writeFileSync(spec.file,spec.content,{mode:0o600,flag:'wx'});
 }
 let registered=false;
 try{
  if(spec.platform==='win32'){
   invoke('reg.exe',['ADD',spec.location,'/v',spec.name,'/t','REG_SZ','/d',spec.command,'/f']);
   registered=true;
  }else if(spec.platform==='darwin'){
   if(start)invoke('launchctl',['bootstrap','gui/'+process.getuid(),spec.file]);
  }else if(spec.platform==='linux'){
   if(start){invoke('systemctl',['--user','daemon-reload']);invoke('systemctl',['--user','enable','--now',LABEL+'.service']);}
  }
  fs.writeFileSync(spec.marker,JSON.stringify({owner:LABEL,platform:spec.platform,
   file:spec.file||null,name:spec.name||null,command:spec.command||null}),{mode:0o600,flag:'wx'});
  return true;
 }catch(e){
  if(registered&&spec.platform==='win32')try{invoke('reg.exe',['DELETE',spec.location,'/v',spec.name,'/f']);}catch{}
  if(spec.file)fs.rmSync(spec.file,{force:true});throw e;
 }
}
function uninstall(spec,{invoke=run,stop=true}={}){
 let prior;
 try{prior=JSON.parse(fs.readFileSync(spec.marker,'utf8'));}catch(e){if(e.code==='ENOENT')return false;throw e;}
 if(prior.owner!==LABEL||prior.platform!==spec.platform||prior.file!==(spec.file||null))
  throw Error('User-service ownership mismatch');
 if(spec.platform==='win32')invoke('reg.exe',['DELETE',spec.location,'/v',spec.name,'/f']);
 else if(spec.platform==='darwin'){
  if(stop)invoke('launchctl',['bootout','gui/'+process.getuid(),spec.file]);
 }else if(spec.platform==='linux'){
  if(stop){invoke('systemctl',['--user','disable','--now',LABEL+'.service']);invoke('systemctl',['--user','daemon-reload']);}
 }
 if(spec.file)fs.rmSync(spec.file,{force:true});
 fs.rmSync(spec.marker,{force:true});return true;
}
module.exports={serviceSpec,install,uninstall};
