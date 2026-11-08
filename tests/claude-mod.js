'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const settings=require('../server/settings');
(async()=>{
 const hooks=[];
 const mod=await import(pathToFileURL(path.join(__dirname,'../claude-plugin/hooks/claudebridge.mjs')).href);
 mod.register((name,matcher,fn)=>{
  if(typeof matcher==='function'){fn=matcher;matcher=null;}
  hooks.push({name,matcher,fn});
 });
 const by=(name,match)=>hooks.find(x=>x.name===name&&(!match||x.matcher?.component===match||x.matcher?.command===match));
 assert(by('session.start'));assert(by('command.run','claudebridge'));assert(by('ui.render','AbovePrompt'));
 let selected='manual',invalidated=0;
 const $={
  env:{get:async k=>k==='LOCALAPPDATA'?'C:\\Users\\Test\\AppData\\Local':undefined},
  process:{run:async args=>{
   assert(args[1].includes('settings-cli.js'));
   if(args[2]==='set')selected=args[3];
   return {exitCode:0,stdout:JSON.stringify({mode:selected}),stderr:''};
  }},
  command:{register:async data=>assert.equal(data.name,'claudebridge')},
  ui:{
   invalidate:()=>invalidated++,toast:()=>{},
   resolve:()=>({
    Box:props=>({type:'Box',...props}),
    Button:props=>({type:'Button',...props}),
    Text:props=>({type:'Text',...props})
   })
  }
 };
 await by('session.start').fn($,{},async()=>({ok:true}));
 let tree=await by('ui.render','AbovePrompt').fn($,{},async()=>({type:'OtherMod'}));
 assert.equal(tree.children[0].type,'OtherMod','Must preserve other mods');
 let row=tree.children[1];
 assert(row.children.some(c=>c.label==='◈ ClaudeBridge ▾'));
 row.children[0].onPress();
 tree=await by('ui.render','AbovePrompt').fn($,{},async()=>({type:'OtherMod'}));
 row=tree.children[1];
 assert(row.children.some(c=>c.label?.includes('Dual agents')));
 const dual=row.children.find(c=>c.label?.includes('Dual agents'));
 dual.onPress();
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(selected,'dual');
 assert(invalidated>0);
 const cli=fs.readFileSync(path.join(__dirname,'../integrations/mod/settings-cli.js'),'utf8');
 assert(cli.includes("settings.write({mode})"),'Must update shared MCP settings');
 const online=fs.readFileSync(path.join(__dirname,'../installer/online-deps.js'),'utf8');
 assert(!online.includes("'node-forge@1.4.3'"));
 assert(!online.includes("'enable',installed]"),'Must not enable TLS proxy during setup');
 assert(online.includes("'disable',installed]"),'Must clean up previous Ripple installation');
 console.log('PASS: official Claude Code Mod text UI, shared settings and proxy-free install');
})().catch(e=>{console.error(e);process.exitCode=1;});
