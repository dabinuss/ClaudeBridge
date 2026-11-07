# ClaudeBridge safe local cleanup (Windows)
# This does not uninstall Claude Desktop, Node.js, the global Codex CLI,
# user ChatGPT credentials, or the MCPB entry managed by Claude Desktop.
[CmdletBinding(SupportsShouldProcess=$true,ConfirmImpact='High')]
param(
  [switch]$PurgeBridgeState,
  [switch]$PurgeProjectMemory,
  [switch]$AuditOnly,
  [string]$ExtensionRoot = ""
)
$ErrorActionPreference = 'Stop'
$homePath = if($env:CLAUDEBRIDGE_CLEANUP_TEST_HOME) { $env:CLAUDEBRIDGE_CLEANUP_TEST_HOME } else { Join-Path $HOME ".claudebridge" }
$nativeScript = if($ExtensionRoot) {
  Join-Path $ExtensionRoot "integrations\native-ui\install.ps1"
} else {
  Join-Path (Split-Path $PSScriptRoot -Parent) "integrations\native-ui\install.ps1"
}
$registryFile = Join-Path $homePath "projects.json"
$report = [ordered]@{
  nativeIntegration = "not_checked"
  bridgeState = "preserved"
  projectMemory = "preserved"
  projectFolders = @()
  remaining = @()
  notes = @(
    "Claude Desktop's Extensions menu must be used to uninstall the ClaudeBridge MCPB.",
    "This tool does not remove Codex CLI credentials from your ChatGPT account or ~/.codex.",
    "Your source-code project folders are never deleted."
  )
}

# Use the existing, ownership-verifying removal logic. Never guess at
# other applications' shortcuts or remove arbitrary certificates/proxy settings.
if(Test-Path -LiteralPath $nativeScript) {
  if($AuditOnly) {
    $native = & $nativeScript -Action status | ConvertFrom-Json
    $report.nativeIntegration = if($native.installed) { "present" } else { "not_installed" }
  } elseif($PSCmdlet.ShouldProcess("ClaudeBridge-owned desktop shortcuts and companion", "Remove native picker")) {
    $native = & $nativeScript -Action remove | ConvertFrom-Json
    $report.nativeIntegration = if($native.pendingCleanup) { "locked_files_remain" } else { "removed" }
    if($native.remainingDirectory) { $report.remaining += $native.remainingDirectory }
  }
} else {
  $report.nativeIntegration = "installer_not_found"
  $report.notes += "Native launcher installer not found; no native shortcuts were modified."
}

$projectPaths = @()
if(Test-Path -LiteralPath $registryFile) {
  try {
    $registry = Get-Content -LiteralPath $registryFile -Raw | ConvertFrom-Json
    foreach($entry in $registry.projects.PSObject.Properties) {
      $projectPath = [string]$entry.Value.path
      if($projectPath -and [IO.Path]::IsPathRooted($projectPath) -and (Test-Path -LiteralPath $projectPath)) {
        $projectPaths += $projectPath
      }
    }
  } catch {
    $report.notes += "The project registry could not be parsed. No project-memory folders were touched."
  }
}
$projectPaths = @($projectPaths | Select-Object -Unique)

if($PurgeProjectMemory) {
  foreach($projectPath in $projectPaths) {
    $statePath = Join-Path $projectPath ".agent-bridge"
    if(!(Test-Path -LiteralPath $statePath)) { continue }
    $stateItem = Get-Item -LiteralPath $statePath -Force
    if(($stateItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      $report.remaining += $statePath
      $report.notes += "Skipped a reparse-point project memory folder."
      continue
    }
    $report.projectFolders += $statePath
    if(!$AuditOnly -and $PSCmdlet.ShouldProcess($statePath, "Permanently delete ClaudeBridge memory and task history")) {
      try {
        Remove-Item -LiteralPath $statePath -Recurse -Force -ErrorAction Stop
        $report.projectMemory = "deleted"
      } catch {
        $report.projectMemory = "partially_removed"
        $report.remaining += $statePath
      }
    }
  }
}

if($PurgeBridgeState -and (Test-Path -LiteralPath $homePath)) {
  if($AuditOnly) {
    $report.bridgeState = "present"
  } elseif($PSCmdlet.ShouldProcess($homePath, "Delete ClaudeBridge registry, settings and device login logs")) {
    try {
      Remove-Item -LiteralPath $homePath -Force -Recurse -ErrorAction Stop
      $report.bridgeState = "deleted"
    } catch {
      $report.bridgeState = "partially_removed"
      $report.remaining += $homePath
    }
  }
}

if($PurgeBridgeState -and !$PurgeProjectMemory) {
  $report.notes += "Per-project .agent-bridge folders were preserved. The registry has been removed, so those folders must be located directly for any later manual cleanup."
}
if($AuditOnly) { $report.notes += "AuditOnly: nothing was removed." }
$report | ConvertTo-Json -Depth 6
