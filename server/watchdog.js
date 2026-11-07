'use strict';
// Independent, short-lived watchdog launched when tasks begin.
// Does not depend on Claude Desktop remaining open.
const fs=require('node:fs');
const path=require('node:path');
const {openDb,task,listTasks,patchTask,message}=require('./db');
const projectPath=process.argv[2];
if(!projectPath||!fs.existsSync(projectPath))process.exit(2);
const dir=path.join(projectPath,'.agent-bridge');
const pidFile=path.join(dir,'watchdog.pid');
fs.writeFileSync(pidFile,String(process.pid),{mode:0o600});
let idle=0,notified=new Set();
function alive(pid){
  if(!Number.isSafeInteger(pid)||pid<=0)return false;
  try{process.kill(pid,0);return true;}catch{return false;}
}
function check(){
  const db=openDb({path:projectPath});
  try{
    const active=listTasks(db,50).filter(t=>['queued','running'].includes(t.status));
    if(!active.length){idle++;if(idle>=4)process.exit(0);}else idle=0;
    for(const t of active){
      const age=Date.now()-Date.parse(t.heart_beat||t.created);
      if(t.status==='queued'&&age<45000)continue;
      if(t.pid&&alive(t.pid)){
        if(age>90000&&!notified.has(t.id)){
          notified.add(t.id);
          message(db,'watchdog','claude','Codex worker heartbeat has been delayed: '+t.id,t.id);
        }
        continue;
      }
      if(age<30000)continue;
      patchTask(db,t.id,{status:'interrupted',error:'Worker exited or lost heartbeat; task state is preserved for resumption.'});
      message(db,'watchdog','claude','Codex task interrupted: '+t.id+'. A saved session may be resumed from Claude.',t.id);
    }
  }finally{db.close();}
}
const timer=setInterval(()=>{try{check();}catch(e){process.stderr.write('Watchdog: '+e.message+'\n');}},15000);
try{check();}catch(e){process.stderr.write(e.message+'\n');}
process.on('exit',()=>{try{if(fs.readFileSync(pidFile,'utf8').trim()===String(process.pid))fs.unlinkSync(pidFile);}catch{}});
