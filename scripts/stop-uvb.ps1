$ErrorActionPreference = "SilentlyContinue"
$Root = (Split-Path -Parent $PSScriptRoot)
$escapedRoot = [Regex]::Escape($Root)

$processes = Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -match $escapedRoot -and
    $_.Name -match '^(pwsh|powershell|cmd|bun|node|python)\.exe$'
  } |
  Sort-Object ProcessId -Descending

foreach ($process in $processes) {
  try {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  } catch {
    # Best-effort cleanup. Some child processes may already be gone.
  }
}

Write-Host "Stopped UVB background/dev processes for $Root"
