'use strict';
// Best-effort OFFICIAL Claude Code plugin installation. No file or binary
// patching, no proxy configuration, no certificates. Never launches Claude UI.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
function run(cli,args){
 return spawnSync(cli,args,{encoding:'utf8',timeout:45000,maxBuffer:65536,windowsHide:true,shell:false});
}
function availableCli({platform=process.platform,home=os.homedir(),env=process.env,execute=run}={}){
 const candidates=[];
 if(env.CLAUDEBRIDGE_CLAUDE_CLI)candidates.push(env.CLAUDEBRIDGE_CLAUDE_CLI);
 candidates.push(platform==='win32'?path.join(home,'.local','bin','claude.exe'):path.join(home,'.local','bin','claude'));
 candidates.push('claude');
 for(const candidate of candidates){
  if((path.isAbsolute(candidate)&&!fs.existsSync(candidate)))continue;
  const r=execute(candidate,['--version']);
  if(!r.error&&r.status===0)return candidate;
 }
 return null;
}
function install({root,cli,execute=run}){
 if(!root||!path.isAbsolute(root))throw Error('Absolute ClaudeBridge install path required');
 const source=path.join(root,'claude-plugin');
 const manifest=path.join(source,'.claude-plugin','marketplace.json');
 if(!fs.existsSync(manifest))throw Error('ClaudeBridge Mod marketplace is missing');
 if(!cli)return {installed:false,reason:'Claude Code CLI unavailable. Load the bundled plugin using Claude Code plugin manager.'};
 const add=execute(cli,['plugin','marketplace','add',source]);
 if(add.error||add.status!==0){
  const message=String(add.stderr||add.stdout||add.error?.message||'').toLowerCase();
  if(!message.includes('already')&&!message.includes('exist'))
   return {installed:false,reason:'Could not register local marketplace: '+message.slice(-250)};
 }
 const result=execute(cli,['plugin','install','claudebridge@claudebridge-local','--scope','user']);
 if(result.error||result.status!==0){
  const message=String(result.stderr||result.stdout||result.error?.message||'');
  if(!/already installed/i.test(message))
   return {installed:false,reason:'Claude Code Mod activation failed: '+message.slice(-300)};
 }
 return {installed:true,reason:'ClaudeBridge Mod installed as a user-scoped Claude Code plugin; reload local Code sessions'};
}
if(require.main===module){
 try{
  const root=process.argv[2];
  const result=install({root,cli:availableCli()});
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(e){process.stderr.write('ClaudeBridge Mod installer: '+e.message+'\n');process.exitCode=1;}
}
module.exports={availableCli,install};
