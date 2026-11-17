'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {inspect}=require('../server/safe-project-purge');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cb-safe-purge-'));
try{
 fs.writeFileSync(path.join(dir,'.gitignore'),'ignore');
 fs.writeFileSync(path.join(dir,'state.sqlite'),'state');
 fs.writeFileSync(path.join(dir,'state.sqlite-wal'),'state');
 assert.equal(inspect(dir).safe,true);
 fs.writeFileSync(path.join(dir,'my-notes.txt'),'USER DATA');
 assert.equal(inspect(dir).safe,false,'Unrecognized project data must block recursive purge');
 fs.unlinkSync(path.join(dir,'my-notes.txt'));
 fs.mkdirSync(path.join(dir,'nested'));
 assert.equal(inspect(dir).safe,false,'Nested folders must block recursive purge');
 fs.rmdirSync(path.join(dir,'nested'));
 if(process.platform!=='win32'){
  fs.symlinkSync(path.join(dir,'state.sqlite'),path.join(dir,'watchdog.pid'));
  assert.equal(inspect(dir).safe,false,'Symlinks must block recursive purge');
 }
 console.log('PASS: project memory purge refuses foreign files, nested folders and symlinks');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
