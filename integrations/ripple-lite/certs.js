'use strict';
// Cross-platform certificate generation using Node's native RSA and a minimal
// JS X.509 encoder. No OpenSSL executable or global install required.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const forge=require('../../vendor/node_modules/node-forge');
function paths(dir){return Object.fromEntries(['ca.key','ca.pem','leaf.key','leaf.pem'].map(name=>[name.replace('.','_'),path.join(dir,name)]));}
function createIdentity(dir,{days=180}={}){
 if(!path.isAbsolute(dir)||!Number.isInteger(days)||days<1||days>365)throw Error('Invalid certificate location or lifetime');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const p=paths(dir);
 if([p.ca_pem,p.ca_key,p.leaf_pem,p.leaf_key].every(x=>fs.existsSync(x))){
  const ca=new crypto.X509Certificate(fs.readFileSync(p.ca_pem));
  const leaf=new crypto.X509Certificate(fs.readFileSync(p.leaf_pem));
  if(!ca.ca||!leaf.checkHost('claude.ai')||!leaf.checkHost('api.anthropic.com')||!leaf.verify(ca.publicKey))
   throw Error('Stored TLS identity is invalid');
  return {ca:p.ca_pem,cert:p.leaf_pem,key:p.leaf_key,fingerprint:ca.fingerprint256};
 }
 if(fs.readdirSync(dir).some(name=>name.startsWith('ca.')||name.startsWith('leaf.')))
  throw Error('Partial TLS identity found; refusing to replace the trusted root implicitly');
 try{
  function keys(){
   const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:65537,
    publicKeyEncoding:{type:'pkcs1',format:'pem'},privateKeyEncoding:{type:'pkcs1',format:'pem'}});
   return {private:pair.privateKey,public:forge.pki.publicKeyFromPem(pair.publicKey),
     secret:forge.pki.privateKeyFromPem(pair.privateKey)};
  }
  const caKeys=keys(),leafKeys=keys();
  const before=new Date(Date.now()-60000),after=new Date(Date.now()+days*86400000);
  const attrs=[{name:'commonName',value:'ClaudeBridge Local Root'}];
  const ca=forge.pki.createCertificate();
  ca.publicKey=caKeys.public;ca.serialNumber=crypto.randomBytes(16).toString('hex');
  ca.validity.notBefore=before;ca.validity.notAfter=after;
  ca.setSubject(attrs);ca.setIssuer(attrs);
  ca.setExtensions([
   {name:'basicConstraints',cA:true,pathLenConstraint:0,critical:true},
   {name:'keyUsage',keyCertSign:true,cRLSign:true,critical:true}
  ]);
  ca.sign(caKeys.secret,forge.md.sha256.create());
  const leaf=forge.pki.createCertificate();
  leaf.publicKey=leafKeys.public;leaf.serialNumber=crypto.randomBytes(16).toString('hex');
  leaf.validity.notBefore=before;leaf.validity.notAfter=after;
  leaf.setSubject([{name:'commonName',value:'claude.ai'}]);leaf.setIssuer(attrs);
  leaf.setExtensions([
   {name:'basicConstraints',cA:false,critical:true},
   {name:'keyUsage',digitalSignature:true,keyEncipherment:true,critical:true},
   {name:'extKeyUsage',serverAuth:true},
   {name:'subjectAltName',altNames:[
     {type:2,value:'claude.ai'},{type:2,value:'*.claude.ai'},
     {type:2,value:'api.anthropic.com'}
   ]}
  ]);
  leaf.sign(caKeys.secret,forge.md.sha256.create());
  const written=[[p.ca_pem,forge.pki.certificateToPem(ca)],
   [p.ca_key,caKeys.private],[p.leaf_pem,forge.pki.certificateToPem(leaf)],
   [p.leaf_key,leafKeys.private]];
  for(const [file,contents] of written)fs.writeFileSync(file,contents,{mode:0o600,flag:'wx'});
  const nativeCa=new crypto.X509Certificate(fs.readFileSync(p.ca_pem));
  const nativeLeaf=new crypto.X509Certificate(fs.readFileSync(p.leaf_pem));
  if(!nativeCa.ca||nativeLeaf.ca||!nativeLeaf.verify(nativeCa.publicKey)||
    !nativeLeaf.checkHost('claude.ai')||!nativeLeaf.checkHost('api.anthropic.com'))
   throw Error('Generated certificate failed native verification');
  return {ca:p.ca_pem,cert:p.leaf_pem,key:p.leaf_key,fingerprint:nativeCa.fingerprint256};
 }catch(error){
  for(const name of fs.readdirSync(dir))if(name.startsWith('ca.')||name.startsWith('leaf.'))
   fs.rmSync(path.join(dir,name),{force:true});
  throw error;
 }
}
function fingerprint(dir){return new crypto.X509Certificate(fs.readFileSync(paths(dir).ca_pem)).fingerprint256;}
module.exports={createIdentity,fingerprint,paths};
