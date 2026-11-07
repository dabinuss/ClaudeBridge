'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {capture}=require('./memory');
const project=process.argv[2], interval=process.env.BRIDGE_SCAN_INTERVAL_MS ? Number(process.env.BRIDGE_SCAN_INTERVAL_MS):30000;
if(!project||!fs.existsSync(project))process.exit(2);
const pidFile=path.join(project,'.agent-bridge','memory-monitor.pid');
fs.mkdirSync(path.dirname(pidFile),{recursive:true});
fs.writeFileSync(pidFile,String(process.pid),{mode:0o600});
let scanning=false, idle=0;
function tick(){
  if(scanning)return;
  if(!fs.existsSync(project)||!fs.existsSync(path.join(project,'.agent-bridge','state.sqlite')))process.exit(0);
  scanning=true;
  try{capture(project);idle=0;}catch(e){process.stderr.write('Memory monitor: '+e.message+'\n');if(++idle>=20)process.exit(1);}
  finally{scanning=false;}
}
tick();
setInterval(tick,Math.min(Math.max(interval,10000),300000));
process.on('exit',()=>{try{if(fs.readFileSync(pidFile,'utf8').trim()===String(process.pid))fs.unlinkSync(pidFile);}catch{}});
