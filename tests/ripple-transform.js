'use strict';
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const {transformBootstrap,MAX_BODY}=require('../integrations/ripple-lite/transform');
const obj={model_selector_config:[
 {id:'chat',models:[{id:'claude-opus',name:'Opus'}]},
 {id:'code',models:[{id:'claude-sonnet',name:'Sonnet'},{id:'claude-opus',name:'Opus'}]}
]};
const models=[{id:'claudebridge:dual',name:'ClaudeBridge Dual',routable:true}];
for(const encoding of ['identity','gzip','br','deflate']){
 const original=Buffer.from(JSON.stringify(obj));
 const body=encoding==='gzip'?zlib.gzipSync(original):encoding==='br'?zlib.brotliCompressSync(original):
  encoding==='deflate'?zlib.deflateSync(original):original;
 const args={pathname:'/edge-api/bootstrap',body,headers:{'Content-Length':String(body.length),'content-encoding':encoding,ETag:'abc'},models};
 const out=transformBootstrap(args);
 assert.equal(out.changed,true,encoding);
 assert.equal(out.headers.ETag,undefined);
 assert.equal(Number(out.headers['content-length']),out.body.length);
 const decoded=encoding==='gzip'?zlib.gunzipSync(out.body):encoding==='br'?zlib.brotliDecompressSync(out.body):
  encoding==='deflate'?zlib.inflateSync(out.body):out.body;
 const result=JSON.parse(decoded);
 assert.equal(result.model_selector_config[0].models.length,1);
 assert.equal(result.model_selector_config[1].models.length,3);
 assert.deepEqual(JSON.parse(original.toString()),obj,'must not change input object');
 assert.equal(transformBootstrap({...args,pathname:'/api/not-bootstrap'}).changed,false);
}
assert.equal(transformBootstrap({pathname:'/api/bootstrap',body:Buffer.alloc(MAX_BODY+1),models}).changed,false);
assert.equal(transformBootstrap({pathname:'/api/bootstrap',body:Buffer.from('bad'),models}).changed,false);
assert.equal(transformBootstrap({pathname:'/api/bootstrap',body:Buffer.from('{}'),models}).changed,false);
assert.equal(transformBootstrap({pathname:'/api/bootstrap',body:Buffer.from(JSON.stringify(obj)),models:[{id:'unknown',name:'Unknown',routable:false}]}).changed,false);
console.log('PASS: scoped bootstrap rewrite, gzip/br/deflate and fallback without chat mutation');
