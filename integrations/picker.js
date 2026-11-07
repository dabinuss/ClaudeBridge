'use strict';
// Experimental bootstrap adapter for Claude Code surfaces.
// This module does not intercept any traffic by itself. It is intentionally separate
// from the MCP server, and should only be invoked by an explicitly installed integration.
const {read}=require('../server/settings');
const CODE_SURFACES=new Set(['code','ccd','ccr','cowork']);
const ENTRY_ID='claudebridge';
function apply(bootstrap,configuration=read()){
  if(!bootstrap||typeof bootstrap!=='object'||!Array.isArray(bootstrap.model_selector_config))
    return {bootstrap,injected:0};
  if(configuration.mode==='off')return {bootstrap,injected:0};
  const cloned=structuredClone(bootstrap);
  let injected=0;
  for(const surface of cloned.model_selector_config){
    if(!CODE_SURFACES.has(surface?.id)||!Array.isArray(surface.models))continue;
    if(surface.models.some(m=>m?.id===ENTRY_ID))continue;
    const template=surface.models.find(m=>m?.id?.startsWith('claude-')&&!m.disabled);
    if(!template)continue;
    const model=structuredClone(template);
    model.id=ENTRY_ID;
    model.name='ClaudeBridge';
    model.description='Claude + Codex coordination (configured in ClaudeBridge settings)';
    model.section='main';
    for(const key of ['is_default','badge','disabled','disabled_reason','minimum_tier'])delete model[key];
    surface.models.push(model);
    injected++;
  }
  return {bootstrap:cloned,injected};
}
module.exports={apply,ENTRY_ID,CODE_SURFACES};
