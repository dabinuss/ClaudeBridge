'use strict';
// Loopback TLS proxy: inspect only claude.ai bootstrap; all unrelated hosts
// remain opaque CONNECT tunnels. Preserve HTTP streaming for other claude.ai routes.
// Explicit user trust is required before enabling this in Claude Desktop.
const fs=require('node:fs');
const crypto=require('node:crypto');
const http=require('node:http');
const https=require('node:https');
const net=require('node:net');
const tls=require('node:tls');
const {URL}=require('node:url');
const {transformBootstrap,MAX_BODY}=require('./transform');
const {parseAuthority}=require('./transport');
const {createIdentity}=require('./certs');
const {ROUTE_ID,runCodex,writeAnswer}=require('./codex-model');
const {injectChatHtml}=require('./html-inject');
const {dispatch,buildScript}=require('./chat-rpc');
function makePickerProxy({dir,host='127.0.0.1',port=0,models=[],upstream='claude.ai',dial=net.connect,request=https.request,route=runCodex,controlToken=null,onShutdown=null}={}){
 if(!['127.0.0.1','::1'].includes(host))throw Error('Loopback binding required');
 if(upstream!=='claude.ai')throw Error('Only Claude bootstrap interception is supported');
 if(!Array.isArray(models)&&typeof models!=='function')throw Error('Models must be an array or provider function');
 const identity=createIdentity(dir);
 const rendererSource=fs.readFileSync(require('node:path').join(__dirname,'../native-ui/renderer.js'),'utf8');
 const counters={connects:0,intercepted:0,changed:0,passThrough:0,routed:0,errors:0};
 const server=http.createServer((req,res)=>{
  const supplied=String(req.headers['x-claudebridge-token']||'');
  const actual=typeof controlToken==='string'?controlToken:'';
  const authorized=actual.length===64&&supplied.length===actual.length&&
    crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(supplied));
  if(!authorized){res.writeHead(403);res.end();return;}
  if(req.method==='GET'&&req.url==='/__claudebridge/health'){
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
   res.end(JSON.stringify({ok:true}));return;
  }
  if(req.method==='POST'&&req.url==='/__claudebridge/stop'&&typeof onShutdown==='function'){
   res.writeHead(200,{'cache-control':'no-store'});res.end('Stopping');
   setImmediate(onShutdown);return;
  }
  res.writeHead(404);res.end();
 });
 const localHttp=http.createServer((req,res)=>{
  if(!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400);res.end();return;}
  const target=req.socket.servername==='api.anthropic.com'?'api.anthropic.com':'claude.ai';
  const path=new URL(req.url,'https://'+target).pathname;
  const shouldTransform=target==='claude.ai'&&(path==='/api/bootstrap'||path==='/edge-api/bootstrap');
  const authToken=String(req.headers['x-claudebridge-token']||'');
  const authorized=typeof controlToken==='string'&&controlToken.length===64&&
   authToken.length===controlToken.length&&
   crypto.timingSafeEqual(Buffer.from(authToken),Buffer.from(controlToken));
  if(target==='claude.ai'&&path==='/__claudebridge/ui.js'&&req.method==='GET'){
   const requested=new URL(req.url,'https://claude.ai').searchParams.get('token');
   if(!controlToken||requested!==controlToken){res.writeHead(403);res.end();return;}
   res.writeHead(200,{'content-type':'application/javascript; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff'});
   res.end(buildScript(rendererSource,controlToken));return;
  }
  if(target==='claude.ai'&&path==='/__claudebridge/rpc'&&req.method==='POST'){
   if(!authorized||req.headers.origin!=='https://claude.ai'){
    res.writeHead(403);res.end();return;
   }
   let size=0;const body=[];
   req.on('data',part=>{
    size+=part.length;
    if(size>16384){req.destroy();return;}
    body.push(part);
   });
   req.on('end',()=>{
    let result;
    try{result={data:dispatch(JSON.parse(Buffer.concat(body).toString('utf8')))};}
    catch(e){result={error:String(e.message||e).slice(0,200)};}
    res.writeHead(result.error?400:200,{'content-type':'application/json',
      'cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(JSON.stringify(result));
   });return;
  }
  function forward(buffer){
   const headers={...req.headers,host:target};
   delete headers['proxy-authorization'];delete headers['proxy-connection'];
   const upstreamReq=request({hostname:target,servername:target,port:443,method:req.method,
     path:req.url,headers,rejectUnauthorized:true},upstreamRes=>{
     const responseHeaders={...upstreamRes.headers};
     const html=target==='claude.ai'&&req.method==='GET'&&
       String(responseHeaders['content-type']||'').toLowerCase().startsWith('text/html')&&
       typeof controlToken==='string'&&controlToken.length===64;
     if(!shouldTransform&&!html){
       res.writeHead(upstreamRes.statusCode||502,responseHeaders);
       upstreamRes.pipe(res);return;
     }
     let size=0;const chunks=[];
     let fallback=false;
     upstreamRes.on('data',chunk=>{
       if(fallback)return;
       size+=chunk.length;chunks.push(chunk);
       if(size>MAX_BODY){
        fallback=true;
        res.writeHead(upstreamRes.statusCode||502,responseHeaders);
        for(const saved of chunks)res.write(saved);
        upstreamRes.pipe(res);
       }
     });
     upstreamRes.on('end',()=>{
       if(fallback)return;
       const options={body:Buffer.concat(chunks),headers:responseHeaders};
       const transformed=shouldTransform?
        transformBootstrap({...options,pathname:path,models:typeof models==='function'?models():models}):
        injectChatHtml({...options,token:controlToken});
       if(transformed.changed)counters.changed++;
       res.writeHead(upstreamRes.statusCode||502,transformed.headers);
       res.end(transformed.body);
     });
   });
   upstreamReq.on('error',()=>{counters.errors++;if(!res.headersSent){res.writeHead(502);res.end();}else res.destroy();});
   req.on('aborted',()=>upstreamReq.destroy());
   if(buffer)upstreamReq.end(buffer);else req.pipe(upstreamReq);
  }
  if(target!=='api.anthropic.com'||path!=='/v1/messages'||req.method!=='POST'){forward();return;}
  const chunks=[];let size=0;
  req.on('data',piece=>{
   size+=piece.length;
   if(size>MAX_BODY){req.destroy();return;}
   chunks.push(piece);
  });
  req.on('end',async()=>{
   const body=Buffer.concat(chunks);
   let payload;try{payload=JSON.parse(body.toString('utf8'));}catch{forward(body);return;}
   if(payload?.model!==ROUTE_ID){forward(body);return;}
   counters.routed++;
   try{
    const text=await route(payload);
    writeAnswer(res,text,{stream:payload.stream===true});
   }catch(error){
    counters.errors++;
    const status=/unsupported|tool|Invalid|text/i.test(error.message)?422:502;
    res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({type:'error',error:{type:'api_error',message:String(error.message).slice(0,300)}}));
   }
  });
 });
 const tlsServer=tls.createServer({key:fs.readFileSync(identity.key),cert:fs.readFileSync(identity.cert),
   minVersion:'TLSv1.2'},socket=>localHttp.emit('connection',socket));
 tlsServer.on('tlsClientError',()=>{counters.errors++;});
 localHttp.on('upgrade',(req,socket,head)=>{
  // Byte-transparent WebSocket upgrade through TLS to the authentic host.
  const target=req.socket.servername==='api.anthropic.com'?'api.anthropic.com':'claude.ai';
  const peer=tls.connect({host:target,port:443,servername:target,rejectUnauthorized:true},()=>{
   const header=[req.method+' '+req.url+' HTTP/'+req.httpVersion,
     ...Object.entries(req.headers).map(([k,v])=>k+': '+v)].join('\r\n')+'\r\n\r\n';
   peer.write(header);if(head?.length)peer.write(head);
   socket.pipe(peer);peer.pipe(socket);
  });
  peer.on('error',()=>socket.destroy());socket.on('error',()=>peer.destroy());
 });
 server.on('connect',(req,client,head)=>{
  const dest=parseAuthority(req.url);
  if(!dest){client.end('HTTP/1.1 400 Bad Request\r\n\r\n');return;}
  counters.connects++;
  if(['claude.ai','api.anthropic.com'].includes(dest.host)&&dest.port===443){
   counters.intercepted++;
   client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
   if(head?.length)client.unshift(head);
   tlsServer.emit('connection',client);
   return;
  }
  counters.passThrough++;
  const peer=dial(dest.port,dest.host);
  peer.setTimeout(15000,()=>peer.destroy());
  peer.on('error',()=>client.destroy());client.on('error',()=>peer.destroy());
  peer.on('connect',()=>{
   peer.setTimeout(0);
   client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
   if(head?.length)peer.write(head);
   client.pipe(peer);peer.pipe(client);
  });
 });
 return {identity,counters,
  listen:()=>new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(port,host,()=>{server.removeListener('error',reject);resolve(server.address());});
  }),
  close:()=>new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());})
 };
}
module.exports={makePickerProxy};
