'use strict';
// ClaudeBridge Ripple-lite user process. Installed separately from Claude Desktop;
// the original Claude shortcut remains untouched.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {makePickerProxy}=require('./proxy');
const {ROUTE_ID,codexPath}=require('./codex-model');
const PORT=17439;
function root(){return path.join(os.homedir(),'.claudebridge','ripple-lite');}
function models(base=path.resolve(__dirname,'../..')){
 let binary;try{binary=codexPath(base);}catch{return [];}
 const r=spawnSync(process.execPath,[binary,'login','status'],{encoding:'utf8',timeout:5000,windowsHide:true});
 if(r.status!==0)return [];
 return [{id:ROUTE_ID,name:'Codex · ClaudeBridge',description:'Codex through ClaudeBridge',routable:true}];
}
async function main(){
 const dir=root();fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const token=crypto.randomBytes(32).toString('hex');
 const state=path.join(dir,'daemon.json');
 let picker,stopping=false;
 const stop=()=>{
  if(stopping)return;stopping=true;
  try{fs.rmSync(state,{force:true});}catch{}
  picker.close().finally(()=>process.exit(0));
 };
 picker=makePickerProxy({dir:path.join(dir,'certs'),port:PORT,models:models(),
  controlToken:token,onShutdown:stop});
 const address=await picker.listen();
 fs.writeFileSync(state,JSON.stringify({pid:process.pid,port:address.port,
  token,started:new Date().toISOString()}),{mode:0o600});
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 process.stdout.write('ClaudeBridge Ripple-lite proxy listening on 127.0.0.1:'+address.port+'\n');
}
if(require.main===module)main().catch(e=>{process.stderr.write('Ripple-lite: '+e.message+'\n');process.exitCode=1;});
module.exports={models,PORT,root};
