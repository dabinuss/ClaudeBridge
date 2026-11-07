'use strict';
// Token-free project activity journal. Records filenames and git state, not file contents.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {openDb,now}=require('./db');
const MAX_FILES=4000;
const EXCLUDE=new Set(['.git','.agent-bridge','node_modules','.next','dist','build','target','.venv','venv','.claude','vendor']);
const EXTENSIONS=new Set(['.js','.jsx','.ts','.tsx','.json','.md','.py','.go','.rs','.cs','.java','.kt','.dart','.html','.css','.scss','.vue','.svelte','.php','.yml','.yaml','.toml','.gd','.cpp','.c','.h','.hpp','.sh','.ps1','.sql']);
function scan(projectPath){
  const entries=[], stack=[projectPath];
  while(stack.length&&entries.length<MAX_FILES){
    const directory=stack.pop();let children;
    try{children=fs.readdirSync(directory,{withFileTypes:true});}catch{continue;}
    for(const e of children){
      if(EXCLUDE.has(e.name)||e.name.startsWith('.env')||e.name.includes('secret'))continue;
      const file=path.join(directory,e.name);
      if(e.isSymbolicLink())continue;
      if(e.isDirectory()){if(stack.length<500)stack.push(file);continue;}
      if(!e.isFile()||!EXTENSIONS.has(path.extname(e.name).toLowerCase()))continue;
      try{
        const st=fs.statSync(file);if(st.size>10*1024*1024)continue;
        entries.push({path:path.relative(projectPath,file).replaceAll('\\','/'),mtime:Math.floor(st.mtimeMs),size:st.size});
      }catch{}
      if(entries.length>=MAX_FILES)break;
    }
  }
  entries.sort((a,b)=>a.path.localeCompare(b.path));
  return entries;
}
function gitSummary(projectPath){
  function run(args){
    const r=spawnSync('git',args,{cwd:projectPath,encoding:'utf8',windowsHide:true,timeout:4000,maxBuffer:128*1024});
    return r.status===0?String(r.stdout).trim().slice(0,10000):null;
  }
  return {head:run(['rev-parse','--short','HEAD']),branch:run(['branch','--show-current']),
    status:run(['status','--short','--untracked-files=no'])};
}
function ensureSchema(db){
  db.exec('CREATE TABLE IF NOT EXISTS memory_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, summary TEXT NOT NULL);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_memory_at ON memory_events(at);');
  db.exec('CREATE TABLE IF NOT EXISTS memory_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
}
function record(db,kind,summary){
  db.prepare('INSERT INTO memory_events(at,kind,summary) VALUES(?,?,?)').run(now(),kind,String(summary).slice(0,2500));
  db.exec('DELETE FROM memory_events WHERE id IN (SELECT id FROM memory_events ORDER BY id DESC LIMIT -1 OFFSET 5000)');
}
function capture(projectPath){
  const db=openDb({path:projectPath});
  try{
    ensureSchema(db);
    const files=scan(projectPath),git=gitSummary(projectPath);
    const prevRaw=db.prepare("SELECT value FROM memory_meta WHERE key='snapshot'").get();
    const prev=prevRaw?JSON.parse(prevRaw.value):{files:[],git:{}};
    const old=new Map(prev.files.map(f=>[f.path,f]));
    const next=new Map(files.map(f=>[f.path,f]));
    const added=[],changed=[],deleted=[];
    for(const f of files){const before=old.get(f.path);if(!before)added.push(f.path);else if(before.mtime!==f.mtime||before.size!==f.size)changed.push(f.path);}
    for(const f of prev.files)if(!next.has(f.path))deleted.push(f.path);
    if(prevRaw){
      if(added.length||changed.length||deleted.length){
        record(db,'files','Added: '+added.slice(0,30).join(', ')+'; changed: '+changed.slice(0,60).join(', ')+'; removed: '+deleted.slice(0,30).join(', '));
      }
      if(git.head&&git.head!==prev.git.head)record(db,'commit','Git HEAD changed: '+String(prev.git.head||'none')+' → '+git.head);
      if(git.branch!==prev.git.branch)record(db,'branch','Git branch: '+String(prev.git.branch||'none')+' → '+String(git.branch||'none'));
    }else record(db,'baseline','Project baseline created: '+files.length+' tracked source files');
    db.prepare("INSERT INTO memory_meta(key,value) VALUES('snapshot',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({files,git}));
    return {files:files.length,added:added.length,changed:changed.length,deleted:deleted.length,head:git.head,branch:git.branch};
  }finally{db.close();}
}
function timeline(projectPath,limit=40){
  const db=openDb({path:projectPath});
  try{
    ensureSchema(db);
    return db.prepare('SELECT at,kind,summary FROM memory_events ORDER BY id DESC LIMIT ?').all(Math.min(Math.max(Number(limit)||40,1),100)).reverse();
  }finally{db.close();}
}
function digest(projectPath){
  const db=openDb({path:projectPath});
  try{
    ensureSchema(db);
    const events=db.prepare('SELECT at,kind,summary FROM memory_events ORDER BY id DESC LIMIT 20').all().reverse();
    const decisions=db.prepare("SELECT created,body FROM messages WHERE recipient='all' ORDER BY created DESC LIMIT 12").all().reverse();
    const outstanding=db.prepare("SELECT id,status,mode,prompt,last_message FROM tasks WHERE status IN ('running','queued','interrupted','failed') ORDER BY updated DESC LIMIT 10").all();
    return {project:projectPath,decisions,openTasks:outstanding,recentEvents:events,
      note:'This is a token-efficient project handoff. File changes and Git activity are recorded without LLM calls. Intent and decisions require explicit checkpoints.'};
  }finally{db.close();}
}
module.exports={capture,timeline,digest};
