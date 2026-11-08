'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const setup=fs.readFileSync(path.join(__dirname,'../installer/online-windows.cmd'),'utf8');
const lifecycle=fs.readFileSync(path.join(__dirname,'../integrations/ripple-lite/lifecycle.js'),'utf8');
for(const part of ['Start-Transcript -Path $logFile -Append','Stop-Transcript','pause >nul','CLAUDEBRIDGE_EXIT_CODE','ClaudeBridge ERROR:'])assert(setup.includes(part),'Missing diagnostic: '+part);
for(const part of ['activation failed during ','certificate trust','local proxy startup','Claude Desktop proxy configuration'])assert(lifecycle.includes(part),'Missing stage: '+part);
console.log('PASS: Windows installer failure diagnostics and stage reporting');
