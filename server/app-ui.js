'use strict';
const fs=require('node:fs');
const path=require('node:path');
const URI='ui://claudebridge/control-panel.html';
const MIME='text/html;profile=mcp-app';
const template=path.join(__dirname,'..','ui','control-panel.html');
const bundle=path.join(__dirname,'..','ui','control-panel.bundle.js');
let cache=null;
function load(){
  if(cache)return cache;
  if(!fs.existsSync(bundle))throw Error('ClaudeBridge UI bundle is missing. Reinstall the extension from the GitHub release.');
  const source=fs.readFileSync(template,'utf8');
  const code=fs.readFileSync(bundle,'utf8');
  if(!code.includes('ClaudeBridge')||!source.includes('/*__CLAUDEBRIDGE_APP_BUNDLE__*/'))
    throw Error('Invalid ClaudeBridge UI build.');
  cache=source.replace('/*__CLAUDEBRIDGE_APP_BUNDLE__*/',()=>code);
  return cache;
}
function readResource(uri){
 if(uri!==URI)throw Error('Unknown UI resource');
 return {contents:[{uri:URI,mimeType:MIME,text:load()}]};
}
function listResources(){
 return {resources:[{uri:URI,name:'ClaudeBridge Control Panel',mimeType:MIME,description:'Manage agent modes and Codex login inside Claude.'}]};
}
module.exports={URI,MIME,readResource,listResources,load};
