'use strict';
// A single setup-time certificate approval, followed by user-scoped proxy startup.
// No alternative Claude executable or shortcut is created.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const readline=require('node:readline/promises');
const {createIdentity}=require('./certs');
const lifecycle=require('./lifecycle');
async function main(){
 const action=process.argv[2]||'status';
 const installed=process.argv[3]||path.resolve(__dirname,'../..');
 if(action==='status'){process.stdout.write(JSON.stringify(lifecycle.status())+'\n');return;}
 if(action==='disable'){
  const answer=await lifecycle.disable({installed});
  process.stdout.write(JSON.stringify(answer)+'\n');return;
 }
 if(action!=='enable')throw Error('Usage: activate.js enable | disable | status');
 const id=createIdentity(path.join(os.homedir(),'.claudebridge','ripple-lite','certs'));
 process.stdout.write('\nClaudeBridge local HTTPS proxy (normal Claude start; no launcher).\n');
 process.stdout.write('Certificate SHA-256: '+id.fingerprint+'\n');
 process.stdout.write('The certificate will be trusted for your user account and removed when disabling.\n');
 if(!process.stdin.isTTY){
  process.stdout.write('Interactive certificate approval unavailable; proxy not enabled.\n');
  process.exitCode=2;return;
 }
 const rl=readline.createInterface({input:process.stdin,output:process.stdout});
 let confirm;
 try{confirm=(await rl.question('Install local CA and enable ClaudeBridge proxy? [y/N] ')).trim().toLowerCase();}
 finally{rl.close();}
 if(confirm!=='y'&&confirm!=='yes'){
  process.stdout.write('Proxy setup declined; ClaudeBridge MCP remains installed.\n');
  return;
 }
 const result=await lifecycle.enable({installed,consent:true});
 process.stdout.write(JSON.stringify(result)+'\n');
 process.stdout.write('Fully quit and reopen normal Claude Desktop.\n');
}
main().catch(e=>{process.stderr.write('ClaudeBridge proxy setup: '+e.message+'\n');process.exitCode=1;});
