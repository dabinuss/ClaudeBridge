'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cb-orphan-repair-'));
const payload=path.join(temp,'payload'),home=path.join(temp,'home');
function put(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);}
const installed=path.join(home,'Installed');
const nodeName=process.platform==='win32'?'node.exe':'node';
const runtime='integrations/native-ui/'+nodeName;
const setup=path.join(payload,'installer','setup.js');
const env={...process.env,CLAUDEBRIDGE_SETUP_TEST_HOME:home,CLAUDEBRIDGE_SETUP_SKIP_NATIVE:'1'};
function run(){return spawnSync(process.execPath,[setup,'install'],{env,encoding:'utf8',timeout:30000});}
try{
 fs.mkdirSync(path.join(payload,'vendor'),{recursive:true});
 fs.mkdirSync(path.join(payload,'ui'),{recursive:true});
 fs.mkdirSync(path.join(payload,'claude-plugin'),{recursive:true});
 fs.mkdirSync(path.join(payload,'server'),{recursive:true});
 fs.mkdirSync(path.join(payload,'integrations/native-ui'),{recursive:true});
 fs.mkdirSync(path.join(payload,'installer'),{recursive:true});
 fs.copyFileSync(path.join(__dirname,'../installer/setup.js'),setup);
 fs.writeFileSync(path.join(payload,'manifest.json'),JSON.stringify({name:'claudebridge'}));
 fs.writeFileSync(path.join(payload,'server','v2.js'),'// test');
 fs.copyFileSync(process.execPath,path.join(payload,runtime));
 // Exact state reported by the user: previous uninstall left a private node.exe
 // but removed installer-owned.json, MCP registration and almost everything else.
 fs.mkdirSync(path.join(installed,'integrations/native-ui'),{recursive:true});
 fs.writeFileSync(path.join(installed,runtime),'leftover');
 let result=run();
 assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
 assert.equal(JSON.parse(result.stdout).mcp,true);
 assert.equal(JSON.parse(fs.readFileSync(path.join(installed,'installer-owned.json'),'utf8')).owner,'claudebridge-standalone-v1');
 assert.equal(fs.readFileSync(path.join(installed,runtime)).length,fs.statSync(process.execPath).size);
 // Missing marker and unknown files must never be adopted or deleted.
 fs.rmSync(path.join(installed,'installer-owned.json'));
 put(path.join(installed,'unrelated-user-file.txt'),'keep');
 result=run();
 assert.equal(result.status,0,result.stderr+'\\n'+result.stdout);
 const recovered=JSON.parse(result.stdout);
 assert.equal(recovered.installPath,path.join(home,'Installed-Managed'));
 assert.equal(fs.readFileSync(path.join(installed,'unrelated-user-file.txt'),'utf8'),'keep');
 assert(!fs.existsSync(path.join(installed,'installer-owned.json')));
 assert(fs.existsSync(path.join(home,'Installed-Managed','installer-owned.json')));
 // Subsequent repairs and uninstall reuse the safe owned directory.
 result=run();
 assert.equal(result.status,0,result.stderr);
 assert.equal(JSON.parse(result.stdout).installPath,recovered.installPath);
 const remove=spawnSync(process.execPath,[setup,'uninstall'],{env,encoding:'utf8',timeout:30000});
 assert.equal(remove.status,0,remove.stderr);
 assert(!fs.existsSync(recovered.installPath));
 assert.equal(fs.readFileSync(path.join(installed,'unrelated-user-file.txt'),'utf8'),'keep');
 console.log('PASS: verified orphan repaired and unknown residues preserved using side-by-side install');
}catch(error){console.error(error);process.exitCode=1;}
finally{fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
