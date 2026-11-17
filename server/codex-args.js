'use strict';
// The Codex 0.167 CLI accepts --sandbox on `exec`, but NOT on the nested
// `exec resume` and `exec fork` subcommands. Those support -c config overrides.
function buildExecArgs({previousTask=null,worktree=false,mode='review',model=null}={}){
 if(!['review','code'].includes(mode))throw Error('Invalid Codex task mode');
 if(model!==null&&(typeof model!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(model)))
  throw Error('Invalid Codex model ID');
 const sandbox=mode==='review'?'read-only':'workspace-write';
 if(previousTask){
  if(typeof previousTask.session_id!=='string'||!/^[0-9a-f-]{36}$/i.test(previousTask.session_id))
   throw Error('Resumable Codex session ID is invalid');
  const command=worktree&&mode==='code'?'fork':'resume';
  const args=['exec',command,previousTask.session_id,'--json','-c','sandbox_mode='+JSON.stringify(sandbox)];
  if(model)args.push('--model',model);
  if(command==='fork')args.push('--worktree');
  return args;
 }
 const args=['exec','--json','--sandbox',sandbox];
 if(model)args.push('--model',model);
 if(worktree&&mode==='code')args.push('--worktree');
 return args;
}
module.exports={buildExecArgs};
