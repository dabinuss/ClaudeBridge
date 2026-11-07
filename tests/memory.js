'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {capture,timeline,digest}=require('../server/memory');
const {openDb,message}=require('../server/db');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'claudebridge-memory-'));
try{
 fs.writeFileSync(path.join(dir,'index.js'),'const a=1;\n');
 const first=capture(dir);assert.equal(first.files,1);
 assert(timeline(dir).some(e=>e.kind==='baseline'));
 fs.writeFileSync(path.join(dir,'index.js'),'const a=1000;\n');
 fs.writeFileSync(path.join(dir,'README.md'),'hello\n');
 const second=capture(dir);assert.equal(second.added,1);assert.equal(second.changed,1);
 assert(timeline(dir).some(e=>e.kind==='files'&&e.summary.includes('index.js')));
 const db=openDb({path:dir});message(db,'claude','all','Keep typed API contracts');db.close();
 assert(digest(dir).decisions.some(e=>e.body.includes('typed API')));
 const third=capture(dir);assert.equal(third.changed,0);assert.equal(third.added,0);
 console.log('PASS: token-free snapshot, file-change timeline, decision handoff');
}finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:150});}
