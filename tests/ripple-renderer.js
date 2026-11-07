'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('../.builddeps/node_modules/jsdom');
const {buildScript}=require('../integrations/ripple-lite/chat-rpc');
const html='<html><head></head><body>'+
 '<div role="menu" id="unrelated"><button role="menuitem">Settings</button><button role="menuitem">Help</button></div>'+
 '<div role="menu" id="models"><button role="menuitem">Claude Opus</button><button role="menuitem">Claude Sonnet</button></div>'+
 '</body></html>';
const dom=new JSDOM(html,{url:'https://claude.ai',pretendToBeVisual:true,runScripts:'dangerously'});
const win=dom.window;
win.HTMLElement.prototype.getClientRects=function(){return [{width:180,height:26}];};
let mode='manual',rpcCalls=0;
win.fetch=async(url,options)=>{
 rpcCalls++;
 assert.equal(url,'/__claudebridge/rpc');
 assert.equal(options.headers['x-claudebridge-token'],'a'.repeat(64));
 const query=JSON.parse(options.body);
 if(query.action==='set-mode')mode=query.mode;
 return {ok:true,json:async()=>({data:{mode,codexInstalled:true,codexLogin:'signed_in'}})};
};
const source=fs.readFileSync(path.join(__dirname,'../integrations/native-ui/renderer.js'),'utf8');
win.eval(buildScript(source,'a'.repeat(64)));
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
(async()=>{
 await wait(100);
 const models=win.document.getElementById('models');
 const panel=models.querySelector('[data-claudebridge-picker]');
 assert(panel,'ClaudeBridge must be added to existing model menu');
 assert(!win.document.getElementById('unrelated').querySelector('[data-claudebridge-picker]'));
 assert.equal(models.querySelectorAll('[role=menuitem]').length,2);
 const dual=[...panel.querySelectorAll('button')].find(b=>b.textContent==='Dual agents');
 assert(dual);
 dual.click();
 await wait(60);
 assert.equal(mode,'dual');
 assert.equal(dual.getAttribute('aria-pressed'),'true');
 assert(rpcCalls>=2);
 assert.equal(win.document.querySelectorAll('[data-claudebridge-picker]').length,1);
 console.log('PASS: Claude Chat menu adds real Bridge mode controls via first-party HTTPS RPC');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{win.__claudebridgePickerDispose?.();win.close();});
