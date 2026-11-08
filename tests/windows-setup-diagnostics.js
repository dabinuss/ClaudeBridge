'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const setup=fs.readFileSync(path.join(__dirname,'../installer/online-windows.cmd'),'utf8');
const lifecycle=fs.readFileSync(path.join(__dirname,'../integrations/ripple-lite/lifecycle.js'),'utf8');
for(const part of ['Start-Transcript -Path $logFile -Append','Stop-Transcript','pause >nul','CLAUDEBRIDGE_EXIT_CODE','ClaudeBridge ERROR:'])assert(setup.includes(part),'Missing diagnostic: '+part);
for(const part of ['activation failed during ','certificate trust','local proxy startup','Claude Desktop proxy configuration'])assert(lifecycle.includes(part),'Missing stage: '+part);
// Regression: the installed node.exe must not be executing while its own
// installation directory is deleted on Windows (ERROR_SHARING_VIOLATION/EBUSY).
for(const part of [
  "if($mode -eq 'uninstall')",
  "ClaudeBridgeUninstall-",
  "Copy-Item -LiteralPath $nodeInstalled -Destination $temporaryNode",
  "& $temporaryNode @arglist",
  "$uninstallExit=$LASTEXITCODE",
  "Remove-Item -LiteralPath $cleanupRoot"
])assert(setup.includes(part),'Missing out-of-tree uninstaller: '+part);
assert(!setup.includes('& $nodeInstalled @arglist\n  exit $LASTEXITCODE\n }\n Write-Host'), 'Do not run installed runtime for uninstall');
console.log('PASS: Windows setup logging and out-of-tree Node runtime for uninstall');
