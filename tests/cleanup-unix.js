'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
if(!['linux','darwin'].includes(process.platform))process.exit(0);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'claudebridge-unix-cleanup-'));
const fakeClaude=path.join(dir,'Claude-test');
fs.writeFileSync(fakeClaude,'#!/bin/sh\nexit 0\n',{mode:0o700});
const root=path.join(dir,'user');
const registry=path.join(root,'.claudebridge');
const project=path.join(dir,'my-user-project');
const state=path.join(project,'.agent-bridge');
fs.mkdirSync(registry,{recursive:true});fs.mkdirSync(state,{recursive:true});
fs.writeFileSync(path.join(project,'source.js'),'USER DATA - MUST PRESERVE\n');
fs.writeFileSync(path.join(state,'state.sqlite'),'test sqlite');
fs.writeFileSync(path.join(state,'.gitignore'),'*');
fs.writeFileSync(path.join(registry,'projects.json'),JSON.stringify({active:'test',projects:{test:{name:'Test',path:project}}}));
fs.writeFileSync(path.join(registry,'settings.json'),'{"mode":"dual"}');
process.env.CLAUDEBRIDGE_NATIVE_TEST_ROOT=root;
process.env.CLAUDEBRIDGE_CLAUDE_EXECUTABLE=fakeClaude;
process.env.CLAUDEBRIDGE_CLEANUP_TEST_HOME=registry;
const installer=require('../integrations/native-ui/setup-unix');
const clean=require('../maintenance/cleanup-unix');
try{
 installer.install(path.resolve(__dirname,'..'));
 const preview=clean.clean({audit:true,purgeProjectMemory:true,purgeState:true});
 assert(preview.native.installed);assert(preview.projects.includes(state));
 assert(fs.existsSync(path.join(state,'state.sqlite')),'Audit mutated files');
 const result=clean.clean({audit:false,purgeProjectMemory:true,purgeState:true});
 assert.equal(result.remaining.length,0,JSON.stringify(result));
 assert(!fs.existsSync(registry));
 assert(!fs.existsSync(state));
 assert(!installer.status().installed);
 assert(fs.existsSync(path.join(project,'source.js')),'User source was deleted!');
 assert(fs.existsSync(fakeClaude),'Claude executable was deleted!');
 console.log('PASS: '+process.platform+' audit-only and permanent safe ClaudeBridge cleanup');
}catch(e){console.error(e);process.exitCode=1;}
finally{
 delete process.env.CLAUDEBRIDGE_NATIVE_TEST_ROOT;
 delete process.env.CLAUDEBRIDGE_CLAUDE_EXECUTABLE;
 delete process.env.CLAUDEBRIDGE_CLEANUP_TEST_HOME;
 fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:150});
}
