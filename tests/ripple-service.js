'use strict';
const assert=require('node:assert/strict'),os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const svc=require('../integrations/ripple-lite/service');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'cb-service-'));
try{
 for(const platform of ['win32','darwin','linux']){
  const home=path.join(base,platform);fs.mkdirSync(home,{recursive:true});
  const spec=svc.serviceSpec({platform,home,exe:path.join(home,'node'),script:path.join(home,'daemon.js'),env:{XDG_CONFIG_HOME:path.join(home,'.config')}});
  const calls=[];
  assert.equal(svc.install(spec,{start:false,invoke:(cmd,args)=>{calls.push(cmd)}}),true);
  assert.ok(fs.existsSync(spec.marker));
  if(spec.file)assert.ok(fs.existsSync(spec.file));
  assert.throws(()=>svc.install(spec,{start:false}),/Existing/);
  assert.equal(svc.uninstall(spec,{stop:false,invoke:(cmd,args)=>{calls.push(cmd)}}),true);
  assert.equal(svc.uninstall(spec,{stop:false,invoke:()=>{}}),false);
  assert.equal(fs.existsSync(spec.marker),false);
 }
 console.log('PASS: reversible owned login autostart definitions for Windows/macOS/Linux');
}finally{fs.rmSync(base,{recursive:true,force:true});}
