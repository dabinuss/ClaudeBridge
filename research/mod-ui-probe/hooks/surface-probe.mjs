// Temporary visual probe. Not part of a release installer.
// Official Claude Code Mods surfaces only; never touches Desktop binaries,
// certificates, global shortcuts, proxies or model routing.
const seen=new Set();
const TARGETS=new Set(['AbovePrompt','SessionMode','PromptHint']);
function label($,event,name){
 const {Text}=$.ui.resolve(event);
 return Text({dimColor:true,children:'[ClaudeBridge probe: '+name+' / '+String(event.surface||'unknown')+']'});
}
export function register(on){
 on('session.start',async ($,e,next)=>{
  const result=await next(e);
  await $.command.register({name:'bridge-probe',description:'Report ClaudeBridge official UI render sites seen this session'});
  $.ui.status('ClaudeBridge probe loaded; use /bridge-probe');
  return result;
 });
 on('command.run',{command:'bridge-probe'},async ()=>{
  return {text:'Official UI render sites seen: '+([ ...seen ].sort().join(', ')||'(none)')};
 });
 on('ui.render',async ($,e,next)=>{
  if(typeof e.component==='string')seen.add(e.component+'@'+String(e.surface||'unknown'));
  if(!TARGETS.has(e.component))return next(e);
  const original=await next(e);
  if(e.component==='PromptHint')return original;
  const {Box}=$.ui.resolve(e);
  // Only Compose an annotation in a render site that Claude already raised.
  // Never claim this reaches the Desktop app-level project header.
  return Box({flexDirection:'column',children:[original,label($,e,e.component)].filter(Boolean)});
 });
}
