$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$watchScript = Join-Path $repoRoot "scripts\watch-tzutil.ps1"
$logDir = Join-Path $repoRoot ".uvb\logs"
$outLog = Join-Path $logDir "tzutil-watch.out.log"
$errLog = Join-Path $logDir "tzutil-watch.err.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$existing = Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -like "*watch-tzutil.ps1*" -and
    $_.CommandLine -notlike "*start-tzutil-watch.ps1*" -and
    $_.ProcessId -ne $PID
  }

if ($existing) {
  $existing | ForEach-Object {
    Write-Host "TZUtil watcher already appears to be running as PID $($_.ProcessId)."
  }
  exit 0
}

$command = "& '$watchScript' >> '$outLog' 2>> '$errLog'"
$process = Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -PassThru

Write-Host "Started TZUtil watcher as PID $($process.Id)."
Write-Host "Log: $(Join-Path $logDir 'tzutil-watch.log')"
