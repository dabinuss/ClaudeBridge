// ClaudeBridge official Claude Code mod: native AbovePrompt UI, no TLS proxy,
// no app.asar patch, no Chrome DevTools and no launcher.
// This surface is the local Claude Code tab, NOT the global Chat app toolbar.
const LABELS={off:'Off',manual:'On demand',fallback:'Fallback',dual:'Dual agents'};
let expanded=false,mode='manual',available=false,detail='';

async function installedCommands($){
 const local=await $.env.get('LOCALAPPDATA');
 if(local){
  const base=local+'\\ClaudeBridge\\';
  return ['Installed-Managed','Installed'].map(dir=>[
    base+dir+'\\integrations\\native-ui\\node.exe',
    base+dir+'\\integrations\\mod\\settings-cli.js']);
 }
 const home=await $.env.get('HOME');
 if(!home)return [];
 const mac=await $.env.get('OSTYPE');
 const base=mac?.includes('darwin')?
  home+'/Library/Application Support/ClaudeBridge/':
  home+'/.local/share/claudebridge/';
 return ['Installed-Managed','Installed'].map(dir=>[
   base+dir+'/integrations/native-ui/node',base+dir+'/integrations/mod/settings-cli.js']);
}
async function call($,args){
 const candidates=await installedCommands($);
 if(!candidates.length)throw Error('ClaudeBridge is not installed');
 let previous='ClaudeBridge runtime unavailable';
 for(const cmd of candidates){
  try{
   const result=await $.process.run([...cmd,...args]);
   if(result.exitCode===0)return JSON.parse(result.stdout);
   previous=String(result.stderr||previous).slice(0,300);
  }catch(error){previous=String(error?.message||error);}
 }
 throw Error(previous);
}
async function refresh($){
 try{
  const result=await call($,['get']);
  mode=result.mode||'manual';available=true;detail='';
 }catch(error){available=false;detail=String(error.message||error);}
 $.ui.invalidate('ui.render');
}
async function setMode($,next){
 if(!Object.hasOwn(LABELS,next))return;
 try{
  const result=await call($,['set',next]);
  mode=result.mode;available=true;detail='';
  $.ui.toast('ClaudeBridge: '+LABELS[mode]);
 }catch(error){available=false;detail=String(error.message||error);$.ui.toast('ClaudeBridge unavailable');}
 $.ui.invalidate('ui.render');
}
export function register(on){
 on('session.start',async ($,e,next)=>{
  await $.command.register({name:'claudebridge',description:'Show ClaudeBridge controls'});
  await refresh($);
  return next(e);
 });
 on('command.run',{command:'claudebridge'},async $=>{
  expanded=!expanded;
  await refresh($);
  return {text:'ClaudeBridge '+(expanded?'controls opened':'controls hidden')};
 });
 on('ui.render',{component:'AbovePrompt'},async ($,e,next)=>{
  const previous=await next(e);
  const {Box,Text,Button}=$.ui.resolve(e);
  const children=[
   Button({label:'◈ ClaudeBridge ▾',plain:true,onPress:()=>{
    expanded=!expanded;$.ui.invalidate('ui.render');
   }}),
   Text({dimColor:true,children:available?' '+LABELS[mode]:' not connected'})
  ];
  if(expanded){
   for(const [key,label] of Object.entries(LABELS))
    children.push(Button({key:'cb-'+key,label:(mode===key?'● ':'○ ')+label,
     plain:true,onPress:()=>void setMode($,key)}));
   children.push(Button({label:'↻',plain:true,onPress:()=>void refresh($)}));
   if(detail)children.push(Text({dimColor:true,children:detail.slice(0,160)}));
  }
  const ourRow=Box({flexDirection:'row',flexWrap:'wrap',gap:1,children});
  return Box({flexDirection:'column',gap:1,children:[previous,ourRow].filter(Boolean)});
 });
}
