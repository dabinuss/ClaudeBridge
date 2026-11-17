'use strict';
const fs=require('node:fs');
const path=require('node:path');
const OWNED=/^(?:state\.sqlite(?:-(?:wal|shm|journal))?|\.gitignore|(?:memory-monitor|watchdog)\.pid|task-[0-9a-f-]{36}\.jsonl)$/i;
// Older installations lack an ownership marker. Delete the directory ONLY
// when its complete content is recognizable, with no nested dirs or links.
function inspect(directory){
 const result={safe:false,reason:null};
 let stat;
 try{stat=fs.lstatSync(directory);}catch(e){return {...result,reason:e.message};}
 if(!stat.isDirectory()||stat.isSymbolicLink())return {...result,reason:'Project memory is not a real directory'};
 let names;
 try{names=fs.readdirSync(directory);}catch(e){return {...result,reason:e.message};}
 if(!names.includes('state.sqlite')||!names.includes('.gitignore'))
  return {...result,reason:'Project memory ownership cannot be verified'};
 for(const name of names){
  if(!OWNED.test(name))return {...result,reason:'Unknown content: '+name};
  const entry=fs.lstatSync(path.join(directory,name));
  if(!entry.isFile()||entry.isSymbolicLink())return {...result,reason:'Unsafe file: '+name};
 }
 return {safe:true,reason:null};
}
module.exports={inspect};
