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
 const label=process.platform==='win32'?'Windows':process.platform==='darwin'?'macOS':'Linux';
 const r=spawnSync('unzip',['-q',path.join(root,'ClaudeBridge-'+label+'.mcpb'),'-d',work],{encoding:'utf8',timeout:45000});
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
 const archive=fs.readFileSync(core);
 const digest=crypto.createHash('sha256').update(archive).digest('hex');
 const unixTemplate=fs.readFileSync(path.join(root,'installer','online-unix.sh'),'utf8');
 if(!unixTemplate.endsWith('\n')||!unixTemplate.includes('__PAYLOAD_LINE__'))
  throw Error('Unix installer template must end in a newline and expose its payload offset');
 const payloadLine=unixTemplate.split('\n').length;
 const unixScript=unixTemplate.replace('__PAYLOAD_LINE__',String(payloadLine));
 for(const [label,extension] of [['macOS','.command'],['Linux','.run']]){
  const output=path.join(root,'ClaudeBridge-Setup-'+label+extension);
  // POSIX shell header and full compressed Bridge content share a single file.
  fs.writeFileSync(output,Buffer.concat([Buffer.from(unixScript,'utf8'),archive]),{mode:0o755});
  fs.chmodSync(output,0o755);
  console.log(path.basename(output)+': '+fs.statSync(output).size+' bytes');
 }
 const winTemplate=fs.readFileSync(path.join(root,'installer','online-windows.cmd'),'utf8');
 if(!winTemplate.includes('# CLAUDEBRIDGE POWERSHELL START'))
  throw Error('Windows embedded installer is missing the PowerShell delimiter');
 const windowsFile=path.join(root,'ClaudeBridge-Setup-Windows.cmd');
 // Embed the same complete core as base64. The extracted bytes are never downloaded.
 const base64=archive.toString('base64').match(/.{1,76}/g).join('\r\n');
 fs.writeFileSync(windowsFile,winTemplate.trimEnd()+'\r\n# CLAUDEBRIDGE CORE PAYLOAD\r\n'+base64+'\r\n','utf8');
 console.log(path.basename(windowsFile)+': '+fs.statSync(windowsFile).size+' bytes');
 console.log('Embedded ClaudeBridge core: '+archive.length+' bytes SHA-256 '+digest);
}catch(e){process.stderr.write(e.stack+'\n');process.exitCode=1;}
finally{fs.rmSync(work,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
