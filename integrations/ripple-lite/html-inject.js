'use strict';
// Adds a first-party-origin script reference to ordinary Claude Chat HTML,
// while preserving CSP. No application patch, launcher, or global script injection.
const zlib=require('node:zlib');
const MAX=2*1024*1024;
function unpack(buffer,encoding){
 if(encoding==='gzip')return zlib.gunzipSync(buffer,{maxOutputLength:MAX});
 if(encoding==='br')return zlib.brotliDecompressSync(buffer,{maxOutputLength:MAX});
 if(encoding==='deflate')return zlib.inflateSync(buffer,{maxOutputLength:MAX});
 if(encoding==='identity')return buffer;
 throw Error('Unknown encoding');
}
function pack(buffer,encoding){
 if(encoding==='gzip')return zlib.gzipSync(buffer);
 if(encoding==='br')return zlib.brotliCompressSync(buffer);
 if(encoding==='deflate')return zlib.deflateSync(buffer);
 return buffer;
}
function injectChatHtml({body,headers={},token}={}){
 if(!Buffer.isBuffer(body)||body.length>MAX||typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))
  return {changed:false,body,headers};
 const h=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),String(v)]));
 if(!/^text\/html(?:;|$)/i.test(h['content-type']||''))return {changed:false,body,headers};
 const encoding=(h['content-encoding']||'identity').toLowerCase();
 let raw;
 try{raw=unpack(body,encoding);}catch{return {changed:false,body,headers};}
 if(raw.length>MAX)return {changed:false,body,headers};
 let html=raw.toString('utf8');
 if(!/<\/head\s*>/i.test(html)||html.includes('/__claudebridge/ui.js'))
  return {changed:false,body,headers};
 const csp=h['content-security-policy']||'';
 const directive=/(?:^|;)\s*script-src\s+([^;]+)/i.exec(csp)?.[1]||
   /(?:^|;)\s*default-src\s+([^;]+)/i.exec(csp)?.[1]||'';
 const nonceTags=[...html.matchAll(/<script\b[^>]*\bnonce=["']([^"']+)["']/gi)].map(x=>x[1]);
 let nonce='';
 for(const value of nonceTags){
  if(!/^[a-zA-Z0-9+/_=-]{6,128}$/.test(value))continue;
  if(!directive||directive.includes("'nonce-"+value+"'")){nonce=value;break;}
 }
 if(directive){
  if(/'none'/.test(directive))return {changed:false,body,headers};
  if(/'strict-dynamic'/.test(directive)&&!nonce)return {changed:false,body,headers};
  if(/'nonce-/.test(directive)&&!nonce)return {changed:false,body,headers};
  if(!nonce&&!/'self'|https:|\*/.test(directive))return {changed:false,body,headers};
 }
 const tag='<script src="/__claudebridge/ui.js?token='+token+'"'+
   (nonce?' nonce="'+nonce+'"':'')+' defer></script>';
 html=html.replace(/<\/head\s*>/i,tag+'</head>');
 const updated=pack(Buffer.from(html,'utf8'),encoding);
 const out={...headers};
 for(const k of Object.keys(out)){
  if(['content-length','transfer-encoding','etag','content-md5','digest','content-range'].includes(k.toLowerCase()))
   delete out[k];
 }
 out['content-length']=String(updated.length);
 out['cache-control']='no-store';
 return {changed:true,body:updated,headers:out};
}
module.exports={injectChatHtml,MAX};
