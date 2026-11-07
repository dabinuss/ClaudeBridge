'use strict';
// Detached task worker. Survives Claude Desktop MCP restarts; uses SQLite WAL for coordination.
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');
const {spawn,spawnSync}=require('node:child_process');
const {openDb,task,patchTask,message,now}=require('./db');
const plans=require('./plans');
const memory=require('./memory');
const {terminateTree}=require('./process-tree');
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
let finalized=false;
function finish(error,code){
  if(finalized)return;finalized=true;
  clearInterval(heartbeat);clearTimeout(timeout);
  const state=task(db,id);
  if(state.status==='cancelled'){db.close();return;}
  const successful=!error&&code===0&&turnCompleted&&!turnFailed;
  patchTask(db,id,{status:successful?'completed':'failed',error:successful?null:String(error||state.error||'Codex exited without completing the turn').slice(0,1000),exit_code:code});
  message(db,'system','claude',successful?'Codex task completed: '+id:'Codex task failed: '+id+' '+String(error||''),id);
  db.close();
}
let heartbeat,timeout,turnCompleted=false,turnFailed=false;
try{
  const binary=cli();
  const [exe,base]=command(binary);
  const previousTask=t.previous?task(db,t.previous):null;
  if(t.previous&&(!previousTask||!previousTask.session_id))throw Error('Previous Codex session is not available for resume.');
  const args=t.previous
    ?(t.worktree&&t.mode==='code'
      ?['exec','fork',previousTask.session_id,'--json','--sandbox','workspace-write','--worktree']
      :['exec','resume',previousTask.session_id,'--json','--sandbox',t.mode==='review'?'read-only':'workspace-write'])
    :['exec','--json','--sandbox',t.mode==='review'?'read-only':'workspace-write'];
  const mailbox=path.join(__dirname,'agent-mcp.js');
  args.push('-c','mcp_servers.claudebridge_mailbox.command='+JSON.stringify(process.execPath));
  args.push('-c','mcp_servers.claudebridge_mailbox.args='+JSON.stringify([mailbox,projectPath,id]));
  if(!t.previous&&t.worktree&&t.mode==='code')args.push('--worktree');
  args.push('-');
  const context=db.prepare('SELECT sender,body FROM messages ORDER BY created DESC LIMIT 30').all().reverse();
  const boundPlan=plans.forTask(db,id);
  const handoff=memory.digest(projectPath);
  const prompt=[
    'You are Codex collaborating with Claude via ClaudeBridge.',
    'Project root: '+projectPath,
    'Mode: '+t.mode,
    'ORIGINAL REQUEST AND APPROVED PLAN CONTRACT:',
    boundPlan?JSON.stringify(boundPlan):'No approved plan is bound to this task. Follow the explicit task only.',
    'A plan-bound task must follow the bound version. If you discover that it is invalid or conflicts with a newer plan, report the conflict to Claude through the mailbox; do not silently replace it.',
    'PROJECT HANDOFF SNAPSHOT:',
    JSON.stringify(handoff),
    'Do not edit .agent-bridge or the SQLite database.',
    t.worktree?'For parallel work, keep changes isolated to the Codex-managed Git worktree. Never merge automatically.':'Coordinate file ownership and do not overwrite Claude changes. No isolated worktree is active.',
    'The ClaudeBridge mailbox MCP server is available: use read_messages at the start and when you need updates; send_message to tell Claude about blockers or progress; checkpoint important decisions. Never wait indefinitely for a reply.',
    'Report work performed, files changed, tests, blockers, and concrete next steps.',
    'Messages from Claude and other agents:',
    ...context.map(x=>x.sender+': '+x.body),
    'Task:',t.prompt
  ].join('\n');
  const child=spawn(exe,[...base,...args],{cwd:projectPath,windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false,detached:process.platform!=='win32'});
  const claimed=db.prepare("UPDATE tasks SET status='running',pid=?,child_pid=?,heart_beat=?,updated=? WHERE id=? AND status='queued'")
    .run(process.pid,child.pid||null,now(),now(),id);
  if(claimed.changes!==1){
    terminateTree(child.pid);
    db.close();
    process.exit(0);
  }
  message(db,'system','claude','Codex started task '+id,id);
  heartbeat=setInterval(()=>{
    try {
      if(task(db,id)?.status==='cancelled') {turnFailed=true;terminateTree(child.pid);return;}
      patchTask(db,id,{heart_beat:now()});
    } catch(e){process.stderr.write('Heartbeat error: '+e.message+'\n');}
  },5000);
  timeout=setTimeout(()=>{
    turnFailed=true;
    patchTask(db,id,{error:'Task timed out after 45 minutes'});
    terminateTree(child.pid);
  },45*60*1000);
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
  process.on('SIGTERM',()=>{
    patchTask(db,id,{status:'cancelled'});
    terminateTree(child.pid);
  });
}catch(e){
  patchTask(db,id,{status:'failed',error:e.message.slice(0,1000)});
  message(db,'system','claude','Codex failed to start: '+e.message,id);
  db.close();process.exitCode=1;
}