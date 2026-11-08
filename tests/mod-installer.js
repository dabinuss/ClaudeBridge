'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {availableCli,install}=require('../installer/mod-install');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cb-mod-inst-'));
try{
 const cli=path.join(tmp,'claude');
 fs.writeFileSync(cli,'test');
 const source=path.join(tmp,'claude-plugin','.claude-plugin');
 fs.mkdirSync(source,{recursive:true});
 fs.writeFileSync(path.join(source,'marketplace.json'),'{}');
 const calls=[];
 const execute=(program,args)=>{
  calls.push([program,...args]);
  return {status:0,stdout:'ok',stderr:''};
 };
 assert.equal(availableCli({home:tmp,env:{CLAUDEBRIDGE_CLAUDE_CLI:cli},execute}),cli);
 const result=install({root:tmp,cli,execute});
 assert.equal(result.installed,true);
 assert(calls.some(x=>x[1]==='plugin'&&x[2]==='marketplace'&&x[3]==='add'));
 assert(calls.some(x=>x[1]==='plugin'&&x[2]==='install'&&x[3]==='claudebridge@claudebridge-local'));
 const missing=install({root:tmp,cli:null,execute});
 assert.equal(missing.installed,false);
 console.log('PASS: official Claude plugin registration with graceful CLI-missing fallback');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
