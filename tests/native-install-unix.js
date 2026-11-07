'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
if(!['linux','darwin'].includes(process.platform))process.exit(0);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'claudebridge-native-unix-'));
const fakeClaude=path.join(temp,'Claude-test');
fs.writeFileSync(fakeClaude,'#!/bin/sh\nexit 0\n',{mode:0o700});
fs.chmodSync(fakeClaude,0o700);
process.env.CLAUDEBRIDGE_NATIVE_TEST_ROOT=temp;
process.env.CLAUDEBRIDGE_CLAUDE_EXECUTABLE=fakeClaude;
const installer=require('../integrations/native-ui/setup-unix');
const sourceRoot=path.resolve(__dirname,'..');
try{
 assert.equal(installer.status().installed,false);
 const done=installer.install(sourceRoot);
 assert(done.installed,JSON.stringify(done));
 assert(fs.existsSync(done.shortcut),'Native launcher missing');
 assert(fs.existsSync(path.join(done.directory,'node')),'Bundled Node missing');
 assert(fs.existsSync(path.join(done.directory,'native-ui.json')),'Native config missing');
 assert(fs.existsSync(path.join(done.directory,'settings.js')),'Settings missing');
 assert.equal(installer.status().installed,true);
 const cfg=JSON.parse(fs.readFileSync(path.join(done.directory,'native-ui.json'),'utf8'));
 assert.equal(cfg.claudeExe,fs.realpathSync(fakeClaude));
 installer.install(sourceRoot);
 assert.equal(installer.status().installed,true,'Reinstall should be idempotent');
 const output=installer.remove();
 assert.equal(output.installed,false);
 assert.equal(output.pendingCleanup,false,'No native files should remain after removal');
 assert(!fs.existsSync(done.shortcut),'Native launcher survived removal');
 assert(!fs.existsSync(done.directory),'Native support directory survived removal');
 assert(fs.existsSync(fakeClaude),'Original Claude executable must survive removal');
 if(process.platform==='darwin'){
   assert(!fs.existsSync(path.join(temp,'Applications','ClaudeBridge Claude.app')));
 }else{
   assert(!fs.existsSync(path.join(temp,'.local/share/applications/claudebridge-claude.desktop')));
 }
 console.log('PASS: '+process.platform+' user-only native install, idempotency, original preservation, rollback');
}catch(error){console.error(error);process.exitCode=1;}
finally{
 delete process.env.CLAUDEBRIDGE_NATIVE_TEST_ROOT;
 delete process.env.CLAUDEBRIDGE_CLAUDE_EXECUTABLE;
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:150});
}