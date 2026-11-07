'use strict';
const {spawnSync}=require('node:child_process');
function terminateTree(pid,signal='SIGTERM'){
  if(!Number.isSafeInteger(pid)||pid<=0)return false;
  if(process.platform==='win32'){
    const r=spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,timeout:5000,stdio:'ignore'});
    return r.status===0;
  }
  try{process.kill(-pid,signal);return true;}catch{
    try{process.kill(pid,signal);return true;}catch{return false;}
  }
}
module.exports={terminateTree};
