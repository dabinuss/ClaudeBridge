'use strict';
const assert=require('node:assert/strict');
const net=require('node:net'),tls=require('node:tls'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {makePickerProxy}=require('../integrations/ripple-lite/proxy');
async function connect(proxy,host){
 const addr=proxy.address;
 const raw=net.connect(addr.port,'127.0.0.1');
 await new Promise((resolve,reject)=>{raw.once('connect',resolve);raw.once('error',reject);});
 raw.write('CONNECT '+host+':443 HTTP/1.1\r\nHost: '+host+':443\r\n\r\n');
 let header='';
 await new Promise((resolve,reject)=>{
  function onData(d){
   header+=d.toString('latin1');
   if(!header.includes('\r\n\r\n'))return;
   raw.off('data',onData);
   assert.match(header,/200 Connection Established/);
   resolve();
  }
  raw.on('data',onData);raw.once('error',reject);
 });
 const secure=tls.connect({socket:raw,servername:host,ca:fs.readFileSync(proxy.identity.ca)});
 await new Promise((resolve,reject)=>{secure.once('secureConnect',resolve);secure.once('error',reject);});
 return secure;
}
async function read(secure){
 let response='';
 secure.on('data',d=>response+=d.toString());
 await new Promise((resolve,reject)=>{secure.once('end',resolve);secure.once('error',reject);});
 return response;
}
(async()=>{
 try{execFileSync('openssl',['version'],{stdio:'ignore'});}catch{console.log('SKIP: OpenSSL unavailable');return;}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cb-route-e2e-'));
 let proxy;
 try{
  let calls=0;
  proxy=makePickerProxy({dir,route:async payload=>{
   calls++;
   assert.equal(payload.model,'claudebridge-codex');
   return 'Codex routed successfully';
  }});
  proxy.address=await proxy.listen();
  const secure=await connect(proxy,'api.anthropic.com');
  const body=JSON.stringify({model:'claudebridge-codex',messages:[{role:'user',content:'hello'}],stream:false});
  secure.write('POST /v1/messages HTTP/1.1\r\nHost: api.anthropic.com\r\nContent-Type: application/json\r\nContent-Length: '+Buffer.byteLength(body)+'\r\nConnection: close\r\n\r\n'+body);
  const output=await read(secure);
  assert.match(output,/200 OK/);
  assert.match(output,/Codex routed successfully/);
  assert.equal(calls,1);
  assert.equal(proxy.counters.routed,1);
  console.log('PASS: HTTPS API route reaches Codex adapter with verified TLS');
 }finally{if(proxy)await proxy.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
