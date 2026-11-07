'use strict';
// Explicit, user-scoped ClaudeBridge cleanup for macOS and Linux.
// This never removes Claude Desktop, the MCPB managed by Claude, source projects, or ~/.codex.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const native=require('../integrations/native-ui/setup-unix');
const home=os.homedir();
const bridgeHome=process.env.CLAUDEBRIDGE_CLEANUP_TEST_HOME||path.join(home,'.claudebridge');
function isRealDir(p){try{const s=fs.lstatSync(p);return s.isDirectory()&&!s.isSymbolicLink();}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function inspect(){
 const registry=path.join(bridgeHome,'projects.json');
 const projects=[],notes=[];
 if(fs.existsSync(registry)){
  try {
   const data=JSON.parse(fs.readFileSync(registry,'utf8'));
   for(const [id,entry] of Object.entries(data.projects||{})){
    const source=String(entry?.path||'');
    if(!path.isAbsolute(source)||!isRealDir(source)){notes.push('Skipping invalid/unavailable project '+id);continue;}
    const state=path.join(source,'.agent-bridge');
    if(isRealDir(state)){
     const sqlite=path.join(state,'state.sqlite');
     const ignore=path.join(state,'.gitignore');
     if(fs.existsSync(sqlite)&&fs.existsSync(ignore))projects.push(state);
     else notes.push('Skipping unrecognized project folder '+state);
    }else if(fs.existsSync(state))notes.push('Skipping symlinked or non-directory state '+state);
   }
  }catch(e){notes.push('Project registry unreadable: '+e.message);}
 }
 return {bridgeHome:isRealDir(bridgeHome)?bridgeHome:null,projects:[...new Set(projects)],
  native:native.status(),notes};
}
function clean({audit=true,purgeState=false,purgeProjectMemory=false}={}){
 if(!['darwin','linux'].includes(process.platform))throw Error('Unix cleanup supports only macOS and Linux');
 const report=inspect();report.auditOnly=audit;report.deleted=[];report.remaining=[];
 if(audit)return report;
 try{
  const old=report.native;
  const removed=native.remove();
  if(old.installed&&!removed.pendingCleanup)report.deleted.push(old.directory,old.shortcut);
  if(removed.pendingCleanup&&removed.remainingDirectory)report.remaining.push(removed.remainingDirectory);
 }catch(e){report.remaining.push('Native launcher: '+e.message);}
 if(purgeProjectMemory){
  for(const p of report.projects){
   try{
    if(!isRealDir(p))throw Error('Refusing symlink');
    fs.rmSync(p,{recursive:true,force:true});
    report.deleted.push(p);
   }catch(e){report.remaining.push(p+' ('+e.message+')');}
  }
 }
 if(purgeState&&report.bridgeHome){
  try{
   if(!isRealDir(bridgeHome))throw Error('Refusing symlink');
   fs.rmSync(bridgeHome,{recursive:true,force:true});
   report.deleted.push(bridgeHome);
  }catch(e){report.remaining.push(bridgeHome+' ('+e.message+')');}
 }
 if(purgeState&&!purgeProjectMemory)
  report.notes.push('Project memory retained. Removing the registry loses the automatic inventory of those locations.');
 report.notes.push('Remove the MCPB separately in Claude Desktop > Settings > Extensions.');
 report.notes.push('Global Codex login, backups and other applications are never deleted.');
 return report;
}
if(require.main===module){
 const args=new Set(process.argv.slice(2));
 const audit=args.has('--audit')||!args.has('--yes');
 if(!audit&&!args.has('--yes'))throw Error('Explicit --yes required');
 const report=clean({audit,purgeState:args.has('--purge-state'),purgeProjectMemory:args.has('--purge-project-memory')});
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
module.exports={inspect,clean};
