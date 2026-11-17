'use strict';
// Shared modes for MCP and UI, with per-project overrides.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const base=path.join(os.homedir(),'.claudebridge');
const file=path.join(base,'settings.json');
const DEFAULTS=Object.freeze({schemaVersion:2,enabled:true,mode:'manual',memoryEnabled:true,autoResume:true,codexModel:null});
const MODES=new Set(['off','manual','fallback','dual']);
const KEYS=['mode','memoryEnabled','autoResume','codexModel'];
function database(){
 if(!fs.existsSync(file))return {...DEFAULTS,projects:{}};
 const saved=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!saved||Array.isArray(saved)||typeof saved!=='object')throw Error('Invalid ClaudeBridge settings');
 return {...DEFAULTS,...saved,projects:saved.projects&&typeof saved.projects==='object'&&!Array.isArray(saved.projects)?saved.projects:{}};
}
function read(projectId=null){
 const db=database();
 const effective=projectId&&db.projects[projectId]?db.projects[projectId]:{};
 const result={...DEFAULTS,...Object.fromEntries(KEYS.filter(k=>k in db).map(k=>[k,db[k]])),...effective};
 result.enabled=result.mode!=='off';
 if(projectId)result.projectId=projectId;
 return result;
}
function write(input,projectId=null){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid settings update');
 const db=database();
 const target=projectId?(db.projects[projectId]={...(db.projects[projectId]||{})}):db;
 if(Object.prototype.hasOwnProperty.call(input,'mode')){
  if(typeof input.mode!=='string'||!MODES.has(input.mode))throw Error('Invalid mode. Choose off, manual, fallback or dual.');
  target.mode=input.mode;
 }
 if(Object.prototype.hasOwnProperty.call(input,'codexModel')){
  const value=input.codexModel;
  if(value===null||value==='')target.codexModel=null;
  else if(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))target.codexModel=value;
  else throw Error('Codex model must be a valid model ID or null for the CLI default.');
 }
 for(const k of ['memoryEnabled','autoResume']){
  if(Object.prototype.hasOwnProperty.call(input,k)){
   if(typeof input[k]!=='boolean')throw Error(k+' must be a boolean.');
   target[k]=input[k];
  }
 }
 db.schemaVersion=2;
 db.enabled=db.mode!=='off';
 fs.mkdirSync(base,{recursive:true});
 const tmp=file+'.'+crypto.randomUUID()+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(db,null,2)+'\n',{mode:0o600});
 fs.renameSync(tmp,file);
 return read(projectId);
}
module.exports={read,write,MODES};
