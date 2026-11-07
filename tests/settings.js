'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-settings-'));
const oldHome=process.env.HOME,oldProfile=process.env.USERPROFILE;
process.env.HOME=dir;process.env.USERPROFILE=dir;
const cfg=require('../server/settings');
try{
 assert.equal(cfg.read().mode,'manual');
 assert.equal(cfg.write({mode:'dual'}).mode,'dual');
 assert.equal(cfg.read().enabled,true);
 assert.equal(cfg.write({mode:'fallback',memoryEnabled:false}).memoryEnabled,false);
 assert.equal(cfg.read().mode,'fallback');
 assert.equal(cfg.write({mode:'off'}).enabled,false);
 assert.equal(cfg.write({mode:'dual'},'project-one').mode,'dual');
 assert.equal(cfg.read('project-one').mode,'dual');
 assert.equal(cfg.read('project-two').mode,'off');
 assert.equal(cfg.write({mode:'manual'},'project-two').mode,'manual');
 assert.equal(cfg.read('project-one').mode,'dual');
 assert.throws(()=>cfg.write({mode:'invalid'}));
 console.log('PASS: persistent Off Manual Fallback Dual settings');
}finally{
 if(oldHome===undefined)delete process.env.HOME;else process.env.HOME=oldHome;
 if(oldProfile===undefined)delete process.env.USERPROFILE;else process.env.USERPROFILE=oldProfile;
 fs.rmSync(dir,{recursive:true,force:true,maxRetries:6,retryDelay:100});
}