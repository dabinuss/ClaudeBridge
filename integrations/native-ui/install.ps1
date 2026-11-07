param(
  [ValidateSet("install","remove","status")][string]$Action = "status",
  [string]$ExtensionRoot = ""
)
$ErrorActionPreference = "Stop"
$testing = [bool]$env:CLAUDEBRIDGE_NATIVE_TEST_ROOT
$base = if($testing) { Join-Path $env:CLAUDEBRIDGE_NATIVE_TEST_ROOT "NativePicker" } else { Join-Path $env:LOCALAPPDATA "ClaudeBridge\NativePicker" }
$shortcutName = "ClaudeBridge Claude.lnk"
$menu = if($testing) { Join-Path $env:CLAUDEBRIDGE_NATIVE_TEST_ROOT "StartMenu" } else { Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs" }
$link = Join-Path $menu $shortcutName
$desktopDir = if($testing) { Join-Path $env:CLAUDEBRIDGE_NATIVE_TEST_ROOT "Desktop" } else { [Environment]::GetFolderPath("DesktopDirectory") }
$desktopLink = Join-Path $desktopDir $shortcutName

function Get-ClaudeExe {
  if($testing -and $env:CLAUDEBRIDGE_NATIVE_TEST_CLAUDE_EXE -and (Test-Path $env:CLAUDEBRIDGE_NATIVE_TEST_CLAUDE_EXE)) { return $env:CLAUDEBRIDGE_NATIVE_TEST_CLAUDE_EXE }
  $shell = New-Object -ComObject WScript.Shell
  $locations = @(
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Claude.lnk"),
    (Join-Path $env:PUBLIC "Desktop\Claude.lnk"),
    (Join-Path ([Environment]::GetFolderPath("DesktopDirectory")) "Claude.lnk")
  )
  foreach($candidate in $locations) {
    if(Test-Path $candidate) {
      $shortcut = $shell.CreateShortcut($candidate)
      $target = $shortcut.TargetPath
      if($target -and (Test-Path $target)) {
        if([IO.Path]::GetFileName($target) -ieq "Claude.exe") { return $target }
        # Older Squirrel shortcuts launch Update.exe --processStart Claude.exe.
        if([IO.Path]::GetFileName($target) -ieq "Update.exe" -and $shortcut.Arguments -match 'Claude\.exe') {
          $appDir = Get-ChildItem -LiteralPath (Split-Path $target) -Directory -Filter "app-*" -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1
          if($appDir -and (Test-Path (Join-Path $appDir.FullName "Claude.exe"))) {
            return (Join-Path $appDir.FullName "Claude.exe")
          }
        }
      }
    }
  }
  $guesses = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Claude\Claude.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\claude\Claude.exe"),
    (Join-Path $env:LOCALAPPDATA "Claude\Claude.exe"),
    (Join-Path $env:ProgramFiles "Claude\Claude.exe")
  )
  foreach($candidate in $guesses) {
    if(Test-Path $candidate) { return (Resolve-Path $candidate).Path }
  }
  foreach($baseDir in @((Join-Path $env:LOCALAPPDATA "Claude"),(Join-Path $env:LOCALAPPDATA "Programs\Claude"))) {
    if(Test-Path $baseDir) {
      $appDir = Get-ChildItem -LiteralPath $baseDir -Directory -Filter "app-*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
      if($appDir -and (Test-Path (Join-Path $appDir.FullName "Claude.exe"))) {
        return (Join-Path $appDir.FullName "Claude.exe")
      }
    }
  }
  $command = Get-Command "Claude.exe" -ErrorAction SilentlyContinue
  if($command -and $command.Source -and (Test-Path $command.Source)) { return $command.Source }
  throw "Claude Desktop executable was not found. A Microsoft Store-only app installation may not support launching with debugging pipe flags."
}

if($Action -eq "status") {
  [PSCustomObject]@{
    installed = (Test-Path (Join-Path $base "companion.js")) -and (Test-Path $link)
    shortcut = $link
    directory = $base
  } | ConvertTo-Json -Compress
  exit 0
}
if($Action -eq "remove") {
  foreach($item in @($link,$desktopLink)) {
    if(Test-Path $item) { Remove-Item -LiteralPath $item -Force }
  }
  $pendingCleanup = $false
  if(Test-Path $base) {
    try { Remove-Item -LiteralPath $base -Recurse -Force -ErrorAction Stop }
    catch { $pendingCleanup = $true } # Windows keeps the active node.exe locked until Claude exits.
  }
  [PSCustomObject]@{
    installed = $false
    pendingCleanup = $pendingCleanup
    message = if($pendingCleanup) {
      "Native picker shortcuts were removed. Quit Claude Desktop to release locked companion files; remove the leftover NativePicker directory afterward. MCP remains unchanged."
    } else {
      "Native picker launcher removed. ClaudeBridge MCP was not modified."
    }
  } | ConvertTo-Json -Compress
  exit 0
}
if(!$ExtensionRoot -or !(Test-Path $ExtensionRoot)) {
  throw "An existing ClaudeBridge extension directory must be supplied."
}
$source = Join-Path $ExtensionRoot "integrations\native-ui"
foreach($name in @("companion.js","renderer.js","cdp.js","launcher.vbs","node.exe")) {
  if(!(Test-Path (Join-Path $source $name))) { throw "Missing native launcher component: $name" }
}
$settings = Join-Path $ExtensionRoot "server\settings.js"
if(!(Test-Path $settings)) { throw "ClaudeBridge settings module missing." }
$claudeExe = Get-ClaudeExe
New-Item -ItemType Directory -Path $base -Force | Out-Null
foreach($name in @("companion.js","renderer.js","cdp.js","launcher.vbs","node.exe")) {
  Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $base $name) -Force
}
Copy-Item -LiteralPath $settings -Destination (Join-Path $base "settings.js") -Force
$config = @{ claudeExe = $claudeExe; extensionRoot = (Resolve-Path $ExtensionRoot).Path }
$config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $base "native-ui.json") -Encoding UTF8
$wsh = New-Object -ComObject WScript.Shell
New-Item -ItemType Directory -Path $menu,$desktopDir -Force | Out-Null
foreach($location in @($link,$desktopLink)) {
  $obj = $wsh.CreateShortcut($location)
  $obj.TargetPath = (Join-Path $env:WINDIR "System32\wscript.exe")
  $obj.Arguments = '"' + (Join-Path $base "launcher.vbs") + '"'
  $obj.WorkingDirectory = $base
  $obj.IconLocation = $claudeExe + ",0"
  $obj.Description = "Claude Desktop with ClaudeBridge native model-menu controls"
  $obj.Save()
}
[PSCustomObject]@{
  installed = $true
  shortcut = $link
  desktopShortcut = $desktopLink
  message = "Fully quit Claude Desktop, then launch it using the ClaudeBridge Claude shortcut. The original Claude shortcuts remain unchanged."
} | ConvertTo-Json -Compress
