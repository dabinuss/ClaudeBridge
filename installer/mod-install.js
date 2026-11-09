'use strict';
// Best-effort OFFICIAL Claude Code plugin installation. No file or binary
// patching, no proxy configuration, no certificates. Never launches Claude UI.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
function run(cli,args){
 const executable=Array.isArray(cli)?cli[0]:cli;
 const argv=Array.isArray(cli)?[...cli.slice(1),...args]:args;
 return spawnSync(executable,argv,{encoding:'utf8',timeout:45000,maxBuffer:262144,windowsHide:true,shell:false});
}
function availableCli({platform=process.platform,home=os.homedir(),env=process.env,execute=run,root=null}={}){
 // Desktop bundles Claude Code but often exposes no system 'claude' command.
 // Bundle the official CLI alongside the offline Windows MCP runtime so that
 // user-scoped plugin registration works without a global Node/Claude install.
 if(root){
  const node=path.join(root,'integrations','native-ui',platform==='win32'?'node.exe':'node');
  const manifestPath=path.join(root,'vendor','node_modules','@anthropic-ai','claude-code','package.json');
  if(fs.existsSync(node)&&fs.existsSync(manifestPath)){
   try{
    const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    const script=typeof manifest.bin==='string'?manifest.bin:manifest.bin?.claude;
    if(typeof script==='string'){
     const bin=path.join(path.dirname(manifestPath),script);
     if(fs.existsSync(bin)){
      // Modern Claude Code's npm bin is an actual native executable,
      // NOT a JavaScript script. Running it through Node produces
      // ERR_UNKNOWN_FILE_EXTENSION for .exe on Windows.
      const native=!['.js','.cjs','.mjs'].includes(path.extname(bin).toLowerCase());
      if(native&&fs.statSync(bin).size<1024*1024){
       process.stderr.write('Bundled Claude executable appears to be an uninstalled placeholder: '+bin+'\\n');
      }else{
       const candidate=native?bin:[node,bin];
       const result=execute(candidate,['--version']);
       if(result.status===0&&!result.error)return candidate;
       process.stderr.write('Bundled Claude CLI discovery failed: '+
        String(result.stderr||result.stdout||result.error?.message||'no response').slice(0,4000)+'\\n');
      }
     }else process.stderr.write('Bundled Claude CLI script is missing: '+bin+'\\n');
    }else process.stderr.write('Bundled Claude CLI package has no executable bin\\n');
   }catch(error){process.stderr.write('Bundled Claude CLI inspection failed: '+error.message+'\\n');}
  }else{
   process.stderr.write('Bundled Claude CLI not present: node='+fs.existsSync(node)+
    ', manifest='+fs.existsSync(manifestPath)+', root='+root+'\\n');
  }
 }
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
 if(!cli)return {installed:false,verified:false,uiRendered:false,reason:'Claude Code CLI unavailable; only MCP is installed. Activate ClaudeBridge using the Desktop Code tab plugin manager.'};
 const checked=execute(cli,['plugin','validate',source]);
 if(checked.error||checked.status!==0)
  return {installed:false,verified:false,uiRendered:false,
   reason:'ClaudeBridge Mod failed Claude Code plugin validation: '+String(checked.stderr||checked.stdout||checked.error?.message||'unknown').slice(-450)};
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
 const listing=execute(cli,['plugin','list','--json']);
 let verified=false;
 if(listing.status===0&&!listing.error){
  try{
   const parsed=JSON.parse(listing.stdout);
   // Do not confuse a successful CLI exit with a loaded Desktop render site.
   const installed=JSON.stringify(parsed);
   verified=installed.includes('claudebridge@claudebridge-local');
  }catch{}
 }
 return {installed:true,verified,uiRendered:false,
  reason:verified?'ClaudeBridge plugin registered. Open local Desktop Code and use /reload-plugins; a live UI render is still unverified.':'Plugin installation returned success, but Claude Code did not confirm it in plugin list. Check /plugin.'};
}
if(require.main===module){
 try{
  const root=process.argv[2];
  const result=install({root,cli:availableCli({root})});
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(e){process.stderr.write('ClaudeBridge Mod installer: '+e.message+'\n');process.exitCode=1;}
}
module.exports={availableCli,install};
