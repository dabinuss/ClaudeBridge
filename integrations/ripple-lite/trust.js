'use strict';
// Explicit user-scoped trust management. Never silently trust a root certificate.
// Call only after the user has accepted the CA fingerprint shown by setup.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
function execute(cmd,args){return execFileSync(cmd,args,{encoding:'utf8',stdio:'inherit',timeout:30000,windowsHide:false});}
function identity(ca){
 const cert=new crypto.X509Certificate(fs.readFileSync(ca));
 if(cert.subject!=='CN=ClaudeBridge Local Root'||!cert.ca)
  throw Error('Refusing to trust non-ClaudeBridge root');
 return {cert,sha1:cert.fingerprint.replace(/:/g,'').toUpperCase(),sha256:cert.fingerprint256};
}
function command(operation,ca,platform=process.platform,env=process.env){
 if(!['trust','untrust'].includes(operation))throw Error('Invalid trust operation');
 const x=identity(ca);
 if(platform==='win32'){
  const escaped=ca.replace(/'/g,"''");
  if(operation==='trust')return {name:'powershell.exe',args:['-NoProfile','-Command',
   "Import-Certificate -FilePath '"+escaped+"' -CertStoreLocation Cert:\\CurrentUser\\Root -ErrorAction Stop | Out-Null"]};
  return {name:'powershell.exe',args:['-NoProfile','-Command',
   "$c=Get-ChildItem Cert:\\CurrentUser\\Root | Where-Object { $_.Thumbprint -eq '"+x.sha1+"' }; if($c){$c | Remove-Item -Force -ErrorAction Stop}"]};
 }
 if(platform==='darwin'){
  const keychain=path.join(os.homedir(),'Library','Keychains','login.keychain-db');
  return operation==='trust'
   ?{name:'security',args:['add-trusted-cert','-r','trustRoot','-k',keychain,ca]}
   :{name:'security',args:['delete-certificate','-Z',x.sha1,keychain]};
 }
 if(platform==='linux'){
  const dir=env.CLAUDEBRIDGE_NSS_DB||path.join(os.homedir(),'.pki','nssdb');
  const nickname='ClaudeBridge '+x.sha1;
  return operation==='trust'
   ?{name:'certutil',args:['-d','sql:'+dir,'-A','-n',nickname,'-t','C,,','-i',ca]}
   :{name:'certutil',args:['-d','sql:'+dir,'-D','-n',nickname]};
 }
 throw Error('Unsupported OS');
}
function apply(operation,ca,{confirm=false,platform=process.platform,run=execute,env=process.env}={}){
 if(confirm!==true)throw Error('Explicit user approval required to modify certificate trust');
 const details=identity(ca);
 const c=command(operation,ca,platform,env);
 run(c.name,c.args);
 return {operation,fingerprint:details.sha256};
}
module.exports={identity,command,apply};
