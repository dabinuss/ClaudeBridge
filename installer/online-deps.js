'use strict';
/**
 * Online setup stage. Invoked ONLY after the bootstrap has verified and
 * unpacked a platform-matched Node.js distribution and a SHA256-pinned core.
 * No privileged/global packages, no install scripts, no unverified shell pipes.
 */
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const action=process.argv[2]||'install';
const npmCli=process.env.CLAUDEBRIDGE_NPM_CLI;
const version='0.167.0';
function run(args){
 const r=spawnSync(process.execPath,args,{cwd:root,env:{
  ...process.env,npm_config_audit:'false',npm_config_fund:'false',
  npm_config_ignore_scripts:'true',npm_config_update_notifier:'false'
 },encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024,windowsHide:true,shell:false});
 if(r.error||r.status!==0)throw Error('Dependency installation failed: '+String(r.stderr||r.error?.message||'').slice(-1800));
 return r;
}
function prepare(){
 if(!npmCli||!fs.existsSync(npmCli))throw Error('Verified Node distribution must include npm CLI');
 const node=path.join(root,'integrations','native-ui',process.platform==='win32'?'node.exe':'node');
 fs.mkdirSync(path.dirname(node),{recursive:true});
 fs.copyFileSync(process.execPath,node);
 if(process.platform!=='win32')fs.chmodSync(node,0o700);
 const vendor=path.join(root,'vendor');
 fs.mkdirSync(vendor,{recursive:true});
 run([npmCli,'install','--prefix',vendor,'--no-save','--no-audit','--no-fund','--ignore-scripts',
    '--registry=https://registry.npmjs.org','@openai/codex@'+version]);
 const codex=path.join(vendor,'node_modules','@openai','codex','bin','codex.js');
 if(!fs.existsSync(codex))throw Error('Codex package installation is incomplete');
 // npm integrity and HTTPS are checked by npm; verify the unpacked CLI is the expected version.
 const verify=spawnSync(process.execPath,[codex,'--version'],{encoding:'utf8',timeout:10000,windowsHide:true});
 if(verify.status!==0||!String(verify.stdout).includes(version))
  throw Error('Installed Codex CLI did not pass version verification');
}
function main(){
 if(action==='install'){
  // Retire old proxy BEFORE npm replaces the old vendor tree. The old
  // Ripple disable implementation still requires node-forge to load.
  if(!process.env.CLAUDEBRIDGE_SETUP_TEST_HOME){
   const installed=process.platform==='win32'?
    path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'ClaudeBridge','Installed'):
    process.platform==='darwin'?
      path.join(os.homedir(),'Library','Application Support','ClaudeBridge','Installed'):
      path.join(os.homedir(),'.local','share','claudebridge','Installed');
   const legacyMarker=path.join(os.homedir(),'.claudebridge','ripple-lite','enabled.json');
   if(fs.existsSync(legacyMarker)){
    const oldNode=path.join(installed,'integrations','native-ui',process.platform==='win32'?'node.exe':'node');
    const disable=path.join(installed,'integrations','ripple-lite','activate.js');
    if(!fs.existsSync(oldNode)||!fs.existsSync(disable))
     throw Error('Old Ripple-lite ownership marker exists but its installer was not found; refusing to remove trust blindly');
    const cleanup=spawnSync(oldNode,[disable,'disable',installed],
     {encoding:'utf8',timeout:60000,windowsHide:true,shell:false});
    if(cleanup.status!==0||cleanup.error)throw Error('Previous Ripple-lite cleanup failed: '+
     String(cleanup.stderr||cleanup.error?.message||'unknown failure').slice(-800));
    process.stdout.write('Previous Ripple-lite proxy disabled and Claude settings restored.\\n');
   }
  }
  prepare();
  const script=path.join(root,'installer','setup.js');
  const r=run([script,'install']);
  process.stdout.write(r.stdout);
  // Claude Code Mods use the documented plugin UI. No local HTTPS proxy,
  // certificate trust, egressProxyUrl or daemon is enabled on fresh installs.
  process.stdout.write('ClaudeBridge installed without HTTPS proxy or certificate trust.\n');
  if(!process.env.CLAUDEBRIDGE_SETUP_TEST_HOME){
   const installed=process.platform==='win32'?
    path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'ClaudeBridge','Installed'):
    process.platform==='darwin'?
      path.join(os.homedir(),'Library','Application Support','ClaudeBridge','Installed'):
      path.join(os.homedir(),'.local','share','claudebridge','Installed');
   const modInstaller=path.join(installed,'installer','mod-install.js');
   const modResult=spawnSync(process.execPath,[modInstaller,installed],
    {encoding:'utf8',timeout:120000,windowsHide:true,shell:false});
   if(modResult.status===0)process.stdout.write(modResult.stdout);
   else process.stderr.write('ClaudeBridge Mod optional activation: '+
     String(modResult.stderr||modResult.error?.message||'unavailable').slice(-500)+'\n');
  }
  return;
 }
 if(action==='uninstall'||action==='status'){
  const script=path.join(root,'installer','setup.js');
  const r=run([script,action,...process.argv.slice(3)]);
  process.stdout.write(r.stdout);
  return;
 }
 throw Error('Unknown online setup action');
}
try{main();}catch(error){process.stderr.write('ClaudeBridge online setup: '+error.message+'\n');process.exitCode=1;}
