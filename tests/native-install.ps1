$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$env:CLAUDEBRIDGE_NATIVE_TEST_ROOT = Join-Path $env:RUNNER_TEMP ("ClaudeBridgeNativeTest-" + $PID)
New-Item -ItemType Directory -Path $env:CLAUDEBRIDGE_NATIVE_TEST_ROOT -Force | Out-Null
$env:CLAUDEBRIDGE_NATIVE_TEST_CLAUDE_EXE = Join-Path $env:CLAUDEBRIDGE_NATIVE_TEST_ROOT "FakeClaude.exe"
Set-Content -LiteralPath $env:CLAUDEBRIDGE_NATIVE_TEST_CLAUDE_EXE -Value "CI test only"
$installer = Join-Path $root "integrations\native-ui\install.ps1"
try {
  $installed = (& $installer -Action install -ExtensionRoot $root | ConvertFrom-Json)
  if(-not $installed.installed) { throw "Native launcher did not report successful installation." }
  if(!(Test-Path $installed.shortcut)) { throw "Start Menu shortcut was not created." }
  $dest = Join-Path $env:CLAUDEBRIDGE_NATIVE_TEST_ROOT "NativePicker"
  foreach($filename in @("node.exe","renderer.js","companion.js","cdp.js","launcher.vbs","settings.js","native-ui.json")) {
    if(!(Test-Path (Join-Path $dest $filename))) { throw "Missing copied launcher file: $filename" }
  }
  $status = (& $installer -Action status -ExtensionRoot $root | ConvertFrom-Json)
  if(-not $status.installed) { throw "Native launcher status did not detect installation." }
  $removed = (& $installer -Action remove -ExtensionRoot $root | ConvertFrom-Json)
  if($removed.installed) { throw "Native launcher was not removed." }
  if(Test-Path $installed.shortcut) { throw "Uninstall left a shortcut behind." }
  Write-Output "PASS: native picker install, copied dependencies, shortcut, status, rollback"
} finally {
  Remove-Item -LiteralPath $env:CLAUDEBRIDGE_NATIVE_TEST_ROOT -Force -Recurse -ErrorAction SilentlyContinue
  Remove-Item Env:\CLAUDEBRIDGE_NATIVE_TEST_ROOT -ErrorAction SilentlyContinue
  Remove-Item Env:\CLAUDEBRIDGE_NATIVE_TEST_CLAUDE_EXE -ErrorAction SilentlyContinue
}
