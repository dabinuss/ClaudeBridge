'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('../.builddeps/node_modules/jsdom');

async function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
const html='<html><head></head><body><div id="other" role="menu"><button role="menuitem">Settings</button><button role="menuitem">Help</button></div><div id="models" role="menu"><button role="menuitem">Claude Opus</button><button role="menuitem">Claude Sonnet</button></div></body></html>';
const dom=new JSDOM(html,{url:'https://claude.ai',runScripts:'dangerously',pretendToBeVisual:true});
const win=dom.window;
let mode='manual',login='signed_in',requests=0;
win.__claudebridgeHost=(raw)=>{
 const req=JSON.parse(raw);requests++;
 if(req.action==='set-mode')mode=req.mode;
 const data={mode,codexInstalled:true,codexLogin:login};
 win.setTimeout(()=>win.dispatchEvent(new win.CustomEvent('claudebridge-response',{detail:{id:req.id,data}})),0);
};
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../integrations/native-ui/renderer.js'),'utf8');
 win.eval(source);
 await sleep(100);
 assert.equal(win.document.querySelectorAll('[data-claudebridge-picker]').length,1);
 assert(!win.document.getElementById('other').querySelector('[data-claudebridge-picker]'),'must not affect unrelated menus');
 const panel=win.document.querySelector('[data-claudebridge-picker]');
 const buttons=[...panel.querySelectorAll('.cb-modes button')];
 assert.deepEqual(buttons.map(x=>x.textContent),['Off','On demand','Fallback','Dual agents']);
 assert.equal(buttons.find(x=>x.textContent==='On demand').getAttribute('aria-pressed'),'true');
 buttons.find(x=>x.textContent==='Dual agents').click();
 await sleep(80);
 assert.equal(mode,'dual','click must change shared bridge mode');
 assert.equal(buttons.find(x=>x.textContent==='Dual agents').getAttribute('aria-pressed'),'true');
 assert.equal(win.document.querySelectorAll('[role=menuitem]').length,4,'original model choices must remain untouched');
 assert.equal(win.document.querySelectorAll('[data-claudebridge-picker]').length,1,'no duplicate injected controls');
 assert(requests>=2,'native host bridge should receive status and set-mode calls');
 console.log('PASS: original menu augmented, modes operational, other menus unchanged, no duplicate UI');
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>dom.window.close());
