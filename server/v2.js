'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const readline=require('node:readline');
const {spawn,spawnSync}=require('node:child_process');
const store=require('./db');
const activeSettings=()=>settings.read(currentProject()?.id||null);
const memory=require('./memory');
const plans=require('./plans');
const settings=require('./settings');
const appUI=require('./app-ui');
const {terminateTree}=require('./process-tree');
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
  const p=currentProject(),bin=codexBinary(),login=auth(),configuration=activeSettings();
  return {ready:Boolean(bin)&&login.status==='signed_in'&&Boolean(p),codexInstalled:Boolean(bin),codexLogin:login.status,mode:configuration.mode,configuration,project:p||null,
    nextStep:!p?'Connect a local project folder using bridge_project.':!bin?'Install the platform-specific extension package with bundled Codex CLI.':
      login.status!=='signed_in'?'One-time sign-in required. Ask Claude to start Codex sign-in or run codex login.':'Ask Claude to delegate a task to Codex.',
    interface:'Natural language in Claude Desktop; no slash commands are required.'};
}
function ensureMemoryMonitor(p){
  const file=path.join(p.path,'.agent-bridge','memory-monitor.pid');
  if(fs.existsSync(file)){
    const pid=Number(fs.readFileSync(file,'utf8').trim());
    if(pid>0){try{process.kill(pid,0);return;}catch{}}
  }
  memory.capture(p.path);
  const child=spawn(process.execPath,[path.join(__dirname,'memory-monitor.js'),p.path],{
    cwd:os.tmpdir(),detached:true,windowsHide:true,stdio:'ignore',shell:false
  });
  child.on('error',()=>{});
  child.unref();
}
function ensureWatchdog(p){
  const file=path.join(p.path,'.agent-bridge','watchdog.pid');
  if(fs.existsSync(file)){
    const pid=Number(fs.readFileSync(file,'utf8').trim());
    if(pid>0){try{process.kill(pid,0);return;}catch{}}
  }
  const child=spawn(process.execPath,[path.join(__dirname,'watchdog.js'),p.path],{
    cwd:os.tmpdir(),detached:true,windowsHide:true,stdio:'ignore',shell:false
  });
  child.on('error',()=>{});
  child.unref();
}
function delegate(args){
  const configuration=activeSettings();
  if(configuration.mode==='off')throw Error('ClaudeBridge is disabled. Switch to Manual, Fallback or Dual mode first.');
  const [p,db]=projectDb();
  try{
    const prompt=String(args.task||'').trim(),mode=args.mode||'review';
    if(configuration.mode==='fallback' && args.trigger!=='limit_confirmed' && args.trigger!=='manual')throw Error('Fallback mode only accepts a confirmed limit event or explicit manual handoff. Claude Desktop has no reliable automatic quota event.');
    if(!prompt||prompt.length>30000)throw Error('Task must contain 1–30,000 characters');
    if(!['code','review'].includes(mode))throw Error('Mode must be code or review');
    if(!codexBinary())throw Error('Codex is missing. Install the platform-specific extension.');
    db.exec('BEGIN IMMEDIATE');
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
    const planId=args.plan_id||null;
    if(planId&&plans.get(db,planId).status!=='active')throw Error('An approved plan is required for plan-bound execution.');
    if(previous){
      const old=task(db,previous);
      if(!old||!old.session_id)throw Error('Previous task has no resumable Codex session.');
      if(['queued','running'].includes(live(old,db).status))throw Error('Previous task is still active');
    }
    addTask(db,{id,mode,prompt,project_path:p.path,worktree:useWorktree,previous});
    if(planId)plans.bind(db,id,planId);
    db.exec('COMMIT');
    const worker=path.join(__dirname,'worker.js');
    const child=spawn(process.execPath,[worker,p.path,id,codexBinary()],{
      cwd:p.path,detached:true,windowsHide:true,stdio:'ignore',shell:false
    });
    child.on('error',()=>{});
    child.unref();
    ensureWatchdog(p);
    ensureMemoryMonitor(p);
    return {id,status:'queued',project:p.name,mode,worktree:useWorktree,
      note:'Codex is running independently. Claude may continue other work. Ask for Codex status or check the project messages.'};
  }catch(e){if(db.isTransaction){try{db.exec('ROLLBACK');}catch{}}throw e;}finally{db.close();}
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
function managePlan(args){
  const [,db]=projectDb();
  try{
    switch(args.action){
      case 'list':return plans.list(db);
      case 'get':return {plan:plans.get(db,args.plan_id),history:plans.history(db,args.plan_id)};
      case 'propose':return plans.create(db,{title:args.title,request:args.original_request,specification:args.plan});
      case 'approve':return plans.approve(db,args.plan_id,args.user_confirmed===true);
      case 'revise':return plans.revise(db,args.plan_id,args.plan,args.reason);
      case 'complete':return plans.complete(db,args.plan_id);
      default:throw Error('Unknown plan action.');
    }
  }finally{db.close();}
}
function sendMessage(args){
  const [,db]=projectDb();
  try{return message(db,'claude',String(args.to||'codex'),args.message,args.task_id||null);}
  finally{db.close();}
}
function workingMemory(args={}){
  if(!activeSettings().memoryEnabled)throw Error('Automatic project memory is disabled in ClaudeBridge settings.');
  const [p,db]=projectDb();db.close();
  ensureMemoryMonitor(p);
  return args.timeline?{project:p.name,timeline:memory.timeline(p.path,args.limit||40)}:memory.digest(p.path);
}
function context(){
  const [p,db]=projectDb();
  try{return {project:p,recentMessages:messages(db,30),recentTasks:listTasks(db,15).map(taskSummary),plans:plans.list(db)};}
  finally{db.close();}
}
function stopTask(args){
  const [,db]=projectDb();
  try{
    const t=task(db,args.task_id);if(!t)throw Error('Unknown task');
    if(!['queued','running'].includes(t.status))return taskSummary(t);
    patchTask(db,t.id,{status:'cancelled'});
    if(t.child_pid)terminateTree(t.child_pid);
    if(t.pid){try{process.kill(t.pid,'SIGTERM');}catch{}}
    message(db,'system','claude','Cancelled Codex task '+t.id,t.id);
    return {id:t.id,status:'cancelled'};
  }finally{db.close();}
}
function worktrees(){
  const [p,db]=projectDb();db.close();
  const result=spawnSync('git',['worktree','list','--porcelain'],{cwd:p.path,encoding:'utf8',timeout:5000,windowsHide:true,maxBuffer:128*1024});
  if(result.status!==0)throw Error('Git worktrees are unavailable: '+String(result.stderr||'not a Git repository').slice(0,500));
  const records=String(result.stdout).trim().split(/\n\s*\n/).filter(Boolean).map(text=>{
    const info={};
    for(const line of text.split(/\r?\n/)){
      const [key,...rest]=line.split(' ');
      if(['worktree','HEAD','branch'].includes(key))info[key]=rest.join(' ');
      if(key==='detached')info.detached=true;
    }
    return info;
  });
  return {project:p.name,worktrees:records,
    guidance:'Worktree changes are not merged automatically. Ask Claude to inspect diffs and integrate changes after review.'};
}
function codexLogin(){
  const bin=codexBinary();
  if(!bin)throw Error('Codex CLI is missing. Install a bundled platform package.');
  if(auth().status==='signed_in')return {status:'signed_in',message:'Codex is already connected to your ChatGPT account.'};
  const file=path.join(store.home,'login-device.log');
  const pidFile=path.join(store.home,'login-process.json');
  let pid=null;
  if(fs.existsSync(pidFile)){
    try{pid=JSON.parse(fs.readFileSync(pidFile,'utf8')).pid;process.kill(pid,0);}
    catch{pid=null;}
  }
  if(!pid){
    fs.writeFileSync(file,'Starting ChatGPT device authentication. Please approve sign-in in your browser.\n',{mode:0o600});
    const fd=fs.openSync(file,'a',0o600);
    const [exe,args]=codexCommand(bin,['login','--device-auth']);
    try{
      const proc=spawn(exe,args,{cwd:store.home,detached:true,windowsHide:true,stdio:['ignore',fd,fd],shell:false});
      proc.on('error',()=>{});
      pid=proc.pid||null;
      proc.unref();
      fs.writeFileSync(pidFile,JSON.stringify({pid,started:new Date().toISOString()}),{mode:0o600});
    }finally{fs.closeSync(fd);}
  }
  const output=fs.readFileSync(file,'utf8').slice(-5000);
  return {status:'action_required',loginProcessId:pid,
    instructions:output,
    nextStep:'Open the verification URL and enter the device code shown above. Then tell Claude: "Check whether Codex is signed in." If no code is visible yet, ask Claude to start/check Codex login again. If device login is unavailable, use codex login in a terminal.'};
}
const props=(o,required=[])=>({type:'object',properties:o,required});
const specs=[
 {name:'bridge_health',description:'Check whether ClaudeBridge is installed, Codex is signed in, and a local project is selected. Use this automatically when user mentions Codex.',inputSchema:props({})},
 {name:'bridge_settings',description:'Get or change ClaudeBridge mode: off, manual, fallback, dual. Fallback requires an explicit handoff or supported external trigger, not an invented quota event. Updates also affect optional desktop UI.',inputSchema:props({action:{type:'string',enum:['get','set']},mode:{type:'string',enum:['off','manual','fallback','dual']},memoryEnabled:{type:'boolean'},autoResume:{type:'boolean'}},['action'])},
 {name:'bridge_control_panel',description:'Open the interactive ClaudeBridge settings panel inside the existing Claude conversation, including Off/Manual/Fallback/Dual, memory, and Codex installation and login status.',inputSchema:props({}),_meta:{ui:{resourceUri:appUI.URI}}},
 {name:'bridge_project',description:'Register and activate a local code project, switch projects, or list available projects. Ask user for a path only if none is known.',inputSchema:props({action:{type:'string',enum:['list','register','select']},path:{type:'string'},name:{type:'string'},id:{type:'string'}},['action'])},
 {name:'bridge_delegate',description:'Delegate work. For execution of an agreed plan, include plan_id so Codex receives its immutable approved revision. Never invent user approval.',inputSchema:props({task:{type:'string'},mode:{type:'string',enum:['code','review']},worktree:{type:'boolean'},previous:{type:'string'},plan_id:{type:'string'},trigger:{type:'string',enum:['manual','limit_confirmed']}},['task'])},
 {name:'bridge_plan',description:'Persist original user request and explicit plan, view history, propose revisions, or activate only after the user approves. When asked to create a plan, first save the proposed plan. Do not execute a draft without approval.',inputSchema:props({action:{type:'string',enum:['list','get','propose','approve','revise','complete']},plan_id:{type:'string'},title:{type:'string'},original_request:{type:'string'},plan:{type:'string'},reason:{type:'string'},user_confirmed:{type:'boolean'}},['action'])},
 {name:'bridge_status',description:'Report Codex progress, completion or an interrupted task. If no task ID, list recent tasks.',inputSchema:props({task_id:{type:'string'}})},
 {name:'bridge_context',description:'Read durable agent messages and recent tasks for the current project.',inputSchema:props({})},
 {name:'bridge_memory',description:'Read token-efficient automatically timestamped project timeline, file changes, Git changes, decisions and resumable tasks.',inputSchema:props({timeline:{type:'boolean'},limit:{type:'integer',minimum:1,maximum:100}})},
 {name:'bridge_message',description:'Post a message for another agent. Messages are persisted in the project database and included in future Codex tasks.',inputSchema:props({message:{type:'string'},to:{type:'string'},task_id:{type:'string'}},['message'])},
 {name:'bridge_checkpoint',description:'Write a durable handoff/decision that will appear in Codex tasks.',inputSchema:props({note:{type:'string'}},['note'])},
 {name:'bridge_cancel',description:'Stop an active Codex task.',inputSchema:props({task_id:{type:'string'}},['task_id'])},
 {name:'bridge_resume',description:'Resume a previous Codex session with a new task.',inputSchema:props({task_id:{type:'string'},task:{type:'string'}},['task_id','task'])},
 {name:'bridge_worktrees',description:'List current Git worktrees so Claude can inspect independent Codex changes before merging them.',inputSchema:props({})},
 {name:'bridge_login',description:'Guide the user through one-time Codex ChatGPT authentication. Requires user action.',inputSchema:props({})}
];
function call(name,args={}){
  switch(name){
    case 'bridge_health':return diagnose();
    case 'bridge_control_panel':return {settings:activeSettings(),health:diagnose(),panel:'ClaudeBridge Control Panel'};
    case 'bridge_settings':return args.action==='get'?activeSettings():args.action==='set'?settings.write(args,currentProject()?.id||null):(()=>{throw Error('Unknown settings action');})();
    case 'bridge_project':{
      if(args.action==='list')return registeredProjects();
      if(args.action==='register'){
        const p=registerProject(args.path,args.name);ensureMemoryMonitor(p);return p;
      }
      if(args.action==='select'){
        const p=chooseProject(args.id);ensureMemoryMonitor(p);return p;
      }
      throw Error('Unknown project action');
    }
    case 'bridge_delegate':return delegate(args);
    case 'bridge_plan':return managePlan(args);
    case 'bridge_status':return bridgeStatus(args);
    case 'bridge_context':return context();
    case 'bridge_memory':return workingMemory(args);
    case 'bridge_message':return sendMessage(args);
    case 'bridge_checkpoint':return sendMessage({to:'all',message:args.note});
    case 'bridge_cancel':return stopTask(args);
    case 'bridge_resume':return delegate({task:args.task,previous:args.task_id,mode:(()=>{const [,db]=projectDb();try{return task(db,args.task_id)?.mode||'review';}finally{db.close();}})(),worktree:false});
    case 'bridge_worktrees':return worktrees();
    case 'bridge_login':return codexLogin();
    default:throw Error('Unknown tool: '+name);
  }
}
function respond(obj){process.stdout.write(JSON.stringify(obj)+'\n');}
async function handle(req){
  if(!req||req.jsonrpc!=='2.0'||!req.method||req.id===undefined)return;
  try{
    let result;
    if(req.method==='initialize')result={protocolVersion:req.params?.protocolVersion||'2025-06-18',serverInfo:{name:'claudebridge',version:'2.2.0'},capabilities:{tools:{},resources:{}},
      instructions:'Use ClaudeBridge naturally. First read bridge_settings and bridge_health for coding requests. If mode=off do not delegate. If mode=manual delegate when asked. If mode=dual, use bridge_context and bridge_memory, split substantial coding tasks into independent work and delegate one to Codex while Claude works on separate files; avoid simultaneous edits to the same file. If mode=fallback do not start Codex unless the user requests handoff or an actual external quota event is confirmed; the bridge cannot detect Claude quota through MCP alone. When user wants UI controls, open bridge_control_panel. Save explicit instructions and proposed plans with bridge_plan and bind approved plan IDs when delegating. Consult the mailbox, inspect all Codex worktrees before merging, and report status plainly. Never claim to read hidden Claude threads, automatically detect quota, or replace the native model picker.'};
    else if(req.method==='ping')result={};
    else if(req.method==='tools/list')result={tools:specs};
    else if(req.method==='resources/list')result=appUI.listResources();
    else if(req.method==='resources/read')result=appUI.readResource(req.params?.uri);
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