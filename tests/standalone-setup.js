'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'claudebridge-setup-test-'));
const source=path.resolve(__dirname,'..');
const fixture=path.join(temp,'payload');
const testHome=path.join(temp,'user');
function make(p){fs.mkdirSync(p,{recursive:true});}
try{
 for(const dir of ['installer','integrations/native-ui','server','vendor','ui','claude-plugin/skills/claudebridge','claude-plugin/.claude-plugin'])make(path.join(fixture,dir));
 fs.copyFileSync(path.join(source,'installer','setup.js'),path.join(fixture,'installer','setup.js'));
 fs.copyFileSync(process.execPath,path.join(fixture,'integrations/native-ui',process.platform==='win32'?'node.exe':'node'));
 fs.writeFileSync(path.join(fixture,'manifest.json'),'{"version":"2.5.0"}');
 fs.writeFileSync(path.join(fixture,'server','v2.js'),'// test fixture');
 fs.writeFileSync(path.join(fixture,'integrations/native-ui','renderer.js'),'// test fixture');
 fs.writeFileSync(path.join(fixture,'ui','index.html'),'test');
 fs.writeFileSync(path.join(fixture,'vendor','dummy.js'),'test');
 fs.copyFileSync(path.join(source,'claude-plugin','.claude-plugin','plugin.json'),path.join(fixture,'claude-plugin','.claude-plugin','plugin.json'));
 fs.copyFileSync(path.join(source,'claude-plugin','skills','claudebridge','SKILL.md'),path.join(fixture,'claude-plugin','skills','claudebridge','SKILL.md'));
 const env={...process.env,CLAUDEBRIDGE_SETUP_TEST_HOME:testHome,CLAUDEBRIDGE_SETUP_SKIP_NATIVE:'1'};
 const cfg=path.join(testHome,'Claude','claude_desktop_config.json');
 make(path.dirname(cfg));
 fs.writeFileSync(cfg,JSON.stringify({mcpServers:{'another-server':{command:'another',args:['--leave-alone']}},otherSetting:'keep'}));
 function call(action,expect=0,flags=[]){
  const r=spawnSync(process.execPath,[path.join(fixture,'installer','setup.js'),action,...flags],{encoding:'utf8',env,timeout:25000});
  assert.equal(r.status,expect,r.stderr+'\n'+r.stdout);
  return r.stdout.trim()?JSON.parse(r.stdout):null;
 }
 const installed=call('install');
 assert.equal(installed.mcp,true);
 let c=JSON.parse(fs.readFileSync(cfg,'utf8'));
 assert.equal(c.otherSetting,'keep');
 assert.equal(c.mcpServers['another-server'].command,'another');
 assert(c.mcpServers.claudebridge.args[0].endsWith(path.join('Installed','server','v2.js')));
 assert(fs.existsSync(path.join(testHome,'Claude','claude_desktop_config.json.claudebridge-backup')));
 assert.equal(call('status').mcpOwned,true);
 call('install'); // idempotent
 assert.equal(call('status').mcpOwned,true);
 const removed=call('uninstall');
 assert.equal(removed.mcpRemoved,true);
 c=JSON.parse(fs.readFileSync(cfg,'utf8'));
 assert(!c.mcpServers.claudebridge);
 assert.equal(c.mcpServers['another-server'].command,'another');
 assert.equal(c.otherSetting,'keep');
 assert(!call('status').installed);
 assert(!fs.existsSync(cfg+'.claudebridge-backup'),'Owned backup must be removed on uninstall');
 // Reinstall and exercise the optional full cleanup without touching source files.
 call('install');
 const project=path.join(temp,'user-source-project');
 const mem=path.join(project,'.agent-bridge');
 make(mem);
 fs.writeFileSync(path.join(project,'app.js'),'KEEP MY CODE');
 fs.writeFileSync(path.join(mem,'state.sqlite'),'mock database');
 fs.writeFileSync(path.join(mem,'.gitignore'),'*');
 const shared=path.join(testHome,'.claudebridge');
 make(shared);
 fs.writeFileSync(path.join(shared,'settings.json'),'{"mode":"dual"}');
 fs.writeFileSync(path.join(shared,'projects.json'),JSON.stringify({active:'project',projects:{project:{name:'Project',path:project}}}));
 // Locked native integration must never leave a broken launcher by removing shared Node first.
 const blocked=spawnSync(process.execPath,[path.join(fixture,'installer','setup.js'),'uninstall'],{
  env:{...env,CLAUDEBRIDGE_TEST_NATIVE_BUSY:'1'},encoding:'utf8',timeout:25000
 });
 assert.equal(blocked.status,2,'Busy companion must block uninstall');
 assert(fs.existsSync(path.join(testHome,'Installed','installer-owned.json')),'Shared runtime was removed prematurely');
 assert.equal(call('status').mcpOwned,true,'MCP registration should remain intact');
 const purged=call('uninstall',0,['--purge-data']);
 assert.equal(purged.projectMemoryPreserved,false);
 assert(!fs.existsSync(mem),'Bridge memory was not removed');
 assert(!fs.existsSync(shared),'ClaudeBridge settings remain');
 assert(fs.existsSync(path.join(project,'app.js')),'Source project was modified');
 // Refuse to overwrite or delete other parties' ClaudeBridge entries.
 c.mcpServers.claudebridge={command:'other',args:['someone-elses-server']};
 fs.writeFileSync(cfg,JSON.stringify(c));
 const fail=spawnSync(process.execPath,[path.join(fixture,'installer','setup.js'),'install'],{env,encoding:'utf8',timeout:25000});
 assert.notEqual(fail.status,0,'installer must reject existing foreign MCP registration');
 assert.equal(JSON.parse(fs.readFileSync(cfg,'utf8')).mcpServers.claudebridge.command,'other');
 console.log('PASS: standalone '+process.platform+' install, other MCP preserved, repair, uninstall, foreign entry protected');
}catch(e){console.error(e);process.exitCode=1;}
finally{fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
