'use strict';
// Minimal Codex-backed Messages route for text-only requests.
// This is not a full Claude Code agent harness: tool calling is deliberately
// rejected instead of pretending to support it.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const ROUTE_ID='claudebridge-codex';
const MAX_OUTPUT=1024*1024;
function extractText(parts){
 if(typeof parts==='string')return parts;
 if(!Array.isArray(parts))throw Error('Unsupported message content');
 const text=[];
 for(const part of parts){
  if(part.type!=='text'||typeof part.text!=='string')throw Error('Only text messages are supported');
  text.push(part.text);
 }
 return text.join('\n');
}
function promptFor(request){
 if(!request||typeof request!=='object'||request.model!==ROUTE_ID||
   !Array.isArray(request.messages)||request.messages.length===0)
  throw Error('Invalid ClaudeBridge Codex request');
 if(Array.isArray(request.tools)&&request.tools.length>0)
  throw Error('Claude Code tool use cannot be translated by the text-only adapter');
 if(request.tool_choice&&request.tool_choice.type!=='none')
  throw Error('Tool choice is unsupported');
 const prompt=[];
 if(request.system)prompt.push('System instructions:\n'+extractText(request.system));
 for(const message of request.messages){
  if(!['user','assistant'].includes(message.role))throw Error('Unsupported message role');
  prompt.push(message.role.toUpperCase()+':\n'+extractText(message.content));
 }
 prompt.push('ASSISTANT:');
 const text=prompt.join('\n\n');
 if(text.length>250000)throw Error('Prompt too long');
 return text;
}
function codexPath(base){
 const p=path.join(base,'vendor','node_modules','@openai','codex','bin','codex.js');
 if(!fs.existsSync(p))throw Error('Codex CLI not installed');
 return p;
}
async function runCodex(request,{base=path.resolve(__dirname,'../..'),cwd=os.tmpdir(),binary=codexPath(base),timeoutMs=90000}={}){
 const prompt=promptFor(request);
 const exe=binary.endsWith('.js')?process.execPath:binary;
 const args=binary.endsWith('.js')?[binary]:[];
 args.push('exec','--json','--sandbox','read-only','--skip-git-repo-check','-');
 return new Promise((resolve,reject)=>{
  let settled=false,latest='',bytes=0;
  const child=spawn(exe,args,{cwd,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
  const fail=error=>{if(settled)return;settled=true;child.kill();reject(error);};
  const timeout=setTimeout(()=>fail(Error('Codex timed out')),timeoutMs);
  const lines=readline.createInterface({input:child.stdout});
  lines.on('line',line=>{
   bytes+=Buffer.byteLength(line);
   if(bytes>MAX_OUTPUT)return fail(Error('Codex output exceeds limit'));
   let event;
   try{event=JSON.parse(line);}catch{return;}
   if(event.type==='item.completed'&&event.item?.type==='agent_message')
    latest=String(event.item.text||'').slice(0,MAX_OUTPUT);
   if(event.type==='turn.failed'||event.type==='error')
    fail(Error(String(event.error?.message||event.message||'Codex error').slice(0,300)));
  });
  child.on('error',fail);
  child.on('close',code=>{
   clearTimeout(timeout);
   if(settled)return;
   settled=true;
   if(code!==0||!latest)return reject(Error('Codex did not complete a text response'));
   resolve(latest);
  });
  child.stdin.on('error',()=>{});
  child.stdin.end(prompt);
 });
}
function anthropicMessage(text,model=ROUTE_ID){
 return {id:'msg_'+crypto.randomBytes(12).toString('hex'),type:'message',role:'assistant',
   content:[{type:'text',text}],model,stop_reason:'end_turn',stop_sequence:null,
   usage:{input_tokens:0,output_tokens:0}};
}
function writeAnswer(res,text,{stream=false}={}){
 const message=anthropicMessage(text);
 if(!stream){
  res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify(message));return;
 }
 res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store','connection':'keep-alive'});
 const emit=(event,obj)=>res.write('event: '+event+'\ndata: '+JSON.stringify(obj)+'\n\n');
 emit('message_start',{type:'message_start',message:{...message,content:[],stop_reason:null}});
 emit('content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}});
 emit('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text}});
 emit('content_block_stop',{type:'content_block_stop',index:0});
 emit('message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:0}});
 emit('message_stop',{type:'message_stop'});
 res.end();
}
module.exports={ROUTE_ID,promptFor,codexPath,runCodex,anthropicMessage,writeAnswer};
