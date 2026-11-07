'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {openDb,addTask}=require('../server/db');
const plans=require('../server/plans');
const project=fs.mkdtempSync(path.join(os.tmpdir(),'claudebridge-plans-'));
try{
  const db=openDb({path:project});
  const p=plans.create(db,{title:'Combat rework',request:'Create a plan for slowing combat',specification:'1. First round is preparation. 2. Test balance.'});
  assert.equal(p.status,'draft');
  assert.equal(p.version,1);
  assert.throws(()=>plans.bind(db,crypto.randomUUID(),p.id),/approved/);
  assert.throws(()=>plans.approve(db,p.id,false),/explicitly approve/);
  const approved=plans.approve(db,p.id,true);
  assert.equal(approved.status,'active');
  const taskId=crypto.randomUUID();
  addTask(db,{id:taskId,mode:'review',prompt:'Review combat system',project_path:project});
  plans.bind(db,taskId,p.id);
  assert.match(plans.forTask(db,taskId).specification,/First round/);
  const revised=plans.revise(db,p.id,'1. First two turns are preparation. 2. Test balance.','User changed the timing');
  assert.equal(revised.status,'draft');
  assert.equal(revised.version,2);
  assert.match(plans.forTask(db,taskId).specification,/First round/);
  assert.throws(()=>plans.bind(db,crypto.randomUUID(),p.id),/approved/);
  plans.approve(db,p.id,true);
  assert.equal(plans.history(db,p.id).revisions.length,2);
  assert.equal(plans.get(db,p.id).request,'Create a plan for slowing combat');
  db.close();
  console.log('PASS: original prompt, plan approval, immutable task revision, revision history');
}finally{
  fs.rmSync(project,{recursive:true,force:true,maxRetries:10,retryDelay:150});
}
