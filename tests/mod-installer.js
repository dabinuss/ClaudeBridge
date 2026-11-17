'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {availableCli,install,uninstall}=require('../installer/mod-install');
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
 const pkg=path.join(tmp,'vendor','node_modules','@anthropic-ai','claude-code');
 fs.mkdirSync(pkg,{recursive:true});
 fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@anthropic-ai/claude-code',bin:{claude:'cli.js'}}));
 fs.writeFileSync(path.join(pkg,'cli.js'),'// mocked CLI');
 const node=path.join(tmp,'integrations','native-ui',process.platform==='win32'?'node.exe':'node');
 fs.mkdirSync(path.dirname(node),{recursive:true});
 fs.writeFileSync(node,'mock runtime');
 const candidate=availableCli({root:tmp,execute:(program,args)=>({status:0,stdout:'2.1.319',stderr:''})});
  assert.deepEqual(candidate,[node,path.join(pkg,'cli.js')],'Prefer private official Claude CLI when present');
 // Since Claude Code 2.1, package.json points at a native executable.
 // It must NOT be invoked through Node or ESM rejects the .exe extension.
 fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@anthropic-ai/claude-code',bin:{claude:'bin/claude.exe'}}));
 const nativeBin=path.join(pkg,'bin','claude.exe');
 fs.mkdirSync(path.dirname(nativeBin),{recursive:true});
 fs.writeFileSync(nativeBin,'not a placeholder');
 fs.truncateSync(nativeBin,1024*1024+1);
 const nativeChoice=availableCli({root:tmp,execute:(program,args)=>({status:0,stdout:'2.1.319',stderr:''})});
 assert.equal(nativeChoice,nativeBin,'Modern native Claude binary must run directly without private Node');

 assert.equal(availableCli({home:tmp,env:{CLAUDEBRIDGE_CLAUDE_CLI:cli},execute}),cli);
 const result=install({root:tmp,cli,execute});
 assert.equal(result.installed,true);
 assert(calls.some(x=>x[1]==='plugin'&&x[2]==='marketplace'&&x[3]==='add'));
 assert(calls.some(x=>x[1]==='plugin'&&x[2]==='install'&&x[3]==='claudebridge@claudebridge-local'));
 const missing=install({root:tmp,cli:null,execute});
 assert.equal(missing.installed,false);
 let pluginPresent=true;
 const removalCalls=[];
 const removeExecute=(program,args)=>{
  removalCalls.push([program,...args]);
  if(args[0]==='plugin'&&args[1]==='list')
   return {status:0,stdout:JSON.stringify({installed:pluginPresent?['claudebridge@claudebridge-local']:[]}),stderr:''};
  if(args[1]==='uninstall')pluginPresent=false;
  return {status:0,stdout:'ok',stderr:''};
 };
 const removed=uninstall({root:tmp,cli,execute:removeExecute});
 assert.equal(removed.removed,true);
 assert(removalCalls.some(x=>x.includes('uninstall')&&x.includes('claudebridge@claudebridge-local')));
 assert(removalCalls.some(x=>x.includes('marketplace')&&x.includes('remove')&&x.includes('claudebridge-local')));
 assert.equal(uninstall({root:tmp,cli,execute:removeExecute}).removed,true,'Repeated uninstall must be safe');
 assert.equal(uninstall({root:tmp,cli:null,execute:removeExecute}).removed,false,'CLI absence cannot masquerade as cleanup');
 const failedRemoval=uninstall({root:tmp,cli,execute:()=>({status:1,stderr:'failed'})});
 assert.equal(failedRemoval.removed,false);
 console.log('PASS: official Claude plugin registration with graceful CLI-missing fallback');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
