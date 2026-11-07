'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {createIdentity,fingerprint}=require('../integrations/ripple-lite/certs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cb-certs-'));
try{
 const p=createIdentity(temp);
 assert.equal(fs.existsSync(p.ca),true);
 const ca=new crypto.X509Certificate(fs.readFileSync(p.ca));
 const leaf=new crypto.X509Certificate(fs.readFileSync(p.cert));
 assert.equal(leaf.checkHost('claude.ai'),'claude.ai');
 assert.equal(leaf.verify(ca.publicKey),true);
 assert.equal(fingerprint(temp),p.fingerprint);
 assert.equal(createIdentity(temp).fingerprint,p.fingerprint);
 assert.throws(()=>createIdentity('relative/path'));
 assert.equal(fs.existsSync(path.join(temp,'leaf.csr')),false);
 console.log('PASS: locally generated scoped CA and TLS leaf');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
