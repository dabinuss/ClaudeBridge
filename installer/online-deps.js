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
  prepare();
  const script=path.join(root,'installer','setup.js');
  const r=run([script,'install']);
  process.stdout.write(r.stdout);
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
