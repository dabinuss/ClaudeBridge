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
