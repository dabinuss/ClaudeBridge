'use strict';
const assert=require('node:assert/strict');
const net=require('node:net'),tls=require('node:tls'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PassThrough}=require('node:stream');
const {makePickerProxy}=require('../integrations/ripple-lite/proxy');
async function connect(proxy){
 const raw=net.connect(proxy.address.port,'127.0.0.1');
 await new Promise(r=>raw.once('connect',r));
 raw.write('CONNECT claude.ai:443 HTTP/1.1\r\nHost: claude.ai:443\r\n\r\n');
 let header='';
 await new Promise((resolve,reject)=>{
  const onData=d=>{
   header+=d.toString();
   if(!header.includes('\r\n\r\n'))return;
   raw.off('data',onData);
   assert.match(header,/200 Connection Established/);resolve();
  };
  raw.on('data',onData);raw.once('error',reject);
 });
 const secure=tls.connect({socket:raw,servername:'claude.ai',ca:fs.readFileSync(proxy.identity.ca)});
 await new Promise((resolve,reject)=>{secure.once('secureConnect',resolve);secure.once('error',reject);});
 return secure;
}
async function request(proxy,method,url,body='',headers={}){
 const socket=await connect(proxy);
 let response='';
 socket.on('data',chunk=>response+=chunk.toString());
 const h=['Host: claude.ai','Connection: close',...Object.entries(headers).map(([k,v])=>k+': '+v)];
 if(method==='POST')h.push('Content-Length: '+Buffer.byteLength(body));
 socket.write(method+' '+url+' HTTP/1.1\r\n'+h.join('\r\n')+'\r\n\r\n'+body);
 await new Promise((resolve,reject)=>{socket.once('end',resolve);socket.once('error',reject);});
 return {head:response.split('\r\n\r\n')[0],body:response.slice(response.indexOf('\r\n\r\n')+4)};
}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cb-chat-https-'));
 let proxy;
 try{
  const token='1'.repeat(64);
  proxy=makePickerProxy({dir,controlToken:token,request:(opts,callback)=>{
   const stream=new PassThrough();
   stream.on('finish',()=>{
    const response=new PassThrough();
    response.statusCode=200;
    response.headers={'content-type':'text/html','content-security-policy':"script-src 'self'"};
    callback(response);
    response.end('<html><head></head><body>Claude Desktop Chat</body></html>');
   });
   return stream;
  }});
  proxy.address=await proxy.listen();
  const page=await request(proxy,'GET','/');
  assert.match(page.head,/200 OK/);
  assert.match(page.body,/\/__claudebridge\/ui.js\?token=/);
  const script=await request(proxy,'GET','/__claudebridge/ui.js?token='+token);
  assert.match(script.body,/__claudebridgeHost/);
  assert.match(script.body,/__claudebridgePickerInjected/);
  const rpc=await request(proxy,'POST','/__claudebridge/rpc',
   JSON.stringify({id:1,action:'status'}),{
    Origin:'https://claude.ai','x-claudebridge-token':token,'Content-Type':'application/json'});
  assert.match(rpc.head,/200 OK/);
  assert.match(rpc.body,/"mode":/);
  const forbidden=await request(proxy,'POST','/__claudebridge/rpc',
   JSON.stringify({id:2,action:'status'}),{Origin:'https://evil.example'});
  assert.match(forbidden.head,/403 Forbidden/);
  console.log('PASS: real HTTPS Chat HTML injection, first-party UI, authorized settings RPC');
 }finally{if(proxy)await proxy.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
