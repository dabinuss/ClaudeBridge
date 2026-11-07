'use strict';
// Native Claude Desktop renderer enhancement, loaded only by the optional CDP companion.
// Never alters network requests, Claude messages, model IDs, or the MCP transport.
(()=>{
 if(window.__claudebridgePickerInjected)return;
 Object.defineProperty(window,'__claudebridgePickerInjected',{value:true});
 const marker='data-claudebridge-picker';
 const labels={off:'Off',manual:'On demand',fallback:'Fallback',dual:'Dual agents'};
 let sequence=0;const pending=new Map();
 const css=[
  '['+marker+']{border-top:1px solid #8885;padding:10px 12px;font:inherit;min-width:240px;max-width:370px}',
  '['+marker+'] .cb-header{font-size:13px;font-weight:700;margin-bottom:9px}',
  '['+marker+'] .cb-modes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}',
  '['+marker+'] button{font:inherit;font-size:12px;cursor:pointer;background:transparent;color:inherit;padding:6px 8px;border:1px solid #8885;border-radius:7px}',
  '['+marker+'] button[aria-pressed=true]{border-color:#b66b3a;background:#b66b3a20;font-weight:650}',
  '['+marker+'] button:disabled{opacity:.4;cursor:default}',
  '['+marker+'] .cb-status{font-size:11px;opacity:.85;margin:9px 0 7px;white-space:normal}',
  '['+marker+'] .cb-actions{display:flex;gap:6px;flex-wrap:wrap}',
  '['+marker+'] .cb-message{font-size:11px;white-space:pre-wrap;max-height:100px;overflow:auto;margin-top:7px}'
 ].join('\n');
 const style=document.createElement('style');style.textContent=css;
 (document.head||document.documentElement).append(style);
 function rpc(action,extra={}){
  return new Promise((resolve,reject)=>{
   if(typeof window.__claudebridgeHost!=='function')return reject(Error('Native bridge disconnected'));
   const id=++sequence;pending.set(id,{resolve,reject});
   window.__claudebridgeHost(JSON.stringify({id,action,...extra}));
   setTimeout(()=>{const entry=pending.get(id);if(entry){pending.delete(id);entry.reject(Error('Native bridge timeout'));}},5000);
  });
 }
 window.addEventListener('claudebridge-response',e=>{
  const {id,data,error}=e.detail||{};const entry=pending.get(id);
  if(!entry)return;
  pending.delete(id);
  if(error)entry.reject(Error(error));else entry.resolve(data);
 });
 function element(tag,cls,value){
  const x=document.createElement(tag);x.className=cls||'';if(value)x.textContent=value;return x;
 }
 function btn(label,fn){
  const b=element('button','',label);b.type='button';
  b.addEventListener('pointerdown',e=>e.stopPropagation(),true);
  b.addEventListener('click',e=>{
   e.preventDefault();e.stopImmediatePropagation();
   Promise.resolve().then(()=>fn(b)).catch(err=>{
    const root=b.closest('['+marker+']');
    if(root)root.querySelector('.cb-message').textContent=String(err.message||err);
   });
  },true);
  return b;
 }
 function update(root,data){
  if(!root.isConnected||!data)return;
  const mode=data.mode||data.settings?.mode||'manual';
  for(const b of root.querySelectorAll('.cb-modes button'))
   b.setAttribute('aria-pressed',String(b.textContent===labels[mode]));
  const installed=data.codexInstalled??data.health?.codexInstalled;
  const login=data.codexLogin??data.health?.codexLogin;
  root.querySelector('.cb-status').textContent='Codex: '+(installed?'Installed':'Not installed')
   +' · ChatGPT: '+(login==='signed_in'?'Connected':'Sign-in required')
   +(mode==='fallback'?' · Manual/confirmed limit handoff only':'');
  const controls=root.querySelectorAll('.cb-actions button');
  controls[1].disabled=login==='signed_in'||!installed;
  controls[1].textContent=login==='signed_in'?'Codex connected':'Connect Codex';
  controls[2].hidden=Boolean(installed);
 }
 function attach(menu){
  if(menu.querySelector('['+marker+']'))return;
  const root=element('div','','');root.setAttribute(marker,'');
  root.setAttribute('role','group');root.setAttribute('aria-label','ClaudeBridge controls');
  root.addEventListener('pointerdown',e=>e.stopPropagation(),true);
  root.addEventListener('click',e=>e.stopPropagation(),true);
  root.append(element('div','cb-header','ClaudeBridge'));
  const modes=element('div','cb-modes','');
  for(const [mode,label] of Object.entries(labels)){
   const b=btn(label,async()=>update(root,await rpc('set-mode',{mode})));
   b.setAttribute('aria-pressed','false');modes.append(b);
  }
  root.append(modes,element('div','cb-status','Checking Codex…'));
  const actions=element('div','cb-actions','');
  actions.append(btn('Refresh',async()=>update(root,await rpc('status'))));
  actions.append(btn('Connect Codex',async()=>{
   const data=await rpc('login');
   update(root,data);
   root.querySelector('.cb-message').textContent=data.instructions||data.nextStep||'Approve sign-in in your browser.';
  }));
  actions.append(btn('Install / Repair',async()=>rpc('repair')));
  root.append(actions,element('div','cb-message',''));menu.append(root);
  rpc('status').then(data=>update(root,data)).catch(e=>{
   root.querySelector('.cb-status').textContent='ClaudeBridge unavailable';
   root.querySelector('.cb-message').textContent=String(e.message||e);
  });
 }
 function looksLikeModelMenu(el){
  const role=el.getAttribute('role');
  if(!['menu','listbox','dialog'].includes(role)&&!el.matches('[data-radix-popper-content-wrapper]'))return false;
  const sample=(el.textContent||'').slice(0,1800);
  return /\b(opus|sonnet|haiku|model)\b/i.test(sample)&&
    el.querySelectorAll('[role="menuitem"],[role="option"],[role="menuitemradio"],button').length>=2;
 }
 function scan(){
  document.querySelectorAll('[role=menu],[role=listbox],[role=dialog],[data-radix-popper-content-wrapper]').forEach(el=>{
   try{if(looksLikeModelMenu(el))attach(el);}catch{}
  });
 }
 let scheduled=false;
 const observer=new MutationObserver(()=>{
  if(scheduled)return;scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;scan();});
 });
 observer.observe(document.documentElement,{subtree:true,childList:true});
 scan();
 window.addEventListener('beforeunload',()=>observer.disconnect(),{once:true});
})();
