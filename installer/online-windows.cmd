@echo off
setlocal
set "CLAUDEBRIDGE_SETUP_SCRIPT=%~f0"
set "CLAUDEBRIDGE_SETUP_ARGS=%*"
powershell.exe -NoProfile -Command "$s=[IO.File]::ReadAllText($env:CLAUDEBRIDGE_SETUP_SCRIPT); $mark=('# CLAUDEBRIDGE'+' POWERSHELL START'); $end=('# CLAUDEBRIDGE'+' CORE PAYLOAD'); $pos=$s.IndexOf($mark); $stop=$s.LastIndexOf($end); if($pos -lt 0 -or $stop -le $pos){throw 'Invalid embedded ClaudeBridge setup'}; Invoke-Expression $s.Substring($pos + $mark.Length,$stop - $pos - $mark.Length)"
set "CLAUDEBRIDGE_EXIT_CODE=%errorlevel%"
if not "%CLAUDEBRIDGE_EXIT_CODE%"=="0" (
  echo.
  echo ClaudeBridge installation failed with exit code %CLAUDEBRIDGE_EXIT_CODE%.
  echo Log: %LOCALAPPDATA%\ClaudeBridge\setup.log
  echo Press any key to close this window after reading the error.
  pause >nul
)
exit /b %CLAUDEBRIDGE_EXIT_CODE%
# CLAUDEBRIDGE POWERSHELL START
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
# Preserve the complete console record across short-lived double-clicked setups.
$logDir=Join-Path $env:LOCALAPPDATA 'ClaudeBridge'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile=Join-Path $logDir 'setup.log'
try { Start-Transcript -Path $logFile -Append -ErrorAction Stop | Out-Null }
catch { Write-Warning "Unable to start setup transcript: $($_.Exception.Message)" }
Write-Host "ClaudeBridge setup log: $logFile"
$mode='install'
$purge=$false
$cli=[string]$env:CLAUDEBRIDGE_SETUP_ARGS
if($cli -match '(^|\s)(--uninstall|uninstall)(\s|$)'){$mode='uninstall'}
if($cli -match '(^|\s)(--status|status)(\s|$)'){$mode='status'}
if($cli -match '--purge-data'){$purge=$true}
if($cli -match '(^|\s)--verify-core(\s|$)'){$mode='verify-core'}
$base=if($env:CLAUDEBRIDGE_SETUP_TEST_HOME){$env:CLAUDEBRIDGE_SETUP_TEST_HOME}else{Join-Path $env:LOCALAPPDATA 'ClaudeBridge'}
$installed=Join-Path $base 'Installed'
$nodeInstalled=Join-Path $installed 'integrations\native-ui\node.exe'
$setupInstalled=Join-Path $installed 'installer\setup.js'
if(!$cli -and (Test-Path (Join-Path $installed 'installer-owned.json'))){
 Write-Host 'ClaudeBridge: 1) Update / Repair  2) Uninstall  3) Cancel'
 $answer=Read-Host 'Select'
 switch($answer){
  '1' {$mode='install'}
  '2' {
    $mode='uninstall'
    $answer=Read-Host 'Also delete saved ClaudeBridge plans, settings and registered project memory? [y/N]'
    $purge=$answer -match '^(y|yes)$'
  }
  default {exit 0}
 }
}
if($mode -ne 'install'){
 if((Test-Path $nodeInstalled) -and (Test-Path $setupInstalled)){
  $arglist=@($setupInstalled,$mode)
  if($mode -eq 'uninstall' -and $purge){$arglist+= '--purge-data'}
  # Windows locks the executable image of a running process. Never uninstall
  # using node.exe FROM the directory that is about to be removed.
  # Run the installed uninstall script with a temporary COPY of the runtime.
  if($mode -eq 'uninstall'){
   $cleanupRoot=Join-Path ([IO.Path]::GetTempPath()) ('ClaudeBridgeUninstall-'+[guid]::NewGuid().ToString('N'))
   New-Item -ItemType Directory -Path $cleanupRoot -Force | Out-Null
   $temporaryNode=Join-Path $cleanupRoot 'node.exe'
   try {
    Copy-Item -LiteralPath $nodeInstalled -Destination $temporaryNode -ErrorAction Stop
    Write-Host 'Removing ClaudeBridge using a temporary Node runtime outside the installed directory.'
    & $temporaryNode @arglist
    $uninstallExit=$LASTEXITCODE
   } finally {
    Remove-Item -LiteralPath $cleanupRoot -Force -Recurse -ErrorAction SilentlyContinue
   }
   exit $uninstallExit
  }
  & $nodeInstalled @arglist
  exit $LASTEXITCODE
 }
 Write-Host 'ClaudeBridge is not installed.'
 exit 0
}
$root=Join-Path ([IO.Path]::GetTempPath()) ('ClaudeBridgeOnline-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null
try{
 $core=Join-Path $root 'core.tar.gz'
 # All ClaudeBridge-owned program scripts and UI are inside this very same file.
 $source=[IO.File]::ReadAllText($env:CLAUDEBRIDGE_SETUP_SCRIPT)
 $mark='# CLAUDEBRIDGE CORE PAYLOAD'
 $index=$source.LastIndexOf($mark)
 if($index -lt 0){throw 'Embedded ClaudeBridge application missing'}
 $encoded=$source.Substring($index+$mark.Length).Trim()
 [IO.File]::WriteAllBytes($core,[Convert]::FromBase64String($encoded))
 $coreDir=Join-Path $root 'core'
 New-Item -ItemType Directory -Path $coreDir | Out-Null
 & tar.exe -xzf $core -C $coreDir
 if($LASTEXITCODE -ne 0){throw 'Failed to extract the embedded ClaudeBridge application.'}
 if($mode -eq 'verify-core'){
   Write-Host 'Embedded ClaudeBridge application extracted successfully.'
   exit 0
 }
 $nodeVer='22.23.4'
 $archive="node-v$nodeVer-win-x64.zip"
 $nodeBase="https://nodejs.org/dist/v$nodeVer"
 Write-Host "Downloading Node.js $nodeVer from nodejs.org..."
 $zip=Join-Path $root $archive
 $hashes=Join-Path $root 'SHASUMS256.txt'
 Invoke-WebRequest -Uri "$nodeBase/$archive" -OutFile $zip -UseBasicParsing
 Invoke-WebRequest -Uri "$nodeBase/SHASUMS256.txt" -OutFile $hashes -UseBasicParsing
 $matching=@(Get-Content -LiteralPath $hashes | Where-Object {$_ -match ('\s'+[regex]::Escape($archive)+'$')})
 if($matching.Count -ne 1){throw 'Node.js checksum manifest did not contain the required archive.'}
 $hash=($matching[0] -split '\s+')[0]
 if((Get-FileHash $zip -Algorithm SHA256).Hash -ine $hash){throw 'Node.js SHA256 verification failed. Installation stopped.'}
 Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $root 'runtime') -Force
 $runtime=Join-Path (Join-Path $root 'runtime') "node-v$nodeVer-win-x64"
 $node=Join-Path $runtime 'node.exe'
 $npm=Join-Path $runtime 'node_modules\npm\bin\npm-cli.js'
 if(!(Test-Path $node) -or !(Test-Path $npm)){throw 'Official Node archive did not contain Node.js and npm.'}
 $env:CLAUDEBRIDGE_NPM_CLI=$npm
 & $node (Join-Path $coreDir 'installer\online-deps.js') install
 if($LASTEXITCODE -ne 0){throw "ClaudeBridge setup returned exit code $LASTEXITCODE. See $logFile for the original error."}
 Write-Host 'ClaudeBridge installed. Fully quit Claude and reopen the normal Claude Desktop application.'
}catch{
 Write-Host ''
 Write-Host ('ClaudeBridge ERROR: '+$_.Exception.Message) -ForegroundColor Red
 Write-Host ('Details saved in: '+$logFile) -ForegroundColor Yellow
 throw
}finally{
 Remove-Item -LiteralPath $root -Force -Recurse -ErrorAction SilentlyContinue
 try { Stop-Transcript -ErrorAction SilentlyContinue | Out-Null } catch {}
}
