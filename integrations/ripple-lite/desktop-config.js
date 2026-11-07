'use strict';
// Claude Desktop 1P managed egress proxy setting. Owner-safe changes; no binary patch,
// no launcher, no alteration of the user's existing chat data.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const MARK='claudebridge';
function configDir(platform=process.platform,home=os.homedir(),env=process.env){
 if(env.CLAUDEBRIDGE_TEST_CONFIG_DIR)return path.resolve(env.CLAUDEBRIDGE_TEST_CONFIG_DIR);
 if(platform==='win32')return path.join(env.LOCALAPPDATA||path.join(home,'AppData','Local'),'Claude-3p','configLibrary');
 if(platform==='darwin')return path.join(home,'Library','Application Support','Claude-3p','configLibrary');
 return path.join(env.XDG_CONFIG_HOME||path.join(home,'.config'),'Claude-3p','configLibrary');
}
function readJson(file){
 try{const value=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!value||Array.isArray(value)||typeof value!=='object')throw Error('Invalid object: '+file);
  return value;
 }catch(e){if(e.code==='ENOENT')return null;throw e;}
}
function writeAtomic(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const tmp=file+'.'+process.pid+'.'+crypto.randomUUID()+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
  fs.renameSync(tmp,file);
 }catch(e){try{fs.rmSync(tmp,{force:true});}catch{}throw e;}
}
function validatedUrl(proxyUrl){
 const u=new URL(proxyUrl);
 if(u.protocol!=='http:'||!['127.0.0.1','[::1]','localhost'].includes(u.hostname)||
    !u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash)
   throw Error('Only loopback HTTP proxy endpoints with an explicit port are allowed');
 return proxyUrl;
}
function state(dir=configDir()){
 const meta=readJson(path.join(dir,'_meta.json'))||{};
 const id=typeof meta.appliedId==='string'?meta.appliedId:null;
 const active=id?readJson(path.join(dir,id+'.json')):null;
 return {meta,id,active,ours:Boolean(id&&meta[MARK]?.id===id)};
}
function apply({proxyUrl,dir=configDir(),owner='claudebridge'}){
 validatedUrl(proxyUrl);
 if(!owner||typeof owner!=='string')throw Error('Owner required');
 const current=state(dir);
 const mark=current.meta[MARK];
 if(mark && mark.owner!==owner)throw Error('Another ClaudeBridge installation owns the proxy entry');
 if(current.ours && mark.owner===owner){
  writeAtomic(path.join(dir,current.id+'.json'),{...current.active,egressProxyUrl:proxyUrl});
  return {id:current.id,previous:mark.previous||null};
 }
 const id=crypto.randomUUID();
 writeAtomic(path.join(dir,id+'.json'),{egressProxyUrl:proxyUrl});
 const meta={...current.meta,appliedId:id,[MARK]:{id,owner,previous:current.id}};
 writeAtomic(path.join(dir,'_meta.json'),meta);
 return {id,previous:current.id};
}
function remove({dir=configDir(),owner='claudebridge'}={}){
 const current=state(dir),mark=current.meta[MARK];
 if(!current.ours||mark.owner!==owner)return false;
 const next={...current.meta};
 if(mark.previous)next.appliedId=mark.previous;
 else delete next.appliedId;
 delete next[MARK];
 writeAtomic(path.join(dir,'_meta.json'),next);
 fs.rmSync(path.join(dir,current.id+'.json'),{force:true});
 return true;
}
module.exports={configDir,state,apply,remove,validatedUrl};
