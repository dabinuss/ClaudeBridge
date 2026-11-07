'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const readline=require('node:readline');
const {spawn,spawnSync}=require('node:child_process');
const store=require('./db');
const {registerProject,chooseProject,currentProject,registeredProjects,openDb,addTask,patchTask,task,listTasks,message,messages}=store;
const bundled=path.resolve(__dirname,'..','vendor','node_modules','@openai','codex','bin','codex.js');
function codexBinary(){
  if(fs.existsSync(bundled))return bundled;
  if(process.env.CODEX_BIN&&fs.existsSync(process.env.CODEX_BIN))return process.env.CODEX_BIN;
  const found=spawnSync(process.platform==='win32'?'where.exe':'which',['codex'],{encoding:'utf8',timeout:4000,windowsHide:true});
  return found.status===0?found.stdout.split(/\r?\n/).find(Boolean)?.trim():null;
}
function codexCommand(binary,args){
  if(/\.js$/i.test(binary))return [process.execPath,[binary,...args]];
  if(process.platform==='win32'&&/\.cmd$/i.test(binary)){
    const script=path.join(path.dirname(binary),'node_modules','@openai','codex','bin','codex.js');
    if(!fs.existsSync(script))throw Error('Codex launcher is invalid. Reinstall the extension.');
    return [process.execPath,[script,...args]];
  }
  if(/\.bat$/i.test(binary))throw Error('Unsupported Codex launcher.');
  return [binary,args];
}
function auth(){
  const bin=codexBinary();if(!bin)return {status:'missing'};
  try{
    const [exe,args]=codexCommand(bin,['login','status']);
    const r=spawnSync(exe,args,{encoding:'utf8',timeout:5000,windowsHide:true,maxBuffer:65536});
    return {status:r.status===0?'signed_in':'not_signed_in'};
  }catch(e){return {status:'unknown',reason:e.message};}
}
function projectDb(){
  const p=currentProject();
  if(!p)throw Error('No project selected. Tell Claude: "Connect my local project folder" and provide the folder path.');
  return [p,openDb(p)];
}
function taskSummary(t){
  return {id:t.id,mode:t.mode,status:t.status,updated:t.updated,sessionId:t.session_id,worktree:Boolean(t.worktree),lastMessage:t.last_message,error:t.error,task:t.prompt.slice(0,200)};
}
function live(t,db){
  if(t.status!=='running'&&t.status!=='queued')return t;
  if(t.status==='queued'&&Date.now()-Date.parse(t.created)<30000)return t;
  if(t.status==='running'&&t.heart_beat&&Date.now()-Date.parse(t.heart_beat)<30000)return t;
  let alive=false;
  if(t.pid){try{process.kill(t.pid,0);alive=true;}catch{}}
  if(!alive){patchTask(db,t.id,{status:'interrupted',error:'Worker is no longer responding. Resume this session or create a new job.'});return task(db,t.id);}
  return t;
}
function diagnose(){
  const p=currentProject(),bin=codexBinary(),login=auth();
  return {ready:Boolean(bin)&&login.status==='signed_in'&&Boolean(p),codexInstalled:Boolean(bin),codexLogin:login.status,project:p||null,
    nextStep:!p?'Connect a local project folder using bridge_project.':!bin?'Install the platform-specific extension package with bundled Codex CLI.':
      login.status!=='signed_in'?'One-time sign-in required. Ask Claude to start Codex sign-in or run codex login.':'Ask Claude to delegate a task to Codex.',
    interface:'Natural language in Claude Desktop; no slash commands are required.'};
}
function delegate(args){
  const [p,db]=projectDb();
  try{
    const prompt=String(args.task||'').trim(),mode=args.mode||'review';
    if(!prompt||prompt.length>30000)throw Error('Task must contain 1–30,000 characters');
    if(!['code','review'].includes(mode))throw Error('Mode must be code or review');
    if(!codexBinary())throw Error('Codex is missing. Install the platform-specific extension.');
    const busy=listTasks(db,50).map(t=>live(t,db)).filter(t=>['queued','running'].includes(t.status));
    if(busy.length>=3)throw Error('Three Codex tasks are already active. Wait or cancel one.');
    const useWorktree=mode==='code'&&args.worktree!==false;
    if(mode==='code'&&!useWorktree&&busy.some(t=>t.mode==='code'))throw Error('A direct-write task is already running. Enable worktree isolation.');
    if(useWorktree){
      const git=spawnSync('git',['rev-parse','--is-inside-work-tree'],{cwd:p.path,encoding:'utf8',timeout:3000,windowsHide:true});
      if(git.status!==0)throw Error('Git worktree mode requires a Git repository. Run git init, or explicitly choose direct-write mode.');
    }
    const id=crypto.randomUUID();
    const previous=args.previous||null;
    if(previous){
      const old=task(db,previous);
      if(!old||!old.session_id)throw Error('Previous task has no resumable Codex session.');
      if(['queued','running'].includes(live(old,db).status))throw Error('Previous task is still active');
    }
    addTask(db,{id,mode,prompt,project_path:p.path,worktree:useWorktree,previous});
    const worker=path.join(__dirname,'worker.js');
    const child=spawn(process.execPath,[worker,p.path,id,codexBinary()],{
      cwd:p.path,detached:true,windowsHide:true,stdio:'ignore',shell:false
    });
    child.on('error',()=>{});
    child.unref();
    return {id,status:'queued',project:p.name,mode,worktree:useWorktree,
      note:'Codex is running independently. Claude may continue other work. Ask for Codex status or check the project messages.'};
  }finally{db.close();}
}
function bridgeStatus(args){
  const [p,db]=projectDb();
  try{
    if(args.task_id){
      if(!/^[0-9a-f-]{36}$/i.test(args.task_id))throw Error('Invalid task ID');
      const t=task(db,args.task_id);if(!t)throw Error('Unknown task');
      return taskSummary(live(t,db));
    }
    return {project:p,jobs:listTasks(db,30).map(t=>taskSummary(live(t,db)))};
  }finally{db.close();}
}
function sendMessage(args){
  const [,db]=projectDb();
  try{return message(db,'claude',String(args.to||'codex'),args.message,args.task_id||null);}
  finally{db.close();}
}
function context(){
  const [p,db]=projectDb();
  try{return {project:p,recentMessages:messages(db,30),recentTasks:listTasks(db,15).map(taskSummary)};}
  finally{db.close();}
}
function stopTask(args){
  const [,db]=projectDb();
  try{
    const t=task(db,args.task_id);if(!t)throw Error('Unknown task');
    if(!['queued','running'].includes(t.status))return taskSummary(t);
    patchTask(db,t.id,{status:'cancelled'});
    if(t.pid){try{process.kill(t.pid,'SIGTERM');}catch{}}
    return {id:t.id,status:'cancelled'};
  }finally{db.close();}
}
function codexLogin(){
  const bin=codexBinary();if(!bin)throw Error('Codex not installed.');
  if(auth().status==='signed_in')return {status:'signed_in',message:'Already connected to your ChatGPT account.'};
  // Start the device authorization flow and show its code / URL in Claude.
  const [exe,args]=codexCommand(bin,['login','--device-auth']);
  const result=spawnSync(exe,args,{encoding:'utf8',timeout:12000,windowsHide:true,maxBuffer:65536});
  return {status:'action_required',instructions:String((result.stdout||'')+'\n'+(result.stderr||'')).slice(0,3000),
    fallback:'If no device code was shown, open a terminal and run codex login. Sign-in cannot be completed without user approval.'};
}
const props=(o,required=[])=>({type:'object',properties:o,required});
const specs=[
 {name:'bridge_health',description:'Check whether ClaudeBridge is installed, Codex is signed in, and a local project is selected. Use this automatically when user mentions Codex.',inputSchema:props({})},
 {name:'bridge_project',description:'Register and activate a local code project, switch projects, or list available projects. Ask user for a path only if none is known.',inputSchema:props({action:{type:'string',enum:['list','register','select']},path:{type:'string'},name:{type:'string'},id:{type:'string'}},['action'])},
 {name:'bridge_delegate',description:'Delegate coding or read-only review work to a detached Codex worker. Claude can work concurrently. Writing tasks default to a safe Git worktree; do not claim that a worktree is merged into the main project.',inputSchema:props({task:{type:'string'},mode:{type:'string',enum:['code','review']},worktree:{type:'boolean'},previous:{type:'string'}},['task'])},
 {name:'bridge_status',description:'Report Codex progress, completion or an interrupted task. If no task ID, list recent tasks.',inputSchema:props({task_id:{type:'string'}})},
 {name:'bridge_context',description:'Read durable agent messages and recent tasks for the current project.',inputSchema:props({})},
 {name:'bridge_message',description:'Post a message for another agent. Messages are persisted in the project database and included in future Codex tasks.',inputSchema:props({message:{type:'string'},to:{type:'string'},task_id:{type:'string'}},['message'])},
 {name:'bridge_checkpoint',description:'Write a durable handoff/decision that will appear in Codex tasks.',inputSchema:props({note:{type:'string'}},['note'])},
 {name:'bridge_cancel',description:'Stop an active Codex task.',inputSchema:props({task_id:{type:'string'}},['task_id'])},
 {name:'bridge_resume',description:'Resume a previous Codex session with a new task.',inputSchema:props({task_id:{type:'string'},task:{type:'string'}},['task_id','task'])},
 {name:'bridge_login',description:'Guide the user through one-time Codex ChatGPT authentication. Requires user action.',inputSchema:props({})}
];
function call(name,args={}){
  switch(name){
    case 'bridge_health':return diagnose();
    case 'bridge_project':{
      if(args.action==='list')return registeredProjects();
      if(args.action==='register')return registerProject(args.path,args.name);
      if(args.action==='select')return chooseProject(args.id);
      throw Error('Unknown project action');
    }
    case 'bridge_delegate':return delegate(args);
    case 'bridge_status':return bridgeStatus(args);
    case 'bridge_context':return context();
    case 'bridge_message':return sendMessage(args);
    case 'bridge_checkpoint':return sendMessage({to:'all',message:args.note});
    case 'bridge_cancel':return stopTask(args);
    case 'bridge_resume':return delegate({task:args.task,previous:args.task_id,mode:(()=>{const [,db]=projectDb();try{return task(db,args.task_id)?.mode||'review';}finally{db.close();}})(),worktree:false});
    case 'bridge_login':return codexLogin();
    default:throw Error('Unknown tool: '+name);
  }
}
function respond(obj){process.stdout.write(JSON.stringify(obj)+'\n');}
async function handle(req){
  if(!req||req.jsonrpc!=='2.0'||!req.method||req.id===undefined)return;
  try{
    let result;
    if(req.method==='initialize')result={protocolVersion:req.params?.protocolVersion||'2025-06-18',serverInfo:{name:'claudebridge',version:'2.0.0'},capabilities:{tools:{}},
      instructions:'Use ClaudeBridge naturally. When a user asks for Codex help, check bridge_health, register or select the project if needed, and delegate work. Check bridge_context for messages. Tell the user when a Git worktree needs separate review/merge. Never claim to read hidden Claude threads or automatically detect Claude subscription quotas.'};
    else if(req.method==='ping')result={};
    else if(req.method==='tools/list')result={tools:specs};
    else if(req.method==='tools/call'){
      try{result={content:[{type:'text',text:JSON.stringify(call(req.params?.name,req.params?.arguments||{}),null,2)}]};}
      catch(e){result={isError:true,content:[{type:'text',text:String(e.message)}]};}
    }else return respond({jsonrpc:'2.0',id:req.id,error:{code:-32601,message:'Method not found'}});
    respond({jsonrpc:'2.0',id:req.id,result});
  }catch(e){respond({jsonrpc:'2.0',id:req.id,error:{code:-32603,message:String(e.message)}});}
}
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{
  if(Buffer.byteLength(line)>1024*1024)return;
  try{handle(JSON.parse(line));}catch(e){process.stderr.write('Invalid MCP input: '+e.message+'\n');}
});