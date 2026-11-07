'use strict';
// Build one executable Unix installer by appending a gzipped project payload to a shell launcher.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const base=path.resolve(__dirname,'..');
const label=process.platform==='darwin'?'macOS':process.platform==='linux'?'Linux':null;
if(!label)throw Error('Build this installer on macOS or Linux');
const template=fs.readFileSync(path.join(__dirname,'unix-installer.sh'),'utf8');
if(!template.endsWith('\n')||!template.includes('__PAYLOAD_LINE__'))throw Error('Installer template malformed');
const offset=template.split('\n').length;
const prefix=template.replace('__PAYLOAD_LINE__',String(offset));
const archive=path.join(base,'.builddeps','ClaudeBridge-standalone-payload.tar.gz');
const entries=['manifest.json','server','vendor','ui','integrations','installer','maintenance'];
fs.mkdirSync(path.dirname(archive),{recursive:true});
const result=spawnSync('tar',['-czf',archive,...entries],{cwd:base,stdio:'inherit',timeout:180000});
if(result.status!==0)throw Error('Cannot create installer archive');
const output=path.join(base,'ClaudeBridge-Setup-'+label+(label==='macOS'?'.command':'.run'));
const descriptor=fs.openSync(output,'w',0o755);
try{
 fs.writeSync(descriptor,Buffer.from(prefix,'utf8'));
 const input=fs.openSync(archive,'r');
 try{
  const chunk=Buffer.allocUnsafe(1024*1024);let n;
  while((n=fs.readSync(input,chunk,0,chunk.length,null))>0)fs.writeSync(descriptor,chunk,0,n);
 }finally{fs.closeSync(input);}
}finally{fs.closeSync(descriptor);}
fs.chmodSync(output,0o755);
console.log('Created '+path.basename(output)+' ('+Math.round(fs.statSync(output).size/1048576)+' MiB), payload line '+offset);
