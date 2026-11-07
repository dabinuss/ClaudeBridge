param(
  [ValidateSet("install","remove","status")][string]$Action = "status",
  [string]$ExtensionRoot = ""
)
$ErrorActionPreference = "Stop"
$base = Join-Path $env:LOCALAPPDATA "ClaudeBridge\NativePicker"
$shortcutName = "ClaudeBridge Claude.lnk"
$menu = Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs"
$link = Join-Path $menu $shortcutName
$desktopLink = Join-Path ([Environment]::GetFolderPath("DesktopDirectory")) $shortcutName

function Get-ClaudeExe {
  $shell = New-Object -ComObject WScript.Shell
  $locations = @(
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Claude.lnk"),
    (Join-Path $env:PUBLIC "Desktop\Claude.lnk"),
    (Join-Path ([Environment]::GetFolderPath("DesktopDirectory")) "Claude.lnk")
  )
  foreach($candidate in $locations) {
    if(Test-Path $candidate) {
      $target = $shell.CreateShortcut($candidate).TargetPath
      if($target -and (Test-Path $target) -and $target.EndsWith(".exe")) { return $target }
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
  if(Test-Path $base) { Remove-Item -LiteralPath $base -Recurse -Force }
  Write-Output '{"installed":false,"message":"Native picker launcher removed. ClaudeBridge MCP was not modified."}'
  exit 0
}
if(!$ExtensionRoot -or !(Test-Path $ExtensionRoot)) {
  throw "An existing ClaudeBridge extension directory must be supplied."
}
$source = Join-Path $ExtensionRoot "integrations\native-ui"
foreach($name in @("companion.js","renderer.js","node.exe")) {
  if(!(Test-Path (Join-Path $source $name))) { throw "Missing native launcher component: $name" }
}
$settings = Join-Path $ExtensionRoot "server\settings.js"
if(!(Test-Path $settings)) { throw "ClaudeBridge settings module missing." }
$claudeExe = Get-ClaudeExe
New-Item -ItemType Directory -Path $base -Force | Out-Null
foreach($name in @("companion.js","renderer.js","node.exe")) {
  Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $base $name) -Force
}
Copy-Item -LiteralPath $settings -Destination (Join-Path $base "settings.js") -Force
$config = @{ claudeExe = $claudeExe; extensionRoot = (Resolve-Path $ExtensionRoot).Path }
$config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $base "native-ui.json") -Encoding UTF8
$wsh = New-Object -ComObject WScript.Shell
foreach($location in @($link,$desktopLink)) {
  $obj = $wsh.CreateShortcut($location)
  $obj.TargetPath = (Join-Path $base "node.exe")
  $obj.Arguments = '"' + (Join-Path $base "companion.js") + '"'
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
