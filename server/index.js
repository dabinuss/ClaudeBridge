'use strict';
// Dependency-free MCP stdio server for Claude Desktop.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const {spawn, spawnSync} = require('node:child_process');

const root = path.resolve(process.env.BRIDGE_PROJECT || process.env.BRIDGE_PROJECT_TEST || process.cwd());
const meta = path.join(root, '.agent-bridge');
const tasksFile = path.join(meta, 'tasks.json');
const notesFile = path.join(meta, 'handoff.md');
const activityFile = path.join(meta, 'activity.jsonl');
const running = new Map();
const MAX_LOG_BYTES = 8 * 1024 * 1024;
const MAX_NOTES_BYTES = 256 * 1024;
const MAX_TASKS = 1000;
const MAX_INPUT_BYTES = 1024 * 1024;
let codexCache = null;
const now = () => new Date().toISOString();
function safeWrite(file, data) {
  const tmp = file + '.' + process.pid + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, file);
}
function setup() {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('Project directory does not exist: '+root);
  fs.mkdirSync(meta, {recursive:true});
  if (!fs.existsSync(tasksFile)) safeWrite(tasksFile, '{}\n');
  if (!fs.existsSync(notesFile)) safeWrite(notesFile, '# Project handoff\n\n');
  // A process stopped unexpectedly: previous "running" entries are never silently reported as successful.
  const all = load(); let changed=false;
  for (const t of Object.values(all)) if(t.status==='running' || t.status==='queued') {
    t.status='interrupted'; t.updated=now(); t.error='Bridge process restarted; task state must be checked before resuming.';changed=true;
  }
  if (changed) save(all);
}
function load() {
  const value = JSON.parse(fs.readFileSync(tasksFile,'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid task database');
  return value;
}
function save(value) {
  const entries=Object.values(value);
  if(entries.length>MAX_TASKS) {
    const removable=entries.filter(t=>!['queued','running'].includes(t.status))
      .sort((a,b)=>String(a.updated).localeCompare(String(b.updated)));
    for(const task of removable.slice(0,entries.length-MAX_TASKS)) delete value[task.id];
  }
  safeWrite(tasksFile,JSON.stringify(value,null,2)+'\n');
}
function event(kind, taskId, detail) {
  fs.appendFileSync(activityFile, JSON.stringify({at:now(), kind, taskId, detail:String(detail||'').slice(0,1000)})+'\n');
}
function update(id, patch) {const all=load(); if(!all[id])return; Object.assign(all[id],patch,{updated:now()}); save(all); return all[id];}
function checkTaskId(id) {if(!/^[0-9a-f-]{36}$/i.test(String(id||'')))throw Error('Invalid task ID');}
function getTask(id) {checkTaskId(id); const t=load()[id];if(!t)throw Error('Task not found');return t;}
function cliLocation(){
  if(process.env.CODEX_BIN) return path.resolve(process.env.CODEX_BIN);
  if(codexCache && fs.existsSync(codexCache)) return codexCache;
  const which=process.platform==='win32'?'where.exe':'which';
  const found=spawnSync(which,['codex'],{encoding:'utf8',windowsHide:true,timeout:4000});
  const candidates=found.status===0?found.stdout.split(/\r?\n/).map(x=>x.trim()).filter(Boolean):[];
  const binary=candidates.find(x=>/\.(cmd|exe|js)$/i.test(x))||candidates[0]||null;
  if(binary) codexCache=binary;
  return binary;
}
function launchExecutable(binary,args){
  let command=binary, commandArgs=args;
  if(process.platform==='win32' && /\.cmd$/i.test(binary)){
    // Never concatenate CLI arguments into a cmd.exe command: avoid shell injection.
    const entry=path.join(path.dirname(binary),'node_modules','@openai','codex','bin','codex.js');
    if(!fs.existsSync(entry)) throw Error('Codex Windows launcher found, but its Node entrypoint is missing: '+entry);
    command=process.execPath;commandArgs=[entry,...args];
  } else if(/\.js$/i.test(binary)){
    command=process.execPath;commandArgs=[binary,...args];
  } else if(/\.bat$/i.test(binary)){
    throw Error('Unsupported .bat launcher. Configure CODEX_BIN to use codex.cmd or codex.js.');
  }
  return spawn(command,commandArgs,{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false});
}
function appendLimited(file, data) {
  const used=fs.existsSync(file)?fs.statSync(file).size:0;
  if(used<MAX_LOG_BYTES) fs.appendFileSync(file,String(data).slice(0,MAX_LOG_BYTES-used));
}
function startTask(prompt, mode, previous=null, customId=null) {
  if(typeof prompt!=='string' || !prompt.trim() || prompt.length>30000)throw Error('Task must contain 1–30,000 characters');
  if(!['code','review'].includes(mode))throw Error('Mode must be code or review');
  if([...running.values()].some(x=>x.mode==='code') || (mode==='code' && running.size)) throw Error('A Codex job is already running. Wait for completion or cancel it to avoid file conflicts.');
  const binary=cliLocation(); if(!binary) throw Error('Codex CLI not found. Install with npm install -g @openai/codex and run codex login.');
  const id=customId||crypto.randomUUID();
  const prev=previous?getTask(previous):null;
  if(prev && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(prev.sessionId||'')))throw Error('Previous task has no Codex session ID. Start a new task instead.');
  const task={id,mode,prompt,previous:previous||null,created:now(),updated:now(),status:'queued',sessionId:prev?.sessionId||null,lastMessage:'',error:null,usage:null,completed:false};
  const all=load();all[id]=task;save(all); event('task.queued',id,prompt.slice(0,220));
  const args=previous?['exec','resume',prev.sessionId,'--json','-']:['exec','--json','--sandbox',mode==='review'?'read-only':'workspace-write','-'];
  const handoff=fs.readFileSync(notesFile,'utf8').slice(-16000);
  const instructions=[
    'You are Codex working alongside Claude Desktop on the same local project.',
    'Project folder: '+root,
    'Mode: '+mode+'. '+(mode==='review'?'Inspect and report findings. Do not modify files.':'You may modify project files within the workspace.'),
    'Coordinate using the shared notes below. Never edit files under .agent-bridge.',
    'When finished, report precisely what changed, which tests ran, blockers, and suggested next steps.',
    '--- SHARED PROJECT NOTES ---',handoff,'--- CURRENT TASK ---',prompt
  ].join('\n');
  let child;
  try {child=launchExecutable(binary,args);} catch(e){update(id,{status:'failed',error:e.message});throw e;}
  running.set(id,{child,mode});update(id,{status:'running',pid:child.pid||null});event('task.started',id,'pid '+(child.pid||'?'));
  const logFile=path.join(meta,'task-'+id+'.jsonl');
  const rl=readline.createInterface({input:child.stdout});
  let successful=false,hadFailure=false,stderr='';
  rl.on('line',line=>{
    appendLimited(logFile,line.slice(0,256*1024)+'\n');let e;try{e=JSON.parse(line);}catch{return;}
    if(e.type==='thread.started' && e.thread_id) update(id,{sessionId:e.thread_id});
    if(e.type==='item.completed' && e.item?.type==='agent_message') update(id,{lastMessage:String(e.item.text||'').slice(-12000)});
    if(e.type==='item.started' && e.item?.type==='command_execution') update(id,{activity:String(e.item.command||'').slice(0,400)});
    if(e.type==='turn.completed'){successful=true;update(id,{usage:e.usage||null});}
    if(e.type==='turn.failed'||e.type==='error'){hadFailure=true;update(id,{error:String(e.error?.message||e.message||'Codex reported an error').slice(0,1000)});}
  });
  child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-3000);});
  child.stdin.on('error',()=>{});
  child.stdin.end(instructions);
  let finalized=false;
  function finalize(code,signal,error){
    if(finalized)return;finalized=true;running.delete(id);
    const current=getTask(id);
    const cancelled=current.status==='cancelled';
    const status=cancelled?'cancelled':((code===0&&successful&&!hadFailure)?'completed':'failed');
    update(id,{status,completed:status==='completed',exitCode:code,signal:signal||null,error:cancelled?current.error:(error||current.error||((status==='failed')?stderr||'Codex finished without successful turn completion':null))});
    event('task.'+status,id,code===null?'unknown exit':String(code));
  }
  child.on('error',e=>finalize(null,null,e.message));
  child.on('close',(code,signal)=>finalize(code,signal,null));
  return {id,status:'running',mode,project:root,notice:'Codex is working in the background. Use bridge_status with this ID for progress.'};
}
function status(id, includeEvents=false){
  if(id){const t=getTask(id);const data={...t};if(includeEvents){const f=path.join(meta,'task-'+id+'.jsonl');if(fs.existsSync(f)){const lines=fs.readFileSync(f,'utf8').trim().split('\n').slice(-15);data.recentEvents=lines.map(x=>{try{return JSON.parse(x)}catch{return {raw:x.slice(0,200)}}});}}return data;}
  return {project:root,jobs:Object.values(load()).sort((a,b)=>b.created.localeCompare(a.created)).slice(0,30).map(t=>({id:t.id,status:t.status,mode:t.mode,prompt:t.prompt.slice(0,120),updated:t.updated,sessionId:t.sessionId}))};
}
const specs=[
 {name:'bridge_health',description:'Check local project, installed Codex CLI and active jobs.',inputSchema:{type:'object',properties:{}}},
 {name:'bridge_delegate',description:'Start an asynchronous Codex task. mode=code modifies project files; mode=review reads and reviews. Inform user that changes are made locally. Poll bridge_status.',inputSchema:{type:'object',properties:{task:{type:'string',description:'Specific coding or review instruction'},mode:{type:'string',enum:['code','review'],default:'code'}},required:['task']}},
 {name:'bridge_status',description:'Read Codex job status, final message, token usage, recent progress events.',inputSchema:{type:'object',properties:{task_id:{type:'string'},include_events:{type:'boolean'}}}},
 {name:'bridge_cancel',description:'Stop a running Codex task by ID.',inputSchema:{type:'object',properties:{task_id:{type:'string'}},required:['task_id']}},
 {name:'bridge_resume',description:'Continue a previous Codex session with additional instructions. Session must have an ID and not be actively running.',inputSchema:{type:'object',properties:{task_id:{type:'string'},task:{type:'string'}},required:['task_id','task']}},
 {name:'bridge_checkpoint',description:'Append a project checkpoint or handoff from Claude with decisions, completed work, and next steps.',inputSchema:{type:'object',properties:{note:{type:'string'}},required:['note']}},
 {name:'bridge_context',description:'Read shared project handoff notes and latest job summaries.',inputSchema:{type:'object',properties:{}}}
];
function call(name,args={}){
  switch(name){
    case 'bridge_health': {const bin=cliLocation();return {project:root, codexBinary:bin||null,codexAvailable:Boolean(bin), bridgeVersion:'1.0.0',runningTasks:running.size, dataDirectory:meta};}
    case 'bridge_delegate': return startTask(args.task,args.mode||'code');
    case 'bridge_status':return status(args.task_id,Boolean(args.include_events));
    case 'bridge_cancel': {const t=getTask(args.task_id);const entry=running.get(t.id);if(!entry)return {id:t.id,status:t.status,message:'Task is not running in this bridge process.'};update(t.id,{status:'cancelled',error:'Cancelled by user/Claude'});entry.child.kill();if(process.platform==='win32'&&entry.child.pid){spawn('taskkill',['/pid',String(entry.child.pid),'/t','/f'],{windowsHide:true});}return {id:t.id,status:'cancelled'};}
    case 'bridge_resume':{const old=getTask(args.task_id);if(['running','queued'].includes(old.status))throw Error('Task is already running.');return startTask(args.task,old.mode,old.id);}
    case 'bridge_checkpoint': {if(typeof args.note!=='string'||!args.note.trim()||args.note.length>20000)throw Error('Note must contain 1–20,000 characters'); const content='\n## '+now()+' · Claude\n\n'+args.note.trim()+'\n';
      if(fs.statSync(notesFile).size+Buffer.byteLength(content)>MAX_NOTES_BYTES) throw Error('Project handoff is full. Archive or shorten handoff.md before continuing.');
      fs.appendFileSync(notesFile,content);event('checkpoint',null,args.note.slice(0,180));return {saved:true,file:notesFile};}
    case 'bridge_context':return {project:root,notes:fs.readFileSync(notesFile,'utf8').slice(-25000),recentJobs:status().jobs};
    default:throw Error('Unknown tool: '+name);
  }
}
function respond(obj){process.stdout.write(JSON.stringify(obj)+'\n');}
async function handle(req){
  if(!req || req.jsonrpc!=='2.0'||!req.method)return;
  if(req.id===undefined)return;
  try {
    let result;
    if(req.method==='initialize')result={protocolVersion:req.params?.protocolVersion||'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'claudebridge',version:'1.0.0'},instructions:'Call bridge_health, then bridge_context. Delegate independent work with bridge_delegate and poll bridge_status. Save Claude decisions using bridge_checkpoint. Do not assume you can detect Claude subscription limits or read other Claude threads.'};
    else if(req.method==='ping')result={};
    else if(req.method==='tools/list')result={tools:specs};
    else if(req.method==='tools/call'){
      try {result={content:[{type:'text',text:JSON.stringify(call(req.params?.name,req.params?.arguments||{}),null,2)}]};}
      catch(e){result={isError:true,content:[{type:'text',text:String(e.message)}]};}
    }
    else return respond({jsonrpc:'2.0',id:req.id,error:{code:-32601,message:'Method not found'}});
    respond({jsonrpc:'2.0',id:req.id,result});
  }catch(e){respond({jsonrpc:'2.0',id:req.id,error:{code:-32603,message:String(e.message)}});}
}
try{setup();}catch(e){process.stderr.write('Bridge startup error: '+e.message+'\n');process.exit(1);}
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{
  if(Buffer.byteLength(line)>MAX_INPUT_BYTES){process.stderr.write('MCP input too large\n');return;}
  try{handle(JSON.parse(line));}catch(e){process.stderr.write(e.message+'\n');}
});
