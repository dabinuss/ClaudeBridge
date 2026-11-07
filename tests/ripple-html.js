'use strict';
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const {injectChatHtml}=require('../integrations/ripple-lite/html-inject');
const token='a'.repeat(64);
const original='<html><head><script nonce="abc123xyz" src="/app.js"></script></head><body>Hi</body></html>';
for(const encoding of ['identity','gzip','br','deflate']){
 const body=encoding==='identity'?Buffer.from(original):encoding==='gzip'?zlib.gzipSync(original):
  encoding==='br'?zlib.brotliCompressSync(original):zlib.deflateSync(original);
 const headers={'Content-Type':'text/html; charset=utf-8','Content-Encoding':encoding,
  'Content-Security-Policy':"script-src 'nonce-abc123xyz' 'strict-dynamic'",
  'Transfer-Encoding':'chunked'};
 const out=injectChatHtml({body,headers,token});
 assert.equal(out.changed,true);
 const decoded=encoding==='identity'?out.body:encoding==='gzip'?zlib.gunzipSync(out.body):
  encoding==='br'?zlib.brotliDecompressSync(out.body):zlib.inflateSync(out.body);
 assert.match(decoded.toString(),/\/__claudebridge\/ui.js\?token=/);
 assert.match(decoded.toString(),/nonce="abc123xyz"/);
 assert.equal(out.headers['Transfer-Encoding'],undefined);
 assert.equal(Number(out.headers['content-length']),out.body.length);
 assert.equal(injectChatHtml({body:out.body,headers:out.headers,token}).changed,false);
}
assert.equal(injectChatHtml({body:Buffer.from(original),headers:{'content-type':'application/json'},token}).changed,false);
assert.equal(injectChatHtml({body:Buffer.from('<html><head></head></html>'),headers:{
 'content-type':'text/html','content-security-policy':"script-src 'strict-dynamic'"},token}).changed,false);
console.log('PASS: CSP-preserving regular Claude Chat script injection over compressed HTML');
