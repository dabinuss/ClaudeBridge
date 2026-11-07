'use strict';
// Durable, versioned plan contracts shared by Claude and Codex.
// Only explicit user approval activates a plan. Previous revisions remain available.
const crypto=require('node:crypto');
const {now}=require('./db');
function schema(db){
  db.exec("CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, title TEXT NOT NULL, request TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','active','superseded','completed')), version INTEGER NOT NULL, updated TEXT NOT NULL);");
  db.exec("CREATE TABLE IF NOT EXISTS plan_revisions (plan_id TEXT NOT NULL, version INTEGER NOT NULL, at TEXT NOT NULL, author TEXT NOT NULL, specification TEXT NOT NULL, reason TEXT NOT NULL, PRIMARY KEY(plan_id,version));");
  db.exec("CREATE TABLE IF NOT EXISTS plan_events (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id TEXT NOT NULL, at TEXT NOT NULL, author TEXT NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL);");
  db.exec("CREATE TABLE IF NOT EXISTS task_plans (task_id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, plan_version INTEGER NOT NULL);");
}
function verifyText(s,key,max=30000){
  if(typeof s!=='string'||!s.trim()||s.length>max)throw Error(key+' must contain 1-'+max+' characters.');
  return s.trim();
}
function event(db,id,author,type,detail){
  db.prepare('INSERT INTO plan_events(plan_id,at,author,type,detail) VALUES(?,?,?,?,?)').run(id,now(),author,type,detail.slice(0,1000));
}
function create(db,{title,request,specification,author='claude'}){
  schema(db); title=verifyText(title,'Title',200); request=verifyText(request,'Original user request',10000);
  specification=verifyText(specification,'Plan',30000);
  const id=crypto.randomUUID(),at=now();
  db.exec('BEGIN IMMEDIATE');
  try{
    db.prepare("INSERT INTO plans VALUES(?,?,?,'draft',1,?)").run(id,title,request,at);
    db.prepare('INSERT INTO plan_revisions VALUES(?,?,?,?,?,?)').run(id,1,at,author,specification,'Initial proposed plan');
    event(db,id,author,'draft_created','Plan proposed; user approval required before execution.');
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return get(db,id);
}
function get(db,id){
  schema(db);
  const p=db.prepare('SELECT * FROM plans WHERE id=?').get(id);
  if(!p)throw Error('Unknown plan');
  const r=db.prepare('SELECT * FROM plan_revisions WHERE plan_id=? AND version=?').get(id,p.version);
  return {...p,specification:r.specification,revisionReason:r.reason};
}
function list(db){
  schema(db);
  return db.prepare('SELECT id,title,status,version,updated FROM plans ORDER BY updated DESC LIMIT 25').all();
}
function revise(db,id,specification,reason,author='claude'){
  specification=verifyText(specification,'Revised plan',30000);
  reason=verifyText(reason,'Revision reason',1000);
  db.exec('BEGIN IMMEDIATE');
  try{
    const p=get(db,id);
    if(p.status==='completed')throw Error('Completed plans cannot be revised');
    const version=p.version+1,at=now();
    // Never silently change an approved plan; it must be approved again.
    db.prepare("UPDATE plans SET version=?,status='draft',updated=? WHERE id=?").run(version,at,id);
    db.prepare('INSERT INTO plan_revisions VALUES(?,?,?,?,?,?)').run(id,version,at,author,specification,reason);
    event(db,id,author,'revised',reason+'; approval required again.');
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return get(db,id);
}
function approve(db,id,confirmed=false){
  if(confirmed!==true)throw Error('The user must explicitly approve the plan before activation.');
  db.exec('BEGIN IMMEDIATE');
  try{
    const p=get(db,id);
    if(p.status!=='draft')throw Error('Only draft plans can be approved');
    db.prepare("UPDATE plans SET status='active',updated=? WHERE id=?").run(now(),id);
    event(db,id,'user','approved','Approved version '+p.version);
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return get(db,id);
}
function complete(db,id){
  const p=get(db,id);
  if(p.status!=='active')throw Error('Only active plans can be completed');
  db.prepare("UPDATE plans SET status='completed',updated=? WHERE id=?").run(now(),id);
  event(db,id,'claude','completed','Plan execution marked completed.');
  return get(db,id);
}
function bind(db,taskId,planId){
  const p=get(db,planId);
  if(p.status!=='active')throw Error('The plan must be user-approved before delegating execution.');
  db.prepare('INSERT INTO task_plans VALUES(?,?,?)').run(taskId,planId,p.version);
  event(db,planId,'claude','task_assigned','Task '+taskId+' bound to immutable plan revision '+p.version);
  return p;
}
function forTask(db,taskId){
  schema(db);
  const mapping=db.prepare('SELECT * FROM task_plans WHERE task_id=?').get(taskId);
  if(!mapping)return null;
  const p=db.prepare('SELECT * FROM plans WHERE id=?').get(mapping.plan_id);
  const r=db.prepare('SELECT specification FROM plan_revisions WHERE plan_id=? AND version=?').get(mapping.plan_id,mapping.plan_version);
  return {...mapping,title:p.title,request:p.request,currentStatus:p.status,currentVersion:p.version,specification:r.specification};
}
function history(db,id){
  get(db,id);
  return {revisions:db.prepare('SELECT version,at,author,reason FROM plan_revisions WHERE plan_id=? ORDER BY version').all(id),
    events:db.prepare('SELECT at,author,type,detail FROM plan_events WHERE plan_id=? ORDER BY id DESC LIMIT 50').all(id).reverse()};
}
module.exports={schema,create,get,list,revise,approve,complete,bind,forTask,history};
