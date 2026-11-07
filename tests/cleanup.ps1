$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$root = Join-Path $env:RUNNER_TEMP ("ClaudeBridgeCleanupTest-" + $PID)
$env:CLAUDEBRIDGE_CLEANUP_TEST_HOME = Join-Path $root "home"
$env:CLAUDEBRIDGE_NATIVE_TEST_ROOT = Join-Path $root "native"
$script = Join-Path $repoRoot "maintenance\cleanup.ps1"
$project = Join-Path $root "project"
$state = Join-Path $project ".agent-bridge"
$registry = Join-Path $env:CLAUDEBRIDGE_CLEANUP_TEST_HOME "projects.json"
try {
  New-Item -ItemType Directory -Force -Path $state,$env:CLAUDEBRIDGE_CLEANUP_TEST_HOME | Out-Null
  Set-Content -LiteralPath (Join-Path $project "my-app.js") -Value "KEEP USER CODE"
  Set-Content -LiteralPath (Join-Path $state "state.sqlite") -Value "mock state"
  Set-Content -LiteralPath (Join-Path $env:CLAUDEBRIDGE_CLEANUP_TEST_HOME "settings.json") -Value '{"mode":"dual"}'
  @{
    active = "test"
    projects = @{ test = @{ id = "test"; path = $project; name = "Mock project" } }
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $registry
  $audit = (& $script -AuditOnly -PurgeBridgeState -PurgeProjectMemory -ExtensionRoot $repoRoot | ConvertFrom-Json)
  if($audit.projectMemory -eq "deleted") { throw "AuditOnly unexpectedly deleted data" }
  if(!(Test-Path $state) -or !(Test-Path $registry)) { throw "AuditOnly must preserve all files" }
  $remove = (& $script -PurgeBridgeState -PurgeProjectMemory -Confirm:$false -ExtensionRoot $repoRoot | ConvertFrom-Json)
  if(Test-Path $state) { throw "Project memory survived explicit purge" }
  if(Test-Path $registry) { throw "Project registry survived explicit purge" }
  if(!(Test-Path (Join-Path $project "my-app.js"))) { throw "User project source was deleted" }
  Write-Output "PASS: audit-only, explicit Bridge data cleanup, project source preservation"
} finally {
  Remove-Item -LiteralPath $root -Force -Recurse -ErrorAction SilentlyContinue
  Remove-Item Env:\CLAUDEBRIDGE_CLEANUP_TEST_HOME -ErrorAction SilentlyContinue
  Remove-Item Env:\CLAUDEBRIDGE_NATIVE_TEST_ROOT -ErrorAction SilentlyContinue
}
