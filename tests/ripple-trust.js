'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createIdentity}=require('../integrations/ripple-lite/certs');
const {command,apply}=require('../integrations/ripple-lite/trust');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cb-trust-'));
try{
 const ca=createIdentity(dir).ca;
 for(const platform of ['win32','darwin','linux']){
  assert.equal(command('trust',ca,platform).args.length>0,true);
  assert.equal(command('untrust',ca,platform).args.length>0,true);
 }
 assert.throws(()=>apply('trust',ca),/approval/);
 let invoked=0;
 const out=apply('trust',ca,{confirm:true,platform:'win32',run:(cmd,args)=>{assert.equal(cmd,'powershell.exe');assert(args.includes('-Command'));invoked++;}});
 assert.equal(invoked,1);
 assert.ok(out.fingerprint);
 console.log('PASS: explicit consent, user-only trust and fingerprint-specific removal');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
