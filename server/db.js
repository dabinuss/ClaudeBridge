'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const now=()=>new Date().toISOString();
const home=path.join(os.homedir(),'.claudebridge');
const registryPath=path.join(home,'projects.json');
fs.mkdirSync(home,{recursive:true});
function atomicWrite(file,value){
  const tmp=file+'.'+process.pid+'.'+crypto.randomUUID()+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function loadRegistry(){
  if(!fs.existsSync(registryPath))return {active:null,projects:{}};
  const r=JSON.parse(fs.readFileSync(registryPath,'utf8'));
  if(!r||typeof r!=='object'||!r.projects||typeof r.projects!=='object')throw Error('Invalid project registry');
  return r;
}
function registeredProjects(){return loadRegistry();}
function registerProject(input,name){
  if(typeof input!=='string'||!path.isAbsolute(input))throw Error('Select an absolute, existing local project folder');
  const real=fs.realpathSync(input);
  if(!fs.statSync(real).isDirectory())throw Error('Project folder must be a directory');
  const r=loadRegistry();
  const id=crypto.createHash('sha256').update(real).digest('hex').slice(0,16);
  r.projects[id]={id,name:String(name||path.basename(real)).slice(0,100),path:real,registered:now()};
  r.active=id;atomicWrite(registryPath,r);return r.projects[id];
}
function chooseProject(id){
  const r=loadRegistry();
  const p=r.projects[id];
  if(!p)throw Error('Unknown project. List projects first.');
  if(!fs.existsSync(p.path))throw Error('Project folder is no longer available');
  r.active=id;atomicWrite(registryPath,r);return p;
}
function currentProject(){
  const r=loadRegistry();
  return r.projects[r.active]||null;
}
function openDb(project){
  if(!project||!project.path)throw Error('No project selected. Ask Claude to connect a local code folder first.');
  const dir=path.join(project.path,'.agent-bridge');
  fs.mkdirSync(dir,{recursive:true});
  const gitignore=path.join(dir,'.gitignore');
  if(!fs.existsSync(gitignore))fs.writeFileSync(gitignore,'*\n',{mode:0o600});
  const db=new DatabaseSync(path.join(dir,'state.sqlite'),{timeout:5000});
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, mode TEXT NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL, session_id TEXT, pid INTEGER, created TEXT NOT NULL, updated TEXT NOT NULL, last_message TEXT DEFAULT '', error TEXT, project_path TEXT NOT NULL, worktree INTEGER DEFAULT 0, exit_code INTEGER, heart_beat TEXT, last_activity TEXT DEFAULT '', previous TEXT);");
  db.exec("CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, created TEXT NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, body TEXT NOT NULL, task_id TEXT);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_task_updated ON tasks(updated); CREATE INDEX IF NOT EXISTS idx_msg_time ON messages(created);");
  return db;
}
function addTask(db,task){
  db.prepare('INSERT INTO tasks(id,mode,prompt,status,created,updated,project_path,worktree,previous) VALUES(?,?,?,?,?,?,?,?,?)').run(task.id,task.mode,task.prompt,'queued',now(),now(),task.project_path,task.worktree?1:0,task.previous||null);
}
function patchTask(db,id,patch){
  const allowed=['status','session_id','pid','updated','last_message','error','exit_code','heart_beat','last_activity'];
  const keys=Object.keys(patch).filter(k=>allowed.includes(k));
  if(!keys.length)return;
  const sql='UPDATE tasks SET '+keys.map(k=>k+'=?').join(',')+',updated=? WHERE id=?';
  db.prepare(sql).run(...keys.map(k=>patch[k]),now(),id);
}
function task(db,id){return db.prepare('SELECT * FROM tasks WHERE id=?').get(id);}
function listTasks(db,limit=20){return db.prepare('SELECT * FROM tasks ORDER BY updated DESC LIMIT ?').all(Math.min(Math.max(limit,1),50));}
function message(db,sender,recipient,body,taskId=null){
  if(typeof body!=='string'||!body.trim()||body.length>10000)throw Error('Message must contain 1–10,000 characters');
  const row={id:crypto.randomUUID(),created:now(),sender,recipient,body:body.trim(),taskId};
  db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(row.id,row.created,row.sender,row.recipient,row.body,taskId);
  db.exec('DELETE FROM messages WHERE id IN (SELECT id FROM messages ORDER BY created DESC LIMIT -1 OFFSET 2000)');
  return row;
}
function messages(db,limit=30){return db.prepare('SELECT * FROM messages ORDER BY created DESC LIMIT ?').all(Math.min(Math.max(limit,1),100)).reverse();}
module.exports={home,now,registerProject,chooseProject,currentProject,registeredProjects,openDb,addTask,patchTask,task,listTasks,message,messages};