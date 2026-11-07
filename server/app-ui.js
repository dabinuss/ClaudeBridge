'use strict';
const fs=require('node:fs');
const path=require('node:path');
const URI='ui://claudebridge/control-panel.html';
const MIME='text/html;profile=mcp-app';
function load(){
 const source=fs.readFileSync(path.join(__dirname,'..','ui','control-panel.html'),'utf8');
 let bundle='';
 try{
   const entry=require.resolve('@modelcontextprotocol/ext-apps/app-with-deps',{paths:[path.join(__dirname,'..','vendor')]});
   bundle=fs.readFileSync(entry,'utf8');
   const expression=/export\{([^}]+)\};?\s*$/;
   if(!expression.test(bundle))throw Error('MCP Apps browser bundle export format changed');
   bundle=bundle.replace(expression,(_,names)=>'globalThis.ExtApps={'+names.split(',').map(value=>{
     const parts=value.trim().split(/\s+as\s+/);
     return (parts[1]||parts[0])+':'+parts[0];
   }).join(',')+'};');
 }catch(e){
   // The protocol still works if the host does not support MCP Apps.
   bundle='console.warn('+JSON.stringify('MCP Apps UI bundle unavailable: '+e.message)+');';
 }
 return source.replace('/*__EXT_APPS_BUNDLE__*/',()=>bundle);
}
function readResource(uri){
 if(uri!==URI)throw Error('Unknown UI resource');
 return {contents:[{uri:URI,mimeType:MIME,text:load()}]};
}
function listResources(){
 return {resources:[{uri:URI,name:'ClaudeBridge Control Panel',mimeType:MIME,description:'Manage agent modes and Codex login inside Claude.'}]};
}
module.exports={URI,MIME,readResource,listResources,load};
