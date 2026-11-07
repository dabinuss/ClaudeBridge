'use strict';
// ClaudeBridge Ripple-lite: a minimal *transport*, not the authenticated picker.
// Requests are never intercepted by this pass-through proxy; model-picker
// injection requires a separately validated and explicitly enabled TLS handler.
const http=require('node:http');
const net=require('node:net');
const {URL}=require('node:url');
function parseAuthority(authority){
 if(typeof authority!=='string'||authority.includes('@'))return null;
 let url;
 try{url=new URL('http://'+authority);}catch{return null;}
 const port=url.port?Number(url.port):443;
 if(!url.hostname||!/^[0-9]+$/.test(String(port))||port<1||port>65535||url.username||url.password)return null;
 return {host:url.hostname.replace(/^\[|\]$/g,''),port};
}
function createProxy({host='127.0.0.1',port=0,dial=net.connect}={}){
 if(!['127.0.0.1','::1','localhost'].includes(host))throw Error('Proxy may bind only to loopback');
 const counters={connects:0,denied:0,active:0};
 const server=http.createServer((req,res)=>{
  counters.denied++;
  res.writeHead(405,{'content-type':'text/plain','connection':'close'});res.end('CONNECT only');
 });
 server.on('connect',(req,client,head)=>{
  const target=parseAuthority(req.url);
  if(!target){counters.denied++;client.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return;}
  counters.connects++;
  const upstream=dial(target.port,target.host);
  let connected=false,closed=false;
  function fail(){if(!closed){closed=true;client.destroy();upstream.destroy();}}
  upstream.setTimeout(15000,fail);
  upstream.on('error',fail);
  client.on('error',fail);
  client.on('close',()=>{closed=true;upstream.destroy();});
  upstream.once('connect',()=>{
   connected=true;upstream.setTimeout(0);
   if(closed)return;
   counters.active++;
   client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
   if(head?.length)upstream.write(head);
   client.pipe(upstream);upstream.pipe(client);
  });
  upstream.on('close',()=>{if(connected)counters.active--;client.destroy();});
 });
 return {
  server,counters,
  listen:()=>new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(port,host,()=>{server.removeListener('error',reject);resolve(server.address());});
  }),
  close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))
 };
}
module.exports={createProxy,parseAuthority};
