'use strict';
// Project-scoped MCP mailbox exposed only to a Codex worker for real-time collaboration.
const readline=require('node:readline');
const {openDb,task,message,messages}=require('./db');
const plans=require('./plans');
const [root,taskId]=process.argv.slice(2);
if(!root||!/^[0-9a-f-]{36}$/i.test(taskId||'')){process.stderr.write('Invalid Codex mailbox configuration\n');process.exit(2);}
const db=openDb({path:root});
const current=task(db,taskId);
if(!current||current.project_path!==root){process.stderr.write('Unknown mailbox task\n');process.exit(2);}
const specs=[
{name:'read_messages',description:'Read the most recent project messages from Claude, Codex and the system. Call this when beginning, when blocked, and before finalizing the task.',inputSchema:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:100}}}},
{name:'send_message',description:'Post a progress update, question, blocker or decision for Claude to read in the shared project inbox.',inputSchema:{type:'object',properties:{body:{type:'string',maxLength:10000},to:{type:'string',enum:['claude','all']}},required:['body']}},
{name:'checkpoint',description:'Persist a decision, completed work summary or next-step handoff for later agents.',inputSchema:{type:'object',properties:{note:{type:'string',maxLength:10000}},required:['note']}}
];
function respond(data){process.stdout.write(JSON.stringify(data)+'\n');}
function tool(name,args){
 if(name==='read_messages'){
   const contract=plans.forTask(db,taskId);
   return {taskId,messages:messages(db,args.limit||30),plan:contract,
     planWarning:contract&&contract.currentVersion!==contract.plan_version?'The active plan has been revised since this task began. Stop conflicting work and request new instructions from Claude.':null};
 }
 if(name==='send_message')return message(db,'codex',args.to||'claude',args.body,taskId);
 if(name==='checkpoint')return message(db,'codex','all',args.note,taskId);
 throw Error('Unknown mailbox tool');
}
function handle(req){
 if(!req||req.jsonrpc!=='2.0'||req.id===undefined||!req.method)return;
 let result;
 if(req.method==='initialize')result={protocolVersion:req.params?.protocolVersion||'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'claudebridge-mailbox',version:'2.0.0'},instructions:'You collaborate with Claude through shared project messages. Call read_messages to receive new Claude instructions, send_message to report progress or blockers, and checkpoint for durable decisions. Do not assume Claude responds immediately.'};
 else if(req.method==='tools/list')result={tools:specs};
 else if(req.method==='ping')result={};
 else if(req.method==='tools/call'){
   try{result={content:[{type:'text',text:JSON.stringify(tool(req.params?.name,req.params?.arguments||{}))}]};}
   catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}
 }else return respond({jsonrpc:'2.0',id:req.id,error:{code:-32601,message:'Method not found'}});
 respond({jsonrpc:'2.0',id:req.id,result});
}
readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
 if(Buffer.byteLength(line)>1024*1024)return;
 try{handle(JSON.parse(line));}catch(e){process.stderr.write(e.message+'\n');}
});
process.on('exit',()=>{try{db.close();}catch{}});
