'use strict';
// Pure, bounded bootstrap response transform. No global HTTP interception and no
// credential handling. Only the known bootstrap paths and model-list shape.
const zlib=require('node:zlib');
const {addBridgeModels,isBootstrapPath}=require('./bootstrap');
const MAX_BODY=2*1024*1024;
function transformBootstrap({pathname,body,headers={},models=[]}){
 if(!isBootstrapPath(pathname)||!Buffer.isBuffer(body)||body.length>MAX_BODY)
  return {changed:false,body,headers};
 const lower=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));
 const encoding=String(lower['content-encoding']||'identity').toLowerCase();
 if(!['identity','gzip','br','deflate'].includes(encoding))
  return {changed:false,body,headers};
 let plain;
 try{
  plain=encoding==='gzip'?zlib.gunzipSync(body,{maxOutputLength:MAX_BODY}):
    encoding==='br'?zlib.brotliDecompressSync(body,{maxOutputLength:MAX_BODY}):
    encoding==='deflate'?zlib.inflateSync(body,{maxOutputLength:MAX_BODY}):body;
  if(plain.length>MAX_BODY)return {changed:false,body,headers};
 }catch{return {changed:false,body,headers};}
 let json;
 try{json=JSON.parse(plain.toString('utf8'));}catch{return {changed:false,body,headers};}
 if(!json||typeof json!=='object'||Array.isArray(json))return {changed:false,body,headers};
 const result=addBridgeModels(json,models);
 if(result.added===0)return {changed:false,body,headers,result};
 const updated=Buffer.from(JSON.stringify(json));
 const compressed=encoding==='gzip'?zlib.gzipSync(updated):
  encoding==='br'?zlib.brotliCompressSync(updated):
  encoding==='deflate'?zlib.deflateSync(updated):updated;
 // Preserve caller's header casing, only replace affected entity metadata.
 const out={...headers};
 for(const key of Object.keys(out))if(['content-length','transfer-encoding','etag','content-md5','digest','content-range'].includes(key.toLowerCase()))delete out[key];
 out['content-length']=String(compressed.length);
 out['cache-control']='no-store';
 return {changed:true,body:compressed,headers:out,result};
}
module.exports={transformBootstrap,MAX_BODY};
