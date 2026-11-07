import { App } from '@modelcontextprotocol/ext-apps';
const explanation={off:'Codex is disabled. Project notes remain stored.',manual:'Claude delegates tasks on request.',fallback:'Handoff when a limit is confirmed or you request it. Automatic Claude quota detection is not available.',dual:'Claude and Codex may work concurrently on separate tasks.'};
const $=id=>document.getElementById(id);
const app=new App({name:'ClaudeBridge Settings',version:'2.4.0'},{});
async function call(name,args){
 const result=await app.callServerTool({name,arguments:args});
 if(result?.isError)throw Error(result.content?.[0]?.text||'Tool failed');
 return JSON.parse(result.content?.[0]?.text||'{}');
}
function show(text){$('msg').textContent=text;}
async function refresh(){
 try{
  const [config,health]=await Promise.all([call('bridge_settings',{action:'get'}),call('bridge_health',{})]);
  $('project').textContent=health.project?'Project: '+health.project.name:'Global defaults (no project selected)';
  $('mode').value=config.mode;
  $('memory').checked=Boolean(config.memoryEnabled);
  $('explanation').textContent=explanation[config.mode]||'';
  $('installed').textContent=health.codexInstalled?'Codex included':'Not installed';
  $('installBtn').hidden=health.codexInstalled;
  $('loginStatus').textContent=health.codexLogin==='signed_in'?'Codex already connected':health.codexLogin==='not_signed_in'?'Sign-in required':health.codexLogin;
  $('loginBtn').textContent=health.codexLogin==='signed_in'?'Codex already integrated':'Connect ChatGPT';
  $('loginBtn').disabled=health.codexLogin==='signed_in'||!health.codexInstalled;
  const native=await call('bridge_native_picker',{action:'status'});
  $('nativeStatus').textContent=!native.supported?'Not supported':native.installed?'Enabled via ClaudeBridge shortcut':'Not installed';
  $('nativeInstallBtn').disabled=!native.supported||native.installed;
  $('nativeRemoveBtn').disabled=!native.supported||!native.installed;
   }catch(e){show('Cannot refresh settings: '+e.message);}
}
$('mode').addEventListener('change',async e=>{try{await call('bridge_settings',{action:'set',mode:e.target.value});$('explanation').textContent=explanation[e.target.value];show('Mode saved.');}catch(err){show(err.message);}});
$('memory').addEventListener('change',async e=>{try{await call('bridge_settings',{action:'set',memoryEnabled:e.target.checked});show('Working memory setting saved.');}catch(err){show(err.message);}});
$('refreshBtn').addEventListener('click',refresh);
$('nativeInstallBtn').addEventListener('click',async()=>{
 try{
  const result=await call('bridge_native_picker',{action:'install'});
  await refresh();show(result.message||'Fully quit Claude Desktop and reopen using the ClaudeBridge Claude shortcut.');
 }catch(e){show('Native picker installation failed: '+e.message);}
});
$('nativeRemoveBtn').addEventListener('click',async()=>{
 try{
  const result=await call('bridge_native_picker',{action:'remove'});
  await refresh();show(result.message||'Native picker removed. The MCP bridge is unchanged.');
 }catch(e){show('Removal failed: '+e.message);}
});
$('installBtn').addEventListener('click',()=>app.openLink({url:'https://github.com/dabinuss/ClaudeBridge/releases/tag/preview'}));
$('loginBtn').addEventListener('click',async()=>{try{const r=await call('bridge_login',{});await refresh();show(r.instructions||r.message||r.nextStep||'Follow ChatGPT sign-in instructions.');}catch(e){show(e.message);}});
app.ontoolresult=()=>refresh();
app.connect().then(refresh).catch(e=>show('Claude does not support interactive MCP Apps in this view: '+e.message));
