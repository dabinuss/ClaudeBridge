'use strict';
// User-scoped, reversible native Claude picker installation for macOS/Linux.
// Does not patch Claude.app, desktop files belonging to Claude, the network stack or MCP settings.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');

const platform=process.platform;
const home=os.homedir();
const root=process.env.CLAUDEBRIDGE_NATIVE_TEST_ROOT?path.resolve(process.env.CLAUDEBRIDGE_NATIVE_TEST_ROOT):home;
const test=Boolean(process.env.CLAUDEBRIDGE_NATIVE_TEST_ROOT);
const base=path.join(root,platform==='darwin'?'Library/Application Support/ClaudeBridge/NativePicker':'.local/share/claudebridge/native-picker');
const tag='claudebridge-native-picker-v1';
const ownFile=path.join(base,'owner.json');
const app=path.join(root,'Applications','ClaudeBridge Claude.app');
const desktop=path.join(root,'.local/share/applications/claudebridge-claude.desktop');
const desktopIcon=path.join(root,'Desktop','claudebridge-claude.desktop');
const mk=(p)=>fs.mkdirSync(p,{recursive:true,mode:0o700});
const shellQuote=(value)=>"'"+String(value).replaceAll("'","'\\''")+"'";
function regular(p){try{const st=fs.lstatSync(p);return st.isFile()&&!st.isSymbolicLink();}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function pathSafe(p){try{const st=fs.lstatSync(p);return !st.isSymbolicLink();}catch(e){if(e.code==='ENOENT')return true;throw e;}}
function validatePlatform(){if(!['darwin','linux'].includes(platform))throw Error('Unix native picker supports macOS and Linux only');}
function owner(){
 if(!regular(ownFile))return null;
 try{const x=JSON.parse(fs.readFileSync(ownFile,'utf8'));return x.tag===tag?x:null;}catch{return null;}
}
function ownLauncher(){
 if(platform==='darwin'){
  const marker=path.join(app,'Contents','Resources','claudebridge-owned.txt');
  return regular(marker)&&fs.readFileSync(marker,'utf8').trim()===tag;
 }
 return regular(desktop)&&fs.readFileSync(desktop,'utf8').includes('X-ClaudeBridge-Owned='+tag);
}
function status(){
 validatePlatform();
 const owned=Boolean(owner()),launcher=ownLauncher();
 return {supported:true,installed:owned&&launcher,owned,launcher,
  directory:base,shortcut:platform==='darwin'?app:desktop,
  requiresRestart:true,
  note:'Fully quit Claude Desktop, then launch through ClaudeBridge Claude. The original launcher remains unchanged.'};
}
function detectClaude(){
 const supplied=process.env.CLAUDEBRIDGE_CLAUDE_EXECUTABLE;
 if(supplied){
  if(!path.isAbsolute(supplied)||!regular(supplied))throw Error('Specified Claude executable must be an existing absolute file');
  return fs.realpathSync(supplied);
 }
 const choices=platform==='darwin'?[
  '/Applications/Claude.app/Contents/MacOS/Claude',
  path.join(home,'Applications/Claude.app/Contents/MacOS/Claude')
 ]:[
  '/opt/Claude/claude','/opt/claude/claude',
  '/usr/bin/claude-desktop','/usr/local/bin/claude-desktop',
  path.join(home,'.local/bin/claude-desktop'),
  path.join(home,'Applications/Claude.AppImage')
 ];
 for(const p of choices)if(regular(p))return fs.realpathSync(p);
 if(platform==='linux'){
  const cli=spawnSync('which',['claude-desktop'],{encoding:'utf8',timeout:3000});
  if(cli.status===0&&regular(cli.stdout.trim()))return fs.realpathSync(cli.stdout.trim());
 }
 throw Error('Claude Desktop executable not found. Supply CLAUDEBRIDGE_CLAUDE_EXECUTABLE=/absolute/path/to/Claude');
}
function install(extensionRoot){
 validatePlatform();
 if(!path.isAbsolute(extensionRoot)||!fs.existsSync(extensionRoot))throw Error('A valid absolute extension directory is required');
 if((fs.existsSync(base)&&!owner())||(fs.existsSync(platform==='darwin'?app:desktop)&&!ownLauncher())||(platform==='linux'&&fs.existsSync(desktopIcon)&&!regular(desktopIcon)))
  throw Error('Existing installation path is not owned by ClaudeBridge; refusing overwrite');
 for(const p of [base,path.dirname(base)])if(!pathSafe(p))throw Error('Refusing symlinked installation directory');
 const source=path.join(extensionRoot,'integrations','native-ui');
 const node=path.join(source,'node');
 const copies=new Map([
  ['companion.js',path.join(source,'companion.js')],
  ['cdp.js',path.join(source,'cdp.js')],
  ['renderer.js',path.join(source,'renderer.js')],
  ['settings.js',path.join(extensionRoot,'server','settings.js')],
  ['node',node]
 ]);
 for(const p of copies.values())if(!regular(p))throw Error('Installer component missing: '+path.basename(p));
 const claudeExe=detectClaude();
 mk(base);
 for(const [name,src] of copies){
  const dst=path.join(base,name);
  if(!pathSafe(dst))throw Error('Refusing symlinked installation component '+name);
  fs.copyFileSync(src,dst);
  fs.chmodSync(dst,name==='node'?0o700:0o600);
 }
 const cfg={claudeExe,extensionRoot,tag};
 fs.writeFileSync(path.join(base,'native-ui.json'),JSON.stringify(cfg,null,2)+'\n',{mode:0o600});
 fs.writeFileSync(ownFile,JSON.stringify({tag,created:new Date().toISOString()}),{mode:0o600});
 if(platform==='darwin'){
  const contents=path.join(app,'Contents');
  const execDir=path.join(contents,'MacOS');
  const resources=path.join(contents,'Resources');
  if(fs.existsSync(app)&&!ownLauncher())throw Error('Refusing to replace an unrelated macOS application');
  mk(execDir);mk(resources);
  const executable=path.join(execDir,'ClaudeBridge');
  fs.writeFileSync(executable,'#!/bin/sh\nexec '+shellQuote(path.join(base,'node'))+' '+shellQuote(path.join(base,'companion.js'))+'\n',{mode:0o700});
  fs.chmodSync(executable,0o700);
  fs.writeFileSync(path.join(resources,'claudebridge-owned.txt'),tag+'\n',{mode:0o600});
  fs.writeFileSync(path.join(contents,'Info.plist'),[
   '<?xml version="1.0" encoding="UTF-8"?>',
   '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
   '<plist version="1.0"><dict>',
   '<key>CFBundleIdentifier</key><string>dev.claudebridge.launcher</string>',
   '<key>CFBundleName</key><string>ClaudeBridge Claude</string>',
   '<key>CFBundleDisplayName</key><string>ClaudeBridge Claude</string>',
   '<key>CFBundleExecutable</key><string>ClaudeBridge</string>',
   '<key>CFBundlePackageType</key><string>APPL</string>',
   '<key>CFBundleVersion</key><string>1</string>',
   '<key>CFBundleShortVersionString</key><string>2.4.0</string>',
   '</dict></plist>'
  ].join('\n')+'\n',{mode:0o600});
 }else{
  mk(path.dirname(desktop));
  const shell=path.join(base,'launch.sh');
  const script='#!/bin/sh\nexec '+shellQuote(path.join(base,'node'))+' '+shellQuote(path.join(base,'companion.js'))+'\n';
  fs.writeFileSync(shell,script,{mode:0o700});fs.chmodSync(shell,0o700);
  const entry=['[Desktop Entry]','Version=1.0','Type=Application','Name=ClaudeBridge Claude',
   'Comment=Claude Desktop with ClaudeBridge model menu','Exec="'+shell.replaceAll('"','\\"')+'"',
   'Terminal=false','Categories=Development;','X-ClaudeBridge-Owned='+tag].join('\n')+'\n';
  fs.writeFileSync(desktop,entry,{mode:0o600});fs.chmodSync(desktop,0o755);
  if(fs.existsSync(path.dirname(desktopIcon))&&pathSafe(desktopIcon)&&(!fs.existsSync(desktopIcon)||(regular(desktopIcon)&&fs.readFileSync(desktopIcon,'utf8').includes('X-ClaudeBridge-Owned='+tag)))){
   fs.writeFileSync(desktopIcon,entry,{mode:0o600});fs.chmodSync(desktopIcon,0o755);
  }
 }
 return {...status(),message:'Native picker installed. Fully quit Claude and launch using the ClaudeBridge Claude shortcut.'};
}
function remove(){
 validatePlatform();
 if(platform==='darwin'){
  if(ownLauncher())fs.rmSync(app,{recursive:true,force:true});
 }else{
  if(ownLauncher())fs.rmSync(desktop,{force:true});
  if(regular(desktopIcon)&&fs.readFileSync(desktopIcon,'utf8').includes('X-ClaudeBridge-Owned='+tag))
   fs.rmSync(desktopIcon,{force:true});
 }
 let pendingCleanup=false;
 if(owner()){
  try{fs.rmSync(base,{recursive:true,force:true});}catch{pendingCleanup=true;}
 }
 if(!pendingCleanup&&!fs.existsSync(base)){
  const parent=path.dirname(base);
  try{if(fs.readdirSync(parent).length===0)fs.rmdirSync(parent);}catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTEMPTY'&&e.code!=='EACCES')process.stderr.write('Launcher directory cleanup: '+e.message+'\n');}
 }
 return {...status(),installed:false,pendingCleanup,
  remainingDirectory:fs.existsSync(base)?base:null,
  message:pendingCleanup?'Quit the enhanced Claude launcher and run removal again. Companion files remain locked.':'Native controls removed. Claude Desktop and MCP were not altered.'};
}
function cli(){
 const action=process.argv[2]||'status',extensionRoot=process.argv[3];
 const output=action==='status'?status():action==='install'?install(extensionRoot):action==='remove'?remove():null;
 if(!output)throw Error('Usage: setup.js install <absolute-extension-root> | remove | status');
 process.stdout.write(JSON.stringify(output)+'\n');
}
if(require.main===module){
 try{cli();}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}
}
module.exports={status,install,remove,detectClaude};
