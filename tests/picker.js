'use strict';
const assert=require('node:assert/strict');
const {apply}=require('../integrations/picker');
const input={model_selector_config:[
 {id:'chat',models:[{id:'claude-opus',name:'Opus',section:'main'}]},
 {id:'code',models:[{id:'claude-sonnet',name:'Sonnet',section:'main',thinking:{effort_options:[]}}]},
 {id:'cowork',models:[{id:'claude-sonnet',name:'Sonnet',section:'main'}]}
]};
const before=JSON.stringify(input);
const {bootstrap:out,injected}=apply(input,{mode:'dual'});
assert.equal(injected,2);
assert.equal(out.model_selector_config[0].models.length,1);
assert.equal(out.model_selector_config[1].models[1].name,'ClaudeBridge');
assert.equal(out.model_selector_config[2].models[1].id,'claudebridge');
assert.equal(JSON.stringify(input),before);
assert.equal(apply(out,{mode:'dual'}).injected,0);
assert.equal(apply(input,{mode:'off'}).injected,0);
console.log('PASS: experimental picker adapter isolates Code surfaces and avoids duplicates');
