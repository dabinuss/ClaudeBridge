'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {state,apply,remove}=require('../integrations/ripple-lite/desktop-config');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cb-ripple-cfg-'));
try{
 fs.writeFileSync(path.join(dir,'_meta.json'),JSON.stringify({appliedId:'existing',external:true}));
 fs.writeFileSync(path.join(dir,'existing.json'),JSON.stringify({egressProxyUrl:'http://127.0.0.1:99'}));
 assert.throws(()=>apply({dir,proxyUrl:'http://example.com:9999'}));
 const x=apply({dir,proxyUrl:'http://127.0.0.1:12345'});
 assert.equal(x.previous,'existing');
 assert.equal(state(dir).ours,true);
 assert.equal(state(dir).active.egressProxyUrl,'http://127.0.0.1:12345');
 apply({dir,proxyUrl:'http://127.0.0.1:12346'});
 assert.equal(state(dir).id,x.id);
 assert.equal(remove({dir,owner:'another'}),false);
 assert.equal(remove({dir}),true);
 assert.equal(state(dir).id,'existing');
 assert.equal(state(dir).meta.external,true);
 assert.equal(fs.existsSync(path.join(dir,x.id+'.json')),false);
 assert.equal(remove({dir}),false);
 console.log('PASS: managed proxy settings, ownership, existing config restoration');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
