'use strict';
const assert=require('node:assert/strict');
const net=require('node:net'),tls=require('node:tls'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PassThrough}=require('node:stream');
const {execFileSync}=require('node:child_process');
const {makePickerProxy}=require('../integrations/ripple-lite/proxy');
async function eventually(pred){for(let i=0;i<100;i++){if(pred())return;await new Promise(r=>setTimeout(r,10));}throw Error('timed out');}
(async()=>{
 try{execFileSync('openssl',['version'],{stdio:'ignore'});}catch{console.log('SKIP: openssl unavailable');return;}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cb-ripple-mitm-'));
 let proxy,server;
 try{
  const model={id:'claudebridge:dual',name:'ClaudeBridge Dual',routable:true};
  proxy=makePickerProxy({dir,models:[model],request:(options,cb)=>{
   const request=new PassThrough();
   request.on('finish',()=>{
    const response=new PassThrough();
    response.statusCode=200;
    response.headers={'content-type':'application/json'};
    cb(response);
    response.end(JSON.stringify({model_selector_config:[{id:'chat',models:[{id:'claude-opus',name:'Opus'}]},
      {id:'code',models:[{id:'claude-opus',name:'Opus'},{id:'claude-sonnet',name:'Sonnet'}]}]}));
   });
   return request;
  }});
  const listen=await proxy.listen();
  const raw=net.connect(listen.port,'127.0.0.1');
  await new Promise(r=>raw.once('connect',r));
  raw.write('CONNECT claude.ai:443 HTTP/1.1\r\nHost: claude.ai:443\r\n\r\n');
  let handshake=Buffer.alloc(0);
  await new Promise((resolve,reject)=>{
   const onData=data=>{
    handshake=Buffer.concat([handshake,data]);
    const i=handshake.indexOf('\r\n\r\n');
    if(i<0)return;
    raw.off('data',onData);
    const extra=handshake.subarray(i+4);
    if(extra.length)raw.unshift(extra);
    assert.match(handshake.subarray(0,i).toString(),/200 Connection Established/);
    resolve();
   };raw.on('data',onData);raw.once('error',reject);
  });
  const secure=tls.connect({socket:raw,servername:'claude.ai',ca:fs.readFileSync(proxy.identity.ca)});
  await new Promise((resolve,reject)=>{secure.once('secureConnect',resolve);secure.once('error',reject);});
  let output='';
  secure.on('data',chunk=>output+=chunk.toString());
  secure.write('GET /edge-api/bootstrap HTTP/1.1\r\nHost: claude.ai\r\nConnection: close\r\n\r\n');
  await eventually(()=>output.includes('claudebridge:dual'));
  assert.equal(proxy.counters.changed,1);
  const payload=JSON.parse(output.slice(output.indexOf('\r\n\r\n')+4));
  assert.equal(payload.model_selector_config[0].models.length,1);
  assert.equal(payload.model_selector_config[1].models.length,3);
  secure.destroy();
  console.log('PASS: real TLS CONNECT handshake, verified local CA, scoped model bootstrap injection');
 }finally{
  if(proxy)await proxy.close();
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
