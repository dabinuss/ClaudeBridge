'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {capture}=require('./memory');
const settings=require('./settings');
const project=process.argv[2];
const parsed=Number(process.env.BRIDGE_SCAN_INTERVAL_MS||60000);
const interval=Number.isFinite(parsed)?Math.min(Math.max(parsed,10000),300000):60000;
if(!project||!fs.existsSync(project))process.exit(2);
const projectId=crypto.createHash('sha256').update(fs.realpathSync(project)).digest('hex').slice(0,16);
const pidFile=path.join(project,'.agent-bridge','memory-monitor.pid');
fs.mkdirSync(path.dirname(pidFile),{recursive:true});
try{fs.writeFileSync(pidFile,String(process.pid),{flag:'wx',mode:0o600});}
catch(e){
  if(e.code!=='EEXIST')throw e;
  let previous=0;
  try{previous=Number(fs.readFileSync(pidFile,'utf8').trim());}catch{}
  if(Number.isSafeInteger(previous)&&previous>0){
    try{process.kill(previous,0);process.exit(0);}catch{}
  }
  fs.writeFileSync(pidFile,String(process.pid),{mode:0o600});
}
let scanning=false,failures=0;
function tick(){
  if(scanning)return;
  if(!fs.existsSync(project)||!fs.existsSync(path.join(project,'.agent-bridge','state.sqlite')))process.exit(0);
  if(!settings.read(projectId).memoryEnabled)process.exit(0);
  scanning=true;
  try{capture(project);failures=0;}
  catch(e){
    process.stderr.write('Memory monitor: '+e.message+'\n');
    if(++failures>=10)process.exit(1);
  }finally{scanning=false;}
}
tick();
setInterval(tick,interval);
process.on('exit',()=>{try{if(fs.readFileSync(pidFile,'utf8').trim()===String(process.pid))fs.unlinkSync(pidFile);}catch{}});
