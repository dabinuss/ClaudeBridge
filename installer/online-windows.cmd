@echo off
setlocal
set "CLAUDEBRIDGE_SETUP_SCRIPT=%~f0"
set "CLAUDEBRIDGE_SETUP_ARGS=%*"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:CLAUDEBRIDGE_SETUP_SCRIPT); $mark=('# CLAUDEBRIDGE'+' POWERSHELL START'); $pos=$s.IndexOf($mark); if($pos -lt 0){throw 'Invalid setup file'}; Invoke-Expression $s.Substring($pos + $mark.Length)"
exit /b %errorlevel%
# CLAUDEBRIDGE POWERSHELL START
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$mode='install'
$purge=$false
$cli=[string]$env:CLAUDEBRIDGE_SETUP_ARGS
if($cli -match '(^|\s)(--uninstall|uninstall)(\s|$)'){$mode='uninstall'}
if($cli -match '(^|\s)(--status|status)(\s|$)'){$mode='status'}
if($cli -match '--purge-data'){$purge=$true}
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
 $expected='__CORE_SHA256__'
 $url='https://github.com/dabinuss/ClaudeBridge/releases/download/preview/ClaudeBridge-Online-Core.tar.gz'
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 Write-Host 'Downloading SHA256-pinned ClaudeBridge application...'
 Invoke-WebRequest -Uri $url -OutFile $core -UseBasicParsing -MaximumRedirection 5
 if((Get-FileHash $core -Algorithm SHA256).Hash -ine $expected){
   throw 'ClaudeBridge package SHA256 verification failed. Installation stopped.'
 }
 $coreDir=Join-Path $root 'core'
 New-Item -ItemType Directory -Path $coreDir | Out-Null
 & tar.exe -xzf $core -C $coreDir
 if($LASTEXITCODE -ne 0){throw 'Failed to extract the ClaudeBridge application.'}
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
 if($LASTEXITCODE -ne 0){throw 'ClaudeBridge setup returned an error.'}
 Write-Host 'ClaudeBridge installed. Fully quit Claude and open ClaudeBridge Claude if the native launcher was installed.'
}finally{
 Remove-Item -LiteralPath $root -Force -Recurse -ErrorAction SilentlyContinue
}
