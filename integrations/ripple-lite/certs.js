'use strict';
// User-scoped TLS identity for explicit, optional bootstrap interception.
// Never adds a system-wide CA or silently modifies certificate trust.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
function run(cmd,args){return execFileSync(cmd,args,{stdio:['ignore','pipe','pipe'],timeout:20000,windowsHide:true});}
function paths(dir){return Object.fromEntries(['ca.key','ca.pem','leaf.key','leaf.csr','leaf.pem','leaf.ext'].map(name=>[name.replace('.','_'),path.join(dir,name)]));}
function createIdentity(dir,{execute=run,days=180}={}){
 if(!path.isAbsolute(dir)||!Number.isInteger(days)||days<1||days>365)throw Error('Invalid certificate location or lifetime');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const p=paths(dir);
 if(fs.existsSync(p.ca_pem)&&fs.existsSync(p.leaf_pem)&&fs.existsSync(p.leaf_key)){
  return {ca:p.ca_pem,cert:p.leaf_pem,key:p.leaf_key,fingerprint:new crypto.X509Certificate(fs.readFileSync(p.ca_pem)).fingerprint256};
 }
 if(fs.readdirSync(dir).some(name=>name.startsWith('ca.')||name.startsWith('leaf.')))
  throw Error('Partial TLS identity found; refusing to replace the trusted root implicitly');
 const create=(args)=>execute('openssl',args);
 try{
  create(['genrsa','-out',p.ca_key,'2048']);
  create(['req','-new','-x509','-sha256','-days',String(days),'-key',p.ca_key,'-out',p.ca_pem,
    '-subj','/CN=ClaudeBridge Local Root',
    '-addext','basicConstraints=critical,CA:TRUE,pathlen:0',
    '-addext','keyUsage=critical,keyCertSign,cRLSign']);
  create(['genrsa','-out',p.leaf_key,'2048']);
  create(['req','-new','-sha256','-key',p.leaf_key,'-out',p.leaf_csr,
    '-subj','/CN=claude.ai']);
  fs.writeFileSync(p.leaf_ext,[
    'subjectAltName=DNS:claude.ai,DNS:*.claude.ai,DNS:api.anthropic.com',
    'basicConstraints=critical,CA:FALSE',
    'keyUsage=critical,digitalSignature,keyEncipherment',
    'extendedKeyUsage=serverAuth'
  ].join('\n')+'\n',{mode:0o600});
  create(['x509','-req','-sha256','-days',String(days),'-in',p.leaf_csr,
    '-CA',p.ca_pem,'-CAkey',p.ca_key,'-CAcreateserial','-out',p.leaf_pem,'-extfile',p.leaf_ext]);
  fs.chmodSync(p.ca_key,0o600);fs.chmodSync(p.leaf_key,0o600);
  fs.rmSync(p.leaf_csr,{force:true});fs.rmSync(p.leaf_ext,{force:true});
  const leaf=new crypto.X509Certificate(fs.readFileSync(p.leaf_pem));
  if(!leaf.checkHost('claude.ai')||leaf.ca||!leaf.verify(crypto.createPublicKey(fs.readFileSync(p.ca_pem))))
   throw Error('Generated TLS certificate failed validation');
  return {ca:p.ca_pem,cert:p.leaf_pem,key:p.leaf_key,fingerprint:new crypto.X509Certificate(fs.readFileSync(p.ca_pem)).fingerprint256};
 }catch(e){
  // No half-generated identity should be installed accidentally.
  for(const name of fs.readdirSync(dir))if(name.startsWith('ca.')||name.startsWith('leaf.'))fs.rmSync(path.join(dir,name),{force:true});
  throw e;
 }
}
function fingerprint(dir){const p=paths(dir);return new crypto.X509Certificate(fs.readFileSync(p.ca_pem)).fingerprint256;}
module.exports={createIdentity,fingerprint,paths};
