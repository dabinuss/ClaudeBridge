'use strict';
// Shared user settings for MCP and optional Desktop integrations.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const base=path.join(os.homedir(),'.claudebridge');
const file=path.join(base,'settings.json');
const DEFAULTS=Object.freeze({schemaVersion:1,enabled:true,mode:'manual',memoryEnabled:true,autoResume:true});
const MODES=new Set(['off','manual','fallback','dual']);
function read(){
 if(!fs.existsSync(file))return {...DEFAULTS};
 const saved=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!saved||Array.isArray(saved)||typeof saved!=='object')throw Error('Invalid ClaudeBridge settings');
 return {...DEFAULTS,...saved};
}
function write(input){
 const current=read(),next={...current};
 if(Object.prototype.hasOwnProperty.call(input,'mode')){
   if(typeof input.mode!=='string'||!MODES.has(input.mode))throw Error('Invalid mode. Choose off, manual, fallback or dual.');
   next.mode=input.mode;
   next.enabled=input.mode!=='off';
 }
 for(const k of ['memoryEnabled','autoResume']){
   if(Object.prototype.hasOwnProperty.call(input,k)){
     if(typeof input[k]!=='boolean')throw Error(k+' must be a boolean.');
     next[k]=input[k];
   }
 }
 fs.mkdirSync(base,{recursive:true});
 const tmp=file+'.'+crypto.randomUUID()+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(next,null,2)+'\n',{mode:0o600});
 fs.renameSync(tmp,file);
 return next;
}
module.exports={read,write,MODES};