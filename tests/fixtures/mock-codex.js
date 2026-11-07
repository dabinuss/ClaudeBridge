'use strict';
process.stdin.resume();let input='';
process.stdin.on('data',d=>input+=d);
process.stdin.on('end',()=>{
 if(!input.includes('hello'))process.exitCode=1;
 else process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Codex says hello'}})+'\n');
});
