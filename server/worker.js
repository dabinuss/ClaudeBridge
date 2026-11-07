'use strict';
// Detached task worker. Survives Claude Desktop MCP restarts; uses SQLite WAL for coordination.
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');
const {spawn,spawnSync}=require('node:child_process');
const {openDb,task,patchTask,message,now}=require('./db');
const [projectPath,id,bundled]=process.argv.slice(2);
const project={path:projectPath};
const db=openDb(project);
let t=task(db,id);
if(!t)process.exit(2);
const log=path.join(projectPath,'.agent-bridge','task-'+id+'.jsonl');
const MAX_LOG=8*1024*1024;
function append(line){
  const len=fs.existsSync(log)?fs.statSync(log).size:0;
  if(len>=MAX_LOG)return;
  fs.appendFileSync(log,String(line).slice(0,Math.max(0,MAX_LOG-len)));
}
function cli(){
  const candidates=[bundled,process.env.CODEX_BIN].filter(Boolean);
  for(const c of candidates)if(fs.existsSync(c))return c;
  const found=spawnSync(process.platform==='win32'?'where.exe':'which',['codex'],{encoding:'utf8',windowsHide:true,timeout:4000});
  if(found.status===0)return found.stdout.split(/\r?\n/).map(x=>x.trim()).find(x=>/\.(exe|cmd|js)$/i.test(x))||found.stdout.split(/\r?\n/)[0].trim();
  throw Error('Codex not installed. Reinstall the platform-specific ClaudeBridge extension.');
}
function command(binary){
  if(/\.js$/i.test(binary))return [process.execPath,[binary]];
  if(process.platform==='win32'&&/\.cmd$/i.test(binary)){
    const entry=path.join(path.dirname(binary),'node_modules','@openai','codex','bin','codex.js');
    if(!fs.existsSync(entry))throw Error('Invalid Codex Windows launcher');
    return [process.execPath,[entry]];
  }
  if(/\.bat$/i.test(binary))throw Error('Unsupported batch launcher');
  return [binary,[]];
}
function finish(error,code){
  clearInterval(heartbeat);clearTimeout(timeout);
  const state=task(db,id);
  if(state.status==='cancelled')return;
  const successful=!error&&code===0&&turnCompleted&&!turnFailed;
  patchTask(db,id,{status:successful?'completed':'failed',error:successful?null:String(error||state.error||'Codex exited without completing the turn').slice(0,1000),exit_code:code});
  message(db,'system','claude',successful?'Codex task completed: '+id:'Codex task failed: '+id+' '+String(error||''),id);
  db.close();
}
let heartbeat,timeout,turnCompleted=false,turnFailed=false;
try{
  const binary=cli();
  const [exe,base]=command(binary);
  const args=t.previous?['exec','resume',t.previous,'--json','-']:['exec','--json','--sandbox',t.mode==='review'?'read-only':'workspace-write'];
  if(!t.previous&&t.worktree&&t.mode==='code')args.push('--worktree');
  args.push('-');
  const context=db.prepare('SELECT sender,body FROM messages ORDER BY created DESC LIMIT 30').all().reverse();
  const prompt=[
    'You are Codex collaborating with Claude via ClaudeBridge.',
    'Project root: '+projectPath,
    'Mode: '+t.mode,
    'Do not edit .agent-bridge or the SQLite database.',
    'For parallel work, keep changes isolated to the Codex-managed Git worktree. Never merge automatically.',
    'Report work performed, files changed, tests, blockers, and concrete next steps.',
    'Messages from Claude and other agents:',
    ...context.map(x=>x.sender+': '+x.body),
    'Task:',t.prompt
  ].join('\n');
  const child=spawn(exe,[...base,...args],{cwd:projectPath,windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false});
  patchTask(db,id,{status:'running',pid:process.pid,heart_beat:now()});
  message(db,'system','claude','Codex started task '+id,id);
  heartbeat=setInterval(()=>patchTask(db,id,{heart_beat:now()}),5000);
  timeout=setTimeout(()=>{turnFailed=true;patchTask(db,id,{error:'Task timed out after 45 minutes'});child.kill();if(process.platform==='win32'&&child.pid)spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});},45*60*1000);
  const lines=readline.createInterface({input:child.stdout});
  lines.on('line',line=>{
    append(line.slice(0,256*1024)+'\n');
    let e;try{e=JSON.parse(line);}catch{return;}
    if(e.type==='thread.started'&&typeof e.thread_id==='string'&&/^[0-9a-f-]{36}$/i.test(e.thread_id))patchTask(db,id,{session_id:e.thread_id});
    if(e.type==='item.completed'&&e.item?.type==='agent_message'){
      const msg=String(e.item.text||'').slice(-12000);
      patchTask(db,id,{last_message:msg});
      message(db,'codex','claude',msg.slice(0,4000),id);
    }
    if(e.type==='turn.completed')turnCompleted=true;
    if(e.type==='turn.failed'||e.type==='error'){turnFailed=true;patchTask(db,id,{error:String(e.error?.message||e.message||'Codex error').slice(0,1000)});}
  });
  let stderr='';
  child.stderr.on('data',c=>{stderr=(stderr+String(c)).slice(-3000);});
  child.stdin.on('error',()=>{});
  child.stdin.end(prompt);
  child.on('error',e=>finish(e.message,null));
  child.on('close',code=>finish(turnFailed?stderr||'Codex reported an error':null,code));
  process.on('SIGTERM',()=>{patchTask(db,id,{status:'cancelled'});child.kill();});
}catch(e){
  patchTask(db,id,{status:'failed',error:e.message.slice(0,1000)});
  message(db,'system','claude','Codex failed to start: '+e.message,id);
  db.close();process.exitCode=1;
}