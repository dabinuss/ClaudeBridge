'use strict';
// The official Claude Code Mod calls this private CLI so changes are written
// atomically through the SAME settings module the MCP server already uses.
const settings=require('../../server/settings');
const mode=process.argv[3];
try{
 if(process.argv[2]==='get')console.log(JSON.stringify(settings.read()));
 else if(process.argv[2]==='set'&&['off','manual','fallback','dual'].includes(mode))
  console.log(JSON.stringify(settings.write({mode})));
 else throw Error('Usage: settings-cli.js get | set off|manual|fallback|dual');
}catch(e){console.error(e.message);process.exitCode=1;}
