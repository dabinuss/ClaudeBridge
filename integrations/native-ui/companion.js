'use strict';
// Optional Electron Chrome DevTools Protocol *pipe* companion.
// No HTTPS proxy, trusted CA, network debugging port, asar patch or chat interception.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn,spawnSync}=require('node:child_process');
const settings=require('./settings');
const {CDPPipe}=require('./cdp');
const home=path.join(os.homedir(),'.claudebridge');
const configPath=path.join(__dirname,'native-ui.json');
const config=JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));
const renderer=fs.readFileSync(path.join(__dirname,'renderer.js'),'utf8');
const bin=String(config.claudeExe||'');
if(process.platform!=='win32')throw Error('This companion launcher currently supports Windows only.');
if(!path.isAbsolute(bin)||!fs.existsSync(bin))throw Error('Claude Desktop executable was not found. Re-run Native Picker setup.');
if(!fs.statSync(bin).isFile())throw Error('Claude executable is not a regular file.');
const root=String(config.extensionRoot||'');
const codex=path.join(root,'vendor','node_modules','@openai','codex','bin','codex.js');
const logPath=path.join(home,'native-device-login.log');
let loginProcess=null;

function activeProject(){
 try {
  const registry=JSON.parse(fs.readFileSync(path.join(home,'projects.json'),'utf8'));
  return registry.projects?.[registry.active]||null;
 }catch{return null;}
}
function codexStatus(){
 if(!fs.existsSync(codex))return {codexInstalled:false,codexLogin:'missing'};
 const run=spawnSync(process.execPath,[codex,'login','status'],{
  windowsHide:true,encoding:'utf8',timeout:4000,maxBuffer:32768
 });
 return {codexInstalled:true,codexLogin:run.status===0?'signed_in':'not_signed_in'};
}
function status(){
 const project=activeProject();
 const cfg=settings.read(project?.id||null);
 return {...cfg,...codexStatus(),project:project?{name:project.name,id:project.id}:null,
  instructions:fs.existsSync(logPath)?fs.readFileSync(logPath,'utf8').slice(-1200):''};
}
function startLogin(){
 if(!fs.existsSync(codex))return { ...status(),instructions:'Codex CLI is missing. Reinstall ClaudeBridge.'};
 if(codexStatus().codexLogin==='signed_in')return status();
 if(!loginProcess){
  fs.mkdirSync(home,{recursive:true});
  fs.writeFileSync(logPath,'Starting device authentication. Follow the URL and code below.\n',{mode:0o600});
  const out=fs.openSync(logPath,'a',0o600);
  try{
   loginProcess=spawn(process.execPath,[codex,'login','--device-auth'],{
    cwd:home,windowsHide:true,stdio:['ignore',out,out],shell:false
   });
   loginProcess.on('error',error=>{
    try{fs.appendFileSync(logPath,'\nLogin failed: '+error.message);}catch{}
    loginProcess=null;
   });
   loginProcess.on('exit',()=>{loginProcess=null;});
  }finally{fs.closeSync(out);}
 }
 return status();
}
function execute(request){
 switch(request.action){
  case 'status':return status();
  case 'set-mode':{
   if(!['off','manual','fallback','dual'].includes(request.mode))throw Error('Invalid mode');
   const project=activeProject();
   settings.write({mode:request.mode},project?.id||null);
   return status();
  }
  case 'login':return startLogin();
  case 'repair':{
   const url='https://github.com/dabinuss/ClaudeBridge/releases/tag/preview';
   spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','Start-Process '+url],{
    windowsHide:true,stdio:'ignore',shell:false
   }).unref();
   return {...status(),instructions:'Opened ClaudeBridge releases to repair Codex.'};
  }
  default:throw Error('Unknown native picker action');
 }
}
async function main(){
 const exe=bin;
 const args=['--remote-debugging-pipe',...process.argv.slice(2)];
 const child=spawn(exe,args,{
  cwd:path.dirname(exe),stdio:['ignore','ignore','pipe','pipe','pipe'],
  windowsHide:false,shell:false
 });
 child.stderr.on('data',data=>{
  const line=data.toString().slice(0,1000);
  if(/remote.debug|error|fatal|invalid/i.test(line))process.stderr.write(line);
 });
 child.once('error',err=>{process.stderr.write('Could not launch Claude Desktop: '+err.message+'\n');process.exitCode=1;});
 child.once('exit',code=>{process.stderr.write('Claude Desktop exited ('+code+').\n');process.exitCode=code||0;});
 const cdp=new CDPPipe(child,{renderer,handleAction:execute});
 for(let attempt=0;attempt<8;attempt++){
  await new Promise(resolve=>setTimeout(resolve,700));
  if(child.exitCode!==null)throw Error('Claude Desktop did not start as a new instance. Fully quit the existing Claude process before using the ClaudeBridge shortcut.');
  try{await cdp.init();return;}catch(e){if(attempt===7)throw e;}
 }
}
main().catch(error=>{process.stderr.write('ClaudeBridge native picker: '+error.message+'\n');process.exitCode=1;});
