#!/usr/bin/env node
const {randomUUID}=require('crypto');
process.stdin.resume();
let text='';process.stdin.on('data',c=>text+=c);
process.stdin.on('end',()=>{
  console.log(JSON.stringify({type:'thread.started',thread_id:randomUUID()}));
  console.log(JSON.stringify({type:'turn.started'}));
  console.log(JSON.stringify({type:'item.completed',item:{id:'1',type:'agent_message',text:'Mock completed; task length '+text.length}}));
  console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:11,output_tokens:22}}));
});