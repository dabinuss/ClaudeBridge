'use strict';
const assert = require('node:assert/strict');
const {addBridgeModels,isBootstrapPath} = require('../integrations/ripple-lite/bootstrap');
const fixture = {
  model_selector_config: [
    {id:'chat',models:[{id:'claude-sonnet',name:'Sonnet'}]},
    {id:'code',models:[
      {id:'claude-sonnet',name:'Sonnet',thinking:{effort_options:[{id:'low'},{id:'high'}]}},
      {id:'claude-opus',name:'Opus'}
    ]},
    {id:'design',models:[{id:'claude-sonnet',name:'Sonnet'}]}
  ]
};
const candidates = [
 {id:'claudebridge:dual',name:'ClaudeBridge · Dual',routable:true,effortLevels:['high']},
 {id:'claudebridge:manual',name:'ClaudeBridge · Manual',routable:false}
];
assert.equal(isBootstrapPath('/api/bootstrap'),true);
assert.equal(isBootstrapPath('/edge-api/bootstrap?foo=bar'),true);
assert.equal(isBootstrapPath('/api/bootstrap/fake'),false);
assert.equal(isBootstrapPath('/api/other'),false);
const status = addBridgeModels(fixture,candidates);
assert.equal(status.added,1);
assert.deepEqual(status.surfaces,[{id:'code',inserted:['claudebridge:dual']}]);
assert.equal(fixture.model_selector_config[0].models.length,1);
assert.equal(fixture.model_selector_config[2].models.length,1);
assert.equal(fixture.model_selector_config[1].models.length,3);
assert.deepEqual(fixture.model_selector_config[1].models[2].thinking.effort_options,[{id:'high',recommended:true}]);
assert.equal(addBridgeModels(fixture,candidates).added,0);
assert.equal(addBridgeModels({model_selector_config:[{id:'code',models:[]}]},candidates).added,0);
console.log('PASS: Ripple-lite bootstrap adapter, fail-closed route checks, no chat modifications');
