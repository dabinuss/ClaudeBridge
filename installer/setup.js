'use strict';
// Platform-neutral one-file installer backend. The wrapper unpacks the bundled payload,
// then invokes this script using the included Node runtime.
// Uses Claude Desktop's documented user MCP config rather than private extension internals.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const home=os.homedir();
const platform=process.platform;
const testHome=process.env.CLAUDEBRIDGE_SETUP_TEST_HOME||'';
const stateRoot=testHome?path.resolve(testHome):platform==='win32'?
  path.join(process.env.LOCALAPPDATA||path.join(home,'AppData','Local'),'ClaudeBridge'):
  platform==='darwin'?path.join(home,'Library','Application Support','ClaudeBridge'):
  path.join(home,'.local','share','claudebridge');
const installPath=path.join(stateRoot,'Installed');
const marker=path.join(installPath,'installer-owned.json');
const configPath=testHome?path.join(testHome,'Claude','claude_desktop_config.json'):
  platform==='win32'?path.join(process.env.APPDATA||path.join(home,'AppData','Roaming'),'Claude','claude_desktop_config.json'):
  platform==='darwin'?path.join(home,'Library','Application Support','Claude','claude_desktop_config.json'):
  path.join(home,'.config','Claude','claude_desktop_config.json');
const SERVER_KEY='claudebridge';
const payloadFiles=['manifest.json','server','vendor','ui','integrations'];
const log=(...args)=>process.stdout.write(args.join(' ')+'\n');
const isLink=p=>{try{return fs.lstatSync(p).isSymbolicLink();}catch(e){if(e.code==='ENOENT')return false;throw e;}};
function assertSafe(p){if(isLink(p))throw Error('Refusing symlink path: '+p);}
function mkdir(p){assertSafe(p);fs.mkdirSync(p,{recursive:true,mode:0o700});}
function cleanFile(p){try{return fs.readFileSync(p,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function jsonFile(p){
 const s=cleanFile(p);
 if(s===null)return {};
 let value;try{value=JSON.parse(s);}catch(e){throw Error('Claude Desktop configuration is invalid JSON; will not modify it: '+p);}
 if(!value||Array.isArray(value)||typeof value!=='object')throw Error('Invalid Claude Desktop configuration shape');
 return value;
}
function writeAtomic(p,s){
 mkdir(path.dirname(p));assertSafe(p);
 const temp=p+'.'+process.pid+'.tmp';
 try{
  fs.writeFileSync(temp,s,{mode:0o600});
  fs.renameSync(temp,p);
 }catch(e){try{fs.rmSync(temp,{force:true});}catch{}throw e;}
}
function ensureOwnership(){
 if(!fs.existsSync(installPath))return;
 assertSafe(installPath);
 const data=cleanFile(marker);
 if(!data)throw Error('Existing installation directory is not owned by ClaudeBridge: '+installPath);
 try{if(JSON.parse(data).owner!=='claudebridge-standalone-v1')throw Error('Wrong owner');}
 catch{throw Error('Installation ownership marker invalid: '+installPath);}
}
function nodeExecutable(){
 const names=platform==='win32'?['integrations/native-ui/node.exe','node.exe']:['integrations/native-ui/node','node'];
 for(const n of names){
  const p=path.join(installPath,n);
  if(fs.existsSync(p))return p;
 }
 throw Error('Bundled Node runtime not found');
}
function packageNode(){
 const names=platform==='win32'?['integrations/native-ui/node.exe']:['integrations/native-ui/node'];
 const p=path.join(root,names[0]);
 if(!fs.existsSync(p))throw Error('The setup package does not contain a platform-matched Node runtime');
 return p;
}
function containsPayload(){
 for(const relative of payloadFiles)if(!fs.existsSync(path.join(root,relative)))throw Error('Missing payload: '+relative);
 packageNode();
}
function sameRegistration(entry){
 if(!entry||typeof entry!=='object')return false;
 const args=entry.args;
 return Array.isArray(args)&&args.length===1&&typeof args[0]==='string'&&
   path.resolve(args[0])===path.resolve(path.join(installPath,'server','v2.js'))&&
   entry.command===nodeExecutable();
}
function configure(action,allowAbsent=false){
 const data=jsonFile(configPath);
 if(data.mcpServers!==undefined&&(!data.mcpServers||typeof data.mcpServers!=='object'||Array.isArray(data.mcpServers)))
  throw Error('Invalid mcpServers object in Claude config');
 const servers=data.mcpServers||{};
 const prior=servers[SERVER_KEY];
 if(action==='install'){
  if(prior&&!sameRegistration(prior))throw Error('Claude already has a different '+SERVER_KEY+' MCP entry. Uninstall that one first.');
  servers[SERVER_KEY]={command:nodeExecutable(),args:[path.join(installPath,'server','v2.js')]};
  data.mcpServers=servers;
 }else if(prior){
  if(!sameRegistration(prior))throw Error('ClaudeBridge entry is not ours; refusing to remove a different MCP server.');
  delete servers[SERVER_KEY];
  data.mcpServers=servers;
 }else if(allowAbsent)return false;
 else return false;
 const priorRaw=cleanFile(configPath);
 if(priorRaw!==null){
  const backup=configPath+'.claudebridge-backup';
  if(!fs.existsSync(backup)){
   assertSafe(backup);
   fs.copyFileSync(configPath,backup);
  }
 }
 writeAtomic(configPath,JSON.stringify(data,null,2)+'\n');
 return true;
}
function native(action){
 if(process.env.CLAUDEBRIDGE_SETUP_SKIP_NATIVE==='1')return {skipped:true,reason:'native step deliberately disabled for tests'};
 if(platform==='win32'){
  const script=path.join(installPath,'integrations','native-ui','install.ps1');
  const r=spawnSync('powershell.exe',[
   '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,
   '-Action',action==='install'?'install':'remove','-ExtensionRoot',installPath
  ],{encoding:'utf8',timeout:45000,windowsHide:true,maxBuffer:262144,shell:false});
  if(r.status!==0)throw Error('Windows native integration failed: '+String(r.stderr||r.error?.message).slice(0,700));
  return JSON.parse(r.stdout.trim());
 }
 const setup=require(path.join(installPath,'integrations','native-ui','setup-unix.js'));
 return action==='install'?setup.install(installPath):setup.remove();
}
function copyItem(src,dst){
 const st=fs.lstatSync(src);
 if(st.isSymbolicLink())return; // npm-generated .bin links are not required by the direct Codex launcher.
 if(st.isDirectory()){
  mkdir(dst);
  for(const child of fs.readdirSync(src))copyItem(path.join(src,child),path.join(dst,child));
 }else if(st.isFile()){
  mkdir(path.dirname(dst));assertSafe(dst);
  fs.copyFileSync(src,dst);
  fs.chmodSync(dst,(st.mode & 0o111)?0o700:0o600);
 }else throw Error('Unexpected payload object: '+src);
}
function install(){
 containsPayload();ensureOwnership();
 if(fs.existsSync(installPath)){
  // Reinstall in place so Claude's MCP entry keeps the same path.
  // Full cold replacement is performed only when Claude is not running.
  const own=jsonFile(marker);
  if(own.owner!=='claudebridge-standalone-v1')throw Error('Ownership invalid');
 }
 mkdir(installPath);
 for(const file of payloadFiles)copyItem(path.join(root,file),path.join(installPath,file));
 const backup=configPath+'.claudebridge-backup';
 const existingOwner=cleanFile(marker);
 const previouslyOwned=existingOwner?JSON.parse(existingOwner).backupCreated===true:false;
 const backupExisted=fs.existsSync(backup);
 writeAtomic(marker,JSON.stringify({owner:'claudebridge-standalone-v1',version:'2.5.0',installedAt:new Date().toISOString(),backupCreated:previouslyOwned})+'\n');
 configure('install');
 if(!backupExisted&&fs.existsSync(backup))
  writeAtomic(marker,JSON.stringify({owner:'claudebridge-standalone-v1',version:'2.5.0',installedAt:new Date().toISOString(),backupCreated:true})+'\n');
 let nativeResult={};
 try{nativeResult=native('install');}
 catch(e){nativeResult={installed:false,error:e.message};}
 log(JSON.stringify({ok:true,mcp:true,native:nativeResult,config:configPath,
  message:'ClaudeBridge MCP registered. Quit Claude completely and relaunch using ClaudeBridge Claude if the native launcher was installed. Log into Codex once.'}));
}
function uninstall(){
 if(!fs.existsSync(installPath)){
  // No owned install: leave all other Claude configuration untouched.
  log(JSON.stringify({ok:true,installed:false,message:'No standalone ClaudeBridge installation found.'}));return;
 }
 ensureOwnership();
 let nativeResult;
 try{nativeResult=native('remove');}
 catch(e){nativeResult={error:e.message};}
 const oldMarker=JSON.parse(fs.readFileSync(marker,'utf8'));
 const changed=configure('remove',true);
 if(oldMarker.backupCreated===true){
  const backup=configPath+'.claudebridge-backup';
  if(fs.existsSync(backup)&&!isLink(backup))fs.rmSync(backup,{force:true});
 }
 let residual=null;
 try{fs.rmSync(installPath,{recursive:true,force:true,maxRetries:3,retryDelay:200});}
 catch(e){residual=installPath+' ('+e.message+')';}
 log(JSON.stringify({ok:!residual,mcpRemoved:changed,native:nativeResult,
  residual,projectMemoryPreserved:true,
  message:residual?'Close all ClaudeBridge processes and run uninstall again.':'ClaudeBridge MCP and native launcher removed; user plans and project source preserved.'}));
 if(residual)process.exitCode=2;
}
function status(){
 const current=fs.existsSync(installPath)&&fs.existsSync(marker);
 const cfg=jsonFile(configPath),registered=cfg.mcpServers?.[SERVER_KEY];
 log(JSON.stringify({installed:current,mcpRegistered:Boolean(registered),
  mcpOwned:current&&sameRegistration(registered),
  installPath,configPath}));
}
function main(){
 const action=process.argv[2]||'install';
 if(action==='install')return install();
 if(action==='uninstall')return uninstall();
 if(action==='status')return status();
 throw Error('Usage: installer.js install | uninstall | status');
}
if(require.main===module){try{main();}catch(e){process.stderr.write('ClaudeBridge Setup: '+e.message+'\n');process.exitCode=1;}}
module.exports={install,uninstall,status,configPath,installPath};
