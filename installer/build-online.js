'use strict';
// Assemble tiny online setup launchers from the same compiled core as the MCPB.
// Core SHA-256 is embedded in each bootstrap script (integrity not just TLS).
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'cb-online-core-'));
try{
 const r=spawnSync('unzip',['-q',path.join(root,'ClaudeBridge-Linux.mcpb'),'-d',work],{encoding:'utf8',timeout:45000});
 if(r.status!==0)throw Error('Could not unpack compiled MCPB core: '+r.stderr);
 for(const relative of ['integrations/native-ui/node','integrations/native-ui/node.exe','vendor']){
  fs.rmSync(path.join(work,relative),{force:true,recursive:true});
 }
 // Keep only source + compiled MCP Apps UI; never package Codex or Node in the tiny core.
 const included=['manifest.json','server','ui','integrations','installer','maintenance'];
 for(const p of included)if(!fs.existsSync(path.join(work,p)))throw Error('Missing compiled core component '+p);
 const required=[
  'server/v2.js','server/db.js','server/worker.js','server/watchdog.js',
  'server/agent-mcp.js','server/memory.js','server/memory-monitor.js',
  'server/plans.js','server/settings.js','server/process-tree.js','server/app-ui.js',
  'ui/control-panel.html','ui/control-panel.bundle.js',
  'integrations/native-ui/companion.js','integrations/native-ui/cdp.js',
  'integrations/native-ui/renderer.js','integrations/native-ui/setup-unix.js',
  'integrations/native-ui/install.ps1','integrations/native-ui/launcher.vbs',
  'installer/setup.js','installer/online-deps.js'
 ];
 for(const relative of required){
  const file=path.join(work,relative);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()||fs.statSync(file).size===0)
   throw Error('Compiled ClaudeBridge application core is incomplete: '+relative);
 }
 // Check executable MCP entry points and the real bundled in-chat settings UI,
 // not just the existence of their parent directories.
 const appUI=fs.readFileSync(path.join(work,'ui/control-panel.bundle.js'),'utf8');
 if(!appUI.includes('ClaudeBridge'))throw Error('Compiled MCP settings UI missing');
 const server=fs.readFileSync(path.join(work,'server/v2.js'),'utf8');
 if(!server.includes('bridge_native_picker')||!server.includes('bridge_delegate'))
  throw Error('Required MCP tools missing from the application core');
 const core=path.join(root,'ClaudeBridge-Online-Core.tar.gz');
 const t=spawnSync('tar',['-czf',core,...included],{cwd:work,encoding:'utf8',timeout:45000});
 if(t.status!==0)throw Error('Core packaging failed: '+t.stderr);
 const digest=crypto.createHash('sha256').update(fs.readFileSync(core)).digest('hex');
 const templates=[
  ['online-unix.sh','ClaudeBridge-WebSetup-macOS.command'],
  ['online-unix.sh','ClaudeBridge-WebSetup-Linux.run'],
  ['online-windows.cmd','ClaudeBridge-WebSetup-Windows.cmd']
 ];
 for(const [input,output] of templates){
  const template=fs.readFileSync(path.join(root,'installer',input),'utf8');
  if(!template.includes('__CORE_SHA256__'))throw Error('Missing checksum placeholder '+input);
  const destination=path.join(root,output);
  fs.writeFileSync(destination,template.replaceAll('__CORE_SHA256__',digest),{mode:0o755});
  if(output.endsWith('.run')||output.endsWith('.command'))fs.chmodSync(destination,0o755);
  console.log(output+': '+fs.statSync(destination).size+' bytes');
 }
 console.log('ClaudeBridge core: '+fs.statSync(core).size+' bytes SHA-256 '+digest);
}catch(e){process.stderr.write(e.stack+'\n');process.exitCode=1;}
finally{fs.rmSync(work,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
